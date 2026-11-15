import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { appendRecord, type RecordLine } from './loop-record.js';
import { LOCK_FILE, takeLock } from './loop-state.js';
import {
  attemptDir,
  breakerTripped,
  capIssues,
  deriveUnitId,
  inFlight,
  readLedger,
  readWorkerFile,
  UNITS_DIR,
  UNITS_LOCK,
  unitIdIssues,
  workingMinutes,
  writeWorkerFile,
} from './loop-units.js';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-test-loop-units-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const caps = {
  attemptsPerUnit: 2,
  workMinutesPerUnit: 60,
  waitMinutesPerUnit: 30,
  unitsPerDay: 3,
  failedUnitsInARow: 2,
};
const T0 = new Date('2026-11-15T10:00:00.000Z');
const at = (min: number): string =>
  new Date(T0.getTime() + min * 60_000).toISOString();
const at0 = (min: number): Date => new Date(at(min));

const dispatched = (
  min: number,
  unit = 'fix-1',
  worker = 'w1',
  record?: true,
): RecordLine => ({
  v: 1,
  at: at(min),
  kind: 'dispatched',
  unit,
  worker,
  ...(record ? { record } : {}),
});
const landed = (min: number, unit = 'fix-1'): RecordLine => ({
  v: 1,
  at: at(min),
  kind: 'landed',
  unit,
  commit: 'abcdef1',
});
const failed = (min: number, unit = 'fix-1', worker?: string): RecordLine => ({
  v: 1,
  at: at(min),
  kind: 'failed',
  unit,
  reason: 'r',
  ...(worker ? { worker } : {}),
});
const discarded = (
  min: number,
  unit = 'fix-1',
  worker?: string,
): RecordLine => ({
  v: 1,
  at: at(min),
  kind: 'discarded',
  unit,
  reason: 'r',
  ...(worker ? { worker } : {}),
});
const resumed = (min: number): RecordLine => ({
  v: 1,
  at: at(min),
  kind: 'resumed',
  reason: 'r',
});
const request = (min: number, unit = 'fix-1'): RecordLine => ({
  v: 1,
  at: at(min),
  kind: 'request',
  summary: 's',
  command: 'c',
  unit,
});
const answered = (min: number, unit = 'fix-1', worker = 'w1'): RecordLine => ({
  v: 1,
  at: at(min),
  kind: 'answered',
  unit,
  worker,
});

describe('unit ids', () => {
  test.each([
    ['.', 1],
    ['..', 1],
    ['fix-bug-42', 0],
    ['a/b', 1],
    ['', 1],
    ['x'.repeat(65), 1],
  ])('unitIdIssues(%j) gives %i issue(s)', (id, count) => {
    expect(unitIdIssues(id)).toHaveLength(count);
  });
  test('deriveUnitId gives fix-bug-42', () => {
    expect(deriveUnitId('x:fix-bug', 42)).toBe('fix-bug-42');
  });
  test('attemptDir joins units, unit, worker', () => {
    expect(attemptDir('/l', 'fix-1', 'w1')).toBe(
      path.join('/l', UNITS_DIR, 'fix-1', 'w1'),
    );
  });
});

describe('inFlight', () => {
  test('is open from dispatched', () => {
    const open = inFlight([dispatched(0)]);
    expect(open).toMatchObject({ unit: 'fix-1', worker: 'w1', record: false });
    expect(open?.dispatchedAt).toEqual(at0(0));
  });
  test.each([
    ['landed', landed(5)],
    ['failed with the worker', failed(5, 'fix-1', 'w1')],
    ['failed without a worker', failed(5)],
    ['discarded with the worker', discarded(5, 'fix-1', 'w1')],
    ['discarded without a worker', discarded(5)],
  ])('ends at %s', (_name, line) => {
    expect(inFlight([dispatched(0), line])).toBeUndefined();
  });
  test('another worker or unit does not close it', () => {
    expect(inFlight([dispatched(0), failed(5, 'fix-1', 'w2')])).toBeDefined();
    expect(inFlight([dispatched(0), landed(5, 'other')])).toBeDefined();
  });
  test('a close before the dispatch does not count', () => {
    expect(inFlight([landed(0), dispatched(5)])).toBeDefined();
  });
  test('with two open it returns the newest', () => {
    expect(
      inFlight([dispatched(0, 'a-1', 'w1'), dispatched(5, 'b-1', 'w2')])
        ?.worker,
    ).toBe('w2');
  });
  test('record flags the attempt', () => {
    expect(inFlight([dispatched(0, 'fix-1', 'w1', true)])?.record).toBe(true);
  });
});

