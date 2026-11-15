import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  JOB,
  LOOP,
  NOW,
  REPORT_TEXT,
  snapshot,
  UNIT,
  type UnitFixture,
  unitFixture,
  WORKER,
  WORKER_PID,
} from './fixtures/loop/units.js';
import { git, removeTemps } from './fixtures/worker/repo.js';
import { LOOP_USAGE_LINE, type LoopEnv, runLoopCli } from './loop.js';
import { DISCARD_USAGE_LINE } from './loop-discard-verb.js';
import { keyHits } from './memory-patterns.js';
import { ATTEMPT_REPORT } from './worker-brief.js';

afterEach(removeTemps);

const key = (): string => `${'ghp'}${'_'}${'a1'.repeat(18)}`;

const discardArgs = (...extra: string[]): string[] => [
  'discard',
  LOOP,
  '--unit',
  UNIT,
  '--reason',
  'requeued',
  ...extra,
];

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

// The record's lines after the fixture's own `dispatched`.
const closing = (fx: UnitFixture) => fx.ledger().slice(1);

const verbs = (fx: UnitFixture): string[] =>
  fx.claude.calls.map((c) => c.args[0]);

describe('loop discard closes the attempt', () => {
  test('discard removes a clean worker and writes discarded', () => {
    const fx = unitFixture();
    const r = run(fx, discardArgs());
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    // The worker stops before finish lists it, and finish removes it.
    expect(verbs(fx).slice(0, 3)).toEqual(['agents', 'stop', 'agents']);
    expect(fx.claude.named('stop')[0]).toEqual(['stop', JOB]);
    expect(verbs(fx).at(-1)).toBe('rm');
    expect(fs.existsSync(fx.worktree)).toBe(false);
    expect(fs.readFileSync(path.join(fx.attempt, ATTEMPT_REPORT), 'utf8')).toBe(
      REPORT_TEXT,
    );
    expect(closing(fx)).toEqual([
      {
        v: 1,
        at: expect.any(String),
        kind: 'discarded',
        unit: UNIT,
        worker: WORKER,
        reason: 'requeued',
      },
    ]);
    expect(r.out.at(-1)).toBe(`unit ${UNIT} · worker ${WORKER} · discarded`);
    expect(fs.existsSync(path.join(fx.loopDir, 'units.lock'))).toBe(false);
  });

  test('discard --failed writes failed then discarded', () => {
    const fx = unitFixture();
    const r = run(fx, discardArgs('--failed'));
    expect(r.code).toBe(0);
    expect(
      closing(fx).map((l) => [l.kind, 'worker' in l ? l.worker : undefined]),
    ).toEqual([
      ['failed', WORKER],
      ['discarded', WORKER],
    ]);
    expect(closing(fx).map((l) => ('reason' in l ? l.reason : ''))).toEqual([
      'requeued',
      'requeued',
    ]);
    expect(r.out.at(-1)).toBe(
      `unit ${UNIT} · worker ${WORKER} · failed, then discarded`,
    );
  });

  test('a dirty worker is left, stopped, the attempt closes, and the hand route prints', () => {
    const fx = unitFixture();
    fs.writeFileSync(path.join(fx.worktree, 'wip.txt'), 'unsaved\n');
    const r = run(fx, discardArgs());
    expect(r.code).toBe(0);
    expect(fx.claude.named('stop')).toEqual([['stop', JOB]]);
    expect(fx.claude.named('rm')).toEqual([]);
    expect(fx.alive.has(WORKER_PID)).toBe(false);
    expect(fs.readFileSync(path.join(fx.worktree, 'wip.txt'), 'utf8')).toBe(
      'unsaved\n',
    );
    expect(git(fx.top, 'branch', '--list', `worktree-${WORKER}`)).not.toBe('');
    expect(r.out.join('\n')).toContain('wip.txt');
    expect(r.out).toContain(
      `finish did not clear worker ${WORKER}, so the attempt closes and what remains is yours. List it with sidekick worktree list, and settle what finish names, such as uncommitted work to commit or remove. Then run sidekick worker finish ${fx.brief} --discard in the loop's repo, ${fx.top}`,
    );
    expect(closing(fx).map((l) => l.kind)).toEqual(['discarded']);
    expect(r.out.at(-1)).toBe(`unit ${UNIT} · worker ${WORKER} · discarded`);
  });

  test('a worktree with no report hands finish --no-report, and the hand route keeps it', () => {
    const fx = unitFixture({ report: false });
    fs.writeFileSync(path.join(fx.worktree, 'wip.txt'), 'unsaved\n');
    const r = run(fx, discardArgs());
    expect(r.code).toBe(0);
    expect(r.out.join('\n')).toContain(
      `run sidekick worker finish ${fx.brief} --no-report --discard in the loop's repo, ${fx.top}`,
    );
  });

  test('a clean worker with no report is removed, and no report is saved', () => {
    const fx = unitFixture({ report: false });
    const r = run(fx, discardArgs());
    expect(r.code).toBe(0);
    expect(fs.existsSync(fx.worktree)).toBe(false);
    expect(fs.existsSync(path.join(fx.attempt, ATTEMPT_REPORT))).toBe(false);
    expect(r.out).toContain('no report to save: the worktree holds none');
  });

  test('a worker whose process has ended is not stopped again, and finish removes it', () => {
    const fx = unitFixture({ running: false });
    const r = run(fx, discardArgs());
    expect(r.code).toBe(0);
    expect(fx.claude.named('stop')).toEqual([]);
    expect(fs.existsSync(fx.worktree)).toBe(false);
    expect(closing(fx).map((l) => l.kind)).toEqual(['discarded']);
  });
});

