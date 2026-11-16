import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  git,
  removeTemps,
  repo,
  repoWithWorktree,
  tmp,
} from './fixtures/worker/repo.js';
import { execRunner, type Runner, type RunOptions } from './pm-data.js';
import { checkoutFacts } from './worker-facts.js';
import {
  chainIssues,
  chainOf,
  HARDENED_GIT_FLAGS,
  hardenedRunner,
  mainGitDirIssues,
  withHardenedFlags,
} from './worker-git.js';

afterEach(removeTemps);

interface Call {
  cmd: string;
  args: string[];
  cwd: string;
  opts: RunOptions | undefined;
}

// A runner that keeps each call and runs nothing.
function recorder(): { run: Runner; calls: Call[] } {
  const calls: Call[] = [];
  const run: Runner = (cmd, args, cwd, opts) => {
    calls.push({ cmd, args, cwd, opts });
    return { code: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

// A main checkout's folder, a worktree folder in it with a subfolder, and a
// link to the worktree under another name.
function folders(): { top: string; wt: string; alias: string } {
  const top = tmp();
  const wt = path.join(top, 'wt');
  fs.mkdirSync(path.join(wt, 'sub'), { recursive: true });
  const alias = path.join(top, 'alias');
  fs.symlinkSync(wt, alias);
  return { top, wt, alias };
}

const GIT_DIR = '/repo/.git/worktrees/wt';

describe('withHardenedFlags', () => {
  test('it leads every git call with the hardened flags, wherever it runs, and leaves other commands alone', () => {
    const { run, calls } = recorder();
    const flagged = withHardenedFlags(run);
    flagged('git', ['status', '--porcelain'], '/anywhere');
    flagged('git', ['-C', '/w', 'log'], '/top', { timeoutMs: 5 });
    flagged('gh', ['issue', 'view', '1'], '/w');
    expect(calls).toEqual([
      {
        cmd: 'git',
        args: [...HARDENED_GIT_FLAGS, 'status', '--porcelain'],
        cwd: '/anywhere',
        opts: undefined,
      },
      {
        cmd: 'git',
        args: [...HARDENED_GIT_FLAGS, '-C', '/w', 'log'],
        cwd: '/top',
        opts: { timeoutMs: 5 },
      },
      { cmd: 'gh', args: ['issue', 'view', '1'], cwd: '/w', opts: undefined },
    ]);
  });
});

describe('hardenedRunner', () => {
  test('the hardened runner prefixes git calls in the worktree', () => {
    const { top, wt, alias } = folders();
    const { run, calls } = recorder();
    const hard = hardenedRunner(run, { worktree: wt, gitDir: GIT_DIR });
    const cases: [string, string[]][] = [
      [wt, ['symbolic-ref', '-q', 'HEAD']],
      [path.join(wt, 'sub'), ['status']],
      [top, ['-C', wt, 'ls-files', '-v', '-z']],
      [top, ['--no-optional-locks', '-c', 'a=b', '-C', 'wt', 'status']],
      [top, ['-C', 'elsewhere', '-C', '../wt/sub', 'status']],
      [alias, ['rev-parse', 'HEAD']],
    ];
    for (const [cwd, args] of cases) hard('git', args, cwd);
    hard('git', ['checkout-index', '--stdin'], wt, { input: 'a\0' });
    const prefix = [
      ...HARDENED_GIT_FLAGS,
      `--git-dir=${GIT_DIR}`,
      `--work-tree=${wt}`,
    ];
    expect(calls).toEqual([
      ...cases.map(([cwd, args]) => ({
        cmd: 'git',
        args: [...prefix, ...args],
        cwd,
        opts: undefined,
      })),
      {
        cmd: 'git',
        args: [...prefix, 'checkout-index', '--stdin'],
        cwd: wt,
        opts: { input: 'a\0' },
      },
    ]);
  });

  test('it leaves other folders and commands alone', () => {
    const { top, wt } = folders();
    const sibling = `${wt}0`;
    fs.mkdirSync(sibling);
    const { run, calls } = recorder();
    const hard = hardenedRunner(run, { worktree: wt, gitDir: GIT_DIR });
    const cases: ['gh' | 'git', string[], string][] = [
      ['git', ['worktree', 'list', '--porcelain', '-z'], top],
      ['git', ['-C', top, 'status'], wt],
      ['git', ['status'], sibling],
      // After the subcommand, -C is the subcommand's own option.
      ['git', ['log', '-C', wt], top],
      ['gh', ['issue', 'view', '1'], wt],
    ];
    for (const [cmd, args, cwd] of cases) hard(cmd, args, cwd);
    expect(calls).toEqual(
      cases.map(([cmd, args, cwd]) => ({ cmd, args, cwd, opts: undefined })),
    );
  });

  test("a hardened status runs no filter an embedded repo's own config names", () => {
    const r = repoWithWorktree('');
    const nested = path.join(r.worktree, 'nested');
    fs.mkdirSync(nested);
    git(nested, 'init', '-q');
    git(nested, 'config', 'user.name', 'test');
    git(nested, 'config', 'user.email', 'test@example.com');
    git(nested, 'config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(nested, 'n.txt'), 'n\n');
    git(nested, 'add', 'n.txt');
    git(nested, 'commit', '-q', '-m', 'n');
    // Staged as a gitlink alone: no .gitmodules.
    git(r.worktree, 'add', 'nested');
    const marker = path.join(r.main, 'filter-ran');
    git(nested, 'config', 'filter.x.clean', `touch '${marker}'; cat`);
    fs.writeFileSync(path.join(nested, '.gitattributes'), '* filter=x\n');
    // A same-size edit, so git reads the content, through the filter, to compare it.
    fs.writeFileSync(path.join(nested, 'n.txt'), 'm\n');
    // Plain git status in the worktree reaches into the embedded repo.
    git(r.worktree, 'status', '--porcelain');
    expect(fs.existsSync(marker)).toBe(true);
    fs.rmSync(marker);
    const gitDir = path.join(r.commonDir, 'worktrees', 'side');
    const hard = hardenedRunner(execRunner, { worktree: r.worktree, gitDir });
    const shapes: [string[], string][] = [
      [
        [
          '-C',
          r.worktree,
          'status',
          '--porcelain',
          '-z',
          '--untracked-files=all',
        ],
        r.main,
      ],
      [
        [
          '-C',
          r.worktree,
          'status',
          '--porcelain',
          '-z',
          '--ignored',
          '--untracked-files=normal',
        ],
        r.worktree,
      ],
    ];
    for (const [args, cwd] of shapes) {
      expect(hard('git', args, cwd).code).toBe(0);
    }
    expect(fs.existsSync(marker)).toBe(false);
  });

  test('a hardened call reaches the worktree through real git', () => {
    const r = repoWithWorktree('');
    fs.writeFileSync(path.join(r.worktree, 'new.txt'), 'x\n');
    const gitDir = path.join(r.commonDir, 'worktrees', 'side');
    const hard = hardenedRunner(execRunner, { worktree: r.worktree, gitDir });
    const status = hard(
      'git',
      ['-C', r.worktree, 'status', '--porcelain'],
      r.main,
    );
    expect(status.stdout).toBe('?? new.txt\n');
    const head = hard('git', ['symbolic-ref', '-q', 'HEAD'], r.worktree);
    expect(head.stdout.trim()).toBe('refs/heads/side');
  });
});

// A repo with its linked worktree `side`, that worktree's .git file, and its
// admin folder.
function linked() {
  const r = repoWithWorktree('');
  return {
    ...r,
    dotGit: path.join(r.worktree, '.git'),
    admin: path.join(r.commonDir, 'worktrees', 'side'),
  };
}

const lineAt = (file: string, text: string): void => {
  fs.writeFileSync(file, `${text}\n`);
};

describe('chainOf', () => {
  test('a sound chain gives the admin folder, with or without its expected name', () => {
    const r = linked();
    expect(chainOf(r.worktree, r.commonDir)).toEqual({ gitDir: r.admin });
    expect(chainOf(r.worktree, r.commonDir, 'side')).toEqual({
      gitDir: r.admin,
    });
    expect(chainIssues(r.worktree, r.commonDir)).toEqual([]);
  });

  test('a .git file naming another gitdir breaks the chain', () => {
    const r = linked();
    const other = path.join(tmp(), 'other');
    git(r.main, 'worktree', 'add', '-q', '-b', 'other', other);
    const otherAdmin = path.join(r.commonDir, 'worktrees', 'other');
    lineAt(r.dotGit, `gitdir: ${otherAdmin}`);
    expect(chainIssues(r.worktree, r.commonDir)).toEqual([
      `${otherAdmin}/gitdir points to ${other}/.git, not back to ${r.dotGit}`,
    ]);
  });

  test('a .git file naming a copied admin folder outside the common dir breaks the chain', () => {
    const r = linked();
    const copy = path.join(tmp(), 'side');
    fs.cpSync(r.admin, copy, { recursive: true });
    lineAt(path.join(copy, 'commondir'), r.commonDir);
    lineAt(r.dotGit, `gitdir: ${copy}`);
    expect(chainIssues(r.worktree, r.commonDir)).toEqual([
      `${r.dotGit} names ${copy}, which is not directly under ${r.commonDir}/worktrees, where git keeps each linked worktree's admin folder`,
    ]);
  });

  test('a planted commondir breaks the chain, in the admin folder and in the common dir', () => {
    const r = linked();
    const copy = path.join(tmp(), 'copy.git');
    fs.cpSync(r.commonDir, copy, { recursive: true });
    lineAt(path.join(r.admin, 'commondir'), copy);
    lineAt(path.join(r.commonDir, 'commondir'), copy);
    expect(chainIssues(r.worktree, r.commonDir)).toEqual([
      `${r.commonDir}/commondir exists, but a main git dir never holds one: git reads it to find the repository, so it may send git to another one`,
      `${r.admin}/commondir points to ${copy}, not to the common git dir ${r.commonDir}`,
    ]);
  });

  test('a gitdir pointing elsewhere breaks the chain', () => {
    const r = linked();
    lineAt(path.join(r.admin, 'gitdir'), '/elsewhere-sk/.git');
    expect(chainIssues(r.worktree, r.commonDir)).toEqual([
      `${r.admin}/gitdir points to /elsewhere-sk/.git, not back to ${r.dotGit}`,
    ]);
  });

  test("a unit worker's admin folder must carry the expected name", () => {
    const r = linked();
    expect(chainIssues(r.worktree, r.commonDir, 'w1')).toEqual([
      `${r.dotGit} names the admin folder side, not w1, the name it must have`,
    ]);
  });

  test('relative links resolve from their own folders, as git resolves them', () => {
    const r = linked();
    lineAt(r.dotGit, `gitdir: ${path.relative(r.worktree, r.admin)}`);
    lineAt(path.join(r.admin, 'gitdir'), path.relative(r.admin, r.dotGit));
    expect(chainOf(r.worktree, r.commonDir)).toEqual({ gitDir: r.admin });
  });

  test.each([
    [
      'missing',
      (r: ReturnType<typeof linked>) => fs.rmSync(r.dotGit),
      (r: ReturnType<typeof linked>) =>
        `${r.dotGit} does not exist, so nothing links the worktree to its repo`,
    ],
    [
      'a folder',
      (r: ReturnType<typeof linked>) => {
        fs.rmSync(r.dotGit);
        fs.mkdirSync(r.dotGit);
      },
      (r: ReturnType<typeof linked>) =>
        `${r.dotGit} is not a file, so it is not the link git writes into a linked worktree`,
    ],
    [
      'without its prefix',
      (r: ReturnType<typeof linked>) => lineAt(r.dotGit, r.admin),
      (r: ReturnType<typeof linked>) =>
        `${r.dotGit} does not start with "gitdir: ", so it names no admin folder`,
    ],
    [
      'naming no folder',
      (r: ReturnType<typeof linked>) =>
        lineAt(r.dotGit, `gitdir: ${r.admin}-gone`),
      (r: ReturnType<typeof linked>) =>
        `${r.dotGit} names ${r.admin}-gone, which is not a folder`,
    ],
  ])('a .git entry %s breaks the chain', (_label, breakIt, line) => {
    const r = linked();
    breakIt(r);
    expect(chainIssues(r.worktree, r.commonDir)).toEqual([line(r)]);
  });

  test('an admin folder without its commondir breaks the chain, naming the file', () => {
    const r = linked();
    const file = path.join(r.admin, 'commondir');
    fs.rmSync(file);
    const [issue] = chainIssues(r.worktree, r.commonDir);
    expect(issue).toStartWith(`cannot read ${file}: `);
  });
});

// The repo's facts as finish reads them, from `cwd`.
function factsAt(cwd: string) {
  const facts = checkoutFacts(execRunner, cwd);
  if ('issues' in facts) throw new Error(facts.issues.join('\n'));
  return facts;
}

describe('mainGitDirIssues', () => {
  test('a sound repo passes from the main checkout, a linked one, and a folder below', () => {
    const r = linked();
    fs.mkdirSync(path.join(r.worktree, 'sub'));
    for (const cwd of [r.main, r.worktree, path.join(r.worktree, 'sub')]) {
      expect(mainGitDirIssues(execRunner, factsAt(cwd))).toEqual([]);
    }
  });

  test('a main .git/commondir pointing at a copy refuses, naming the file and both dirs', () => {
    const r = linked();
    const copy = path.join(tmp(), 'copy.git');
    fs.cpSync(r.commonDir, copy, { recursive: true });
    lineAt(path.join(r.commonDir, 'commondir'), copy);
    const planted = `${r.commonDir}/commondir exists, but a main git dir never holds one: git reads it to find the repository, so it may send git to another one`;
    // From the main checkout, git's common dir follows the planted file.
    expect(mainGitDirIssues(execRunner, factsAt(r.main))).toEqual([
      planted,
      `git reports the common git dir ${copy}, but the main checkout's git dir is ${r.commonDir}`,
    ]);
    // From a linked checkout, git reads the admin folder's commondir alone.
    expect(mainGitDirIssues(execRunner, factsAt(r.worktree))).toEqual([
      planted,
    ]);
  });

  test('a main checkout whose .git file names its git dir passes, from it and from a linked checkout', () => {
    const top = tmp();
    const gitDir = path.join(tmp(), 'separate.git');
    git(top, 'init', '-q', '--separate-git-dir', gitDir);
    git(top, 'config', 'user.name', 'test');
    git(top, 'config', 'user.email', 'test@example.com');
    git(top, 'config', 'commit.gpgsign', 'false');
    git(top, 'commit', '-q', '--allow-empty', '-m', 'init');
    const wt = path.join(tmp(), 'wt');
    git(top, 'worktree', 'add', '-q', '-b', 'side', wt);
    expect(mainGitDirIssues(execRunner, factsAt(top))).toEqual([]);
    expect(mainGitDirIssues(execRunner, factsAt(wt))).toEqual([]);
  });

  test("refuses with git's words when the listed main checkout has no top", () => {
    const r = linked();
    const failing: Runner = () => ({
      code: 128,
      stdout: '',
      stderr: 'fatal: not a work tree\n',
    });
    const facts = { ...factsAt(r.worktree), commonDir: '/elsewhere-sk/.git' };
    expect(mainGitDirIssues(failing, facts)).toEqual([
      `git rev-parse --show-toplevel failed in the main checkout ${r.main}, so sidekick cannot find its git dir: fatal: not a work tree`,
    ]);
  });

  test('a bare main repo passes from its linked checkout', () => {
    const src = repo();
    const bare = path.join(tmp(), 'b.git');
    git(src, 'clone', '-q', '--bare', src, bare);
    const wt = path.join(tmp(), 'wt');
    git(bare, 'worktree', 'add', '-q', '-b', 'side', wt);
    expect(mainGitDirIssues(execRunner, factsAt(wt))).toEqual([]);
  });
});
