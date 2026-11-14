import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as v from 'valibot';
import { parseCron } from './loop-cron.js';
import {
  appendRecord,
  isNewRequest,
  MODEL_KINDS,
  type RecordLine,
  RecordLineSchema,
  readRecords,
  recordFile,
} from './loop-record.js';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-loop-record-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const T = new Date(2026, 10, 14, 10, 20);
const base = (d: Date) => ({ v: 1 as const, at: d.toISOString() });

const nine: RecordLine[] = [
  {
    ...base(T),
    kind: 'would',
    summary: 's',
    class: 'c',
    command: 'x',
    unit: 'u1',
    hash: 'h',
  },
  { ...base(T), kind: 'request', summary: 's', command: 'x' },
  { ...base(T), kind: 'did', summary: 's', class: 'c', command: 'x' },
  { ...base(T), kind: 'denied', summary: 's', command: 'x', class: 'c' },
  { ...base(T), kind: 'note', summary: 's' },
  { ...base(T), kind: 'dispatched', unit: 'u1', record: true },
  { ...base(T), kind: 'landed', unit: 'u1', commit: 'abc1234' },
  { ...base(T), kind: 'failed', unit: 'u1', reason: 'boom' },
  { ...base(T), kind: 'discarded', unit: 'u1', reason: 'no' },
];

