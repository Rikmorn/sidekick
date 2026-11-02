import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import type { MemoryLintResult } from './memory-lint.js';
import { cachePath, readCache, writeCache } from './memory-lint-cache.js';
import { execRunner } from './pm-data.js';

afterEach(removeTemps);

const CACHE_NAME = 'sidekick-lint.json';
const RAN_AT = new Date('2026-11-02T14:10:00.000Z');
const RESULT: MemoryLintResult = {
  findings: [
    {
      id: 'dead-link',
      folder: 'proj',
      file: '/store/proj/MEMORY.md',
      line: 3,
      message: 'gone.md does not exist',
    },
    {
      id: 'settings-invalid',
      folder: '',
      file: '/store/settings.json',
      message: 'not valid JSON',
    },
  ],
  counts: { 'dead-link': 1, 'settings-invalid': 1 },
};

const VALID = {
  version: 1,
  ranAt: RAN_AT.toISOString(),
  findings: RESULT.findings,
  counts: RESULT.counts,
};

describe('cachePath', () => {
  test("names a file in the store's git directory, as an absolute path", () => {
    const store = repo();
    expect(cachePath(store, execRunner)).toBe(
      path.join(store, '.git', CACHE_NAME),
    );
  });

  test('gives none for a folder inside another repo', () => {
    const outer = repo();
    const inner = path.join(outer, 'store');
    fs.mkdirSync(inner);
    expect(cachePath(inner, execRunner)).toBeUndefined();
  });

  test('gives none for a folder outside any repo', () => {
    expect(cachePath(tmp(), execRunner)).toBeUndefined();
  });
});

describe('writeCache and readCache', () => {
  test('a written cache reads back whole', () => {
    const file = path.join(tmp(), CACHE_NAME);
    writeCache(file, RESULT, RAN_AT);
    expect(readCache(file)).toEqual(VALID);
  });

  test('a write replaces the old cache and leaves no temporary file', () => {
    const dir = tmp();
    const file = path.join(dir, CACHE_NAME);
    writeCache(file, { findings: [], counts: {} }, RAN_AT);
    writeCache(file, RESULT, RAN_AT);
    expect(fs.readdirSync(dir)).toEqual([CACHE_NAME]);
    expect(readCache(file)?.counts).toEqual(RESULT.counts);
  });

  test('a write that fails throws and removes its temporary file', () => {
    const dir = tmp();
    const file = path.join(dir, CACHE_NAME);
    // A folder in the cache's place makes the rename fail.
    fs.mkdirSync(file);
    fs.writeFileSync(path.join(file, 'keep'), '');
    expect(() => writeCache(file, RESULT, RAN_AT)).toThrow();
    expect(fs.readdirSync(dir)).toEqual([CACHE_NAME]);
  });

  test.each([
    ['a file that is not JSON', '{ nope'],
    ['another version', JSON.stringify({ ...VALID, version: 2 })],
    ['no version', JSON.stringify({ ...VALID, version: undefined })],
    [
      'a finding with an unknown id',
      JSON.stringify({
        ...VALID,
        findings: [{ ...RESULT.findings[0], id: 'no-such-id' }],
      }),
    ],
    ['a ranAt that is not a time', JSON.stringify({ ...VALID, ranAt: 'soon' })],
    ['an array', '[]'],
  ])('%s reads as undefined', (_label, text) => {
    const file = path.join(tmp(), CACHE_NAME);
    fs.writeFileSync(file, text);
    expect(readCache(file)).toBeUndefined();
  });

  test('a missing file reads as undefined', () => {
    expect(readCache(path.join(tmp(), CACHE_NAME))).toBeUndefined();
  });
});
