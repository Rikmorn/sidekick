import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner } from './pm-data.js';
import {
  branchExists,
  checkedOut,
  commitOf,
  ensureWorktreesExcluded,
  headCommit,
  isTrackedClean,
  mainCheckout,
  remotesWithPushUrl,
  statusPathsIn,
} from './worker-repo.js';

afterEach(removeTemps);

describe('mainCheckout', () => {
  test('finds the top and the common git dir from a subfolder', () => {
    const top = repo();
    const sub = path.join(top, 'x', 'y');
    fs.mkdirSync(sub, { recursive: true });
    expect(mainCheckout(execRunner, sub)).toEqual({
      top,
      commonDir: path.join(top, '.git'),
    });
  });

  test('refuses inside a linked worktree, naming the main checkout', () => {
    const top = repo();
    const linked = path.join(tmp(), 'wt');
    git(top, 'worktree', 'add', '-q', linked);
    const result = mainCheckout(execRunner, linked);
    expect(result).toEqual({
      issues: [
        `${linked} is a linked worktree: run sidekick worker from the main checkout, whose git dir is ${path.join(top, '.git')}`,
      ],
    });
  });

  test('refuses outside any repo', () => {
    const result = mainCheckout(execRunner, tmp());
    expect(result).toEqual({
      issues: [
        "not inside a git work tree: run sidekick worker from the repo's main checkout",
      ],
    });
  });
});

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

  test('statusPathsIn names each untracked file in a new folder, and a rename with its source', () => {
    const top = repo();
    fs.mkdirSync(path.join(top, 'new', 'deep'), { recursive: true });
    fs.writeFileSync(path.join(top, 'new', 'deep', 'n.txt'), 'n\n');
    git(top, 'mv', 'a.txt', 'b.txt');
    const result = statusPathsIn(execRunner, top, top);
    const paths = 'paths' in result ? [...result.paths].sort() : [];
    expect(paths).toEqual(['a.txt', 'b.txt', 'new/deep/n.txt']);
  });

  test("statusPathsIn gives git's message for a folder outside any repo", () => {
    const top = repo();
    expect(statusPathsIn(execRunner, top, tmp())).toEqual({
      issue: expect.stringContaining('not a git repository'),
    });
  });
});

describe('ensureWorktreesExcluded', () => {
  const excludeOf = (top: string): string =>
    path.join(top, '.git', 'info', 'exclude');

  test('writes the entry once, and a second run writes nothing', () => {
    const top = repo();
    const commonDir = path.join(top, '.git');
    const before = fs.readFileSync(excludeOf(top), 'utf-8');
    expect(ensureWorktreesExcluded(execRunner, top, commonDir)).toEqual({
      line: `added .claude/worktrees/ to ${excludeOf(top)}`,
    });
    const after = fs.readFileSync(excludeOf(top), 'utf-8');
    expect(after).toBe(`${before}.claude/worktrees/\n`);
    expect(ensureWorktreesExcluded(execRunner, top, commonDir)).toEqual({
      line: undefined,
    });
    expect(fs.readFileSync(excludeOf(top), 'utf-8')).toBe(after);
  });

  test('writes nothing when .gitignore already ignores the folder', () => {
    const top = repo();
    fs.writeFileSync(path.join(top, '.gitignore'), '.claude/\n');
    const before = fs.readFileSync(excludeOf(top), 'utf-8');
    expect(
      ensureWorktreesExcluded(execRunner, top, path.join(top, '.git')),
    ).toEqual({ line: undefined });
    expect(fs.readFileSync(excludeOf(top), 'utf-8')).toBe(before);
  });

  test('puts the entry on its own line when the last line has no newline', () => {
    const top = repo();
    fs.writeFileSync(excludeOf(top), '# kept\nlast-line');
    ensureWorktreesExcluded(execRunner, top, path.join(top, '.git'));
    expect(fs.readFileSync(excludeOf(top), 'utf-8')).toBe(
      '# kept\nlast-line\n.claude/worktrees/\n',
    );
  });

  test('creates a missing info folder', () => {
    const top = repo();
    fs.rmSync(path.join(top, '.git', 'info'), { recursive: true });
    ensureWorktreesExcluded(execRunner, top, path.join(top, '.git'));
    expect(fs.readFileSync(excludeOf(top), 'utf-8')).toBe(
      '.claude/worktrees/\n',
    );
  });

  test('refuses an excludes file it cannot read, writing nothing', () => {
    const top = repo();
    fs.rmSync(excludeOf(top));
    fs.mkdirSync(excludeOf(top));
    const result = ensureWorktreesExcluded(
      execRunner,
      top,
      path.join(top, '.git'),
    );
    const issues = 'issues' in result ? result.issues : [];
    expect(issues).toHaveLength(1);
    expect(issues[0]).toStartWith(
      `cannot read ${excludeOf(top)}, where dispatch adds .claude/worktrees/: `,
    );
    expect(fs.readdirSync(excludeOf(top))).toEqual([]);
  });

  test('refuses an excludes file it cannot write', () => {
    const top = repo();
    const before = fs.readFileSync(excludeOf(top), 'utf-8');
    fs.chmodSync(excludeOf(top), 0o444);
    const result = ensureWorktreesExcluded(
      execRunner,
      top,
      path.join(top, '.git'),
    );
    const issues = 'issues' in result ? result.issues : [];
    expect(issues).toHaveLength(1);
    expect(issues[0]).toStartWith(
      `cannot add .claude/worktrees/ to ${excludeOf(top)}: `,
    );
    expect(fs.readFileSync(excludeOf(top), 'utf-8')).toBe(before);
  });
});
