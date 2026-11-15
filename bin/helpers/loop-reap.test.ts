import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  JOB,
  LOOP,
  MINUTE_MS,
  NOW,
  snapshot,
  UNIT,
  type UnitFixture,
  unitFixture,
  WORKER,
} from './fixtures/loop/units.js';
import { removeTemps } from './fixtures/worker/repo.js';
import { LOOP_USAGE_LINE, type LoopEnv, runLoopCli } from './loop.js';
import { REAP_USAGE_LINE } from './loop-reap.js';
import { appendRecord } from './loop-record.js';

afterEach(removeTemps);

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

const ago = (minutes: number): string =>
  new Date(NOW.getTime() - minutes * MINUTE_MS).toISOString();

const kinds = (fx: UnitFixture): string[] => fx.ledger().map((l) => l.kind);

const reapLead = (minutes: number): string =>
  `unit ${UNIT} · worker ${WORKER} worked ${minutes} minutes, past the work cap of 180 minutes, so reap stops and discards it`;

describe('loop reap', () => {
  test('reap leaves an attempt within its time', () => {
    const fx = unitFixture({ dispatchedAgo: 179 });
    const before = snapshot(fx.loopDir);
    const r = run(fx, ['reap', LOOP]);
    expect(r).toEqual({ code: 0, out: [], err: [] });
    expect(fx.claude.calls).toEqual([]);
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test('reap writes failed and discards past the work cap', () => {
    const fx = unitFixture({ dispatchedAgo: 240 });
    const r = run(fx, ['reap', LOOP]);
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.out[0]).toBe(reapLead(240));
    expect(r.out.at(-1)).toBe(
      `unit ${UNIT} · worker ${WORKER} · failed, then discarded`,
    );
    expect(fx.claude.named('stop')).toEqual([['stop', JOB]]);
    expect(fs.existsSync(fx.worktree)).toBe(false);
    const reason = 'worked 240 minutes, past the work cap of 180 minutes';
    expect(fx.ledger().slice(1)).toEqual([
      {
        v: 1,
        at: NOW.toISOString(),
        kind: 'failed',
        unit: UNIT,
        worker: WORKER,
        reason,
      },
      {
        v: 1,
        at: NOW.toISOString(),
        kind: 'discarded',
        unit: UNIT,
        worker: WORKER,
        reason,
      },
    ]);
  });

  test('reap counts a gone session past its time', () => {
    const fx = unitFixture({ dispatchedAgo: 240, job: null, listed: false });
    const r = run(fx, ['reap', LOOP]);
    expect(r.code).toBe(0);
    expect(r.out[0]).toBe(reapLead(240));
    expect(fx.claude.calls.map((c) => c.args[0])).toEqual(['agents']);
    expect(kinds(fx)).toEqual(['dispatched', 'failed', 'discarded']);
  });

  test('reap leaves a gone session within its time', () => {
    const fx = unitFixture({ dispatchedAgo: 60, listed: false });
    const r = run(fx, ['reap', LOOP]);
    expect(r).toEqual({ code: 0, out: [], err: [] });
    expect(kinds(fx)).toEqual(['dispatched']);
  });

  test('a dirty worker past its time is left in place, and the attempt closes', () => {
    const fx = unitFixture({ dispatchedAgo: 240 });
    fs.writeFileSync(path.join(fx.worktree, 'wip.txt'), 'unsaved\n');
    const r = run(fx, ['reap', LOOP]);
    expect(r.code).toBe(0);
    expect(fs.existsSync(path.join(fx.worktree, 'wip.txt'))).toBe(true);
    expect(fx.claude.named('stop')).toEqual([['stop', JOB]]);
    expect(kinds(fx)).toEqual(['dispatched', 'failed', 'discarded']);
  });

  test('time waiting for an answer, within the wait cap, does not count', () => {
    const fx = unitFixture({ dispatchedAgo: 220 });
    appendRecord(fx.loopDir, {
      v: 1,
      at: ago(200),
      kind: 'request',
      summary: 'which widget?',
      command: 'ask',
      unit: UNIT,
    });
    appendRecord(fx.loopDir, {
      v: 1,
      at: ago(150),
      kind: 'answered',
      unit: UNIT,
      worker: WORKER,
    });
    const r = run(fx, ['reap', LOOP]);
    expect(r).toEqual({ code: 0, out: [], err: [] });
  });

  test('a model that requests without end is reaped once past both caps', () => {
    const fx = unitFixture({ dispatchedAgo: 250 });
    appendRecord(fx.loopDir, {
      v: 1,
      at: ago(245),
      kind: 'request',
      summary: 'still waiting',
      command: 'ask',
      unit: UNIT,
    });
    const r = run(fx, ['reap', LOOP]);
    expect(r.out[0]).toBe(reapLead(190));
    expect(kinds(fx).slice(-2)).toEqual(['failed', 'discarded']);
  });

  test('a stop that fails keeps the attempt in flight, and reap refuses', () => {
    const fx = unitFixture({ dispatchedAgo: 240 });
    fx.claude.state.stopResult = {
      code: 1,
      stdout: '',
      stderr: '',
      timedOut: false,
    };
    const before = snapshot(fx.loopDir);
    const r = run(fx, ['reap', LOOP]);
    expect(r.code).toBe(1);
    expect(r.err[0]).toBe(reapLead(240));
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test('reap refuses an overdue attempt whose unit id names a folder, touching no path and writing nothing', () => {
    const fx = unitFixture({ dispatchedAgo: 60 });
    appendRecord(fx.loopDir, {
      v: 1,
      at: ago(50),
      kind: 'discarded',
      unit: UNIT,
      worker: WORKER,
      reason: 'requeued',
    });
    appendRecord(fx.loopDir, {
      v: 1,
      at: ago(240),
      kind: 'dispatched',
      unit: '..',
      worker: 'fixer-000002',
    });
    const before = snapshot(fx.loopDir);
    const r = run(fx, ['reap', LOOP]);
    expect(r.code).toBe(1);
    expect(r.err).toEqual([
      'unit .. · worker fixer-000002 worked 240 minutes, past the work cap of 180 minutes, so reap stops and discards it',
      'unit: .. names a folder, not a unit',
      `discard touches no path for unit ".." and writes nothing: the dispatched line that names it needs the operator's hand, in ${fx.loopDir}/records`,
    ]);
    expect(fx.claude.calls).toEqual([]);
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test('reap refuses a record it cannot read, naming the file', () => {
    const fx = unitFixture({ dispatchedAgo: 240 });
    fs.mkdirSync(path.join(fx.loopDir, 'records', '2026-11-13.jsonl'));
    const r = run(fx, ['reap', LOOP]);
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain('2026-11-13.jsonl');
    expect(r.err.at(-1)).toBe(
      "reap cannot read the loop's record, so it cannot time the attempt in flight",
    );
    expect(fx.claude.calls).toEqual([]);
  });

  test('reap refuses a units.lock another verb holds', () => {
    const fx = unitFixture({ dispatchedAgo: 240 });
    fs.writeFileSync(
      path.join(fx.loopDir, 'units.lock'),
      JSON.stringify({ pid: 77, at: NOW.toISOString() }),
    );
    const r = run(fx, ['reap', LOOP], { isAlive: (pid) => pid === 77 });
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain(
      'another unit verb holds the lock (pid 77)',
    );
    expect(kinds(fx)).toEqual(['dispatched']);
  });

  test("reap refuses another loop's SIDEKICK_LOOP", () => {
    const fx = unitFixture({ dispatchedAgo: 240 });
    const r = run(fx, ['reap', LOOP], {
      env: { CLAUDE_CONFIG_DIR: fx.config, SIDEKICK_LOOP: 'other' },
    });
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain('SIDEKICK_LOOP is "other"');
    expect(kinds(fx)).toEqual(['dispatched']);
  });

  test.each([
    ['no name', ['reap']],
    ['two names', ['reap', LOOP, 'other']],
    ['a flag', ['reap', LOOP, '--all']],
  ])('%s prints the usage', (_label, args) => {
    const fx = unitFixture();
    expect(run(fx, args)).toEqual({
      code: 1,
      out: [],
      err: [`usage: ${REAP_USAGE_LINE}`],
    });
  });

  test('the usage names reap', () => {
    expect(LOOP_USAGE_LINE).toContain('| reap <name>');
  });
});

describe('every unit verb reaps first', () => {
  test('discard of an overdue unit lets its reap close the attempt, and says so', () => {
    const fx = unitFixture({ dispatchedAgo: 240 });
    const r = run(fx, [
      'discard',
      LOOP,
      '--unit',
      UNIT,
      '--reason',
      'requeued',
    ]);
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.out[0]).toBe(reapLead(240));
    expect(r.out.at(-1)).toBe(
      `reap closed unit ${UNIT}'s attempt as failed, past its work cap, so discard has nothing more to close`,
    );
    expect(kinds(fx)).toEqual(['dispatched', 'failed', 'discarded']);
  });

  test("discard of another unit refuses once the reap has closed the overdue one, keeping the reap's lines", () => {
    const fx = unitFixture({ dispatchedAgo: 240 });
    const r = run(fx, [
      'discard',
      LOOP,
      '--unit',
      'triage-7',
      '--reason',
      'requeued',
    ]);
    expect(r.out[0]).toBe(reapLead(240));
    expect(r.err).toEqual([
      'no attempt for unit triage-7 is in flight, so discard has nothing to close',
    ]);
    expect(r.code).toBe(1);
    expect(kinds(fx)).toEqual(['dispatched', 'failed', 'discarded']);
  });

  test('record reaps first, then records', () => {
    const fx = unitFixture({ dispatchedAgo: 240, listed: false });
    const r = run(fx, ['record', LOOP, '--kind', 'note', '--summary', 'tick']);
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.out[0]).toBe(reapLead(240));
    expect(r.out.at(-1)).toBe('recorded note');
    expect(kinds(fx)).toEqual(['dispatched', 'failed', 'discarded', 'note']);
  });

  test('record with nothing overdue calls no claude', () => {
    const fx = unitFixture({ dispatchedAgo: 60 });
    const r = run(fx, ['record', LOOP, '--kind', 'note', '--summary', 'tick']);
    expect(r).toEqual({ code: 0, out: ['recorded note'], err: [] });
    expect(fx.claude.calls).toEqual([]);
  });

  test('record refuses while another verb holds units.lock, and writes nothing', () => {
    const fx = unitFixture({ dispatchedAgo: 240 });
    fs.writeFileSync(
      path.join(fx.loopDir, 'units.lock'),
      JSON.stringify({ pid: 77, at: NOW.toISOString() }),
    );
    const r = run(fx, ['record', LOOP, '--kind', 'note', '--summary', 'tick'], {
      isAlive: (pid) => pid === 77,
    });
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain(
      'another unit verb holds the lock (pid 77)',
    );
    expect(kinds(fx)).toEqual(['dispatched']);
  });

  test('record names a reap that cannot read loop.json, and still records', () => {
    const fx = unitFixture({ dispatchedAgo: 240, listed: false });
    fs.writeFileSync(path.join(fx.loopDir, 'state.json'), stateJson());
    fs.rmSync(path.join(fx.loopDir, 'loop.json'));
    const r = run(fx, ['record', LOOP, '--kind', 'note', '--summary', 'tick']);
    expect(r.code).toBe(0);
    expect(r.out).toEqual(['recorded note']);
    expect(r.err).toEqual([
      'reap could not run, so an attempt past its work cap may run on:',
      `${path.join(fx.loopDir, 'loop.json')}: missing`,
    ]);
    expect(kinds(fx)).toEqual(['dispatched', 'note']);
  });
});

// A launch's state.json, so record judges by it with no loop.json.
const stateJson = (): string =>
  JSON.stringify({
    v: 1,
    launch: 'L1',
    job: 'job1',
    session: `loop-${LOOP}`,
    launchedAt: NOW.toISOString(),
    startedAt: NOW.toISOString(),
    hash: 'a'.repeat(64),
    record: false,
    states: {},
    schedule: '7 * * * *',
    tick: '/fixer:tick',
  });
