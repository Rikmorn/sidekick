/**
 * What a linked worktree is: held by a session, a worker's, gone from disk,
 * dirty, or removable, and where its commits live. `finish`, `worktree list`,
 * `worktree remove`, and the desk's count read it here, so they agree.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Repo } from './desk-children.js';
import { isCurrent, type ListingRow } from './desk-snapshot.js';
import { defaultBranchOf } from './memory-start.js';
import type { Runner } from './pm-data.js';
import { landedIn } from './worker-landed.js';
import { statusEntriesIn, type WorktreeEntry } from './worker-listing.js';
import type { WorkerRecord } from './worker-record.js';
import { commitOf, HEADS, physical } from './worker-repo.js';
import { nativeFolder } from './worker-worktree.js';
import { ignoredLosses } from './worktree-ignored.js';
import { type LockState, lockStateOf } from './worktree-lock.js';

/**
 * How many dirty paths a state leaves out of `paths`. `exact` when every source
 * was read in full; `at least` when the ignored-file scan stopped at its cap,
 * since it never walks further to count.
 */
export type Omitted =
  | { kind: 'exact'; count: number }
  | { kind: 'at least'; count: number };

export type WorktreeState =
  /** `by` reads `pid 4242`, `session <id>`, or `lock: <reason>`. */
  | { kind: 'held'; by: string }
  | { kind: 'worker'; name: string }
  | { kind: 'folder gone' }
  | { kind: 'dirty'; paths: string[]; omitted: Omitted }
  | { kind: 'removable' };

export type CommitsAt =
  /** `in` is the target ref's short name. */
  | { kind: 'landed'; in: string }
  /** `on` is a remote-tracking ref's short name. */
  | { kind: 'pushed'; on: string }
  | { kind: 'only here'; count: number }
  | { kind: 'unknown'; why: string };

/** What the cheap checks read: no git beyond the listing `findRepo` already ran. */
export interface CheapSources {
  repo: Repo;
  /** Undefined when `claude agents` failed. */
  rows: ListingRow[] | undefined;
  records: WorkerRecord[];
  isAlive: (pid: number) => boolean;
}

export interface WorktreeRow {
  entry: WorktreeEntry;
  /** The path's last segment. */
  name: string;
  lock: LockState;
  state: WorktreeState;
  /** Absent for held and worker rows, since the landed check costs seconds. */
  commits?: CommitsAt;
}

/** How many dirty paths a state names before it counts the rest. */
const DIRTY_CAP = 20;
const REMOTES = 'refs/remotes/';
const UNSEEN_SESSIONS = 'unknown: claude agents failed';

const insideOf = (cwd: string, folder: string): boolean => {
  const at = physical(cwd);
  const root = physical(folder);
  return at === root || at.startsWith(`${root}${path.sep}`);
};

function lockHold(lock: LockState): string | undefined {
  if (lock.kind === 'live') return `pid ${lock.pid}`;
  if (lock.kind === 'other') return `lock: ${lock.reason}`;
  return undefined;
}

function sessionHold(
  rows: ListingRow[],
  entry: WorktreeEntry,
): string | undefined {
  const row = rows.find(
    (candidate) =>
      isCurrent(candidate) &&
      candidate.cwd !== undefined &&
      insideOf(candidate.cwd, entry.path),
  );
  if (row === undefined) return undefined;
  return `session ${row.sessionId ?? row.id ?? row.name ?? 'unknown'}`;
}

// The checks that need no git: a lock, a session in the folder, a worker's record.
function cheapState(
  src: CheapSources,
  entry: WorktreeEntry,
  lock: LockState,
): WorktreeState | undefined {
  const by =
    lockHold(lock) ??
    (src.rows === undefined ? undefined : sessionHold(src.rows, entry));
  if (by !== undefined) return { kind: 'held', by };
  const wanted = physical(entry.path);
  const record = src.records.find(
    (candidate) =>
      physical(nativeFolder(src.repo.top, candidate.name)) === wanted,
  );
  return record === undefined
    ? undefined
    : { kind: 'worker', name: record.name };
}

const linked = (repo: Repo): WorktreeEntry[] => repo.worktrees.slice(1);

/**
 * The linked worktrees neither held nor a worker's, from the cheap checks
 * alone. With no session rows nothing is known to be free, so it names none.
 */
export function leftBehind(src: CheapSources): WorktreeEntry[] {
  if (src.rows === undefined) return [];
  return linked(src.repo).filter(
    (entry) =>
      cheapState(src, entry, lockStateOf(entry.locked, src.isAlive)) ===
      undefined,
  );
}

