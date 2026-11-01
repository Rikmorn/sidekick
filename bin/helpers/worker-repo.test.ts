import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner } from './pm-data.js';
import {
  branchExists,
  checkedOut,
  checkoutFacts,
  checkoutOf,
  commitOf,
  ensureWorktreesExcluded,
  headCommit,
  isTrackedClean,
  listWorktrees,
  lockReasonOf,
  parseWorktrees,
  physical,
  remotesWithPushUrl,
  statusEntriesIn,
  worktreeListed,
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

describe('checkoutFacts', () => {
  test('gives the same main checkout from the main, a sibling, a nested worktree, and their subfolders', () => {
    const top = repo();
    const sibling = path.join(tmp(), 'sib');
    const nested = path.join(top, '.claude', 'worktrees', 'x');
    git(top, 'worktree', 'add', '-q', '-b', 'sib', sibling);
    git(top, 'worktree', 'add', '-q', '-b', 'nest', nested);
    const main = git(top, 'symbolic-ref', '--short', 'HEAD');
    const commonDir = path.join(top, '.git');
    const cases: [string, string][] = [
      [top, main],
      [sibling, 'sib'],
      [nested, 'nest'],
    ];
    for (const [launch, branch] of cases) {
      const sub = path.join(launch, 'sub', 'deep');
      fs.mkdirSync(sub, { recursive: true });
      for (const cwd of [launch, sub]) {
        const facts = checkoutFacts(execRunner, cwd);
        expect(facts).toMatchObject({
          launchTop: launch,
          mainTop: top,
          commonDir,
          branch,
        });
        const listed = 'worktrees' in facts ? facts.worktrees : [];
        expect(listed[0].path).toBe(top);
        expect(listed.map((w) => w.path).sort()).toEqual(
          [top, sibling, nested].sort(),
        );
      }
    }
  });

  test('resolves a symlinked path to the physical checkout', () => {
    const top = repo();
    const link = path.join(tmp(), 'link');
    fs.symlinkSync(top, link);
    expect(checkoutFacts(execRunner, link)).toMatchObject({
      launchTop: top,
      mainTop: top,
    });
  });

  test('gives no branch on a detached HEAD', () => {
    const top = repo();
    git(top, 'checkout', '-q', '--detach');
    expect(checkoutFacts(execRunner, top)).toMatchObject({
      launchTop: top,
      branch: undefined,
    });
  });

  test('gives an issue outside a work tree', () => {
    expect(checkoutFacts(execRunner, tmp())).toEqual({
      issues: [expect.stringContaining('not inside a git work tree')],
    });
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
