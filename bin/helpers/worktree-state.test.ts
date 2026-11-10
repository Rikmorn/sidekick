import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findRepo } from './desk-children.js';
import type { ListingRow } from './desk-snapshot.js';
import {
  git,
  removeTemps,
  repoWithWorktree,
  tmp,
} from './fixtures/worker/repo.js';
import { execRunner, type Runner } from './pm-data.js';
import type { WorkerRecord } from './worker-record.js';
import { nativeFolder } from './worker-worktree.js';
import {
  type CheapSources,
  commitsAt,
  leftBehind,
  mainCheckoutUse,
  sessionInside,
  worktreeRows,
} from './worktree-state.js';

afterEach(removeTemps);

const recordNamed = (name: string): WorkerRecord => ({
  version: 2,
  main: null,
  name,
  job: null,
  brief: 'brief.md',
  dispatchedAt: '2026-11-05T00:00:00Z',
});

const SESSION_LOCK = 'claude session w1 (pid 4242 start 2026-11-05)';

function sources(
  main: string,
  over: Partial<Omit<CheapSources, 'repo'>> = {},
): CheapSources {
  const { repo } = findRepo(execRunner, main);
  if (repo === undefined) throw new Error('no repo');
  return {
    repo,
    rows: [],
    listingWarnings: [],
    records: [],
    unreadRecords: [],
    isAlive: (pid) => pid === 4242,
    ...over,
  };
}

const UNREAD = '/repo/.git/sidekick/workers/broken.json cannot be read';

const stateOf = (src: CheapSources) => {
  const rows = worktreeRows(src, execRunner);
  return rows.map((row) => row.state);
};

// The order of linked worktrees follows .git/worktrees/, so a test with two or
// more pairs each state with its worktree's name instead of a position.
const statesByName = (src: CheapSources) =>
  Object.fromEntries(
    worktreeRows(src, execRunner).map((row) => [row.name, row.state]),
  );

