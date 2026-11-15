import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loopNames, loopsRoot, RUNTIME_ENTRIES } from './loop-store.js';
import { keyHits } from './memory-patterns.js';
import type { Runner } from './pm-data.js';
import { ensureSidekickRepo } from './sidekick-home.js';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-loop-store-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('loopsRoot', () => {
  test('is <home>/.claude/sidekick/loops without CLAUDE_CONFIG_DIR', () => {
    expect(loopsRoot({}, '/work', '/home/u')).toBe(
      '/home/u/.claude/sidekick/loops',
    );
  });
  test('sits under CLAUDE_CONFIG_DIR, resolved against cwd', () => {
    expect(loopsRoot({ CLAUDE_CONFIG_DIR: '/c' }, '/work', '/home/u')).toBe(
      '/c/sidekick/loops',
    );
    expect(loopsRoot({ CLAUDE_CONFIG_DIR: 'c' }, '/work', '/home/u')).toBe(
      '/work/c/sidekick/loops',
    );
  });
});

describe('loopNames', () => {
  test('lists folders sorted, skipping hidden entries and plain files', () => {
    for (const name of ['zeta', 'alpha', '.git', 'mid']) {
      fs.mkdirSync(path.join(tmp, name));
    }
    fs.writeFileSync(path.join(tmp, '.DS_Store'), '');
    fs.writeFileSync(path.join(tmp, 'notes.txt'), '');
    expect(loopNames(tmp)).toEqual(['alpha', 'mid', 'zeta']);
  });
  test('lists a folder whose name breaks the rule, for the check to refuse', () => {
    fs.mkdirSync(path.join(tmp, 'Bad_Name'));
    expect(loopNames(tmp)).toEqual(['Bad_Name']);
  });
  test('lists nothing for a missing root', () => {
    expect(loopNames(path.join(tmp, 'none'))).toEqual([]);
  });
});

describe('RUNTIME_ENTRIES', () => {
  test('holds the records and units folders and the four runtime files', () => {
    expect([...RUNTIME_ENTRIES].sort()).toEqual(
      [
        'armed.json',
        'records',
        'start.lock',
        'state.json',
        'units',
        'units.lock',
      ].sort(),
    );
  });
  test('the sidekick repo .gitignore ignores each entry in every loop folder', () => {
    const fakeGit: Runner = (_cmd, args) =>
      args[0] === 'init'
        ? { code: 0, stdout: '', stderr: '' }
        : { code: 128, stdout: '', stderr: 'fatal: not a git repository' };
    const home = path.join(tmp, 'sidekick');
    expect(ensureSidekickRepo(home, fakeGit)).toEqual([]);
    const lines = fs
      .readFileSync(path.join(home, '.gitignore'), 'utf8')
      .split('\n');
    expect(RUNTIME_ENTRIES.length).toBeGreaterThan(0);
    for (const entry of RUNTIME_ENTRIES) {
      const pattern = `loops/*/${entry}`;
      expect(
        lines.some((line) => line === pattern || line === `${pattern}/`),
      ).toBe(true);
    }
    // And the reverse: each loops/*/ line the file holds names a runtime entry.
    const prefix = 'loops/*/';
    const ignored = lines
      .filter((line) => line.startsWith(prefix))
      .map((line) => line.slice(prefix.length).replace(/\/$/, ''));
    expect(ignored.length).toBeGreaterThan(0);
    expect(ignored.filter((entry) => !RUNTIME_ENTRIES.includes(entry))).toEqual(
      [],
    );
  });
});

test('this test file holds no literal key', () => {
  expect(keyHits(fs.readFileSync(import.meta.path, 'utf8'))).toEqual([]);
});
