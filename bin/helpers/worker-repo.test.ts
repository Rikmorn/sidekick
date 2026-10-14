import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execRunner } from './pm-data.js';
import {
  branchExists,
  commitOf,
  ensureWorktreesExcluded,
  headCommit,
  isTrackedClean,
  mainCheckout,
  remotesWithPushUrl,
} from './worker-repo.js';

const made: string[] = [];
// Physical paths: git prints /private/var/... where os.tmpdir() gives /var/... on macOS.
const tmp = (): string => {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sk-worker-repo-')),
  );
  made.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of made.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();

// A repo with one commit, its identity and signing set locally.
function repo(): string {
  const top = tmp();
  git(top, 'init', '-q');
  git(top, 'config', 'user.name', 'test');
  git(top, 'config', 'user.email', 'test@example.com');
  git(top, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(top, 'a.txt'), 'a\n');
  git(top, 'add', 'a.txt');
  git(top, 'commit', '-q', '-m', 'init');
  return top;
}

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

describe('ensureWorktreesExcluded', () => {
  const excludeOf = (top: string): string =>
    path.join(top, '.git', 'info', 'exclude');

  test('writes the entry once, and a second run writes nothing', () => {
    const top = repo();
    const commonDir = path.join(top, '.git');
    const before = fs.readFileSync(excludeOf(top), 'utf-8');
    expect(ensureWorktreesExcluded(execRunner, top, commonDir)).toBe(
      `added .claude/worktrees/ to ${excludeOf(top)}`,
    );
    const after = fs.readFileSync(excludeOf(top), 'utf-8');
    expect(after).toBe(`${before}.claude/worktrees/\n`);
    expect(ensureWorktreesExcluded(execRunner, top, commonDir)).toBeUndefined();
    expect(fs.readFileSync(excludeOf(top), 'utf-8')).toBe(after);
  });

  test('writes nothing when .gitignore already ignores the folder', () => {
    const top = repo();
    fs.writeFileSync(path.join(top, '.gitignore'), '.claude/\n');
    const before = fs.readFileSync(excludeOf(top), 'utf-8');
    expect(
      ensureWorktreesExcluded(execRunner, top, path.join(top, '.git')),
    ).toBeUndefined();
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
});
