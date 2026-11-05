/**
 * The checks of `sidekick worktree remove`, which change nothing: its
 * arguments, the one worktree they name, the states that keep it, and the
 * branch's plan with its backup ref. `recheck` reads them again once that ref
 * is written. `worktree-remove.ts` runs them, then the deletions.
 */

import * as path from 'node:path';
import type { Repo } from './desk-children.js';
import type { ListingRow } from './desk-snapshot.js';
import { listWorktrees, type WorktreeEntry } from './worker-listing.js';
import { commitOf, HEADS, physical } from './worker-repo.js';
import { type BackupKind, backupRef } from './worker-teardown.js';
import { nativeBranch } from './worker-worktree.js';
import { skipListPath } from './worktree-ignored.js';
import { lockStateOf } from './worktree-lock.js';
import {
  heldWords,
  type Out,
  omittedWords,
  readSources,
  type WorktreeEnv,
} from './worktree-read.js';
import {
  type CommitsAt,
  commitsAt,
  insideOf,
  stateOf,
  type WorktreeRow,
  type WorktreeState,
  worktreeRows,
} from './worktree-state.js';

const DISCARD = '--discard';

export interface RemoveArgs {
  /** The worktree's name, its path's last segment, or its path. */
  target: string;
  discard: boolean;
}

/** The arguments `remove` takes, or undefined when they fit no usage. */
export function parseRemoveArgs(rest: string[]): RemoveArgs | undefined {
  const flags = rest.filter((arg) => arg.startsWith('-'));
  const targets = rest.filter((arg) => !arg.startsWith('-'));
  const fits = targets.length === 1 && flags.every((flag) => flag === DISCARD);
  if (!fits) return undefined;
  return { target: targets[0], discard: flags.includes(DISCARD) };
}

type Refused = { refused: string[] };

const refuse = (...lines: string[]): Refused => ({ refused: lines });

// What remove does with the branch: deletes the one made for this worktree,
// keeps any other, or has none for a detached HEAD. Each writes its backup ref
// first, since claude rm or a hand may yet delete a kept branch.
type BranchPlan =
  | { kind: 'delete'; branch: string; ref: string }
  | { kind: 'keep'; branch: string; ref: string }
  | { kind: 'detached'; ref: string };

/** What the checks settled: the entry, its verified head, and the branch's plan. */
export interface Checked {
  entry: WorktreeEntry;
  name: string;
  head: string;
  plan: BranchPlan;
}

export const samePath = (a: string, b: string): boolean =>
  physical(a) === physical(b);

// One row alone, since worktreeRows runs the landed check, seconds each, per linked entry.
const alone = (repo: Repo, entry: WorktreeEntry): Repo => ({
  ...repo,
  worktrees: [repo.worktrees[0], entry],
});

// The one entry the argument names, by its last segment or its path.
function resolveTarget(
  repo: Repo,
  cwd: string,
  target: string,
): WorktreeEntry | Refused {
  const asPath = path.resolve(cwd, target);
  const matches = repo.worktrees.filter(
    (entry) =>
      path.basename(entry.path) === target || samePath(entry.path, asPath),
  );
  if (matches.length === 0) {
    return refuse(
      `no worktree is named ${target} or sits at ${asPath}: sidekick worktree list names each one`,
    );
  }
  if (matches.length > 1) {
    const paths = matches.map((entry) => entry.path).join(', ');
    return refuse(
      `${matches.length} worktrees match ${target}: ${paths}. Name one by its path`,
    );
  }
  const [entry] = matches;
  if (entry === repo.worktrees[0]) {
    return refuse(
      `${entry.path} is the main checkout, which remove never takes`,
    );
  }
  if (insideOf(cwd, entry.path)) {
    return refuse(
      `remove runs inside ${entry.path}, so it cannot take that worktree. Leave it first: in a Claude Code session, ExitWorktree with keep; in a shell, cd out. Then run remove from the main checkout`,
    );
  }
  return entry;
}

// Removing a folder deletes every worktree under it.
function nestedLines(repo: Repo, entry: WorktreeEntry): string[] {
  const nested = repo.worktrees.filter(
    (other) => other !== entry && insideOf(other.path, entry.path),
  );
  if (nested.length === 0) return [];
  const paths = nested.map((other) => other.path).join(', ');
  return [
    `${entry.path} holds other worktrees, which its removal would delete: ${paths}. Remove those first`,
  ];
}

const TOOK_NOTHING = 'so remove took nothing';
/** After claude rm, which may have removed a session, the worktree is what stays. */
export const KEPT_WORKTREE = 'so remove kept the worktree';

/**
 * The states that keep a worktree, at the checks and at each re-check; none
 * for the rest. `stopped` says what remove left as it stopped.
 */
