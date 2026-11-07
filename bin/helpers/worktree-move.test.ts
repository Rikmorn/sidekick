import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner, type Runner } from './pm-data.js';
import type { ClaudeRunner } from './profile-launch.js';
import { recordsDir, writeRecord } from './worker-record.js';
import { runWorktreeCli, WORKTREE_USAGE_LINE } from './worktree.js';
import { markOf } from './worktree-mark.js';
import {
  checkMove,
  type MoveCheck,
  type MovePlan,
  parseMoveArgs,
} from './worktree-move-checks.js';

afterEach(removeTemps);

const NAME = 'w1';
const OWN = `worktree-${NAME}`;
const INSIDE_WAY =
  'run move inside the worktree EnterWorktree or claude -w made';
const FRESH_WAY =
  'move runs only on a fresh worktree: start one with EnterWorktree or claude -w';
const MARK_WAY = `if move made ${NAME} and could not mark it, mark it with: git config --local branch.${NAME}.sidekickWorktree ${NAME}, then run move again`;

interface Fixture {
  main: string;
  /** The fresh worktree, where Claude Code puts one. */
  dir: string;
  /** The branch the main checkout holds. */
  trunk: string;
  bare: string;
  created: string;
}

// A repo with a bare origin cloned from it, unless `origin` is false, and a
// fresh linked worktree on worktree-<name>, w1 unless `name` says otherwise.
function fixture(opts: { origin?: boolean; name?: string } = {}): Fixture {
  const main = repo();
  const trunk = git(main, 'branch', '--show-current');
  const bare = path.join(tmp(), 'origin.git');
  if (opts.origin !== false) {
    git(main, 'clone', '--bare', '-q', main, bare);
    git(main, 'remote', 'add', 'origin', bare);
  }
  const name = opts.name ?? NAME;
  const dir = path.join(main, '.claude', 'worktrees', name);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  git(main, 'worktree', 'add', '-q', '-b', `worktree-${name}`, dir);
  return { main, dir, trunk, bare, created: git(dir, 'rev-parse', 'HEAD') };
}

// What a write would change: the worktrees, every ref, and the local config.
const snapshot = (main: string): string[] => [
  git(main, 'worktree', 'list', '--porcelain'),
  git(main, 'for-each-ref'),
  git(main, 'config', '--local', '--list'),
];

// Runs the checks from `cwd`, asserting they changed nothing and ran no claude.
function check(
  cwd: string,
  main: string,
  rest: string[],
  env: NodeJS.ProcessEnv = {},
  runGit: Runner = execRunner,
): { result: MoveCheck; err: string[] } {
  const args = parseMoveArgs(rest);
  if (args === undefined) throw new Error(`no usage fits: ${rest.join(' ')}`);
  const before = snapshot(main);
  const claudeCalls: string[][] = [];
  const runClaude: ClaudeRunner = (claudeArgs) => {
    claudeCalls.push(claudeArgs);
    return { code: 0, stdout: '[]', stderr: '', timedOut: false };
  };
  const err: string[] = [];
  const result = checkMove(
    args,
    { cwd, runGit, runClaude, isAlive: () => false, env },
    (line) => err.push(line),
  );
  expect(snapshot(main)).toEqual(before);
  expect(claudeCalls).toEqual([]);
  return { result, err };
}

// git, except that each call `fails` picks exits 128 with git's words.
const failing =
  (fails: (args: string[]) => boolean): Runner =>
  (cmd, args, dir) =>
    fails(args)
      ? { code: 128, stdout: '', stderr: 'fatal: broken\n' }
      : execRunner(cmd, args, dir);

function refused(result: MoveCheck): string[] {
  if (result.kind !== 'refused') {
    throw new Error(`expected a refusal, got ${JSON.stringify(result)}`);
  }
  return result.lines;
}

// The plan of a ready check run in the fixture's worktree.
function planOf(result: MoveCheck, f: Fixture): MovePlan {
  if (result.kind !== 'ready') {
    throw new Error(`expected ready, got ${JSON.stringify(result)}`);
  }
  expect(result.here.name).toBe(NAME);
  expect(result.here.created).toBe(f.created);
  expect(result.here.entry.path).toBe(f.dir);
  expect(result.here.repo.top).toBe(f.main);
  return result.plan;
}

function commit(dir: string, file: string): string {
  fs.writeFileSync(path.join(dir, file), `${file}\n`);
  git(dir, 'add', file);
  git(dir, 'commit', '-q', '-m', file);
  return git(dir, 'rev-parse', 'HEAD');
}

describe('parseMoveArgs', () => {
  test('a branch', () => {
    expect(parseMoveArgs(['feat'])).toEqual({
      kind: 'branch',
      branch: 'feat',
      from: undefined,
    });
  });

  test('a branch with --from', () => {
    expect(parseMoveArgs(['feat', '--from', 'origin/main'])).toEqual({
      kind: 'branch',
      branch: 'feat',
      from: 'origin/main',
    });
  });

  test('--pr 12', () => {
    expect(parseMoveArgs(['--pr', '12'])).toEqual({ kind: 'pr', number: 12 });
  });

  test.each([
    [['--pr', '12', 'feat']],
    [['--pr', '0']],
    [['--pr', 'x']],
    [['--pr', '1.5']],
    [['--pr', '12', '--from', 'main']],
    [[]],
    [['feat', 'other']],
    [['feat', '--from', '']],
    [['feat', '--bogus']],
  ])('%p fits no usage', (rest) => {
    expect(parseMoveArgs(rest)).toBeUndefined();
  });
});

describe('checkMove: where it runs', () => {
  test('in the main checkout, refused, before the re-run check', () => {
    const f = fixture();
    const { result } = check(f.main, f.main, [f.trunk]);
    expect(refused(result)).toEqual([
      `${f.main} is the main checkout, not a linked worktree: ${INSIDE_WAY}`,
    ]);
  });

  test('in a subfolder of the main checkout, refused', () => {
    const f = fixture();
    const sub = path.join(f.main, 'sub');
    fs.mkdirSync(sub);
    const { result } = check(sub, f.main, ['feat']);
    expect(refused(result)).toEqual([
      `${f.main} is the main checkout, not a linked worktree: ${INSIDE_WAY}`,
    ]);
  });

  test('in a subfolder of the worktree, ready', () => {
    const f = fixture();
    const sub = path.join(f.dir, 'sub');
    fs.mkdirSync(sub);
    const { result } = check(sub, f.main, ['feat']);
    expect(planOf(result, f).kind).toBe('new');
  });

  test('outside any repository, refused, with the finding once', () => {
    const f = fixture();
    const outside = tmp();
    const { result, err } = check(outside, f.main, ['feat']);
    expect(refused(result)).toEqual([
      `move found no repository at ${outside}: ${INSIDE_WAY}`,
    ]);
    expect(err).toEqual([]);
  });
});

