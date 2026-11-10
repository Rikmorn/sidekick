import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  git,
  recording,
  removeTemps,
  repo,
  tmp,
} from './fixtures/worker/repo.js';
import { execRunner, MAX_OUTPUT } from './pm-data.js';
import {
  checkedOut,
  listWorktrees,
  lockReasonOf,
  parseWorktrees,
  statusEntriesIn,
  worktreeListed,
} from './worker-listing.js';

afterEach(removeTemps);

describe('a worktree: what it has checked out, and its status', () => {
  test('checkedOut names the branch ref, then a detached HEAD', () => {
    const top = repo();
    const branch = git(top, 'symbolic-ref', 'HEAD');
    expect(checkedOut(execRunner, top)).toBe(branch);
    git(top, 'checkout', '-q', '--detach');
    expect(checkedOut(execRunner, top)).toBe('a detached HEAD');
  });

  test('checkedOut reads a missing folder as an unreadable HEAD', () => {
    const gone = path.join(tmp(), 'gone');
    expect(checkedOut(execRunner, gone)).toStartWith('an unreadable HEAD (');
  });

  test('statusEntriesIn names each untracked file in a new folder by its own path, and a rename with its source', () => {
    const top = repo();
    fs.mkdirSync(path.join(top, 'new', 'deep'), { recursive: true });
    fs.writeFileSync(path.join(top, 'new', 'deep', 'n.txt'), 'n\n');
    git(top, 'mv', 'a.txt', 'b.txt');
    const result = statusEntriesIn(execRunner, top, top);
    const paths = 'entries' in result ? result.entries.map((e) => e.path) : [];
    expect(paths.sort()).toEqual(['a.txt', 'b.txt', 'new/deep/n.txt']);
  });

  test("statusEntriesIn asks for the runtime's largest output, so a long status is not cut off", () => {
    const top = repo();
    const { runGit, calls } = recording();
    statusEntriesIn(runGit, top, top);
    expect(calls.map((c) => c.opts?.maxBuffer)).toEqual([MAX_OUTPUT]);
    expect(calls[0].args).toContain('status');
  });

  test('statusEntriesIn gives a deleted, a modified, and an untracked file their codes', () => {
    const top = repo();
    fs.writeFileSync(path.join(top, 'o.txt'), 'o\n');
    git(top, 'add', 'o.txt');
    git(top, 'commit', '-q', '-m', 'add o');
    fs.rmSync(path.join(top, 'a.txt'));
    fs.writeFileSync(path.join(top, 'o.txt'), 'changed\n');
    fs.writeFileSync(path.join(top, 'u.txt'), 'u\n');
    const result = statusEntriesIn(execRunner, top, top);
    const entries = 'entries' in result ? result.entries : [];
    expect(entries).toContainEqual({ code: ' D', path: 'a.txt' });
    expect(entries).toContainEqual({ code: ' M', path: 'o.txt' });
    expect(entries).toContainEqual({ code: '??', path: 'u.txt' });
  });

  test("statusEntriesIn gives a staged rename's two paths the same R code", () => {
    const top = repo();
    git(top, 'mv', 'a.txt', 'b.txt');
    const result = statusEntriesIn(execRunner, top, top);
    const entries = 'entries' in result ? result.entries : [];
    expect(entries).toHaveLength(2);
    expect(entries).toContainEqual({ code: 'R ', path: 'b.txt' });
    expect(entries).toContainEqual({ code: 'R ', path: 'a.txt' });
  });

  test("statusEntriesIn gives git's message for a folder outside any repo", () => {
    const top = repo();
    expect(statusEntriesIn(execRunner, top, tmp())).toEqual({
      issue: expect.stringContaining('not a git repository'),
    });
  });
});