describe('capIssues', () => {
  test('attempts ignore record dispatches', () => {
    const lines = [
      dispatched(0, 'fix-1', 'w1', true),
      discarded(1),
      dispatched(2, 'fix-1', 'w2', true),
      discarded(3),
    ];
    expect(capIssues(lines, caps, 'fix-1', at0(10), 'l')).toEqual([]);
  });
  test('attempts at the cap refuse', () => {
    const lines = [
      dispatched(0, 'fix-1', 'w1'),
      discarded(1),
      dispatched(2, 'fix-1', 'w2'),
      discarded(3),
    ];
    const issues = capIssues(lines, caps, 'fix-1', at0(10), 'l');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('attemptsPerUnit');
    expect(capIssues(lines, caps, 'fix-2', at0(10), 'l')).toEqual([]);
  });
  test('units per day counts record dispatches', () => {
    const lines = [
      dispatched(0, 'a-1', 'w1', true),
      discarded(1, 'a-1'),
      dispatched(2, 'b-1', 'w2', true),
      discarded(3, 'b-1'),
      dispatched(4, 'c-1', 'w3'),
      discarded(5, 'c-1'),
    ];
    const issues = capIssues(lines, caps, 'd-1', at0(10), 'l');
    expect(issues.some((i) => i.includes('unitsPerDay'))).toBe(true);
  });
  test('units per day ignores dispatches of another local day', () => {
    const old: RecordLine = {
      ...dispatched(0),
      at: new Date(T0.getTime() - 3 * 24 * 3_600_000).toISOString(),
    };
    const lines = [old, old, old];
    expect(
      capIssues(lines, { ...caps, attemptsPerUnit: 99 }, 'z-1', at0(10), 'l'),
    ).toEqual([]);
  });
  test('units per day splits at local midnight', () => {
    const local = (day: number, h: number, m: number): string =>
      new Date(2026, 10, day, h, m).toISOString();
    const lines: RecordLine[] = [
      { ...dispatched(0, 'a-1'), at: local(15, 23, 58) },
      { ...dispatched(0, 'b-1'), at: local(15, 23, 59) },
      { ...dispatched(0, 'c-1'), at: local(16, 0, 1) },
    ];
    const two = { ...caps, unitsPerDay: 2 };
    const before = capIssues(
      lines,
      two,
      'z-1',
      new Date(2026, 10, 15, 23, 59),
      'l',
    );
    const after = capIssues(
      lines,
      two,
      'z-1',
      new Date(2026, 10, 16, 0, 30),
      'l',
    );
    expect(before.some((i) => i.includes('unitsPerDay'))).toBe(true);
    expect(after.some((i) => i.includes('unitsPerDay'))).toBe(false);
  });
  test('the breaker names the way out', () => {
    const lines = [failed(0, 'a-1'), failed(1, 'b-1')];
    const issues = capIssues(lines, caps, 'c-1', at0(10), 'fixer');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('sidekick loop resume fixer --reason');
  });
});

describe('breakerTripped', () => {
  test('counts failed, ignores discarded, restarts at landed or resumed', () => {
    expect(breakerTripped([failed(0), failed(1)], caps)).toBe(true);
    expect(breakerTripped([failed(0), discarded(1), failed(2)], caps)).toBe(
      true,
    );
    expect(breakerTripped([failed(0), discarded(1)], caps)).toBe(false);
    expect(breakerTripped([failed(0), landed(1), failed(2)], caps)).toBe(false);
    expect(breakerTripped([failed(0), failed(1), resumed(2)], caps)).toBe(
      false,
    );
    expect(
      breakerTripped([failed(0), failed(1), resumed(2), failed(3)], caps),
    ).toBe(false);
    expect(
      breakerTripped(
        [failed(0), failed(1), resumed(2), failed(3), failed(4)],
        caps,
      ),
    ).toBe(true);
  });
});

describe('workingMinutes', () => {
  const attempt = (min = 0) => ({
    unit: 'fix-1',
    worker: 'w1',
    dispatchedAt: at0(min),
    record: false,
  });
  test('no waits is wall time', () => {
    expect(workingMinutes([dispatched(0)], attempt(), caps, at0(50))).toBe(50);
  });
  test('waits within the cap pause the clock', () => {
    const lines = [dispatched(0), request(10), answered(25)];
    expect(workingMinutes(lines, attempt(), caps, at0(40))).toBe(25);
  });
  test('waits past the cap count as work', () => {
    const lines = [dispatched(0), request(10), answered(60)];
    expect(workingMinutes(lines, attempt(), caps, at0(70))).toBe(40);
  });
  test('an open wait runs to now', () => {
    const lines = [dispatched(0), request(10)];
    expect(workingMinutes(lines, attempt(), caps, at0(30))).toBe(10);
    expect(workingMinutes(lines, attempt(), caps, at0(100))).toBe(70);
  });
  test('a second request during a wait changes nothing', () => {
    const lines = [dispatched(0), request(10), request(15), answered(20)];
    expect(workingMinutes(lines, attempt(), caps, at0(30))).toBe(20);
  });
  test('a request for another unit or an answer for another worker is not its wait', () => {
    const lines = [
      dispatched(0),
      request(10, 'other'),
      request(12),
      answered(14, 'fix-1', 'w2'),
    ];
    expect(workingMinutes(lines, attempt(), caps, at0(20))).toBe(12);
  });
  test('lines before the dispatch are not counted', () => {
    const lines = [request(0), answered(5), dispatched(10)];
    expect(workingMinutes(lines, attempt(10), caps, at0(20))).toBe(10);
  });
  test('a model that requests without end stops pausing at the wait cap', () => {
    const lines: RecordLine[] = [dispatched(0)];
    for (let m = 1; m < 500; m += 2) lines.push(request(m));
    const minutes = workingMinutes(lines, attempt(), caps, at0(500));
    expect(minutes).toBe(500 - caps.waitMinutesPerUnit);
    expect(minutes).toBeGreaterThan(caps.workMinutesPerUnit);
  });
});