describe('checkMove: a re-run', () => {
  test('a worktree on <branch> is already moved, before every refusal', () => {
    const f = fixture();
    git(f.dir, 'switch', '-q', '-c', 'feat');
    const head = commit(f.dir, 'b.txt');
    fs.writeFileSync(path.join(f.dir, 'u.txt'), 'u\n');
    const { result } = check(f.dir, f.main, ['feat', '--from', f.trunk], {
      SIDEKICK_WORKER: '/b.md',
    });
    expect(result).toEqual({
      kind: 'already',
      line: `feat · ${head} · already moved`,
    });
  });

  test('a worktree on its own name, marked, while <branch> is held elsewhere', () => {
    const f = fixture();
    git(f.dir, 'switch', '-q', '-c', NAME);
    git(f.main, 'config', '--local', `branch.${NAME}.sidekickWorktree`, NAME);
    const { result } = check(f.dir, f.main, [f.trunk]);
    expect(result).toEqual({
      kind: 'already',
      line: `${NAME} · ${f.created} · already moved`,
    });
  });

  test('a worktree on its own name, unmarked, is no re-run: refused as off worktree-w1, with the line that marks it', () => {
    const f = fixture();
    git(f.dir, 'switch', '-q', '-c', NAME);
    const { result } = check(f.dir, f.main, [f.trunk]);
    expect(refused(result)).toEqual([
      `${f.dir} is on ${NAME}, not ${OWN}`,
      MARK_WAY,
      FRESH_WAY,
    ]);
  });

  test('a worktree on its own name, marked for another worktree, is no re-run: refused with the line that marks it', () => {
    const f = fixture();
    git(f.dir, 'switch', '-q', '-c', NAME);
    git(f.main, 'config', '--local', `branch.${NAME}.sidekickWorktree`, 'w9');
    const { result } = check(f.dir, f.main, [f.trunk]);
    expect(refused(result)).toEqual([
      `${f.dir} is on ${NAME}, not ${OWN}`,
      MARK_WAY,
      FRESH_WAY,
    ]);
  });

  test('a worktree on its own name, marked for it, while <branch> is held nowhere: refused without the line that marks it', () => {
    const f = fixture();
    git(f.dir, 'switch', '-q', '-c', NAME);
    git(f.main, 'config', '--local', `branch.${NAME}.sidekickWorktree`, NAME);
    const { result } = check(f.dir, f.main, ['feat']);
    expect(refused(result)).toEqual([
      `${f.dir} is on ${NAME}, not ${OWN}`,
      FRESH_WAY,
    ]);
  });

  test('--pr <n>: a detached HEAD at refs/remotes/pr/<n>', () => {
    const f = fixture();
    git(f.main, 'update-ref', 'refs/remotes/pr/7', f.created);
    git(f.dir, 'switch', '-q', '--detach', 'refs/remotes/pr/7');
    const { result } = check(f.dir, f.main, ['--pr', '7']);
    expect(result).toEqual({
      kind: 'already',
      line: `detached · ${f.created} · already moved`,
    });
  });

  test('move worktree-w1 on the fresh worktree is no re-run, and refuses', () => {
    const f = fixture();
    const { result } = check(f.dir, f.main, [OWN]);
    expect(refused(result)).toEqual([
      `${OWN} is the branch Claude Code made for this worktree, which move replaces: name the branch to move onto`,
    ]);
  });
});