function dirtyState(
  runGit: Runner,
  repo: Repo,
  entry: WorktreeEntry,
): WorktreeState {
  const status = statusEntriesIn(runGit, repo.top, entry.path);
  if ('issue' in status) {
    return { kind: 'held', by: `unknown: git status failed: ${status.issue}` };
  }
  const ignored = ignoredLosses(
    runGit,
    { mainTop: repo.top, worktree: entry.path, commonDir: repo.commonDir },
    { cap: DIRTY_CAP },
  );
  if ('issue' in ignored) {
    return { kind: 'held', by: `unknown: ${ignored.issue}` };
  }
  const all = [...status.entries.map((e) => e.path), ...ignored.paths];
  if (all.length === 0) return { kind: 'removable' };
  // A truncated scan found one path past its cap and dropped it from `paths`.
  const known = all.length + (ignored.truncated ? 1 : 0);
  const count = Math.max(0, known - DIRTY_CAP);
  return {
    kind: 'dirty',
    paths: all.slice(0, DIRTY_CAP),
    omitted: { kind: ignored.truncated ? 'at least' : 'exact', count },
  };
}

function gitState(
  src: CheapSources,
  runGit: Runner,
  entry: WorktreeEntry,
): WorktreeState {
  if (entry.prunable !== undefined || !fs.existsSync(entry.path)) {
    return { kind: 'folder gone' };
  }
  const state = dirtyState(runGit, src.repo, entry);
  if (state.kind === 'removable' && src.rows === undefined) {
    return { kind: 'held', by: UNSEEN_SESSIONS };
  }
  return state;
}

/** Every linked worktree's row; runs status, the ignored check, and the landed check. */
export function worktreeRows(src: CheapSources, runGit: Runner): WorktreeRow[] {
  return linked(src.repo).map((entry) => {
    const lock = lockStateOf(entry.locked, src.isAlive);
    const state = cheapState(src, entry, lock) ?? gitState(src, runGit, entry);
    const base = { entry, name: path.basename(entry.path), lock, state };
    if (state.kind === 'held' || state.kind === 'worker') return base;
    return { ...base, commits: commitsAt(runGit, src.repo, entry.head ?? '') };
  });
}

type Target = { name: string; sha: string };

// A target ref resolved to the full sha `landedIn` needs; skipped when it names no commit.
function resolveTarget(
  runGit: Runner,
  repo: Repo,
  ref: string,
  name: string,
): Target[] {
  const sha = commitOf(runGit, repo.top, ref);
  return sha === undefined ? [] : [{ name, sha }];
}

// The branch the main checkout holds, then origin's default branch.
function targetsOf(runGit: Runner, repo: Repo): Target[] {
  const branch = repo.worktrees[0].branch;
  const held =
    branch === undefined
      ? []
      : resolveTarget(runGit, repo, branch, branch.replace(HEADS, ''));
  const base = defaultBranchOf(runGit, repo.top);
  const remote =
    base === undefined
      ? []
      : resolveTarget(
          runGit,
          repo,
          `${REMOTES}origin/${base}`,
          `origin/${base}`,
        );
  const distinct = remote.filter((r) => held.every((h) => h.sha !== r.sha));
  return [...held, ...distinct];
}

// The first remote-tracking ref holding `head`, not a remote's symbolic HEAD.
function pushedOn(
  runGit: Runner,
  top: string,
  head: string,
): string | undefined {
  const refs = runGit(
    'git',
    ['for-each-ref', '--contains', head, '--format=%(refname)', REMOTES],
    top,
  );
  if (refs.code !== 0) return undefined;
  return refs.stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '' && !line.endsWith('/HEAD'))
    ?.replace(REMOTES, '');
}

function countOnlyHere(
  runGit: Runner,
  top: string,
  head: string,
  targets: Target[],
): CommitsAt {
  const result = runGit(
    'git',
    [
      'rev-list',
      '--count',
      head,
      '--not',
      '--remotes',
      ...targets.map((t) => t.sha),
    ],
    top,
  );
  const count = Number(result.stdout.trim());
  if (result.code !== 0 || !Number.isSafeInteger(count)) {
    return {
      kind: 'unknown',
      why: `git rev-list failed: ${result.stderr.trim()}`,
    };
  }
  return { kind: 'only here', count };
}

/**
 * Where `head` lives: landed in the main checkout's branch or origin's default
 * branch, else pushed to a remote-tracking ref, else only here. A target the
 * landed check cannot judge is skipped; with none judged and nothing pushed the
 * answer is `unknown`.
 */
export function commitsAt(runGit: Runner, repo: Repo, head: string): CommitsAt {
  const sha = commitOf(runGit, repo.top, head);
  if (sha === undefined) {
    return { kind: 'unknown', why: `${head || 'HEAD'} names no commit` };
  }
  const targets = targetsOf(runGit, repo);
  const checked: Target[] = [];
  for (const target of targets) {
    const landing = landedIn(runGit, repo.top, {
      target: target.sha,
      head: sha,
    });
    if (landing.kind === 'landed') return { kind: 'landed', in: target.name };
    if (landing.kind === 'not landed') checked.push(target);
  }
  const pushed = pushedOn(runGit, repo.top, sha);
  if (pushed !== undefined) return { kind: 'pushed', on: pushed };
  if (checked.length === 0) {
    return { kind: 'unknown', why: 'no branch to check the commits against' };
  }
  return countOnlyHere(runGit, repo.top, sha, checked);
}