describe('loop discard and a timed-out launch, whose worker.json names no job', () => {
  test('discard clears a job: null attempt whose session is listed, finding it by name', () => {
    const fx = unitFixture({ job: null });
    const r = run(fx, discardArgs());
    expect(r.code).toBe(0);
    expect(fx.claude.named('stop')).toEqual([['stop', JOB]]);
    expect(fs.existsSync(fx.worktree)).toBe(false);
    expect(closing(fx).map((l) => l.kind)).toEqual(['discarded']);
  });

  test('discard clears a job: null attempt whose session is not listed, reading no row as gone', () => {
    const fx = unitFixture({ job: null, listed: false });
    const r = run(fx, discardArgs());
    expect(r.code).toBe(0);
    expect(verbs(fx)).toEqual(['agents']);
    expect(r.out[0]).toStartWith(
      `worker ${WORKER} has no session left, so discard stopped nothing and ran no finish: run sidekick worktree list`,
    );
    expect(closing(fx).map((l) => l.kind)).toEqual(['discarded']);
    expect(r.out.at(-1)).toBe(`unit ${UNIT} · worker ${WORKER} · discarded`);
  });
});

describe('loop discard keeps the attempt in flight while its worker may run', () => {
  test('a stop that fails writes nothing and runs no finish', () => {
    const fx = unitFixture();
    fx.claude.state.stopResult = {
      code: 1,
      stdout: '',
      stderr: 'no such job\n',
      timedOut: false,
    };
    const before = snapshot(fx.loopDir);
    const r = run(fx, discardArgs());
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain(`claude stop ${JOB}`);
    expect(r.err.at(-1)).toBe(
      `worker ${WORKER} may still run, so the attempt stays in flight: run sidekick loop discard again once it has stopped`,
    );
    expect(verbs(fx)).toEqual(['agents', 'stop']);
    expect(snapshot(fx.loopDir)).toEqual(before);
    expect(fs.existsSync(fx.worktree)).toBe(true);
  });

  test("a process that outlives the stop's wait writes nothing and runs no finish", () => {
    const fx = unitFixture();
    const before = snapshot(fx.loopDir);
    const r = run(fx, discardArgs(), { isAlive: () => true });
    expect(r.code).toBe(1);
    expect(r.err[0]).toBe(
      `worker ${WORKER}'s process, pid ${WORKER_PID}, still runs 15 s after claude stop`,
    );
    expect(verbs(fx)).toEqual(['agents', 'stop']);
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  // Claude Code's lock reason, naming the session's process.
  const lockFor = (fx: UnitFixture, pid: number): void => {
    git(
      fx.top,
      'worktree',
      'lock',
      '--reason',
      `claude session ${WORKER} (pid ${pid} start 2026-11-15T08:20:00Z)`,
      fx.worktree,
    );
  };
  const LOCK_PID = 4242;
  const liveLockLine = `the worktree of ${WORKER} is locked by pid ${LOCK_PID}, which still runs, so the attempt stays in flight: run sidekick loop discard again once it exits`;

  test("a finish whose own wait for the worktree's lock runs out writes no record line, and prints no hand route", () => {
    const fx = unitFixture();
    // A pid the listing gives in a form no one can read: stopped, never waited on.
    fx.claude.state.rows = fx.claude.state.rows.map((row) => ({
      ...row,
      pid: 'not-a-pid',
    }));
    lockFor(fx, LOCK_PID);
    const r = run(fx, discardArgs(), { isAlive: (pid) => pid === LOCK_PID });
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      `the worktree's lock still names a running process, pid ${LOCK_PID}, after 15 s: run finish again once it exits`,
    );
    expect(r.err.at(-1)).toBe(liveLockLine);
    expect(r.err.join('\n')).not.toContain('finish did not clear');
    expect(closing(fx)).toEqual([]);
    expect(fs.existsSync(fx.worktree)).toBe(true);
  });

  test('a finish refusal while a live process holds the lock writes nothing', () => {
    const fx = unitFixture();
    fs.writeFileSync(path.join(fx.worktree, 'wip.txt'), 'unsaved\n');
    lockFor(fx, LOCK_PID);
    const before = snapshot(fx.loopDir);
    const r = run(fx, discardArgs(), { isAlive: (pid) => pid === LOCK_PID });
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err.at(-1)).toBe(liveLockLine);
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test('a lock naming a process that has exited does not hold the attempt open', () => {
    const fx = unitFixture();
    fs.writeFileSync(path.join(fx.worktree, 'wip.txt'), 'unsaved\n');
    lockFor(fx, LOCK_PID);
    const r = run(fx, discardArgs());
    expect(r.code).toBe(0);
    expect(r.out.join('\n')).toContain(`finish did not clear worker ${WORKER}`);
    expect(closing(fx).map((l) => l.kind)).toEqual(['discarded']);
  });

  test('a listing that fails writes nothing', () => {
    const fx = unitFixture();
    const before = snapshot(fx.loopDir);
    const r = run(fx, discardArgs(), {
      runClaude: () => ({ code: 2, stdout: '', stderr: '', timedOut: false }),
    });
    expect(r.code).toBe(1);
    expect(r.err[0]).toBe(
      'claude agents --json --all failed with exit code 2.',
    );
    expect(snapshot(fx.loopDir)).toEqual(before);
  });
});

describe('loop discard refuses, changing nothing', () => {
  const rows: [
    string,
    string[],
    (fx: UnitFixture) => Partial<LoopEnv>,
    string,
  ][] = [
    [
      'with no attempt in flight for the unit',
      ['discard', LOOP, '--unit', 'triage-7', '--reason', 'r'],
      () => ({}),
      `no attempt for unit triage-7 is in flight, so discard has nothing to close; the attempt in flight is unit ${UNIT}, worker ${WORKER}`,
    ],
    [
      'a unit id that names a folder',
      ['discard', LOOP, '--unit', '..', '--reason', 'r'],
      () => ({}),
      'unit: .. names a folder, not a unit',
    ],
    [
      'a unit id the record refuses',
      ['discard', LOOP, '--unit', 'a/b', '--reason', 'r'],
      () => ({}),
      'unit: must be 1 to 64 of A-Z a-z 0-9 . _ -',
    ],
    [
      'an empty reason',
      ['discard', LOOP, '--unit', UNIT, '--reason', ''],
      () => ({}),
      '--reason: Invalid length: Expected >=1 but received 0',
    ],
    [
      'a reason with a control character',
      ['discard', LOOP, '--unit', UNIT, '--reason', 'a\u0007b'],
      () => ({}),
      '--reason: must hold no control character (U+0000 to U+001F, U+007F, or U+0080 to U+009F)',
    ],
    [
      'a key in the reason, naming the check and never the text',
      ['discard', LOOP, '--unit', UNIT, '--reason', `token ${key()}`],
      () => ({}),
      '--reason holds text that looks like a key (github-classic-pat): keep keys out of the record',
    ],
    [
      "another loop's SIDEKICK_LOOP",
      discardArgs(),
      () => ({ env: { SIDEKICK_LOOP: 'other' } }),
      'SIDEKICK_LOOP is "other", so this session cannot run loop discard for "fixer"',
    ],
    [
      'a non-empty SIDEKICK_WORKER',
      discardArgs(),
      (fx) => ({
        env: { CLAUDE_CONFIG_DIR: fx.config, SIDEKICK_WORKER: fx.brief },
      }),
      'SIDEKICK_WORKER is set',
    ],
    [
      'a store with no such loop',
      discardArgs(),
      (fx) => ({ env: { CLAUDE_CONFIG_DIR: path.join(fx.home, 'other') } }),
      'holds no loop "fixer"',
    ],
    [
      'a units.lock another verb holds',
      discardArgs(),
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
    const fx = unitFixture();
    const over = setup(fx);
    const before = snapshot(fx.loopDir);
    const r = run(fx, args, over);
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err.join('\n')).toContain(expected);
    expect(r.err.join('\n')).not.toContain(key());
    expect(fx.claude.calls).toEqual([]);
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test('an attempt already closed refuses', () => {
    const fx = unitFixture();
    expect(run(fx, discardArgs()).code).toBe(0);
    const before = snapshot(fx.loopDir);
    const r = run(fx, discardArgs());
    expect(r.code).toBe(1);
    expect(r.err).toEqual([
      `no attempt for unit ${UNIT} is in flight, so discard has nothing to close`,
    ]);
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test.each([
    ['no --reason', ['discard', LOOP, '--unit', UNIT]],
    ['no --unit', ['discard', LOOP, '--reason', 'r']],
    ['no name', ['discard', '--unit', UNIT, '--reason', 'r']],
    ['an unknown flag', [...discardArgs(), '--force']],
  ])('%s prints the usage', (_label, args) => {
    const fx = unitFixture();
    const r = run(fx, args);
    expect(r).toEqual({
      code: 1,
      out: [],
      err: [`usage: ${DISCARD_USAGE_LINE}`],
    });
  });
});

test('the usage names discard', () => {
  expect(LOOP_USAGE_LINE).toContain(
    'discard <name> --unit <id> --reason <text> [--failed]',
  );
});

test('this test file holds no literal key', () => {
  expect(keyHits(fs.readFileSync(import.meta.path, 'utf8'))).toEqual([]);
});