describe('checkMove: the refusals, in order', () => {
  test('each refusal shows once every earlier one is cleared', () => {
    const f = fixture();
    const top = commit(f.dir, 'b.txt');
    git(f.dir, 'switch', '-q', '-c', 'other');
    fs.writeFileSync(path.join(f.dir, 'u.txt'), 'u\n');
    const worker = { SIDEKICK_WORKER: '/b.md' };
    const first = check(f.dir, f.main, ['bad..name'], worker).result;
    expect(refused(first)[0]).toStartWith('this session is a worker');
    const second = check(f.dir, f.main, ['bad..name']).result;
    expect(refused(second)[0]).toBe(`${f.dir} is on other, not ${OWN}`);
    git(f.dir, 'switch', '-q', OWN);
    const third = check(f.dir, f.main, ['bad..name']).result;
    expect(refused(third)[0]).toStartWith(`${f.dir} has tracked or untracked`);
    fs.rmSync(path.join(f.dir, 'u.txt'));
    const fourth = check(f.dir, f.main, ['bad..name']).result;
    expect(refused(fourth)[0]).toStartWith(`the HEAD of ${f.dir} is ${top}`);
    git(f.dir, 'reset', '-q', '--hard', f.created);
    const fifth = check(f.dir, f.main, ['bad..name']).result;
    expect(refused(fifth)[0]).toStartWith(
      'git check-ref-format refuses bad..name',
    );
  });

  test('1: SIDEKICK_WORKER set', () => {
    const f = fixture();
    const { result } = check(f.dir, f.main, ['feat'], {
      SIDEKICK_WORKER: '/b.md',
    });
    expect(refused(result)).toEqual([
      "this session is a worker, as SIDEKICK_WORKER is set to /b.md: a worker's brief sets its branch, not move",
    ]);
  });

  test("1: a worker record whose name is the folder's", () => {
    const f = fixture();
    writeRecord(path.join(f.main, '.git'), {
      version: 2,
      main: null,
      name: NAME,
      job: null,
      brief: '/b.md',
      dispatchedAt: '2026-11-06T00:00:00Z',
    });
    const { result } = check(f.dir, f.main, ['feat']);
    expect(refused(result)).toEqual([
      `${f.dir} is the worker ${NAME}'s worktree: a worker's brief sets its branch, not move`,
    ]);
  });

  test('1: a worker record that will not read, named, and left as it was', () => {
    const f = fixture();
    const dir = recordsDir(path.join(f.main, '.git'));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'w9.json');
    fs.writeFileSync(file, 'not json\n');
    const { result, err } = check(f.dir, f.main, ['feat']);
    const lines = refused(result);
    expect(lines[0]).toStartWith(
      `a worker record would not read, so ${f.dir} may be that worker's worktree: ${file} cannot be read as a worker record: `,
    );
    expect(lines.slice(1)).toEqual([
      'fix or remove the named record, then run move again',
    ]);
    expect(err).toEqual([]);
    expect(fs.readFileSync(file, 'utf-8')).toBe('not json\n');
  });

  test('1: an empty SIDEKICK_WORKER is no worker', () => {
    const f = fixture();
    const { result } = check(f.dir, f.main, ['feat'], { SIDEKICK_WORKER: '' });
    expect(planOf(result, f).kind).toBe('new');
  });

  test('2: another branch, named', () => {
    const f = fixture();
    git(f.dir, 'switch', '-q', '-c', 'other');
    const { result } = check(f.dir, f.main, ['feat']);
    expect(refused(result)).toEqual([
      `${f.dir} is on other, not ${OWN}`,
      FRESH_WAY,
    ]);
  });

  test('2: a detached HEAD, with its commit', () => {
    const f = fixture();
    git(f.dir, 'switch', '-q', '--detach');
    const { result } = check(f.dir, f.main, ['feat']);
    expect(refused(result)).toEqual([
      `${f.dir} has a detached HEAD at ${f.created}, not ${OWN}`,
      FRESH_WAY,
    ]);
  });

  test('3: an untracked file, named', () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.dir, 'notes.md'), 'n\n');
    const { result } = check(f.dir, f.main, ['feat']);
    expect(refused(result)).toEqual([
      `${f.dir} has tracked or untracked changes: notes.md`,
      'take them out of the worktree or delete them, then run move again',
    ]);
  });

  test('3: a tracked change, named', () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.dir, 'a.txt'), 'changed\n');
    const { result } = check(f.dir, f.main, ['feat']);
    expect(refused(result)[0]).toBe(
      `${f.dir} has tracked or untracked changes: a.txt`,
    );
  });

  test('3: 25 untracked files name 20 and count the rest', () => {
    const f = fixture();
    const names = Array.from({ length: 25 }, (_, i) => `f${10 + i}.txt`);
    for (const name of names) {
      fs.writeFileSync(path.join(f.dir, name), 'x\n');
    }
    const { result } = check(f.dir, f.main, ['feat']);
    expect(refused(result)[0]).toBe(
      `${f.dir} has tracked or untracked changes: ${names.slice(0, 20).join(', ')}, and 5 more`,
    );
  });

  test('3: a failed git status, with git’s words and the way on', () => {
    const f = fixture();
    const runGit = failing((args) => args.includes('status'));
    const { result } = check(f.dir, f.main, ['feat'], {}, runGit);
    expect(refused(result)).toEqual([
      `git status failed in ${f.dir}, so move cannot tell whether it has changes: fatal: broken`,
      `check git status in ${f.dir}, then run move again`,
    ]);
  });

  test('3: an ignored file is not checked, so the move is ready', () => {
    const f = fixture();
    const info = path.join(f.main, '.git', 'info');
    fs.mkdirSync(info, { recursive: true });
    fs.appendFileSync(path.join(info, 'exclude'), '*.env\n');
    fs.writeFileSync(path.join(f.dir, 'local.env'), 'SECRET=1\n');
    const { result } = check(f.dir, f.main, ['feat']);
    expect(planOf(result, f).kind).toBe('new');
  });

  test('4: a commit on top of the creation commit, naming both and the count', () => {
    const f = fixture();
    const head = commit(f.dir, 'b.txt');
    const { result } = check(f.dir, f.main, ['feat']);
    expect(refused(result)).toEqual([
      `the HEAD of ${f.dir} is ${head}, not ${OWN}'s creation commit ${f.created}, with 1 commit on top of it`,
      FRESH_WAY,
    ]);
  });

  test('4: a HEAD behind the creation commit, naming both with no count', () => {
    const f = fixture();
    const later = commit(f.dir, 'b.txt');
    // The reflog's oldest entry is the creation commit, so dropping it makes `later` the creation commit.
    git(f.dir, 'reflog', 'delete', `refs/heads/${OWN}@{1}`);
    git(f.dir, 'reset', '-q', '--hard', f.created);
    const { result } = check(f.dir, f.main, ['feat']);
    expect(refused(result)).toEqual([
      `the HEAD of ${f.dir} is ${f.created}, not ${OWN}'s creation commit ${later}`,
      FRESH_WAY,
    ]);
  });

  test('4: a creation commit the reflog cannot give', () => {
    const f = fixture();
    fs.rmSync(path.join(f.main, '.git', 'logs', 'refs', 'heads', OWN));
    const { result } = check(f.dir, f.main, ['feat']);
    expect(refused(result)).toEqual([
      `move cannot tell whether ${f.dir} is fresh: refs/heads/${OWN} has no reflog to read its creation commit from`,
      FRESH_WAY,
    ]);
  });

  test('5: a name git check-ref-format refuses, with its words and no fatal: prefix', () => {
    const f = fixture();
    const { result } = check(f.dir, f.main, ['bad..name']);
    expect(refused(result)).toEqual([
      "git check-ref-format refuses bad..name: 'bad..name' is not a valid branch name",
      'choose another name',
    ]);
  });

  test('5: @{-1}, which git reads as the previous branch', () => {
    const f = fixture();
    git(f.dir, 'switch', '-q', '-c', 'prev');
    git(f.dir, 'switch', '-q', OWN);
    const { result } = check(f.dir, f.main, ['@{-1}']);
    expect(refused(result)).toEqual([
      'git reads @{-1} as the branch prev: name it as prev',
    ]);
  });

  test('6: a failed git remote, with git’s words and the way on', () => {
    const f = fixture();
    const runGit = failing((args) => args.length === 1 && args[0] === 'remote');
    const { result } = check(f.dir, f.main, ['feat'], {}, runGit);
    expect(refused(result)).toEqual([
      `git remote failed in ${f.dir}: fatal: broken`,
      `check git remote in ${f.dir}, then run move again`,
    ]);
  });

  test('6: a name that begins with a remote, naming it without', () => {
    const f = fixture();
    const { result } = check(f.dir, f.main, ['origin/feat']);
    expect(refused(result)).toEqual([
      "origin/feat begins with origin/, a remote's name, so it reads as a branch of origin: name it without the remote, as feat",
    ]);
  });

  test("6: a remote's whole name", () => {
    const f = fixture();
    const { result } = check(f.dir, f.main, ['origin']);
    expect(refused(result)).toEqual([
      "origin is a remote's name, so it reads as that remote: choose another name",
    ]);
  });

  test('7: --from with a local branch of that name', () => {
    const f = fixture();
    git(f.main, 'branch', 'free');
    const { result } = check(f.dir, f.main, ['free', '--from', f.trunk]);
    expect(refused(result)).toEqual([
      'free exists, and --from asks move to create it: drop --from to move onto it',
    ]);
  });
});