export function stateLines(
  state: WorktreeState,
  entry: WorktreeEntry,
  skipList: string,
  stopped = TOOK_NOTHING,
): string[] {
  switch (state.kind) {
    case 'held':
      return [`${entry.path} is ${heldWords(state.by)}, ${stopped}`];
    case 'worker':
      return [
        `${entry.path} is the worker ${state.name}'s: clear it with sidekick worker finish, which removes its session too`,
      ];
    case 'dirty':
      return [
        `${entry.path} holds files its removal would lose: ${state.paths.join(', ')}${omittedWords(state.omitted)}`,
        `commit, move, or delete them, then run remove again. An ignored file goes with the worktree once its folder is listed in ${skipList}`,
      ];
    case 'folder gone':
    case 'removable':
      return [];
    default: {
      const _exhaustive: never = state;
      throw new Error(`Unhandled state: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

const commitCount = (count: number): string =>
  `${count} ${count === 1 ? 'commit' : 'commits'}`;

const DISCARD_WAY = `run remove again with ${DISCARD} to remove it anyway, keeping them in a backup ref only`;

// The backup ref's kind. Commits held nowhere else are kept by a branch that
// stays; where the branch goes or the HEAD is detached, they need --discard.
function backupKind(
  commits: CommitsAt,
  branch: { stays: boolean; where: string },
  discard: boolean,
): BackupKind | Refused {
  const { stays, where } = branch;
  switch (commits.kind) {
    case 'landed':
      return 'landed';
    case 'pushed':
      return 'pushed';
    case 'only here':
      if (stays) return 'kept';
      if (discard) return 'discarded';
      return refuse(
        `${where} has ${commitCount(commits.count)} found in no landed branch and no remote-tracking ref, as of the last fetch, so remove took nothing`,
        DISCARD_WAY,
      );
    case 'unknown':
      if (stays) return 'kept';
      if (discard) return 'discarded';
      return refuse(
        `remove cannot tell where the commits of ${where} live, as ${commits.why}, so it took nothing`,
        DISCARD_WAY,
      );
    default: {
      const _exhaustive: never = commits;
      throw new Error(`Unhandled commits: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// The verified head and the branch's plan. Only Claude Code's own branch for
// this folder is deleted. Every plan writes a backup ref, and only one that
// loses commits held nowhere else, the branch deleted or the HEAD detached,
// needs --discard.
function branchPlan(
  env: WorktreeEnv,
  repo: Repo,
  row: WorktreeRow,
  discard: boolean,
): Checked | Refused {
  const { entry, name } = row;
  const head =
    entry.head === undefined
      ? undefined
      : commitOf(env.runGit, repo.top, entry.head);
  if (head === undefined) {
    return refuse(
      `git lists no commit for ${entry.path}, so remove cannot keep a backup ref, and took nothing`,
    );
  }
  const branch = entry.branch?.replace(HEADS, '');
  const stays = branch !== undefined && branch !== nativeBranch(name);
  const where = branch ?? `the detached HEAD at ${entry.path}`;
  const commits = row.commits ?? commitsAt(env.runGit, repo, head);
  const kind = backupKind(commits, { stays, where }, discard);
  if (typeof kind !== 'string') return kind;
  const ref = backupRef(kind, name, head);
  return { entry, name, head, plan: planOf(branch, stays, ref) };
}

function planOf(
  branch: string | undefined,
  stays: boolean,
  ref: string,
): BranchPlan {
  if (branch === undefined) return { kind: 'detached', ref };
  return stays
    ? { kind: 'keep', branch, ref }
    : { kind: 'delete', branch, ref };
}

/**
 * The checks before the backup ref, which change nothing. A failed listing
 * refuses with its reason; a record that would not read holds the worktree in
 * the shared state, which names the record.
 */
export function checkTarget(
  args: RemoveArgs,
  env: WorktreeEnv,
  repo: Repo,
  out: Out,
): Checked | Refused {
  const entry = resolveTarget(repo, env.cwd, args.target);
  if ('refused' in entry) return entry;
  const nested = nestedLines(repo, entry);
  if (nested.length > 0) return refuse(...nested);
  const { src, listing, skipWarnings } = readSources(env, alone(repo, entry));
  if ('error' in listing) {
    return refuse(
      `claude agents failed, so remove cannot tell whether a session is in ${entry.path}, and took nothing: ${listing.error}`,
    );
  }
  for (const warning of [...listing.warnings, ...skipWarnings]) {
    out(warning);
  }
  const [row] = worktreeRows(src, env.runGit);
  const kept = stateLines(row.state, entry, skipListPath(repo.commonDir));
  if (kept.length > 0) return refuse(...kept);
  return branchPlan(env, repo, row, args.discard);
}

/**
 * A commit made since the checks is in no backup ref, and a detached one would
 * go with the worktree.
 */
export function movedLines(
  entry: WorktreeEntry,
  head: string,
  stopped: string,
): string[] {
  if (entry.head === head) return [];
  return [
    `the HEAD of ${entry.path} moved from ${head} to ${entry.head ?? 'no commit'} since the checks, ${stopped}: run remove again`,
  ];
}

/** The session rows, records, lock, HEAD, and files, read again once the backup ref is written. */
export function recheck(
  env: WorktreeEnv,
  repo: Repo,
  checked: Checked,
): ListingRow[] | Refused {
  const { src, listing } = readSources(env, repo);
  if ('error' in listing) {
    return refuse(
      `claude agents failed on the second look, so remove deleted nothing: ${listing.error}`,
    );
  }
  const now = listWorktrees(env.runGit, repo.top);
  if ('issue' in now) {
    return refuse(
      `git worktree list failed, so remove deleted nothing: ${now.issue}`,
    );
  }
  const entry = now.worktrees.find((e) => samePath(e.path, checked.entry.path));
  if (entry === undefined) {
    return refuse(
      `git no longer lists ${checked.entry.path}, so remove deleted nothing`,
    );
  }
  const moved = movedLines(entry, checked.head, 'so remove deleted nothing');
  if (moved.length > 0) return refuse(...moved);
  const lock = lockStateOf(entry.locked, env.isAlive);
  const one = { ...src, repo: alone(repo, entry) };
  const state = stateOf(one, env.runGit, entry, lock);
  const kept = stateLines(state, entry, skipListPath(repo.commonDir));
  if (kept.length > 0) return refuse(...kept);
  return listing.rows;
}
