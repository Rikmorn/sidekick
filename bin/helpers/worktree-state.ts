/**
 * What a linked worktree is: held by a session, a worker's, gone from disk,
 * dirty, or removable, and where its commits live. `worktree list` and
 * `worktree remove` read it here, so they agree. The desk's count reads the
 * cheap checks alone, and `finish` reads the files check for a leftover.
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
import { nativeBranch, nativeFolder, shortBranch } from './worker-worktree.js';
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

/** The states a worktree's folder gives on its own; `worker` comes from the records. */
export type FilesState = Exclude<WorktreeState, { kind: 'worker' }>;

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
  /** One warning per listing entry that would not parse; empty when every entry parsed. */
  listingWarnings: string[];
  records: WorkerRecord[];
  /** One warning per worker record that would not read; empty when every record read. */
  unreadRecords: string[];
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

const under = (at: string, root: string): boolean =>
  at === root || at.startsWith(`${root}${path.sep}`);

/** Whether `cwd` is `folder` or under it, compared physically. */
export const insideOf = (cwd: string, folder: string): boolean =>
  under(physical(cwd), physical(folder));

/**
 * Whether a session's `cwd` is `folder` or under it, compared physically, and
 * on darwin with letter case aside: its default file system ignores case, and
 * Node's realpath keeps the case it is given. The fold errs toward held.
 */
export function sessionInside(
  cwd: string,
  folder: string,
  platform: typeof process.platform = process.platform,
): boolean {
  if (platform !== 'darwin') return insideOf(cwd, folder);
  return under(physical(cwd).toLowerCase(), physical(folder).toLowerCase());
}

function lockHold(lock: LockState): string | undefined {
  if (lock.kind === 'live') return `pid ${lock.pid}`;
  if (lock.kind === 'other') return `lock: ${lock.reason}`;
  return undefined;
}

const rowName = (row: ListingRow): string =>
  row.sessionId ?? row.id ?? row.name ?? 'unknown';

function sessionHold(
  rows: ListingRow[],
  entry: WorktreeEntry,
): string | undefined {
  const row = rows.find(
    (candidate) =>
      isCurrent(candidate) &&
      candidate.cwd !== undefined &&
      sessionInside(candidate.cwd, entry.path),
  );
  if (row === undefined) return undefined;
  return `session ${rowName(row)}`;
}

// A listing read in part is read as failed: the entry that would not parse, or
// a current row with no cwd, may be a session in any worktree.
function partialListing(
  rows: ListingRow[],
  warnings: string[],
): string | undefined {
  if (warnings.length > 0) {
    return `claude agents gave a partial listing: ${warnings.join('; ')}`;
  }
  const placeless = rows.filter(
    (row) => isCurrent(row) && row.cwd === undefined,
  );
  if (placeless.length === 0) return undefined;
  return `a current session lists no cwd: ${placeless.map(rowName).join(', ')}`;
}

// Without every session row, or with a record unread, nothing says a worktree
// is free: an unseen session may sit in it, or the record may be its worker's.
function unseenHold(src: CheapSources): string | undefined {
  if (src.rows === undefined) return UNSEEN_SESSIONS;
  const partial = partialListing(src.rows, src.listingWarnings);
  if (partial !== undefined) return `unknown: ${partial}`;
  if (src.unreadRecords.length === 0) return undefined;
  return `unknown: a worker record would not read: ${src.unreadRecords.join('; ')}`;
}

// The worker `name`'s worktree by Claude Code's folder for it, by the folder's
// name, or by the branch, Claude Code's or the worker's name. Each match errs
// toward refusing and naming finish.
function isWorkers(top: string, name: string, entry: WorktreeEntry): boolean {
  const branch =
    entry.branch === undefined ? undefined : shortBranch(entry.branch);
  return (
    physical(nativeFolder(top, name)) === physical(entry.path) ||
    path.basename(entry.path) === name ||
    branch === nativeBranch(name) ||
    branch === name
  );
}

/**
 * The state the checks that need no git give: held by a lock or a session, a
 * worker's, or held when the session rows, any of them, or a worker record
 * would not read; else undefined.
 */
export function cheapState(
  src: CheapSources,
  entry: WorktreeEntry,
  lock: LockState,
): WorktreeState | undefined {
  const by =
    lockHold(lock) ??
    (src.rows === undefined ? undefined : sessionHold(src.rows, entry));
  if (by !== undefined) return { kind: 'held', by };
  const record = src.records.find((candidate) =>
    isWorkers(src.repo.top, candidate.name, entry),
  );
  if (record !== undefined) return { kind: 'worker', name: record.name };
  const unseen = unseenHold(src);
  return unseen === undefined ? undefined : { kind: 'held', by: unseen };
}

const linked = (repo: Repo): WorktreeEntry[] => repo.worktrees.slice(1);

/**
 * The linked worktrees neither held nor a worker's, from the cheap checks
 * alone. With the session rows unread or read in part, or a worker record
 * unread, nothing is known to be free, so it names none.
 */
export function leftBehind(src: CheapSources): WorktreeEntry[] {
  return linked(src.repo).filter(
    (entry) =>
      cheapState(src, entry, lockStateOf(entry.locked, src.isAlive)) ===
      undefined,
  );
}

/** Where a worktree's files are read: the main checkout's top, the worktree, and the common git dir. */
export interface FilesAt {
  mainTop: string;
  worktree: string;
  commonDir: string;
}

function dirtyState(runGit: Runner, at: FilesAt): FilesState {
  const status = statusEntriesIn(runGit, at.mainTop, at.worktree);
  if ('issue' in status) {
    return { kind: 'held', by: `unknown: git status failed: ${status.issue}` };
  }
  const ignored = ignoredLosses(runGit, at, { cap: DIRTY_CAP });
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

/**
 * What a worktree's folder holds, by git status and the ignored-file check:
 * gone when the folder is missing, dirty, or removable; held when git cannot
 * tell. git marks prunable a folder that lost its `.git` entry too, and git
 * run there reads whatever repository encloses it, so that folder is held.
 */
export function filesState(runGit: Runner, at: FilesAt): FilesState {
  if (!fs.existsSync(at.worktree)) return { kind: 'folder gone' };
  if (!fs.existsSync(path.join(at.worktree, '.git'))) {
    return {
      kind: 'held',
      by: `unknown: ${at.worktree} holds no .git entry, so git cannot read its files`,
    };
  }
  return dirtyState(runGit, at);
}

/** `filesState` for a listed entry of `repo`. */
export const diskState = (
  runGit: Runner,
  repo: Repo,
  entry: WorktreeEntry,
): FilesState =>
  filesState(runGit, {
    mainTop: repo.top,
    worktree: entry.path,
    commonDir: repo.commonDir,
  });

/** One worktree's state, as `list` shows it, without the landed check. */
export function stateOf(
  src: CheapSources,
  runGit: Runner,
  entry: WorktreeEntry,
  lock: LockState,
): WorktreeState {
  return cheapState(src, entry, lock) ?? diskState(runGit, src.repo, entry);
}

/** Every linked worktree's row; runs status, the ignored check, and the landed check. */
export function worktreeRows(src: CheapSources, runGit: Runner): WorktreeRow[] {
  return linked(src.repo).map((entry) => {
    const lock = lockStateOf(entry.locked, src.isAlive);
    const state = stateOf(src, runGit, entry, lock);
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