describe('checkMove: the move each branch needs', () => {
  test('a new name, with no --from, starts here', () => {
    const f = fixture();
    const { result } = check(f.dir, f.main, ['feat']);
    expect(planOf(result, f)).toEqual({
      kind: 'new',
      branch: 'feat',
      base: { kind: 'here' },
    });
  });

  test('a new name, with no origin remote, starts here', () => {
    const f = fixture({ origin: false });
    const { result } = check(f.dir, f.main, ['feat']);
    expect(planOf(result, f)).toEqual({
      kind: 'new',
      branch: 'feat',
      base: { kind: 'here' },
    });
  });

  test('a new name, with --from a local branch, starts at its commit', () => {
    const f = fixture();
    const sha = commit(f.main, 'c.txt');
    const { result } = check(f.dir, f.main, ['feat', '--from', f.trunk]);
    expect(planOf(result, f)).toEqual({
      kind: 'new',
      branch: 'feat',
      base: { kind: 'local', rev: f.trunk, sha },
    });
  });

  test('a new name, with --from origin/<trunk>, starts at the remote base', () => {
    const f = fixture();
    const { result } = check(f.dir, f.main, [
      'feat',
      '--from',
      `origin/${f.trunk}`,
    ]);
    expect(planOf(result, f)).toEqual({
      kind: 'new',
      branch: 'feat',
      base: { kind: 'remote', remote: 'origin', branch: f.trunk },
    });
  });

  test('--from origin/x, where a local branch has that whole name, is local', () => {
    const f = fixture();
    git(f.main, 'branch', 'origin/x');
    const { result } = check(f.dir, f.main, ['feat', '--from', 'origin/x']);
    expect(planOf(result, f)).toEqual({
      kind: 'new',
      branch: 'feat',
      base: { kind: 'local', rev: 'origin/x', sha: f.created },
    });
  });

  test('--from origin/<trunk>~1 is no branch name, so it resolves from the last fetch', () => {
    const f = fixture();
    const fetched = commit(f.main, 'c.txt');
    git(f.main, 'update-ref', `refs/remotes/origin/${f.trunk}`, fetched);
    const from = `origin/${f.trunk}~1`;
    const sha = git(f.main, 'rev-parse', `refs/remotes/origin/${f.trunk}~1`);
    const { result } = check(f.dir, f.main, ['feat', '--from', from]);
    expect(planOf(result, f)).toEqual({
      kind: 'new',
      branch: 'feat',
      base: { kind: 'local', rev: from, sha },
    });
  });

  test("--from 'origin/*' is no branch name and names no commit, refused", () => {
    const f = fixture();
    const { result } = check(f.dir, f.main, ['feat', '--from', 'origin/*']);
    expect(refused(result)).toEqual([
      "--from origin/* names no commit: give a branch, tag, or commit, or <remote>/<branch> for a remote's branch",
    ]);
  });

  test('--from naming no commit, refused', () => {
    const f = fixture();
    const { result } = check(f.dir, f.main, ['feat', '--from', 'nope']);
    expect(refused(result)).toEqual([
      "--from nope names no commit: give a branch, tag, or commit, or <remote>/<branch> for a remote's branch",
    ]);
  });

  test('a free local branch is a switch', () => {
    const f = fixture();
    git(f.main, 'branch', 'free');
    const { result } = check(f.dir, f.main, ['free']);
    expect(planOf(result, f)).toEqual({ kind: 'switch', branch: 'free' });
  });

  test('a branch the main checkout holds gives the worktree a branch of its own name', () => {
    const f = fixture();
    const { result } = check(f.dir, f.main, [f.trunk]);
    expect(planOf(result, f)).toEqual({
      kind: 'held',
      branch: f.trunk,
      own: NAME,
      sha: f.created,
      heldAt: f.main,
    });
  });

  test('a held branch that names no commit, refused with the way on', () => {
    const f = fixture();
    const ref = `refs/heads/${f.trunk}^{commit}`;
    const runGit = failing((args) => args.includes(ref));
    const { result } = check(f.dir, f.main, [f.trunk], {}, runGit);
    expect(refused(result)).toEqual([
      `${f.trunk} names no commit, so move cannot branch from it`,
      `check ${f.trunk} in ${f.main}, then run move again`,
    ]);
  });

  test('a held branch, while a branch of the worktree’s name exists, refused', () => {
    const f = fixture();
    git(f.main, 'branch', NAME);
    const { result } = check(f.dir, f.main, [f.trunk]);
    expect(refused(result)).toEqual([
      `${f.main} holds ${f.trunk}, so move would create the branch ${NAME} at its commit, but ${NAME} exists`,
      `switch ${f.main} to another branch, or start a worktree under another name, then run move again`,
    ]);
  });

  test.each([
    'HEAD',
    '.w1',
    '-w1',
  ])('a held branch, from a worktree named %s, which git refuses as a branch, refused', (name) => {
    const f = fixture({ name });
    const { result } = check(f.dir, f.main, [f.trunk]);
    expect(refused(result)).toEqual([
      `${f.main} holds ${f.trunk}, so move would create a branch named for this worktree, ${name}, but git refuses ${name} as a branch name: fatal: '${name}' is not a valid branch name`,
      `start a worktree under a name git takes as a branch and run move there, or land the work onto ${f.trunk} from another worktree`,
    ]);
  });

  test('a branch only on origin', () => {
    const f = fixture();
    git(f.bare, 'update-ref', 'refs/heads/remote-only', f.created);
    const { result } = check(f.dir, f.main, ['remote-only']);
    expect(planOf(result, f)).toEqual({
      kind: 'origin',
      branch: 'remote-only',
    });
  });

  test('a branch only on origin, with --from, refused', () => {
    const f = fixture();
    git(f.bare, 'update-ref', 'refs/heads/remote-only', f.created);
    const { result } = check(f.dir, f.main, ['remote-only', '--from', f.trunk]);
    expect(refused(result)).toEqual([
      'remote-only exists on origin, and --from asks move to create it: drop --from to move onto it',
    ]);
  });

  test('origin holding only foo/feat leaves feat new', () => {
    const f = fixture();
    git(f.bare, 'update-ref', 'refs/heads/foo/feat', f.created);
    const { result } = check(f.dir, f.main, ['feat']);
    expect(planOf(result, f)).toEqual({
      kind: 'new',
      branch: 'feat',
      base: { kind: 'here' },
    });
  });

  test('a failed ls-remote refuses with git’s words', () => {
    const f = fixture();
    const gone = path.join(tmp(), 'gone.git');
    git(f.main, 'remote', 'set-url', 'origin', gone);
    const { result } = check(f.dir, f.main, ['feat']);
    const lines = refused(result);
    expect(lines[0]).toStartWith(
      'git ls-remote origin failed, so move cannot tell whether origin has feat: ',
    );
    expect(lines[0]).toContain(gone);
    expect(lines.slice(1)).toEqual([
      'check the remote origin, then run move again',
    ]);
  });

  test('--pr <n> with origin', () => {
    const f = fixture();
    const { result } = check(f.dir, f.main, ['--pr', '12']);
    expect(planOf(result, f)).toEqual({ kind: 'pr', number: 12 });
  });

  test('--pr <n> with no origin remote, refused', () => {
    const f = fixture({ origin: false });
    const { result } = check(f.dir, f.main, ['--pr', '12']);
    expect(refused(result)).toEqual([
      '--pr reads pull requests from origin, and this repository has no remote named origin: add the GitHub remote as origin, then run move again',
    ]);
  });
});

interface Moved {
  code: number;
  out: string[];
  err: string[];
  /** Every git call's arguments, in order. */
  calls: string[][];
}

// Runs `sidekick worktree move` from `cwd` through the CLI's dispatch,
// recording each git call and asserting it ran no claude.
function move(cwd: string, rest: string[], runGit: Runner = execRunner): Moved {
  const calls: string[][] = [];
  const recording: Runner = (cmd, args, dir) => {
    calls.push(args);
    return runGit(cmd, args, dir);
  };
  const claudeCalls: string[][] = [];
  const runClaude: ClaudeRunner = (claudeArgs) => {
    claudeCalls.push(claudeArgs);
    return { code: 0, stdout: '[]', stderr: '', timedOut: false };
  };
  const out: string[] = [];
  const err: string[] = [];
  const code = runWorktreeCli(
    ['move', ...rest],
    { cwd, runGit: recording, runClaude, isAlive: () => false, env: {} },
    (line) => out.push(line),
    (line) => err.push(line),
  );
  expect(claudeCalls).toEqual([]);
  return { code, out, err, calls };
}

