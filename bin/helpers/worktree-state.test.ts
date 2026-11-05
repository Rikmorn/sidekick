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
import { execRunner } from './pm-data.js';
import type { WorkerRecord } from './worker-record.js';
import { nativeFolder } from './worker-worktree.js';
import {
  type CheapSources,
  commitsAt,
  leftBehind,
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

  test('a deleted folder gives folder gone', () => {
    const r = repoWithWorktree('');
    fs.rmSync(r.worktree, { recursive: true, force: true });
    expect(stateOf(sources(r.main))).toEqual([{ kind: 'folder gone' }]);
  });

  test('a new ignored file gives dirty', () => {
    const r = repoWithWorktree('*.sh\n');
    fs.writeFileSync(path.join(r.worktree, 'scratch.sh'), 'echo\n');
    expect(stateOf(sources(r.main))).toEqual([
      {
        kind: 'dirty',
        paths: ['scratch.sh'],
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
        paths: ['new.txt'],
        omitted: { kind: 'exact', count: 0 },
      },
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

  // The environment may block pushes, so tests write the remote-tracking refs git would.
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
