import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  JOB,
  LOOP,
  NOW,
  snapshot,
  UNIT,
  UNNAMED_UNIT,
  type UnitFixture,
  unitFixture,
  unnamedInFlight,
  WORKER,
  WORKER_PID,
} from './fixtures/loop/units.js';
import { removeTemps } from './fixtures/worker/repo.js';
import { LOOP_USAGE_LINE, type LoopEnv, runLoopCli } from './loop.js';
import { WAKE_USAGE_LINE } from './loop-wake.js';
import { nativeFolder } from './worker-worktree.js';

afterEach(removeTemps);

const wakeArgs = (unit = UNIT): string[] => ['wake', LOOP, '--unit', unit];

const discardLine = `sidekick loop discard ${LOOP} --unit ${UNIT} --reason <text>`;

function run(fx: UnitFixture, args: string[], over: Partial<LoopEnv> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = runLoopCli(
    args,
    fx.lenv(over),
    (l) => out.push(l),
    (l) => err.push(l),
  );
  return { code, out, err };
}

// The loop's own worktree, which `start`'s launch makes and the respawn runs from.
const loopTree = (fx: UnitFixture): string => {
  const folder = nativeFolder(fx.top, `loop-${LOOP}`);
  fs.mkdirSync(folder, { recursive: true });
  return folder;
};

const otherRow = {
  id: 'job-9',
  kind: 'background',
  name: 'fixer-zzz999',
  state: 'stopped',
};