function expectLine(moved: Moved, line: string): void {
  expect(moved.err).toEqual([]);
  expect(moved.out).toEqual([line]);
  expect(moved.code).toBe(0);
}

function expectFailed(moved: Moved): void {
  expect(moved.out).toEqual([]);
  expect(moved.code).toBe(1);
}

// Where the worktree is: its branch, HEAD, changes, and worktree-w1's ref
// line, which is empty once the branch is gone.
const where = (f: Fixture) => ({
  branch: git(f.dir, 'branch', '--show-current'),
  head: git(f.dir, 'rev-parse', 'HEAD'),
  status: git(f.dir, 'status', '--porcelain'),
  own: git(f.main, 'for-each-ref', `refs/heads/${OWN}`),
});

const ownLine = (f: Fixture): string =>
  `${f.created} commit\trefs/heads/${OWN}`;

const unmoved = (f: Fixture) => ({
  branch: OWN,
  head: f.created,
  status: '',
  own: ownLine(f),
});

const STAYED = (f: Fixture): string =>
  `nothing changed in ${f.dir}: it is still on ${OWN}`;

// A local config value, or undefined when it is unset.
function configOf(f: Fixture, key: string): string | undefined {
  const result = execRunner('git', ['config', '--local', '--get', key], f.main);
  return result.code === 0 ? result.stdout.trim() : undefined;
}

// A new commit on the trunk's tree, made on no branch so no checkout moves,
// and held by refs/scratch/<name> so a fetch can name it.
function looseCommit(f: Fixture, name: string): string {
  const sha = git(
    f.main,
    'commit-tree',
    `${f.trunk}^{tree}`,
    '-p',
    f.trunk,
    '-m',
    name,
  );
  git(f.main, 'update-ref', `refs/scratch/${name}`, sha);
  return sha;
}

// A new commit only on origin, at `ref`. Tests never push, so the bare repo
// fetches it.
function originCommit(f: Fixture, ref: string): string {
  const sha = looseCommit(f, 'tip');
  git(f.bare, 'fetch', '-q', f.main, `+refs/scratch/tip:${ref}`);
  return sha;
}

// A branch withenv that tracks .env, while the worktree holds its own .env as
// an ignored file. Returns that file's path.
function ignoredFileTheTargetTracks(f: Fixture): string {
  git(f.main, 'switch', '-q', '-c', 'withenv');
  fs.writeFileSync(path.join(f.main, '.env'), 'TRACKED=1\n');
  git(f.main, 'add', '.env');
  git(f.main, 'commit', '-q', '-m', 'env');
  git(f.main, 'switch', '-q', f.trunk);
  const info = path.join(f.main, '.git', 'info');
  fs.mkdirSync(info, { recursive: true });
  fs.appendFileSync(path.join(info, 'exclude'), '.env\n');
  const file = path.join(f.dir, '.env');
  fs.writeFileSync(file, 'LOCAL=1\n');
  return file;
}

describe('move: the five moves', () => {
  test("new, at the worktree's commit: created there, marked, and worktree-w1 dropped", () => {
    const f = fixture();
    const moved = move(f.dir, ['feat']);
    expectLine(
      moved,
      `feat · ${f.created} · new branch · from the worktree's commit`,
    );
    expect(where(f)).toEqual({
      branch: 'feat',
      head: f.created,
      status: '',
      own: '',
    });
    expect(markOf(execRunner, f.main, 'feat')).toBe(NAME);
    expect(configOf(f, 'branch.feat.merge')).toBeUndefined();
  });

  test('new, --from a local branch: created at its commit, marked', () => {
    const f = fixture();
    const sha = commit(f.main, 'c.txt');
    const moved = move(f.dir, ['feat', '--from', f.trunk]);
    expectLine(moved, `feat · ${sha} · new branch · from ${f.trunk}`);
    expect(where(f)).toEqual({
      branch: 'feat',
      head: sha,
      status: '',
      own: '',
    });
    expect(markOf(execRunner, f.main, 'feat')).toBe(NAME);
  });

  test('new, --from origin/<trunk>: fetched first, created at the fetched commit, with no upstream', () => {
    const f = fixture();
    const sha = originCommit(f, `refs/heads/${f.trunk}`);
    const from = `origin/${f.trunk}`;
    const moved = move(f.dir, ['feat', '--from', from]);
    expectLine(moved, `feat · ${sha} · new branch · from ${from}`);
    expect(where(f)).toEqual({
      branch: 'feat',
      head: sha,
      status: '',
      own: '',
    });
    expect(git(f.main, 'rev-parse', `refs/remotes/${from}`)).toBe(sha);
    expect(markOf(execRunner, f.main, 'feat')).toBe(NAME);
    expect(configOf(f, 'branch.feat.merge')).toBeUndefined();
    expect(configOf(f, 'branch.feat.remote')).toBeUndefined();
  });

  test('switch: a free local branch, switched to, unmarked', () => {
    const f = fixture();
    const sha = looseCommit(f, 'free');
    git(f.main, 'branch', 'free', sha);
    const moved = move(f.dir, ['free']);
    expectLine(moved, `free · ${sha} · existing branch · from free`);
    expect(where(f)).toEqual({
      branch: 'free',
      head: sha,
      status: '',
      own: '',
    });
    expect(markOf(execRunner, f.main, 'free')).toBeUndefined();
  });

  test("held: a marked branch of the worktree's name at the held one's commit, which stays where it was", () => {
    const f = fixture();
    const sha = commit(f.main, 'c.txt');
    const moved = move(f.dir, [f.trunk]);
    expectLine(
      moved,
      `${NAME} · ${sha} · new branch for a held one · from ${f.trunk} · land onto ${f.trunk}`,
    );
    expect(where(f)).toEqual({ branch: NAME, head: sha, status: '', own: '' });
    expect(git(f.main, 'rev-parse', f.trunk)).toBe(sha);
    expect(git(f.main, 'branch', '--show-current')).toBe(f.trunk);
    expect(markOf(execRunner, f.main, NAME)).toBe(NAME);
    expect(markOf(execRunner, f.main, f.trunk)).toBeUndefined();
  });

  test('origin: fetched, created at its commit, tracking origin/<branch>, unmarked', () => {
    const f = fixture();
    const sha = originCommit(f, 'refs/heads/feat');
    const moved = move(f.dir, ['feat']);
    expectLine(moved, `feat · ${sha} · tracking branch · from origin/feat`);
    expect(where(f)).toEqual({
      branch: 'feat',
      head: sha,
      status: '',
      own: '',
    });
    expect(git(f.dir, 'rev-parse', '--abbrev-ref', 'feat@{u}')).toBe(
      'origin/feat',
    );
    expect(markOf(execRunner, f.main, 'feat')).toBeUndefined();
  });

  test('origin, under a narrow fetch refspec: the upstream is set by config, and the worktree is clean', () => {
    const f = fixture();
    git(
      f.main,
      'config',
      'remote.origin.fetch',
      `+refs/heads/${f.trunk}:refs/remotes/origin/${f.trunk}`,
    );
    const sha = originCommit(f, 'refs/heads/feat');
    const moved = move(f.dir, ['feat']);
    expectLine(moved, `feat · ${sha} · tracking branch · from origin/feat`);
    expect(where(f)).toEqual({
      branch: 'feat',
      head: sha,
      status: '',
      own: '',
    });
    expect(configOf(f, 'branch.feat.remote')).toBe('origin');
    expect(configOf(f, 'branch.feat.merge')).toBe('refs/heads/feat');
  });

  test('pr: fetched into refs/remotes/pr/<n>, then detached there', () => {
    const f = fixture();
    const sha = originCommit(f, 'refs/pull/7/head');
    const moved = move(f.dir, ['--pr', '7']);
    expectLine(
      moved,
      `detached · ${sha} · pull request 7, read-only · from pr/7`,
    );
    expect(where(f)).toEqual({ branch: '', head: sha, status: '', own: '' });
    expect(git(f.main, 'rev-parse', 'refs/remotes/pr/7')).toBe(sha);
  });

  test('an ignored file the target does not track never refuses, and stays', () => {
    const f = fixture();
    const info = path.join(f.main, '.git', 'info');
    fs.mkdirSync(info, { recursive: true });
    fs.appendFileSync(path.join(info, 'exclude'), '*.env\n');
    const file = path.join(f.dir, 'local.env');
    fs.writeFileSync(file, 'SECRET=1\n');
    expect(move(f.dir, ['feat']).code).toBe(0);
    expect(fs.readFileSync(file, 'utf-8')).toBe('SECRET=1\n');
  });
});