describe('worktreeRows: each state', () => {
  test('the main checkout never gets a row', () => {
    const r = repoWithWorktree('');
    const rows = worktreeRows(sources(r.main), execRunner);
    expect(rows.map((row) => row.name)).toEqual(['side']);
  });

  test('a live lock is held by its pid', () => {
    const r = repoWithWorktree('');
    git(r.main, 'worktree', 'lock', '--reason', SESSION_LOCK, r.worktree);
    const src = sources(r.main);
    expect(stateOf(src)).toEqual([{ kind: 'held', by: 'pid 4242' }]);
    expect(leftBehind(src)).toEqual([]);
  });

  test('an unreadable lock is held with its reason', () => {
    const r = repoWithWorktree('');
    git(r.main, 'worktree', 'lock', '--reason', 'manual hold', r.worktree);
    expect(stateOf(sources(r.main))).toEqual([
      { kind: 'held', by: 'lock: manual hold' },
    ]);
  });

  test('a dead lock does not hold', () => {
    const r = repoWithWorktree('');
    git(r.main, 'worktree', 'lock', '--reason', SESSION_LOCK, r.worktree);
    const src = sources(r.main, { isAlive: () => false });
    expect(stateOf(src)).toEqual([{ kind: 'removable' }]);
    expect(leftBehind(src)).toHaveLength(1);
  });

  test('a current row whose cwd sits under the symlinked path holds it', () => {
    const r = repoWithWorktree('');
    // git lists the physical path; the session may report the symlinked one.
    const symlinked = path.join(tmp(), 'link');
    fs.symlinkSync(path.dirname(r.worktree), symlinked);
    const row: ListingRow = {
      sessionId: 'abc123',
      kind: 'interactive',
      pid: 99,
      cwd: path.join(symlinked, 'side', 'sub'),
    };
    fs.mkdirSync(path.join(r.worktree, 'sub'));
    const src = sources(r.main, { rows: [row] });
    expect(stateOf(src)).toEqual([{ kind: 'held', by: 'session abc123' }]);
    expect(leftBehind(src)).toEqual([]);
  });

  test('a row outside the worktree does not hold it', () => {
    const r = repoWithWorktree('');
    const row: ListingRow = { sessionId: 'abc', pid: 99, cwd: r.main };
    expect(stateOf(sources(r.main, { rows: [row] }))).toEqual([
      { kind: 'removable' },
    ]);
  });

  test('a record whose native folder is the worktree gives worker', () => {
    const r = repoWithWorktree('');
    const native = nativeFolder(r.main, 'w1');
    fs.mkdirSync(path.dirname(native), { recursive: true });
    git(r.main, 'worktree', 'add', '-q', '-b', 'worktree-w1', native);
    const record = recordNamed('w1');
    const rows = worktreeRows(
      sources(r.main, { records: [record] }),
      execRunner,
    );
    const w1 = rows.find((row) => row.name === 'w1');
    expect(w1?.state).toEqual({ kind: 'worker', name: 'w1' });
    expect(w1?.commits).toBeUndefined();
  });

  test("a record whose name is the folder's gives worker, wherever the folder sits and whatever its branch", () => {
    const r = repoWithWorktree('');
    const dir = path.join(tmp(), 'w1');
    git(r.main, 'worktree', 'add', '-q', '-b', 'other', dir);
    const src = sources(r.main, { records: [recordNamed('w1')] });
    expect(statesByName(src).w1).toEqual({ kind: 'worker', name: 'w1' });
  });

  test("a record whose native branch, or whose name, is the worktree's branch gives worker", () => {
    const r = repoWithWorktree('');
    git(
      r.main,
      'worktree',
      'add',
      '-q',
      '-b',
      'worktree-w1',
      path.join(tmp(), 'x'),
    );
    git(r.main, 'worktree', 'add', '-q', '-b', 'w2', path.join(tmp(), 'y'));
    const src = sources(r.main, {
      records: [recordNamed('w1'), recordNamed('w2')],
    });
    expect(statesByName(src)).toEqual({
      side: { kind: 'removable' },
      x: { kind: 'worker', name: 'w1' },
      y: { kind: 'worker', name: 'w2' },
    });
    expect(leftBehind(src).map((e) => path.basename(e.path))).toEqual(['side']);
  });

  test('a deleted folder gives folder gone', () => {
    const r = repoWithWorktree('');
    fs.rmSync(r.worktree, { recursive: true, force: true });
    expect(stateOf(sources(r.main))).toEqual([{ kind: 'folder gone' }]);
  });

  test('a prunable entry whose folder still exists is held, unknown, inside the main checkout or outside it', () => {
    const r = repoWithWorktree('.claude/\n');
    const native = nativeFolder(r.main, 'p1');
    fs.mkdirSync(path.dirname(native), { recursive: true });
    git(r.main, 'worktree', 'add', '-q', '-b', 'worktree-p1', native);
    fs.rmSync(path.join(native, '.git'));
    fs.rmSync(path.join(r.worktree, '.git'));
    const src = sources(r.main);
    const rows = worktreeRows(src, execRunner);
    expect(rows.every((row) => row.entry.prunable !== undefined)).toBe(true);
    const unlinked = (dir: string) => ({
      kind: 'held',
      by: `unknown: ${dir} holds no .git entry, so git cannot read its files`,
    });
    expect(statesByName(src)).toEqual({
      side: unlinked(r.worktree),
      p1: unlinked(native),
    });
  });

  test('a new ignored file gives dirty', () => {
    const r = repoWithWorktree('*.sh\n');
    fs.writeFileSync(path.join(r.worktree, 'scratch.sh'), 'echo\n');
    expect(stateOf(sources(r.main))).toEqual([
      {
        kind: 'dirty',
        files: [{ path: 'scratch.sh', loss: 'ignored' }],
        omitted: { kind: 'exact', count: 0 },
      },
    ]);
  });

  test('an untracked file gives dirty', () => {
    const r = repoWithWorktree('');
    fs.writeFileSync(path.join(r.worktree, 'new.txt'), 'x\n');
    expect(stateOf(sources(r.main))).toEqual([
      {
        kind: 'dirty',
        files: [{ path: 'new.txt', loss: 'changed' }],
        omitted: { kind: 'exact', count: 0 },
      },
    ]);
  });

  test('a flagged file gives dirty with its kind, and the flagged files come first (#319)', () => {
    const r = repoWithWorktree('*.sh\n');
    for (const file of ['skip.txt', 'hide.txt']) {
      fs.writeFileSync(path.join(r.worktree, file), 'v1\n');
    }
    git(r.worktree, 'add', 'skip.txt', 'hide.txt');
    git(r.worktree, 'commit', '-q', '-m', 'files');
    git(r.worktree, 'update-index', '--skip-worktree', 'skip.txt');
    git(r.worktree, 'update-index', '--assume-unchanged', 'hide.txt');
    fs.writeFileSync(path.join(r.worktree, 'skip.txt'), 'edited\n');
    fs.writeFileSync(path.join(r.worktree, 'new.txt'), 'x\n');
    fs.writeFileSync(path.join(r.worktree, 'scratch.sh'), 'echo\n');
    expect(stateOf(sources(r.main))).toEqual([
      {
        kind: 'dirty',
        files: [
          { path: 'skip.txt', loss: 'skip-worktree' },
          { path: 'hide.txt', loss: 'assume-unchanged' },
          { path: 'new.txt', loss: 'changed' },
          { path: 'scratch.sh', loss: 'ignored' },
        ],
        omitted: { kind: 'exact', count: 0 },
      },
    ]);
  });

  test('a staged change to an assume-unchanged file takes that kind alone', () => {
    const r = repoWithWorktree('');
    fs.writeFileSync(path.join(r.worktree, 'a.txt'), 'staged\n');
    git(r.worktree, 'add', 'a.txt');
    git(r.worktree, 'update-index', '--assume-unchanged', 'a.txt');
    expect(stateOf(sources(r.main))).toEqual([
      {
        kind: 'dirty',
        files: [{ path: 'a.txt', loss: 'assume-unchanged' }],
        omitted: { kind: 'exact', count: 0 },
      },
    ]);
  });

  test('a failed listing of flagged files gives held, unknown', () => {
    const r = repoWithWorktree('');
    const failing: Runner = (cmd, args, cwd, opts) =>
      args.includes('ls-files')
        ? { code: 128, stdout: '', stderr: 'fatal: broken' }
        : execRunner(cmd, args, cwd, opts);
    const rows = worktreeRows(sources(r.main), failing);
    expect(rows.map((row) => row.state)).toEqual([
      { kind: 'held', by: 'unknown: git ls-files failed: fatal: broken' },
    ]);
  });

  test('a clean worktree is removable', () => {
    const r = repoWithWorktree('');
    expect(stateOf(sources(r.main))).toEqual([{ kind: 'removable' }]);
  });

  test('rows undefined makes the clean worktree held, and none removable', () => {
    const r = repoWithWorktree('');
    const src = sources(r.main, { rows: undefined });
    const rows = worktreeRows(src, execRunner);
    expect(rows.map((row) => row.state)).toEqual([
      { kind: 'held', by: 'unknown: claude agents failed' },
    ]);
    expect(rows[0].commits).toBeUndefined();
    expect(leftBehind(src)).toEqual([]);
  });

  test('rows undefined makes a folder gone held too', () => {
    const r = repoWithWorktree('');
    fs.rmSync(r.worktree, { recursive: true, force: true });
    const src = sources(r.main, { rows: undefined });
    expect(stateOf(src)).toEqual([
      { kind: 'held', by: 'unknown: claude agents failed' },
    ]);
    expect(leftBehind(src)).toEqual([]);
  });

  test('a listing warning makes the clean worktree and a folder gone held, and none left behind', () => {
    const r = repoWithWorktree('');
    const gone = path.join(tmp(), 'gone');
    git(r.main, 'worktree', 'add', '-q', '-b', 'gone', gone);
    fs.rmSync(gone, { recursive: true, force: true });
    const warning = "the listing's entry 1 is not an object";
    const src = sources(r.main, { listingWarnings: [warning] });
    const held = {
      kind: 'held',
      by: `unknown: claude agents gave a partial listing: ${warning}`,
    };
    expect(statesByName(src)).toEqual({ side: held, gone: held });
    expect(leftBehind(src)).toEqual([]);
  });

  test('a current row with no cwd makes the clean worktree held, and none left behind', () => {
    const r = repoWithWorktree('');
    const row: ListingRow = {
      sessionId: 'abc123',
      kind: 'interactive',
      pid: 9,
    };
    const src = sources(r.main, { rows: [row] });
    expect(stateOf(src)).toEqual([
      { kind: 'held', by: 'unknown: a current session lists no cwd: abc123' },
    ]);
    expect(leftBehind(src)).toEqual([]);
  });

  test('an exited row with no cwd holds nothing', () => {
    const r = repoWithWorktree('');
    const row: ListingRow = { id: 'job1', kind: 'background', state: 'done' };
    const src = sources(r.main, { rows: [row] });
    expect(stateOf(src)).toEqual([{ kind: 'removable' }]);
    expect(leftBehind(src)).toHaveLength(1);
  });

  test('an unread record makes the clean worktree held, naming the record', () => {
    const r = repoWithWorktree('');
    const src = sources(r.main, { unreadRecords: [UNREAD] });
    const rows = worktreeRows(src, execRunner);
    expect(rows.map((row) => row.state)).toEqual([
      {
        kind: 'held',
        by: `unknown: a worker record would not read: ${UNREAD}`,
      },
    ]);
    expect(rows[0].commits).toBeUndefined();
    expect(leftBehind(src)).toEqual([]);
  });

  test('an unread record makes a folder gone held too', () => {
    const r = repoWithWorktree('');
    fs.rmSync(r.worktree, { recursive: true, force: true });
    const src = sources(r.main, { unreadRecords: [UNREAD] });
    expect(stateOf(src)).toEqual([
      {
        kind: 'held',
        by: `unknown: a worker record would not read: ${UNREAD}`,
      },
    ]);
  });

  test("an unread record leaves a live lock's hold and a worker's row as they were", () => {
    const r = repoWithWorktree('');
    git(r.main, 'worktree', 'lock', '--reason', SESSION_LOCK, r.worktree);
    const native = nativeFolder(r.main, 'w1');
    fs.mkdirSync(path.dirname(native), { recursive: true });
    git(r.main, 'worktree', 'add', '-q', '-b', 'worktree-w1', native);
    const src = sources(r.main, {
      records: [recordNamed('w1')],
      unreadRecords: [UNREAD],
    });
    expect(statesByName(src)).toEqual({
      side: { kind: 'held', by: 'pid 4242' },
      w1: { kind: 'worker', name: 'w1' },
    });
  });
});