describe('loop wake', () => {
  test('wake leaves a running worker alone', () => {
    const fx = unitFixture();
    const before = snapshot(fx.loopDir);
    const r = run(fx, wakeArgs());
    expect(r).toEqual({
      code: 0,
      out: [
        `worker ${WORKER} runs (pid ${WORKER_PID}), so wake leaves it alone`,
      ],
      err: [],
    });
    expect(fx.claude.calls.map((c) => c.args[0])).toEqual(['agents']);
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test('wake leaves alone a worker whose pid the listing gives in a form it cannot read', () => {
    const fx = unitFixture();
    fx.claude.state.rows = fx.claude.state.rows.map((row) => ({
      ...row,
      pid: 'not-a-pid',
    }));
    const r = run(fx, wakeArgs());
    expect(r.code).toBe(0);
    expect(r.out).toEqual([
      `worker ${WORKER} may run: the listing gives its pid in a form wake cannot read, so wake leaves it alone`,
    ]);
    expect(fx.claude.named('respawn')).toEqual([]);
  });

  test('wake respawns a stopped worker by its own job', () => {
    const fx = unitFixture({ running: false });
    fx.claude.state.rows.push(otherRow);
    const folder = loopTree(fx);
    const before = snapshot(fx.loopDir);
    const r = run(fx, wakeArgs());
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(fx.claude.named('respawn')).toEqual([['respawn', JOB]]);
    const respawn = fx.claude.calls.find((c) => c.args[0] === 'respawn');
    expect(respawn?.cwd).toBe(folder);
    expect(r.out).toEqual([
      `worker ${WORKER} was stopped, so wake respawned its job ${JOB}`,
    ]);
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test('wake finds a job: null worker by its session name, and respawns that job alone', () => {
    const fx = unitFixture({ job: null, running: false });
    fx.claude.state.rows.push(otherRow);
    const r = run(fx, wakeArgs());
    expect(r.code).toBe(0);
    expect(fx.claude.named('respawn')).toEqual([['respawn', JOB]]);
  });

  test('wake refuses a worker with no row', () => {
    const fx = unitFixture({ listed: false });
    fx.claude.state.rows.push(otherRow);
    const before = snapshot(fx.loopDir);
    const r = run(fx, wakeArgs());
    expect(r).toEqual({
      code: 1,
      out: [],
      err: [
        `the listing holds no session for worker ${WORKER}, so wake has nothing to respawn: give up on the attempt with ${discardLine}`,
      ],
    });
    expect(fx.claude.named('respawn')).toEqual([]);
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test('wake refuses a job: null worker whose only row is a session with no job id', () => {
    const fx = unitFixture({ job: null, listed: false });
    fx.claude.state.rows.push({ kind: 'interactive', name: WORKER });
    const r = run(fx, wakeArgs());
    expect(r).toEqual({
      code: 1,
      out: [],
      err: [
        `the listing holds worker ${WORKER} only as a session with no job id, which respawn cannot take, so wake has nothing to respawn: give up on the attempt with ${discardLine}`,
      ],
    });
    expect(fx.claude.named('respawn')).toEqual([]);
  });

  test('wake refuses an attempt whose record names no worker, listing nothing', () => {
    const fx = unitFixture();
    unnamedInFlight(fx);
    const before = snapshot(fx.loopDir);
    const r = run(fx, wakeArgs(UNNAMED_UNIT));
    expect(r).toEqual({
      code: 1,
      out: [],
      err: [
        `the attempt in flight for unit ${UNNAMED_UNIT} names no worker, so wake has no session to respawn`,
      ],
    });
    expect(fx.claude.calls).toEqual([]);
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test('wake refuses a job: null worker with two stopped sessions of its name, naming neither job', () => {
    const fx = unitFixture({ job: null, running: false });
    fx.claude.state.rows.push({ ...otherRow, name: WORKER });
    const r = run(fx, wakeArgs());
    expect(r.code).toBe(1);
    expect(r.err).toEqual([
      `the listing holds 2 sessions named ${WORKER}, so wake cannot tell which to respawn: give up on the attempt with ${discardLine}`,
    ]);
    expect(fx.claude.named('respawn')).toEqual([]);
  });

  test("a failed respawn names discard as the way out, not start's", () => {
    const fx = unitFixture({ running: false });
    fx.claude.state.respawnResult = {
      code: 1,
      stdout: '',
      stderr: 'no such job\n',
      timedOut: false,
    };
    const r = run(fx, wakeArgs());
    expect(r.code).toBe(1);
    expect(r.err[0]).toStartWith(`claude respawn ${JOB}`);
    expect(r.err.at(-1)).toBe(
      `To give up on the attempt instead, run ${discardLine}, which stops the worker and closes the attempt.`,
    );
    expect(r.err.join('\n')).not.toContain('sidekick loop start');
  });

  test('a listing that fails respawns nothing, and says wake cannot tell', () => {
    const fx = unitFixture({ running: false });
    const r = run(fx, wakeArgs(), {
      runClaude: () => ({ code: 2, stdout: '', stderr: '', timedOut: false }),
    });
    expect(r.code).toBe(1);
    expect(r.err).toEqual([
      'claude agents --json --all failed with exit code 2.',
      `wake cannot tell whether worker ${WORKER} still runs, so it respawns nothing`,
    ]);
  });

  test('wake refuses when the reap cannot stop an overdue worker, respawning nothing', () => {
    const fx = unitFixture({ dispatchedAgo: 240 });
    fx.claude.state.stopResult = {
      code: 1,
      stdout: '',
      stderr: '',
      timedOut: false,
    };
    const before = snapshot(fx.loopDir);
    const r = run(fx, wakeArgs());
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err[0]).toStartWith(`unit ${UNIT} · worker ${WORKER} worked 240`);
    expect(fx.claude.named('respawn')).toEqual([]);
    expect(snapshot(fx.loopDir)).toEqual(before);
  });
});

describe('loop wake refuses, changing nothing', () => {
  const rows: [
    string,
    string[],
    (fx: UnitFixture) => Partial<LoopEnv>,
    string,
  ][] = [
    [
      'a unit with no attempt in flight',
      wakeArgs('triage-7'),
      () => ({}),
      `no attempt for unit triage-7 is in flight, so wake has no worker to wake; the attempt in flight is unit ${UNIT}, worker ${WORKER}`,
    ],
    [
      'a unit id that names a folder',
      wakeArgs('..'),
      () => ({}),
      'unit: .. names a folder, not a unit',
    ],
    [
      "another loop's SIDEKICK_LOOP",
      wakeArgs(),
      () => ({ env: { SIDEKICK_LOOP: 'other' } }),
      'SIDEKICK_LOOP is "other", so this session cannot run loop wake for "fixer"',
    ],
    [
      'a non-empty SIDEKICK_WORKER',
      wakeArgs(),
      (fx) => ({
        env: { CLAUDE_CONFIG_DIR: fx.config, SIDEKICK_WORKER: fx.brief },
      }),
      'SIDEKICK_WORKER is set: a worker runs no unit verb, so only a loop or the operator runs loop wake',
    ],
    [
      'a units.lock another verb holds',
      wakeArgs(),
      (fx) => {
        fs.writeFileSync(
          path.join(fx.loopDir, 'units.lock'),
          JSON.stringify({ pid: 77, at: NOW.toISOString() }),
        );
        return { isAlive: (pid: number) => pid === 77 };
      },
      'another unit verb holds the lock (pid 77)',
    ],
  ];

  test.each(rows)('%s', (_label, args, setup, expected) => {
    const fx = unitFixture({ running: false });
    const over = setup(fx);
    const before = snapshot(fx.loopDir);
    const r = run(fx, args, over);
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain(expected);
    expect(fx.claude.named('respawn')).toEqual([]);
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test.each([
    ['no --unit', ['wake', LOOP]],
    ['a text', [...wakeArgs(), 'now']],
    ['--all', [...wakeArgs(), '--all']],
  ])('%s prints the usage', (_label, args) => {
    const fx = unitFixture();
    expect(run(fx, args)).toEqual({
      code: 1,
      out: [],
      err: [`usage: ${WAKE_USAGE_LINE}`],
    });
  });
});

test('the usage names wake', () => {
  expect(WAKE_USAGE_LINE).toBe('sidekick loop wake <name> --unit <id>');
  expect(LOOP_USAGE_LINE).toContain('| wake <name> --unit <id>');
});
