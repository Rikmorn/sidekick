import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { removeTemps, tmp } from './fixtures/worker/repo.js';
import {
  jobIdFrom,
  readRecords,
  recordsDir,
  removeRecord,
  type WorkerRecord,
  writeRecord,
} from './worker-record.js';

afterEach(removeTemps);

const record = (name: string): WorkerRecord => ({
  version: 2,
  name,
  main: 'p13-main',
  job: 'abc12345',
  brief: '/r/docs/brief.md',
  dispatchedAt: '2026-10-15T10:00:00.000Z',
});

describe('jobIdFrom', () => {
  // Measured: Claude Code 2.1.300 printed `backgrounded · e21776e8 · p7-desk`.
  const line =
    'Starting background service…\nbackgrounded · b9b00977 · dk-work\n';

  test('takes the id on the line for this name', () => {
    expect(jobIdFrom(line, 'dk-work')).toBe('b9b00977');
  });

  test('picks the line whose name matches among several', () => {
    const two = `backgrounded · 11111111 · other\n${line}`;
    expect(jobIdFrom(two, 'dk-work')).toBe('b9b00977');
  });

  test('is null for another name, and for empty output', () => {
    expect(jobIdFrom(line, 'other')).toBeNull();
    expect(jobIdFrom('', 'dk-work')).toBeNull();
  });

  test('takes the bare `backgrounded <id>` form when it is the only line', () => {
    expect(jobIdFrom('backgrounded 213245a1\n', 'dk-work')).toBe('213245a1');
  });

  test('refuses a bare form beside another backgrounded line', () => {
    const mixed = 'backgrounded 213245a1\nbackgrounded · 22222222 · other\n';
    expect(jobIdFrom(mixed, 'dk-work')).toBeNull();
  });
});

describe('records', () => {
  test('writeRecord creates the folders and readRecords returns the record', () => {
    const dir = tmp();
    expect(writeRecord(dir, record('w1'))).toEqual({ ok: true });
    expect(fs.existsSync(path.join(recordsDir(dir), 'w1.json'))).toBe(true);
    expect(readRecords(dir)).toEqual({ records: [record('w1')], warnings: [] });
  });

  test('a null main round-trips', () => {
    const dir = tmp();
    writeRecord(dir, { ...record('w1'), main: null });
    expect(readRecords(dir).records[0].main).toBeNull();
  });

  test('a version 1 record reads as version 2 with a null main', () => {
    const dir = tmp();
    fs.mkdirSync(recordsDir(dir), { recursive: true });
    const { main: _main, ...rest } = record('w1');
    fs.writeFileSync(
      path.join(recordsDir(dir), 'w1.json'),
      JSON.stringify({ ...rest, version: 1 }),
    );
    expect(readRecords(dir)).toEqual({
      records: [{ ...record('w1'), main: null }],
      warnings: [],
    });
  });

  test('a null job round-trips', () => {
    const dir = tmp();
    writeRecord(dir, { ...record('w1'), job: null });
    expect(readRecords(dir).records[0].job).toBeNull();
  });

  test('a file that is not JSON gives one warning naming it, beside the good record', () => {
    const dir = tmp();
    writeRecord(dir, record('w1'));
    const bad = path.join(recordsDir(dir), 'bad.json');
    fs.writeFileSync(bad, 'not json');
    const read = readRecords(dir);
    expect(read.records).toEqual([record('w1')]);
    expect(read.warnings).toHaveLength(1);
    expect(read.warnings[0]).toContain(bad);
  });

  test('a JSON file of the wrong shape is a warning too', () => {
    const dir = tmp();
    fs.mkdirSync(recordsDir(dir), { recursive: true });
    fs.writeFileSync(path.join(recordsDir(dir), 'x.json'), '{"version":3}');
    const read = readRecords(dir);
    expect(read.records).toEqual([]);
    expect(read.warnings).toHaveLength(1);
  });

  test.each([
    ['../escape', 'escape.json'],
    ['Bad_Name', 'Bad_Name.json'],
  ])('a record named "%s", against the worker-name rule, is skipped with a warning', (name, base) => {
    const dir = tmp();
    writeRecord(dir, record('w1'));
    const file = path.join(recordsDir(dir), base);
    fs.writeFileSync(file, JSON.stringify(record(name)));
    const read = readRecords(dir);
    expect(read.records).toEqual([record('w1')]);
    expect(read.warnings).toEqual([
      `${file} is not a worker record: must match ^[a-z0-9][a-z0-9-]{0,39}$`,
    ]);
  });

  test('a record whose name is not its file name is skipped with a warning', () => {
    const dir = tmp();
    writeRecord(dir, record('b'));
    const file = path.join(recordsDir(dir), 'a.json');
    fs.renameSync(path.join(recordsDir(dir), 'b.json'), file);
    const read = readRecords(dir);
    expect(read.records).toEqual([]);
    expect(read.warnings).toEqual([
      `${file} holds the record of "b", not of "a"`,
    ]);
  });

  test('a missing folder is no records', () => {
    expect(readRecords(tmp())).toEqual({ records: [], warnings: [] });
  });

  test('removeRecord removes a file and is quiet when it is absent', () => {
    const dir = tmp();
    writeRecord(dir, record('w1'));
    removeRecord(dir, 'w1');
    expect(readRecords(dir).records).toEqual([]);
    expect(() => removeRecord(dir, 'w1')).not.toThrow();
  });

  test('a name that could leave the folder is neither written nor removed', () => {
    const dir = tmp();
    const outside = path.join(dir, 'sidekick', 'escape.json');
    fs.mkdirSync(path.dirname(outside), { recursive: true });
    fs.writeFileSync(outside, 'keep');
    const result = writeRecord(dir, record('../escape'));
    expect('issue' in result).toBe(true);
    removeRecord(dir, '../escape');
    expect(fs.readFileSync(outside, 'utf-8')).toBe('keep');
  });

  test('writeRecord returns an issue naming the file when the folder cannot be made', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'sidekick'), 'a file');
    const result = writeRecord(dir, record('w1'));
    expect('issue' in result && result.issue).toContain(
      path.join(recordsDir(dir), 'w1.json'),
    );
  });
});