// Paths that do not exist, since Bun's realpath gives an existing path the
// case on disk, which Node's does not.
describe('sessionInside', () => {
  const folder = '/no-such-sk-root/Repo/.claude/worktrees/W1';
  const lower = '/no-such-sk-root/repo/.claude/worktrees/w1';

  test('on darwin, letter case aside, which errs toward held', () => {
    expect(sessionInside(`${lower}/sub`, folder, 'darwin')).toBe(true);
    expect(sessionInside(lower, folder, 'darwin')).toBe(true);
    expect(sessionInside(`${lower}0`, folder, 'darwin')).toBe(false);
  });

  test('elsewhere, letter case counts', () => {
    expect(sessionInside(`${lower}/sub`, folder, 'linux')).toBe(false);
    expect(sessionInside(`${folder}/sub`, folder, 'linux')).toBe(true);
  });
});

describe('worktreeRows: letter case on darwin', () => {
  test.if(process.platform === 'darwin')(
    'a current row whose cwd names the worktree in other letters holds it',
    () => {
      const r = repoWithWorktree('');
      fs.rmSync(r.worktree, { recursive: true, force: true });
      const row: ListingRow = {
        sessionId: 'abc123',
        kind: 'interactive',
        pid: 99,
        cwd: path.join(path.dirname(r.worktree), 'SIDE', 'sub'),
      };
      const src = sources(r.main, { rows: [row] });
      expect(stateOf(src)).toEqual([{ kind: 'held', by: 'session abc123' }]);
      expect(leftBehind(src)).toEqual([]);
    },
  );
});

