import { afterEach, describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner } from './pm-data.js';
import { isOwnBranch, markOf, writeMark } from './worktree-mark.js';

afterEach(removeTemps);

describe('worktree mark', () => {
  test('a mark written on feat/x.y reads back, and the section holds it', () => {
    const main = repo();
    git(main, 'branch', 'feat/x.y');
    expect(writeMark(execRunner, main, 'feat/x.y', 'w1')).toEqual([]);
    expect(markOf(execRunner, main, 'feat/x.y')).toBe('w1');
    expect(
      git(main, 'config', '--local', '--get-regexp', '^branch\\.feat/x\\.y\\.'),
    ).toBe('branch.feat/x.y.sidekickworktree w1');
  });

  test('a mark written from a linked worktree is read from the main checkout', () => {
    const main = repo();
    const dir = path.join(tmp(), 'w1');
    git(main, 'worktree', 'add', '-q', '-b', 'feat/y', dir);
    expect(writeMark(execRunner, dir, 'feat/y', 'w1')).toEqual([]);
    expect(markOf(execRunner, main, 'feat/y')).toBe('w1');
  });

  test('an unmarked branch reads undefined', () => {
    const main = repo();
    git(main, 'branch', 'feat/z');
    expect(markOf(execRunner, main, 'feat/z')).toBeUndefined();
  });

  test("writeMark returns git's error as an issue when git cannot write", () => {
    const issues = writeMark(
      () => ({ code: 1, stdout: '', stderr: 'boom\n' }),
      '/nowhere',
      'b',
      'w1',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('boom');
  });

  test('isOwnBranch: worktree-<name> and a branch marked for <name> are own; a branch marked for another worktree, or unmarked, is not', () => {
    const main = repo();
    for (const b of ['worktree-w1', 'mine', 'theirs', 'plain']) {
      git(main, 'branch', b);
    }
    writeMark(execRunner, main, 'mine', 'w1');
    writeMark(execRunner, main, 'theirs', 'w2');
    expect(isOwnBranch(execRunner, main, 'worktree-w1', 'w1')).toBe(true);
    expect(isOwnBranch(execRunner, main, 'mine', 'w1')).toBe(true);
    expect(isOwnBranch(execRunner, main, 'theirs', 'w1')).toBe(false);
    expect(isOwnBranch(execRunner, main, 'plain', 'w1')).toBe(false);
  });
});