describe('readLedger', () => {
  test('reads every day file, oldest first', () => {
    const old = new Date(T0.getTime() - 40 * 24 * 3_600_000);
    appendRecord(tmp, { ...dispatched(0), at: old.toISOString() });
    appendRecord(tmp, dispatched(0));
    const read = readLedger(tmp, at0(1));
    expect('lines' in read && read.lines).toHaveLength(2);
    expect('lines' in read && read.lines[0]?.at).toBe(old.toISOString());
  });
  test('a loop with no records is an empty ledger', () => {
    expect(readLedger(tmp, T0)).toEqual({ lines: [] });
  });
  test('a line after now is outside the ledger', () => {
    appendRecord(tmp, dispatched(5));
    expect(readLedger(tmp, T0)).toEqual({ lines: [] });
  });
  test('refuses an unreadable day file, naming it', () => {
    const dir = path.join(tmp, 'records');
    fs.mkdirSync(path.join(dir, '2026-11-10.jsonl'), { recursive: true });
    appendRecord(tmp, dispatched(0));
    const read = readLedger(tmp, at0(1));
    expect('issues' in read && read.issues.join('\n')).toContain(
      '2026-11-10.jsonl',
    );
  });
  test('reads a day file named for a later local day than now', () => {
    const dir = path.join(tmp, 'records');
    fs.mkdirSync(dir);
    const line = JSON.stringify(dispatched(0));
    fs.writeFileSync(path.join(dir, '2030-01-01.jsonl'), `${line}\n`);
    const read = readLedger(tmp, at0(1));
    expect('lines' in read && read.lines).toHaveLength(1);
  });
  test('a records path that is not a folder refuses', () => {
    fs.writeFileSync(path.join(tmp, 'records'), 'x');
    expect('issues' in readLedger(tmp, T0)).toBe(true);
  });
});

describe('worker file', () => {
  const file = {
    v: 1 as const,
    worker: 'w1',
    job: null,
    issue: 42,
    dispatchedAt: T0.toISOString(),
  };
  test('round trips', () => {
    const dir = path.join(tmp, 'a');
    expect(writeWorkerFile(dir, file)).toEqual([]);
    expect(readWorkerFile(dir)).toEqual(file);
  });
  test('refuses a bad file on write and on read, writing nothing', () => {
    const dir = path.join(tmp, 'b');
    expect(writeWorkerFile(dir, { ...file, worker: 'Bad Name' })).not.toEqual(
      [],
    );
    expect(fs.existsSync(dir)).toBe(false);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'worker.json'), '{"v":2}');
    expect('issues' in readWorkerFile(dir)).toBe(true);
    expect('issues' in readWorkerFile(path.join(tmp, 'none'))).toBe(true);
  });
});

describe('units lock', () => {
  const opts = {
    pid: 11,
    now: T0,
    bootTime: new Date(T0.getTime() - 3_600_000),
    isAlive: (pid: number) => pid === 7 || pid === 11,
  };
  test('a second units lock is refused while the first is held', () => {
    const first = takeLock(tmp, opts, UNITS_LOCK);
    expect(first.kind).toBe('held');
    const second = takeLock(tmp, { ...opts, pid: 12 }, UNITS_LOCK);
    expect(second.kind).toBe('busy');
    if (second.kind === 'busy') {
      expect(second.issue).toContain(UNITS_LOCK);
      expect(second.issue).not.toContain('start');
    }
    if (first.kind === 'held') first.release();
    expect(fs.existsSync(path.join(tmp, UNITS_LOCK))).toBe(false);
  });
  test('the units lock and the start lock are independent', () => {
    const start = takeLock(tmp, opts);
    const units = takeLock(tmp, opts, UNITS_LOCK);
    expect(start.kind).toBe('held');
    expect(units.kind).toBe('held');
    expect(fs.existsSync(path.join(tmp, LOCK_FILE))).toBe(true);
  });
  test('an unreadable units lock is refused without naming start', () => {
    fs.writeFileSync(path.join(tmp, UNITS_LOCK), 'junk');
    const lock = takeLock(tmp, opts, UNITS_LOCK);
    expect(lock.kind).toBe('busy');
    if (lock.kind === 'busy') expect(lock.issue).not.toContain('start');
  });
});
