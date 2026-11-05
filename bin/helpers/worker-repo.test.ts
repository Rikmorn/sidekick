import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner } from './pm-data.js';
import {
  branchExists,
  checkoutOf,
  commitOf,
  headCommit,
  isTrackedClean,
  physical,
  remotesWithPushUrl,
} from './worker-repo.js';

afterEach(removeTemps);

describe('commits, cleanliness, and branches', () => {
  test('headCommit and commitOf resolve a short sha to the full one', () => {
    const top = repo();
    const head = git(top, 'rev-parse', 'HEAD');
    expect(headCommit(execRunner, top)).toBe(head);
    expect(commitOf(execRunner, top, head.slice(0, 7))).toBe(head);
    expect(commitOf(execRunner, top, 'deadbeef')).toBeUndefined();
  });

  test('isTrackedClean ignores untracked files and sees a modified one', () => {
    const top = repo();
    fs.writeFileSync(path.join(top, 'new.txt'), 'n\n');
    expect(isTrackedClean(execRunner, top)).toBe(true);
    fs.writeFileSync(path.join(top, 'a.txt'), 'changed\n');
    expect(isTrackedClean(execRunner, top)).toBe(false);
  });

  test('branchExists names only local branches', () => {
    const top = repo();
    expect(branchExists(execRunner, top, 'worktree-w1')).toBe(false);
    git(top, 'branch', 'worktree-w1');
    expect(branchExists(execRunner, top, 'worktree-w1')).toBe(true);
  });

  test('remotesWithPushUrl lists each remote that sets pushurl, once', () => {
    const top = repo();
    expect(remotesWithPushUrl(execRunner, top)).toEqual([]);
    git(top, 'remote', 'add', 'origin', '/nowhere/a');
    git(top, 'remote', 'add', 'up.stream', '/nowhere/b');
    expect(remotesWithPushUrl(execRunner, top)).toEqual([]);
    git(top, 'config', 'remote.up.stream.pushurl', '/nowhere/c');
    git(top, 'config', '--add', 'remote.up.stream.pushurl', '/nowhere/d');
    expect(remotesWithPushUrl(execRunner, top)).toEqual(['up.stream']);
  });
});

describe('physical', () => {
  test('resolves symlinks through the nearest existing ancestor', () => {
    const real = tmp();
    const link = path.join(tmp(), 'link');
    fs.symlinkSync(real, link);
    expect(physical(path.join(link, 'not', 'yet'))).toBe(
      path.join(real, 'not', 'yet'),
    );
  });
});

describe('checkoutOf', () => {
  test("gives the nested worktree's top for a folder inside it", () => {
    const top = repo();
    const nested = path.join(top, '.claude', 'worktrees', 'x');
    git(top, 'worktree', 'add', '-q', '-b', 'nest', nested);
    const sub = path.join(nested, 'a', 'b');
    fs.mkdirSync(sub, { recursive: true });
    expect(checkoutOf(execRunner, sub)).toEqual({ top: nested });
    fs.mkdirSync(path.join(top, 'zzz'));
    expect(checkoutOf(execRunner, path.join(top, 'zzz'))).toEqual({ top });
  });

  test('gives an issue for a folder in no work tree', () => {
    expect(checkoutOf(execRunner, tmp())).toEqual({
      issue: expect.stringContaining('not a git repository'),
    });
  });
});
