import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { removeTemps, repoWithWorktree } from './fixtures/worker/repo.js';
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

  test('node_modules is built in', () => {
    expect(BUILT_IN_SKIPS).toEqual(['node_modules']);
  });
});