describe('the schema', () => {
  test('MODEL_KINDS names the five model kinds', () => {
    expect([...MODEL_KINDS]).toEqual([
      'would',
      'request',
      'did',
      'denied',
      'note',
    ]);
  });

  test('each of the nine kinds round-trips through append and read', () => {
    for (const line of nine) appendRecord(dir, line);
    const read = readRecords(
      dir,
      new Date(2026, 10, 14),
      new Date(2026, 10, 14, 23, 59),
    );
    expect(read.skipped).toBe(0);
    expect(read.lines).toEqual(nine);
  });

  const bad: [string, unknown][] = [
    [
      'would without class',
      { ...base(T), kind: 'would', summary: 's', command: 'x' },
    ],
    ['request without command', { ...base(T), kind: 'request', summary: 's' }],
    [
      'did without command',
      { ...base(T), kind: 'did', summary: 's', class: 'c' },
    ],
    ['denied without command', { ...base(T), kind: 'denied', summary: 's' }],
    ['note without summary', { ...base(T), kind: 'note' }],
    ['dispatched without unit', { ...base(T), kind: 'dispatched' }],
    [
      'dispatched with record false',
      { ...base(T), kind: 'dispatched', unit: 'u', record: false },
    ],
    ['landed without commit', { ...base(T), kind: 'landed', unit: 'u' }],
    [
      'landed with a non-hex commit',
      { ...base(T), kind: 'landed', unit: 'u', commit: 'zzzzzzz' },
    ],
    ['failed without reason', { ...base(T), kind: 'failed', unit: 'u' }],
    ['unknown kind', { ...base(T), kind: 'wat', summary: 's' }],
    [
      'wrong version',
      { v: 2, at: T.toISOString(), kind: 'note', summary: 's' },
    ],
    ['at not a date', { v: 1, at: 'tomorrow', kind: 'note', summary: 's' }],
    [
      'at out of range',
      { v: 1, at: '2026-13-45T00:00:00.000Z', kind: 'note', summary: 's' },
    ],
    [
      'summary over 1,000',
      { ...base(T), kind: 'note', summary: 'a'.repeat(1001) },
    ],
    [
      'command over 4,000',
      { ...base(T), kind: 'request', summary: 's', command: 'a'.repeat(4001) },
    ],
    ['unit a/b', { ...base(T), kind: 'note', summary: 's', unit: 'a/b' }],
    ['unit empty', { ...base(T), kind: 'note', summary: 's', unit: '' }],
    [
      'unit over 64',
      { ...base(T), kind: 'note', summary: 's', unit: 'a'.repeat(65) },
    ],
  ];
  for (const [name, input] of bad) {
    test(`refuses ${name}`, () => {
      expect(v.safeParse(RecordLineSchema, input).success).toBe(false);
    });
  }

  test('accepts the bounds exactly', () => {
    const ok = {
      ...base(T),
      kind: 'request',
      summary: 'a'.repeat(1000),
      command: 'a'.repeat(4000),
      unit: 'A.b_c-9'.padEnd(64, 'x'),
    };
    expect(v.safeParse(RecordLineSchema, ok).success).toBe(true);
  });

  test('a field a newer writer added is stripped, not refused', () => {
    const parsed = v.safeParse(RecordLineSchema, {
      ...base(T),
      kind: 'note',
      summary: 's',
      extra: 1,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'extra' in parsed.output).toBe(false);
  });
});

describe('files and reading', () => {
  test('recordFile names the local date', () => {
    expect(recordFile(dir, new Date(2026, 10, 14, 23, 59))).toBe(
      path.join(dir, 'records', '2026-11-14.jsonl'),
    );
  });

  test('lines at 23:59 and 00:01 land in two files and one read returns both', () => {
    const a = new Date(2026, 10, 14, 23, 59);
    const b = new Date(2026, 10, 15, 0, 1);
    appendRecord(dir, { ...base(b), kind: 'note', summary: 'b' });
    appendRecord(dir, { ...base(a), kind: 'note', summary: 'a' });
    expect(fs.existsSync(path.join(dir, 'records', '2026-11-14.jsonl'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(dir, 'records', '2026-11-15.jsonl'))).toBe(
      true,
    );
    const read = readRecords(
      dir,
      new Date(2026, 10, 14),
      new Date(2026, 10, 15, 1),
    );
    expect(read.lines.map((l) => l.kind === 'note' && l.summary)).toEqual([
      'a',
      'b',
    ]);
  });

  test('keeps only lines inside [since, until]', () => {
    const at = (h: number) => new Date(2026, 10, 14, h);
    for (const h of [8, 9, 10, 11]) {
      appendRecord(dir, { ...base(at(h)), kind: 'note', summary: String(h) });
    }
    const read = readRecords(dir, at(9), at(10));
    expect(read.lines.map((l) => l.kind === 'note' && l.summary)).toEqual([
      '9',
      '10',
    ]);
  });

  test('skips and counts a torn line and foreign JSON', () => {
    appendRecord(dir, { ...base(T), kind: 'note', summary: 'ok' });
    fs.appendFileSync(recordFile(dir, T), '{"v":1,"at":"2026-11\n{"foo":1}\n');
    const read = readRecords(
      dir,
      new Date(2026, 10, 14),
      new Date(2026, 10, 14, 23, 59),
    );
    expect(read.lines).toHaveLength(1);
    expect(read.skipped).toBe(2);
  });

  test('reads nothing from a loop with no records folder', () => {
    expect(
      readRecords(dir, new Date(2026, 10, 1), new Date(2026, 10, 14)),
    ).toEqual({
      lines: [],
      skipped: 0,
    });
  });
});

describe('isNewRequest', () => {
  const parsed = parseCron('7 * * * *');
  if (!parsed.ok) throw new Error('fixture cron');
  const cron = parsed.cron;
  const key = { class: 'c', command: 'x', unit: undefined };
  const req = (d: Date, extra: object = {}): RecordLine => ({
    ...base(d),
    kind: 'request',
    summary: 's',
    command: 'x',
    class: 'c',
    ...extra,
  });
  const at = new Date(2026, 10, 14, 10, 20);

  test('is new with no records', () => {
    expect(isNewRequest(dir, cron, key, at)).toBe(true);
  });
  test('is new when the only identical one is at 09:00', () => {
    appendRecord(dir, req(new Date(2026, 10, 14, 9, 0)));
    expect(isNewRequest(dir, cron, key, at)).toBe(true);
  });
  test('repeats when one is at 09:10', () => {
    appendRecord(dir, req(new Date(2026, 10, 14, 9, 10)));
    expect(isNewRequest(dir, cron, key, at)).toBe(false);
  });
  test('is new when only the unit differs', () => {
    appendRecord(dir, req(new Date(2026, 10, 14, 9, 10), { unit: 'u1' }));
    expect(isNewRequest(dir, cron, key, at)).toBe(true);
    expect(isNewRequest(dir, cron, { ...key, unit: 'u1' }, at)).toBe(false);
  });
  test('is new when only the class differs, and an absent class equals only absent', () => {
    appendRecord(dir, req(new Date(2026, 10, 14, 9, 10)));
    expect(isNewRequest(dir, cron, { ...key, class: 'd' }, at)).toBe(true);
    expect(isNewRequest(dir, cron, { ...key, class: undefined }, at)).toBe(
      true,
    );
  });
  test('compares request lines only', () => {
    appendRecord(dir, {
      ...base(new Date(2026, 10, 14, 9, 10)),
      kind: 'denied',
      summary: 's',
      command: 'x',
      class: 'c',
    });
    expect(isNewRequest(dir, cron, key, at)).toBe(true);
  });
  test('a request after `at` is outside the window', () => {
    appendRecord(dir, req(new Date(2026, 10, 14, 10, 30)));
    expect(isNewRequest(dir, cron, key, at)).toBe(true);
  });
});