describe('move: a re-run', () => {
  test('--pr <n> again prints already moved and fetches nothing', () => {
    const f = fixture();
    const sha = originCommit(f, 'refs/pull/7/head');
    expect(move(f.dir, ['--pr', '7']).code).toBe(0);
    const again = move(f.dir, ['--pr', '7']);
    expectLine(again, `detached · ${sha} · already moved`);
    expect(again.calls.filter((args) => args[0] === 'fetch')).toEqual([]);
  });

  test('<branch> again prints already moved', () => {
    const f = fixture();
    expect(move(f.dir, ['feat']).code).toBe(0);
    expectLine(move(f.dir, ['feat']), `feat · ${f.created} · already moved`);
  });
});

// Runs `sidekick worktree remove` from `cwd`, with no session listed.
function remove(cwd: string, rest: string[]) {
  const runClaude: ClaudeRunner = () => ({
    code: 0,
    stdout: '[]',
    stderr: '',
    timedOut: false,
  });
  const out: string[] = [];
  const err: string[] = [];
  const code = runWorktreeCli(
    ['remove', ...rest],
    { cwd, runGit: execRunner, runClaude, isAlive: () => false, env: {} },
    (line) => out.push(line),
    (line) => err.push(line),
  );
  return { code, out, err };
}

const CLEARED = (branch: string, mark: string): string =>
  `cleared the stale mark branch.${branch}.sidekickWorktree, which named the worktree ${mark}: move leaves an existing or tracking branch unmarked, so remove keeps ${branch}`;

describe('move: a stale mark', () => {
  test('a mark a removed worktree of the same name left is cleared, so remove keeps the branch', () => {
    const f = fixture();
    expect(move(f.dir, ['feat']).code).toBe(0);
    expect(markOf(execRunner, f.main, 'feat')).toBe(NAME);
    git(f.main, 'worktree', 'remove', f.dir);
    git(f.main, 'worktree', 'add', '-q', '-b', OWN, f.dir);
    const moved = move(f.dir, ['feat']);
    expect(moved.out).toEqual([
      `feat · ${f.created} · existing branch · from feat`,
    ]);
    expect(moved.err).toEqual([CLEARED('feat', NAME)]);
    expect(moved.code).toBe(0);
    expect(markOf(execRunner, f.main, 'feat')).toBeUndefined();
    const removed = remove(f.main, [NAME]);
    expect(removed.err).toEqual([]);
    expect(removed.code).toBe(0);
    expect(removed.out).toContain(
      `branch feat kept: remove deletes only ${OWN} or a branch sidekick worktree move made for this worktree`,
    );
    expect(git(f.main, 'rev-parse', 'feat')).toBe(f.created);
  });

  test('a mark on a branch only on origin, for another worktree, is cleared too', () => {
    const f = fixture();
    const sha = originCommit(f, 'refs/heads/feat');
    git(f.main, 'config', '--local', 'branch.feat.sidekickWorktree', 'w9');
    const moved = move(f.dir, ['feat']);
    expect(moved.out).toEqual([
      `feat · ${sha} · tracking branch · from origin/feat`,
    ]);
    expect(moved.err).toEqual([CLEARED('feat', 'w9')]);
    expect(moved.code).toBe(0);
    expect(markOf(execRunner, f.main, 'feat')).toBeUndefined();
    expect(configOf(f, 'branch.feat.merge')).toBe('refs/heads/feat');
  });

  test('a mark that will not clear: the move still exits 0, with the line that clears it', () => {
    const f = fixture();
    const sha = looseCommit(f, 'free');
    git(f.main, 'branch', 'free', sha);
    git(f.main, 'config', '--local', 'branch.free.sidekickWorktree', NAME);
    fs.writeFileSync(path.join(f.main, '.git', 'config.lock'), '');
    const moved = move(f.dir, ['free']);
    expect(moved.out).toEqual([`free · ${sha} · existing branch · from free`]);
    expect(moved.code).toBe(0);
    expect(moved.err[0]).toStartWith(
      'git config --local --unset branch.free.sidekickWorktree failed: ',
    );
    expect(moved.err.slice(1)).toEqual([
      `the worktree moved to free at ${sha}, and free stays marked for the worktree ${NAME}, so remove deletes it from a worktree of that name`,
      'clear it with: git config --local --unset branch.free.sidekickWorktree',
    ]);
    expect(where(f)).toEqual({
      branch: 'free',
      head: sha,
      status: '',
      own: '',
    });
    expect(markOf(execRunner, f.main, 'free')).toBe(NAME);
  });
});