describe('worktreeRows: commits', () => {
  test('a removable row carries where its commits live', () => {
    const r = repoWithWorktree('');
    const rows = worktreeRows(sources(r.main), execRunner);
    expect(rows[0].state).toEqual({ kind: 'removable' });
    expect(rows[0].commits).toEqual({
      kind: 'landed',
      in: git(r.main, 'branch', '--show-current'),
    });
  });
});

function commitFile(dir: string, file: string): string {
  fs.writeFileSync(path.join(dir, file), `${file}\n`);
  git(dir, 'add', file);
  git(dir, 'commit', '-q', '-m', file);
  return git(dir, 'rev-parse', 'HEAD');
}

function commitsFor(main: string, head: string) {
  const { repo } = findRepo(execRunner, main);
  if (repo === undefined) throw new Error('no repo');
  return commitsAt(execRunner, repo, head);
}

describe('commitsAt', () => {
  test('landed by fast-forward into the main checkout branch', () => {
    const r = repoWithWorktree('');
    const head = commitFile(r.worktree, 'b.txt');
    git(r.main, 'merge', '-q', '--ff-only', 'side');
    const branch = git(r.main, 'branch', '--show-current');
    expect(commitsFor(r.main, head)).toEqual({ kind: 'landed', in: branch });
  });

  // These tests write remote-tracking refs directly.
  test('landed by squash into origin/<default>', () => {
    const r = repoWithWorktree('');
    const branch = git(r.main, 'branch', '--show-current');
    const head = commitFile(r.worktree, 'b.txt');
    git(r.main, 'checkout', '-q', '-b', 'squash');
    git(r.main, 'merge', '-q', '--squash', 'side');
    git(r.main, 'commit', '-q', '-m', 'squashed');
    const squashed = git(r.main, 'rev-parse', 'HEAD');
    git(r.main, 'checkout', '-q', branch);
    git(r.main, 'branch', '-q', '-D', 'squash');
    git(r.main, 'update-ref', `refs/remotes/origin/${branch}`, squashed);
    git(
      r.main,
      'symbolic-ref',
      'refs/remotes/origin/HEAD',
      `refs/remotes/origin/${branch}`,
    );
    expect(commitsFor(r.main, head)).toEqual({
      kind: 'landed',
      in: `origin/${branch}`,
    });
  });

  test('pushed under another name', () => {
    const r = repoWithWorktree('');
    const head = commitFile(r.worktree, 'b.txt');
    git(r.main, 'update-ref', 'refs/remotes/origin/feature-x', head);
    expect(commitsFor(r.main, head)).toEqual({
      kind: 'pushed',
      on: 'origin/feature-x',
    });
  });

  test('only here counts the commits no ref holds', () => {
    const r = repoWithWorktree('');
    commitFile(r.worktree, 'b.txt');
    const head = commitFile(r.worktree, 'c.txt');
    expect(commitsFor(r.main, head)).toEqual({ kind: 'only here', count: 2 });
  });

  test('unknown when no target could be checked and nothing is pushed', () => {
    const r = repoWithWorktree('');
    const head = commitFile(r.worktree, 'b.txt');
    git(r.main, 'checkout', '-q', '--detach');
    expect(commitsFor(r.main, head).kind).toBe('unknown');
  });
});