describe('parseWorktrees', () => {
  const record = (...fields: string[]): string => `${fields.join('\0')}\0\0`;

  test('reads each field of locked, prunable, detached, and spaced entries', () => {
    const text = [
      record('worktree /r', 'HEAD aaa', 'branch refs/heads/main'),
      record(
        'worktree /w 1',
        'HEAD bbb',
        'branch refs/heads/w1',
        'locked claude session (pid 1)',
      ),
      record('worktree /w2', 'HEAD ccc', 'branch refs/heads/w2', 'locked'),
      record(
        'worktree /w3',
        'HEAD ddd',
        'branch refs/heads/w3',
        'prunable gitdir file points to non-existent location',
      ),
      record('worktree /w4', 'HEAD eee', 'detached'),
      record('worktree /w5', 'HEAD fff', 'detached', 'prunable'),
    ].join('');
    expect(parseWorktrees(text)).toEqual([
      {
        path: '/r',
        head: 'aaa',
        branch: 'refs/heads/main',
        locked: undefined,
        prunable: undefined,
      },
      {
        path: '/w 1',
        head: 'bbb',
        branch: 'refs/heads/w1',
        locked: 'claude session (pid 1)',
        prunable: undefined,
      },
      {
        path: '/w2',
        head: 'ccc',
        branch: 'refs/heads/w2',
        locked: '',
        prunable: undefined,
      },
      {
        path: '/w3',
        head: 'ddd',
        branch: 'refs/heads/w3',
        locked: undefined,
        prunable: 'gitdir file points to non-existent location',
      },
      {
        path: '/w4',
        head: 'eee',
        branch: undefined,
        locked: undefined,
        prunable: undefined,
      },
      {
        path: '/w5',
        head: 'fff',
        branch: undefined,
        locked: undefined,
        prunable: '',
      },
    ]);
  });

  test('keeps a path with a newline whole and ignores a bare entry', () => {
    const text = record('worktree /a\nb', 'bare');
    expect(parseWorktrees(text)).toEqual([
      {
        path: '/a\nb',
        head: undefined,
        branch: undefined,
        locked: undefined,
        prunable: undefined,
      },
    ]);
  });

  test('gives nothing for empty text', () => {
    expect(parseWorktrees('')).toEqual([]);
  });
});

describe('listWorktrees', () => {
  test("lists the main checkout first, then a linked worktree's lock and a prunable one", () => {
    const top = repo();
    const locked = path.join(tmp(), 'locked');
    const gone = path.join(tmp(), 'gone');
    git(top, 'worktree', 'add', '-q', '--detach', locked);
    git(top, 'worktree', 'lock', '--reason', 'because', locked);
    git(top, 'worktree', 'add', '-q', '--detach', gone);
    fs.rmSync(gone, { recursive: true });
    const result = listWorktrees(execRunner, top);
    const list = 'worktrees' in result ? result.worktrees : [];
    expect(list[0].path).toBe(top);
    expect(list.map((w) => w.path).sort()).toEqual([top, locked, gone].sort());
    expect(list.find((w) => w.path === locked)?.locked).toBe('because');
    expect(list.find((w) => w.path === gone)?.prunable).toStartWith(
      'gitdir file',
    );
    expect(list[0].prunable).toBeUndefined();
  });

  test("gives git's message outside a repo", () => {
    expect(listWorktrees(execRunner, tmp())).toEqual({
      issue: expect.stringContaining('not a git repository'),
    });
  });
});

describe('worktreeListed', () => {
  test('counts a prunable entry as listed and compares physically', () => {
    const top = repo();
    const wt = path.join(tmp(), 'wt');
    git(top, 'worktree', 'add', '-q', wt);
    const link = path.join(tmp(), 'link');
    fs.symlinkSync(wt, link);
    expect(worktreeListed(execRunner, top, wt)).toEqual({ listed: true });
    expect(worktreeListed(execRunner, top, link)).toEqual({ listed: true });
    fs.rmSync(wt, { recursive: true });
    expect(worktreeListed(execRunner, top, wt)).toEqual({ listed: true });
    expect(worktreeListed(execRunner, top, path.join(top, 'nope'))).toEqual({
      listed: false,
    });
  });
});

describe('lockReasonOf', () => {
  test("reads the path's own lock when its admin folder took a suffix, through a symlink too", () => {
    const top = repo();
    const held = path.join(tmp(), 'w1');
    git(top, 'worktree', 'add', '-q', held, '-b', 'held');
    git(top, 'worktree', 'lock', '--reason', 'held lock', held);
    const wt = path.join(tmp(), 'w1');
    git(top, 'worktree', 'add', '-q', wt, '-b', 'wt');
    expect(fs.existsSync(path.join(top, '.git', 'worktrees', 'w11'))).toBe(
      true,
    );
    expect(lockReasonOf(execRunner, top, wt)).toBeUndefined();
    git(top, 'worktree', 'lock', '--reason', 'claude session wt (pid 7)', wt);
    const link = path.join(tmp(), 'link');
    fs.symlinkSync(wt, link);
    expect(lockReasonOf(execRunner, top, wt)).toBe('claude session wt (pid 7)');
    expect(lockReasonOf(execRunner, top, link)).toBe(
      'claude session wt (pid 7)',
    );
    expect(lockReasonOf(execRunner, top, held)).toBe('held lock');
  });

  test('gives undefined for a path git does not list, or when the listing fails', () => {
    const top = repo();
    expect(lockReasonOf(execRunner, top, path.join(top, 'nope'))).toBe(
      undefined,
    );
    expect(lockReasonOf(execRunner, tmp(), top)).toBeUndefined();
  });
});
