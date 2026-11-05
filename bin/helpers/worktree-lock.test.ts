import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repoWithWorktree } from './fixtures/worker/repo.js';
import { execRunner } from './pm-data.js';
import { lockStateOf, removeGitWorktree } from './worktree-lock.js';

afterEach(removeTemps);

const alive = () => true;
const dead = () => false;
const SESSION_LOCK = 'claude session w1 (pid 4242 start 2026-11-05)';

describe('lockStateOf', () => {
  test('no lock is none', () => {
    expect(lockStateOf(undefined, alive)).toEqual({ kind: 'none' });
  });

  test('a session lock is live or dead by its pid', () => {
    expect(lockStateOf(SESSION_LOCK, alive)).toEqual({
      kind: 'live',
      pid: 4242,
    });
    expect(lockStateOf(SESSION_LOCK, dead)).toEqual({
      kind: 'dead',
      pid: 4242,
    });
  });

  test('a lock naming a pid without the claude session prefix is other, live or dead', () => {
    for (const reason of [
      'held (pid 4242 start 2026-11-05)',
      'my claude session w1 (pid 4242 start x)',
      'Claude session w1 (pid 4242 start x)',
    ]) {
      expect(lockStateOf(reason, dead)).toEqual({ kind: 'other', reason });
      expect(lockStateOf(reason, alive)).toEqual({ kind: 'other', reason });
    }
  });

  test('a lock naming no pid is other, the empty reason included', () => {
    expect(lockStateOf('', alive)).toEqual({ kind: 'other', reason: '' });
    expect(lockStateOf('manual hold', alive)).toEqual({
      kind: 'other',
      reason: 'manual hold',
    });
  });

  test('pid 0 names no process, so the lock is other', () => {
    expect(lockStateOf('claude session w1 (pid 0 start x)', alive)).toEqual({
      kind: 'other',
      reason: 'claude session w1 (pid 0 start x)',
    });
  });
});

describe('removeGitWorktree', () => {
  const listed = (main: string): string =>
    git(main, 'worktree', 'list', '--porcelain');

  test('unlocks a dead lock, then removes the worktree', () => {
    const r = repoWithWorktree('');
    git(r.main, 'worktree', 'lock', '--reason', SESSION_LOCK, r.worktree);
    const lock = lockStateOf(SESSION_LOCK, dead);
    expect(removeGitWorktree(execRunner, r.main, r.worktree, lock)).toEqual([]);
    expect(listed(r.main)).not.toContain(r.worktree);
  });

  test('a live lock refuses and stays locked', () => {
    const r = repoWithWorktree('');
    git(r.main, 'worktree', 'lock', '--reason', SESSION_LOCK, r.worktree);
    const lock = lockStateOf(SESSION_LOCK, alive);
    const issues = removeGitWorktree(execRunner, r.main, r.worktree, lock);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('4242');
    expect(listed(r.main)).toContain('locked');
  });

  test('removes an entry whose folder is gone', () => {
    const r = repoWithWorktree('');
    fs.rmSync(r.worktree, { recursive: true, force: true });
    const lock = lockStateOf(undefined, dead);
    expect(removeGitWorktree(execRunner, r.main, r.worktree, lock)).toEqual([]);
    expect(listed(r.main)).not.toContain(r.worktree);
  });

  test('an untracked file refuses with git message and keeps the worktree', () => {
    const r = repoWithWorktree('');
    fs.writeFileSync(path.join(r.worktree, 'new.txt'), 'x\n');
    const lock = lockStateOf(undefined, dead);
    const issues = removeGitWorktree(execRunner, r.main, r.worktree, lock);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('untracked');
    expect(fs.existsSync(path.join(r.worktree, 'new.txt'))).toBe(true);
  });
});
