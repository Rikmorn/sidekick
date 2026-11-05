import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repoWithWorktree } from './fixtures/worker/repo.js';
import { execRunner, type Runner } from './pm-data.js';
import {
  BUILT_IN_SKIPS,
  ignoredLosses,
  readSkips,
  skipListPath,
} from './worktree-ignored.js';

afterEach(removeTemps);

function write(top: string, rel: string, content: string): void {
  const file = path.join(top, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function setup(gitignore: string) {
  const r = repoWithWorktree(gitignore);
  return {
    ...r,
    places: { mainTop: r.main, worktree: r.worktree, commonDir: r.commonDir },
  };
}

const none = { paths: [], truncated: false };

describe('ignoredLosses: ignored files that removal would delete', () => {
  test('a new ignored file is a loss', () => {
    const r = setup('*.sh\n');
    write(r.worktree, 'scratch.sh', 'echo\n');
    expect(ignoredLosses(execRunner, r.places)).toEqual({
      paths: ['scratch.sh'],
      truncated: false,
    });
  });

  test('an ignored file with the same bytes in both is no loss; other bytes are', () => {
    const r = setup('.env\n');
    write(r.main, '.env', 'KEY=1\n');
    write(r.worktree, '.env', 'KEY=1\n');
    expect(ignoredLosses(execRunner, r.places)).toEqual(none);
    write(r.worktree, '.env', 'KEY=2\n');
    expect(ignoredLosses(execRunner, r.places)).toEqual({
      paths: ['.env'],
      truncated: false,
    });
  });

  test('same-size files compare a chunk at a time, to the last byte', () => {
    const r = setup('*.bin\n');
    // 4-byte chunks: two whole chunks, then a partial one.
    write(r.main, 'past.bin', 'aaaabbbbcc');
    write(r.worktree, 'past.bin', 'aaaabbbXcc');
    write(r.main, 'tail.bin', 'aaaabbbbcc');
    write(r.worktree, 'tail.bin', 'aaaabbbbcX');
    write(r.main, 'same.bin', 'aaaabbbbcc');
    write(r.worktree, 'same.bin', 'aaaabbbbcc');
    write(r.main, 'whole.bin', 'aaaabbbb');
    write(r.worktree, 'whole.bin', 'aaaabbbb');
    expect(ignoredLosses(execRunner, r.places, { chunkBytes: 4 })).toEqual({
      paths: ['past.bin', 'tail.bin'],
      truncated: false,
    });
  });

  test('a comparison never holds more than one chunk of a file', () => {
    const r = setup('*.bin\n');
    write(r.main, 'big.bin', 'aaaabbbbcc');
    write(r.worktree, 'big.bin', 'aaaabbbbcc');
    const whole = spyOn(fs, 'readFileSync');
    const chunk = spyOn(fs, 'readSync');
    try {
      expect(ignoredLosses(execRunner, r.places, { chunkBytes: 4 })).toEqual(
        none,
      );
      const wholeReads = whole.mock.calls
        .map(([file]) => String(file))
        .filter((file) => file.endsWith('big.bin'));
      expect(wholeReads).toEqual([]);
      const lengths = chunk.mock.calls.map((call) => call[3]);
      expect(lengths.length).toBeGreaterThan(0);
      expect(lengths.every((n) => typeof n === 'number' && n <= 4)).toBe(true);
    } finally {
      whole.mockRestore();
      chunk.mockRestore();
    }
  });

  test('a new file in an ignored folder the main checkout also has is a loss', () => {
    const r = setup('scratch/\n');
    write(r.main, 'scratch/old.md', 'a');
    write(r.worktree, 'scratch/new-notes.md', 'b');
    expect(ignoredLosses(execRunner, r.places)).toEqual({
      paths: ['scratch/new-notes.md'],
      truncated: false,
    });
  });

  test('a directory in the main checkout where the worktree has a file is a loss', () => {
    const r = setup('.env\n');
    write(r.main, '.env/inner', 'x');
    write(r.worktree, '.env', 'x');
    expect(ignoredLosses(execRunner, r.places)).toEqual({
      paths: ['.env'],
      truncated: false,
    });
  });

  test('node_modules at any depth is skipped', () => {
    const r = setup('node_modules/\n');
    write(r.worktree, 'node_modules/pkg/index.js', 'x');
    write(r.worktree, 'packages/a/node_modules/dep/index.js', 'x');
    expect(ignoredLosses(execRunner, r.places)).toEqual(none);
  });

  test('a node_modules inside a wholly ignored folder is pruned from the walk', () => {
    const r = setup('out/\n');
    write(r.worktree, 'out/node_modules/dep/index.js', 'x');
    write(r.worktree, 'out/keep.txt', 'x');
    expect(ignoredLosses(execRunner, r.places)).toEqual({
      paths: ['out/keep.txt'],
      truncated: false,
    });
  });

  test('a .DS_Store file at the top, in a subfolder, or in a wholly ignored folder is no loss', () => {
    const r = setup('.DS_Store\nout/\n');
    write(r.worktree, '.DS_Store', 'finder');
    write(r.worktree, 'docs/deep/.DS_Store', 'finder');
    write(r.worktree, 'out/.DS_Store', 'finder');
    write(r.worktree, 'out/keep.txt', 'x');
    expect(ignoredLosses(execRunner, r.places)).toEqual({
      paths: ['out/keep.txt'],
      truncated: false,
    });
  });

  test('a file named x.DS_Store, and a folder named .DS_Store, are checked as before', () => {
    const r = setup('*.DS_Store\n.DS_Store/\n');
    write(r.worktree, 'x.DS_Store', 'x');
    write(r.worktree, 'sub/.DS_Store/inner.txt', 'x');
    expect(ignoredLosses(execRunner, r.places)).toEqual({
      paths: ['sub/.DS_Store/inner.txt', 'x.DS_Store'],
      truncated: false,
    });
  });

  test('a folder named in the per-repo skip list is skipped', () => {
    const r = setup('cache/\nbuild/\n');
    write(r.commonDir, 'sidekick/disposable', '# build output\ncache/\n');
    write(r.worktree, 'cache/a.bin', 'x');
    write(r.worktree, 'build/b.bin', 'x');
    expect(ignoredLosses(execRunner, r.places)).toEqual({
      paths: ['build/b.bin'],
      truncated: false,
    });
  });

  test('a skip-list folder inside an ignored folder is pruned', () => {
    const r = setup('out/\n');
    write(r.commonDir, 'sidekick/disposable', 'out/tmp\n');
    write(r.worktree, 'out/tmp/a', 'x');
    write(r.worktree, 'out/real', 'x');
    expect(ignoredLosses(execRunner, r.places)).toEqual({
      paths: ['out/real'],
      truncated: false,
    });
  });

  test("a staged rename's source named like an ignored entry is no entry", () => {
    const r = setup('*.sh\n');
    write(r.worktree, '!! keep.txt', 'a');
    write(r.worktree, 'keep.txt', 'b');
    git(r.worktree, 'add', '--', '!! keep.txt', 'keep.txt');
    git(r.worktree, 'commit', '-q', '-m', 'two');
    git(r.worktree, 'mv', '--', '!! keep.txt', 'moved.txt');
    expect(ignoredLosses(execRunner, r.places)).toEqual(none);
  });

  test('a file name with a space is reported exactly', () => {
    const r = setup('*.log\n');
    write(r.worktree, 'my notes.log', 'x');
    expect(ignoredLosses(execRunner, r.places)).toEqual({
      paths: ['my notes.log'],
      truncated: false,
    });
  });

  test('a symlink is a loss unless the main checkout holds the same one', () => {
    const r = setup('link\n');
    fs.symlinkSync('target', path.join(r.worktree, 'link'));
    expect(ignoredLosses(execRunner, r.places)).toEqual({
      paths: ['link'],
      truncated: false,
    });
    fs.symlinkSync('target', path.join(r.main, 'link'));
    expect(ignoredLosses(execRunner, r.places)).toEqual(none);
    fs.rmSync(path.join(r.main, 'link'));
    fs.symlinkSync('other', path.join(r.main, 'link'));
    expect(ignoredLosses(execRunner, r.places)).toEqual({
      paths: ['link'],
      truncated: false,
    });
  });

  test('25 new files with a cap of 20 give 20 paths and truncated', () => {
    const r = setup('junk/\n');
    for (let i = 0; i < 25; i++) write(r.worktree, `junk/f${i}`, 'x');
    const result = ignoredLosses(execRunner, r.places, { cap: 20 });
    if ('issue' in result) throw new Error(result.issue);
    expect(result.paths).toHaveLength(20);
    expect(result.truncated).toBe(true);
  });

  test('exactly the cap is not truncated', () => {
    const r = setup('junk/\n');
    for (let i = 0; i < 3; i++) write(r.worktree, `junk/f${i}`, 'x');
    const result = ignoredLosses(execRunner, r.places, { cap: 3 });
    if ('issue' in result) throw new Error(result.issue);
    expect(result.paths).toHaveLength(3);
    expect(result.truncated).toBe(false);
  });

  test('a failing git status gives an issue', () => {
    const r = setup('*.sh\n');
    const failing: Runner = () => ({ code: 128, stdout: '', stderr: 'boom\n' });
    expect(ignoredLosses(failing, r.places)).toEqual({ issue: 'boom' });
  });
});

describe('readSkips: the per-repo skip list', () => {
  test('the list lives under the common dir', () => {
    expect(skipListPath('/x/.git')).toBe('/x/.git/sidekick/disposable');
  });

  test('a missing list is no warning', () => {
    const r = setup('');
    expect(readSkips(r.commonDir)).toEqual({ folders: [], warnings: [] });
  });

  test('lines are folders; comments, blanks, and slashes are dropped', () => {
    const r = setup('');
    write(
      r.commonDir,
      'sidekick/disposable',
      '# header\n\ncache/\n./build  # output\n',
    );
    expect(readSkips(r.commonDir)).toEqual({
      folders: ['cache', 'build'],
      warnings: [],
    });
  });

  test('an unreadable list is a warning, and the built-in skips still apply', () => {
    const r = setup('*.sh\n');
    fs.mkdirSync(path.join(r.commonDir, 'sidekick/disposable'), {
      recursive: true,
    });
    const skips = readSkips(r.commonDir);
    expect(skips.folders).toEqual([]);
    expect(skips.warnings).toHaveLength(1);
    write(r.worktree, 'node_modules/x', 'x');
    write(r.worktree, 'a.sh', 'x');
    expect(ignoredLosses(execRunner, r.places)).toEqual({
      paths: ['a.sh'],
      truncated: false,
    });
  });

  test('node_modules folders and .DS_Store files are built in', () => {
    expect(BUILT_IN_SKIPS).toEqual({
      folders: ['node_modules'],
      files: ['.DS_Store'],
    });
  });
});