describe('move: refusals and failures', () => {
  test('a refusal prints to stderr, changes nothing, and exits 1', () => {
    const f = fixture();
    const before = snapshot(f.main);
    const moved = move(f.dir, ['bad..name']);
    expectFailed(moved);
    expect(moved.err).toEqual([
      "git check-ref-format refuses bad..name: 'bad..name' is not a valid branch name",
      'choose another name',
    ]);
    expect(snapshot(f.main)).toEqual(before);
  });

  test('arguments that fit no usage print the usage, run no git, and exit 1', () => {
    const f = fixture();
    expect(move(f.dir, ['--pr', 'x'])).toEqual({
      code: 1,
      out: [],
      err: [`usage: ${WORKTREE_USAGE_LINE}`],
      calls: [],
    });
  });

  test('a failed fetch, with origin at a missing path, leaves the worktree on worktree-w1', () => {
    const f = fixture();
    const gone = path.join(tmp(), 'gone.git');
    git(f.main, 'remote', 'set-url', 'origin', gone);
    const moved = move(f.dir, ['--pr', '7']);
    expectFailed(moved);
    expect(moved.err[0]).toStartWith(
      'git fetch origin +refs/pull/7/head:refs/remotes/pr/7 failed: ',
    );
    expect(moved.err[0]).toContain(gone);
    expect(moved.err.slice(1)).toEqual([
      STAYED(f),
      'check the remote origin, then run move again',
    ]);
    expect(where(f)).toEqual(unmoved(f));
  });

  test('a failed fetch of a remote base leaves the worktree on worktree-w1, with no new branch', () => {
    const f = fixture();
    const gone = path.join(tmp(), 'gone.git');
    git(f.main, 'remote', 'add', 'upstream', gone);
    const moved = move(f.dir, ['feat', '--from', `upstream/${f.trunk}`]);
    expectFailed(moved);
    expect(moved.err[0]).toStartWith(
      `git fetch upstream +refs/heads/${f.trunk}:refs/remotes/upstream/${f.trunk} failed: `,
    );
    expect(moved.err.slice(1)).toEqual([
      STAYED(f),
      'check the remote upstream, then run move again',
    ]);
    expect(where(f)).toEqual(unmoved(f));
    expect(git(f.main, 'for-each-ref', 'refs/heads/feat')).toBe('');
  });

  test('a plain switch that would overwrite an ignored file the target tracks refuses, and keeps the file', () => {
    const f = fixture();
    const file = ignoredFileTheTargetTracks(f);
    const moved = move(f.dir, ['withenv']);
    expectFailed(moved);
    expect(moved.err[0]).toStartWith(
      'git switch --no-overwrite-ignore withenv failed: ',
    );
    expect(moved.err[0]).toContain('.env');
    expect(moved.err.slice(1)).toEqual([
      STAYED(f),
      'move or delete the files git names, then run move again',
    ]);
    expect(fs.readFileSync(file, 'utf-8')).toBe('LOCAL=1\n');
    expect(where(f)).toEqual(unmoved(f));
  });

  test('switch -c refuses the same way, and creates no branch', () => {
    const f = fixture();
    const file = ignoredFileTheTargetTracks(f);
    const sha = git(f.main, 'rev-parse', 'withenv');
    const moved = move(f.dir, ['feat', '--from', 'withenv']);
    expectFailed(moved);
    expect(moved.err[0]).toStartWith(
      `git switch --no-overwrite-ignore -c feat --no-track ${sha} failed: `,
    );
    expect(moved.err[0]).toContain('.env');
    expect(moved.err.slice(1)).toEqual([
      STAYED(f),
      'move or delete the files git names, then run move again',
    ]);
    expect(fs.readFileSync(file, 'utf-8')).toBe('LOCAL=1\n');
    expect(where(f)).toEqual(unmoved(f));
    expect(git(f.main, 'for-each-ref', 'refs/heads/feat')).toBe('');
  });

  test('a switch that exits 0 but leaves HEAD on worktree-w1 marks nothing and drops nothing', () => {
    const f = fixture();
    const noSwitch: Runner = (cmd, args, dir) =>
      args[0] === 'switch'
        ? { code: 0, stdout: '', stderr: '' }
        : execRunner(cmd, args, dir);
    const moved = move(f.dir, ['feat'], noSwitch);
    expectFailed(moved);
    expect(moved.err).toEqual([
      `git switch exited 0, but ${f.dir} is on ${OWN}, not feat`,
      `move marked nothing and kept ${OWN}: check git status in ${f.dir}, then run move again`,
    ]);
    expect(where(f)).toEqual(unmoved(f));
    expect(markOf(execRunner, f.main, 'feat')).toBeUndefined();
  });

  test('a failed mark: the worktree moved, the branch stays unmarked, and the line that marks it', () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.main, '.git', 'config.lock'), '');
    const moved = move(f.dir, ['feat']);
    expectFailed(moved);
    expect(moved.err[0]).toStartWith(
      'git config branch.feat.sidekickWorktree failed: ',
    );
    expect(moved.err.slice(1)).toEqual([
      `the worktree moved to feat at ${f.created}, and feat stays unmarked, so remove keeps it`,
      `mark it with: git config --local branch.feat.sidekickWorktree ${NAME}`,
    ]);
    expect(where(f)).toEqual({
      branch: 'feat',
      head: f.created,
      status: '',
      own: '',
    });
    expect(markOf(execRunner, f.main, 'feat')).toBeUndefined();
  });

  test('a held branch from a worktree named HEAD refuses before any write', () => {
    const f = fixture({ name: 'HEAD' });
    const before = snapshot(f.main);
    const moved = move(f.dir, [f.trunk]);
    expectFailed(moved);
    expect(moved.err).toEqual([
      `${f.main} holds ${f.trunk}, so move would create a branch named for this worktree, HEAD, but git refuses HEAD as a branch name: fatal: 'HEAD' is not a valid branch name`,
      `start a worktree under a name git takes as a branch and run move there, or land the work onto ${f.trunk} from another worktree`,
    ]);
    expect(snapshot(f.main)).toEqual(before);
    expect(git(f.dir, 'branch', '--show-current')).toBe('worktree-HEAD');
  });

  test('a re-run after a failed held mark gives the line that marks the branch, and runs once it is marked', () => {
    const f = fixture();
    const lock = path.join(f.main, '.git', 'config.lock');
    fs.writeFileSync(lock, '');
    const first = move(f.dir, [f.trunk]);
    expectFailed(first);
    expect(first.err.at(-1)).toBe(
      `mark it with: git config --local branch.${NAME}.sidekickWorktree ${NAME}`,
    );
    fs.rmSync(lock);
    const again = move(f.dir, [f.trunk]);
    expectFailed(again);
    expect(again.err).toEqual([
      `${f.dir} is on ${NAME}, not ${OWN}`,
      MARK_WAY,
      FRESH_WAY,
    ]);
    git(f.main, 'config', '--local', `branch.${NAME}.sidekickWorktree`, NAME);
    expectLine(
      move(f.dir, [f.trunk]),
      `${NAME} · ${f.created} · already moved`,
    );
  });

  test('a failed upstream write: the worktree moved, and the two lines that set it', () => {
    const f = fixture();
    const sha = originCommit(f, 'refs/heads/feat');
    fs.writeFileSync(path.join(f.main, '.git', 'config.lock'), '');
    const moved = move(f.dir, ['feat']);
    expectFailed(moved);
    expect(moved.err[0]).toStartWith(
      'git config --local branch.feat.remote origin failed: ',
    );
    expect(moved.err.slice(1)).toEqual([
      `the worktree moved to feat at ${sha}, and feat has no upstream`,
      'set it with: git config --local branch.feat.remote origin',
      'and: git config --local branch.feat.merge refs/heads/feat',
    ]);
    expect(where(f)).toEqual({
      branch: 'feat',
      head: sha,
      status: '',
      own: '',
    });
  });

  test('a failed drop: the worktree moved, and worktree-w1 stays at its creation commit', () => {
    const f = fixture();
    const lock = path.join(f.main, '.git', 'refs', 'heads', `${OWN}.lock`);
    fs.writeFileSync(lock, '');
    const moved = move(f.dir, ['feat']);
    expectFailed(moved);
    expect(moved.err[0]).toStartWith(
      `git update-ref -d refs/heads/${OWN} failed: `,
    );
    expect(moved.err.slice(1)).toEqual([
      `the worktree moved to feat at ${f.created}, and ${OWN} stays at its creation commit ${f.created}, holding no commits of its own`,
      `delete it with: git update-ref -d refs/heads/${OWN} ${f.created}`,
    ]);
    expect(where(f)).toEqual({
      branch: 'feat',
      head: f.created,
      status: '',
      own: ownLine(f),
    });
    expect(markOf(execRunner, f.main, 'feat')).toBe(NAME);
  });
});