describe('mainCheckoutUse', () => {
  test('no rows: free', () => {
    const r = repoWithWorktree('');
    expect(mainCheckoutUse(sources(r.main))).toEqual({ kind: 'free' });
  });

  test('current rows at the top and in a subfolder: in use, naming both', () => {
    const r = repoWithWorktree('');
    fs.mkdirSync(path.join(r.main, 'sub'));
    const rows: ListingRow[] = [
      { sessionId: 'aaa', pid: 1, cwd: r.main },
      { sessionId: 'bbb', pid: 2, cwd: path.join(r.main, 'sub') },
    ];
    expect(mainCheckoutUse(sources(r.main, { rows }))).toEqual({
      kind: 'in use',
      by: ['session aaa', 'session bbb'],
    });
  });

  test('a current row in a linked worktree under the main checkout: free', () => {
    const r = repoWithWorktree('');
    const dir = path.join(r.main, '.claude', 'worktrees', 'inner');
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    git(r.main, 'worktree', 'add', '-q', '-b', 'worktree-inner', dir);
    const rows: ListingRow[] = [{ sessionId: 'aaa', pid: 1, cwd: dir }];
    expect(mainCheckoutUse(sources(r.main, { rows }))).toEqual({
      kind: 'free',
    });
  });

  test('an exited background row at the main checkout: free', () => {
    const r = repoWithWorktree('');
    const rows: ListingRow[] = [
      { sessionId: 'aaa', kind: 'background', state: 'done', cwd: r.main },
    ];
    expect(mainCheckoutUse(sources(r.main, { rows }))).toEqual({
      kind: 'free',
    });
  });

  test('a failed listing: unknown', () => {
    const r = repoWithWorktree('');
    expect(mainCheckoutUse(sources(r.main, { rows: undefined }))).toEqual({
      kind: 'unknown',
      why: 'claude agents failed',
    });
  });

  test('a listing warning: unknown', () => {
    const r = repoWithWorktree('');
    const use = mainCheckoutUse(sources(r.main, { listingWarnings: ['odd'] }));
    expect(use).toEqual({
      kind: 'unknown',
      why: 'claude agents gave a partial listing: odd',
    });
  });

  test('a current row with no cwd: unknown', () => {
    const r = repoWithWorktree('');
    const rows: ListingRow[] = [{ sessionId: 'aaa', pid: 1 }];
    expect(mainCheckoutUse(sources(r.main, { rows }))).toEqual({
      kind: 'unknown',
      why: 'a current session lists no cwd: aaa',
    });
  });

  test('an unreadable worker record does not make it unknown', () => {
    const r = repoWithWorktree('');
    const src = sources(r.main, { unreadRecords: [UNREAD] });
    expect(mainCheckoutUse(src)).toEqual({ kind: 'free' });
  });
});
