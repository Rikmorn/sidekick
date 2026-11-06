import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner } from './pm-data.js';
import type { ClaudeRunner } from './profile-launch.js';
import { writeRecord } from './worker-record.js';
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
// fresh linked worktree on worktree-w1.
function fixture(opts: { origin?: boolean } = {}): Fixture {
  const main = repo();
  const trunk = git(main, 'branch', '--show-current');
  const bare = path.join(tmp(), 'origin.git');
  if (opts.origin !== false) {
    git(main, 'clone', '--bare', '-q', main, bare);
    git(main, 'remote', 'add', 'origin', bare);
  }
  const dir = path.join(main, '.claude', 'worktrees', NAME);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  git(main, 'worktree', 'add', '-q', '-b', OWN, dir);
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
    { cwd, runGit: execRunner, runClaude, isAlive: () => false, env },
    (line) => err.push(line),
  );
  expect(snapshot(main)).toEqual(before);
  expect(claudeCalls).toEqual([]);
  return { result, err };
}

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

  test('outside any repository, refused, with the reason on err', () => {
    const f = fixture();
    const outside = tmp();
    const { result, err } = check(outside, f.main, ['feat']);
    expect(refused(result)).toEqual([
      `move found no repository at ${outside}: ${INSIDE_WAY}`,
    ]);
    expect(err).toEqual([`${outside} is not inside a git repository`]);
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

  test('a worktree on its own name, unmarked, is no re-run: refused as off worktree-w1', () => {
    const f = fixture();
    git(f.dir, 'switch', '-q', '-c', NAME);
    const { result } = check(f.dir, f.main, [f.trunk]);
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

  test('4: a creation commit the reflog cannot give', () => {
    const f = fixture();
    fs.rmSync(path.join(f.main, '.git', 'logs', 'refs', 'heads', OWN));
    const { result } = check(f.dir, f.main, ['feat']);
    expect(refused(result)).toEqual([
      `move cannot tell whether ${f.dir} is fresh: refs/heads/${OWN} has no reflog to read its creation commit from`,
      FRESH_WAY,
    ]);
  });

  test('5: a name git check-ref-format refuses, with its words', () => {
    const f = fixture();
    const { result } = check(f.dir, f.main, ['bad..name']);
    expect(refused(result)).toEqual([
      "git check-ref-format refuses bad..name: fatal: 'bad..name' is not a valid branch name. Choose another name",
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

  test('a held branch, while a branch of the worktree’s name exists, refused', () => {
    const f = fixture();
    git(f.main, 'branch', NAME);
    const { result } = check(f.dir, f.main, [f.trunk]);
    expect(refused(result)).toEqual([
      `${f.main} holds ${f.trunk}, so move would create the branch ${NAME} at its commit, but ${NAME} exists`,
      `switch ${f.main} to another branch, or start a worktree under another name, then run move again`,
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