// The read-only git the checks and the drop run, by subcommand, beside the
// reads isAllowed matches by their arguments. rev-list runs only on a HEAD
// past the creation commit.
const READS = [
  'rev-parse',
  'status',
  'rev-list',
  'ls-remote',
  'check-ref-format',
];

// Arguments move never passes, after git's own `-C <dir>`. The switch shapes
// in isSwitchAllowed are the first net; this list is the second.
const FORBIDDEN = [
  '--force',
  '-f',
  '-D',
  'reset',
  'clean',
  'prune',
  '--discard-changes',
  '-C',
  '--force-create',
  '--merge',
  '-m',
];

// A fetch writes only remote-tracking refs, and names where.
const REMOTE_REFSPEC = /^\+refs\/[^:]+:refs\/remotes\//;

// What a move may write: config on the branch HEAD lands on, undefined for a
// detached HEAD, and the drop of worktree-w1 at its creation commit.
interface Writes {
  target: string | undefined;
  created: string;
}

// The keys move sets on its target, each with the one value it sets.
function settable(target: string | undefined): Map<string, string> {
  if (target === undefined) return new Map();
  return new Map([
    [`branch.${target}.sidekickWorktree`, NAME],
    [`branch.${target}.remote`, 'origin'],
    [`branch.${target}.merge`, `refs/heads/${target}`],
  ]);
}

// A config read; the mark, upstream, or stale mark's removal on the target;
// or the drop's section removal. Any other write fails, remote.origin.fetch
// among them.
function isConfigAllowed(rest: string[], writes: Writes): boolean {
  const args = rest.filter((arg) => arg !== '--local');
  if (args.length !== 2) return false;
  const [first, second] = args;
  switch (first) {
    case '--get':
    case '--get-regexp':
      return true;
    case '--remove-section':
      return second === `branch.${OWN}`;
    case '--unset':
      return (
        writes.target !== undefined &&
        second === `branch.${writes.target}.sidekickWorktree`
      );
    default:
      return settable(writes.target).get(first) === second;
  }
}

const isWord = (arg: string | undefined): boolean =>
  arg !== undefined && !arg.startsWith('-');

// Only the three switches move builds: create at a commit with no upstream,
// detach at a ref, or switch to a branch. Any other shape may force, as
// --discard-changes or -C does.
function isSwitchAllowed(rest: string[]): boolean {
  const [guard, ...args] = rest;
  if (guard !== '--no-overwrite-ignore') return false;
  const [first, second, third, fourth] = args;
  switch (args.length) {
    case 4:
      return (
        first === '-c' &&
        isWord(second) &&
        third === '--no-track' &&
        isWord(fourth)
      );
    case 2:
      return first === '--detach' && isWord(second);
    case 1:
      return isWord(first);
    default:
      return false;
  }
}

// A call's arguments after git's own `-C <dir>`, which status runs with.
const argsOf = (call: string[]): string[] =>
  call[0] === '-C' ? call.slice(2) : call;

// Whether a git call is a read the checks make, or a write move may make.
function isAllowed(call: string[], writes: Writes): boolean {
  const [sub, ...rest] = argsOf(call);
  switch (sub) {
    case 'worktree':
      return rest[0] === 'list';
    case 'reflog':
      return rest[0] === 'show';
    case 'remote':
      return rest.length === 0;
    case 'config':
      return isConfigAllowed(rest, writes);
    case 'fetch':
      return rest.length === 2 && REMOTE_REFSPEC.test(rest[1]);
    case 'switch':
      return isSwitchAllowed(rest);
    case 'update-ref':
      return (
        rest.length === 3 &&
        rest[0] === '-d' &&
        rest[1] === `refs/heads/${OWN}` &&
        rest[2] === writes.created
      );
    default:
      return READS.includes(sub);
  }
}

// Each move's setup, and the branch HEAD lands on.
const MOVES: [string, (f: Fixture) => string[], string | undefined][] = [
  ['new, here', () => ['feat'], 'feat'],
  ['new, local', (f) => ['feat', '--from', f.trunk], 'feat'],
  ['new, remote', (f) => ['feat', '--from', `origin/${f.trunk}`], 'feat'],
  [
    'switch',
    (f) => {
      git(f.main, 'branch', 'free', looseCommit(f, 'free'));
      return ['free'];
    },
    'free',
  ],
  [
    'switch, with a stale mark',
    (f) => {
      git(f.main, 'branch', 'free', looseCommit(f, 'free'));
      git(f.main, 'config', '--local', 'branch.free.sidekickWorktree', NAME);
      return ['free'];
    },
    'free',
  ],
  ['held', (f) => [f.trunk], NAME],
  [
    'origin',
    (f) => {
      originCommit(f, 'refs/heads/feat');
      return ['feat'];
    },
    'feat',
  ],
  [
    'pr',
    (f) => {
      originCommit(f, 'refs/pull/7/head');
      return ['--pr', '7'];
    },
    undefined,
  ],
];

describe('move: the git allow list', () => {
  test.each(
    MOVES,
  )('%s runs only reads and the allowed writes, never a force or a reset', (_, setup, target) => {
    const f = fixture();
    const moved = move(f.dir, setup(f));
    expect(moved.code).toBe(0);
    const writes = { target, created: f.created };
    expect(moved.calls.filter((call) => !isAllowed(call, writes))).toEqual([]);
    const forced = moved.calls.filter((call) =>
      argsOf(call).some((arg) => FORBIDDEN.includes(arg)),
    );
    expect(forced).toEqual([]);
    const subcommands = moved.calls.map((call) => call[0]);
    expect(subcommands).toContain('switch');
    expect(subcommands).toContain('update-ref');
  });
});
