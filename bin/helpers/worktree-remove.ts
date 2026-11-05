/**
 * `sidekick worktree remove <name|path> [--discard]`: removes one linked
 * worktree that no session holds and no worker owns. It keeps the commits in a
 * backup ref before it deletes anything, and never forces, so git itself
 * refuses a worktree with changes. Each refusal names what it found.
 */

import * as path from 'node:path';
import type { Repo } from './desk-children.js';
import { isCurrent, type ListingRow } from './desk-snapshot.js';
import { listWorktrees, type WorktreeEntry } from './worker-listing.js';
import { commitOf, HEADS, physical } from './worker-repo.js';
import {
  type BackupKind,
  backupRef,
  branchGoneIssues,
  NO_LIMIT,
  saidRemoved,
  withText,
  writeBackup,
} from './worker-teardown.js';
import { skipListPath } from './worktree-ignored.js';
import { lockStateOf, removeGitWorktree } from './worktree-lock.js';
import {
  heldWords,
  type Out,
  omittedWords,
  readSources,
  repoOf,
  type WorktreeEnv,
} from './worktree-read.js';
import {
  type CommitsAt,
  cheapState,
  commitsAt,
  insideOf,
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

// What the checks settled: the entry, its verified head, and the ref keeping it.
interface Checked {
  entry: WorktreeEntry;
  name: string;
  // A short name; undefined on a detached HEAD.
  branch: string | undefined;
  head: string;
  ref: string;
}

const samePath = (a: string, b: string): boolean => physical(a) === physical(b);

// One row alone, since worktreeRows runs the landed check, seconds each, per linked entry.
const alone = (repo: Repo, entry: WorktreeEntry): Repo => ({
  ...repo,
  worktrees: [repo.worktrees[0], entry],
});

// Step 1: the one entry the argument names, by its last segment or its path.
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

// Step 2: removing a folder deletes every worktree under it.
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

// Steps 3 and 6: the states that keep a worktree; none for the rest.
function stateLines(
  state: WorktreeState,
  entry: WorktreeEntry,
  skipList: string,
): string[] {
  switch (state.kind) {
    case 'held':
      return [
        `${entry.path} is ${heldWords(state.by)}, so remove took nothing`,
      ];
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

// Step 4: the backup ref's kind; commits held nowhere else need --discard.
function backupKind(
  commits: CommitsAt,
  discard: boolean,
  where: string,
): BackupKind | Refused {
  switch (commits.kind) {
    case 'landed':
      return 'landed';
    case 'pushed':
      return 'pushed';
    case 'only here':
      if (discard) return 'discarded';
      return refuse(
        `${where} has ${commitCount(commits.count)} found in no landed branch and no remote-tracking ref, as of the last fetch, so remove took nothing`,
        DISCARD_WAY,
      );
    case 'unknown':
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

// Steps 4 and 5's input: the verified head and the ref that will keep it.
function backupPlan(
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
  const where = branch ?? `the detached HEAD at ${entry.path}`;
  const commits = row.commits ?? commitsAt(env.runGit, repo, head);
  const kind = backupKind(commits, discard, where);
  if (typeof kind !== 'string') return kind;
  return { entry, name, branch, head, ref: backupRef(kind, name, head) };
}

// A record that would not read may be this worktree's worker, so it refuses,
// as a failed listing does.
function unreadRecordLines(warnings: string[], entry: WorktreeEntry): string[] {
  if (warnings.length === 0) return [];
  return [
    `a worker record would not read, so remove cannot tell whether ${entry.path} is a worker's, and took nothing:`,
    ...warnings,
  ];
}

// Steps 1 to 4, which change nothing.
function checkTarget(
  args: RemoveArgs,
  env: WorktreeEnv,
  repo: Repo,
  out: Out,
): Checked | Refused {
  const entry = resolveTarget(repo, env.cwd, args.target);
  if ('refused' in entry) return entry;
  const nested = nestedLines(repo, entry);
  if (nested.length > 0) return refuse(...nested);
  const sources = readSources(env, alone(repo, entry));
  const { src, listing } = sources;
  if ('error' in listing) {
    return refuse(
      `claude agents failed, so remove cannot tell whether a session is in ${entry.path}, and took nothing: ${listing.error}`,
    );
  }
  const unread = unreadRecordLines(sources.recordWarnings, entry);
  if (unread.length > 0) return refuse(...unread);
  for (const warning of [...listing.warnings, ...sources.skipWarnings]) {
    out(warning);
  }
  const [row] = worktreeRows(src, env.runGit);
  const kept = stateLines(row.state, entry, skipListPath(repo.commonDir));
  if (kept.length > 0) return refuse(...kept);
  return backupPlan(env, repo, row, args.discard);
}

// Step 6: the lock and the session rows, read again once the backup ref is written.
function recheck(
  env: WorktreeEnv,
  repo: Repo,
  checked: Checked,
): ListingRow[] | Refused {
  const { src, listing, recordWarnings } = readSources(env, repo);
  if ('error' in listing) {
    return refuse(
      `claude agents failed on the second look, so remove deleted nothing: ${listing.error}`,
    );
  }
  const unread = unreadRecordLines(recordWarnings, checked.entry);
  if (unread.length > 0) return refuse(...unread);
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
  const lock = lockStateOf(entry.locked, env.isAlive);
  const state = cheapState({ ...src, repo: alone(repo, entry) }, entry, lock);
  const skipList = skipListPath(repo.commonDir);
  const kept = state === undefined ? [] : stateLines(state, entry, skipList);
  if (kept.length > 0) return refuse(...kept);
  return listing.rows;
}

// Background sessions that have exited with their cwd in the worktree.
function exitedSessions(rows: ListingRow[], worktree: string): string[] {
  return rows.flatMap((row) => {
    const exited = row.kind === 'background' && !isCurrent(row);
    const inside = row.cwd !== undefined && insideOf(row.cwd, worktree);
    return exited && inside && row.id !== undefined ? [row.id] : [];
  });
}

// claude rm runs with no limit, since any limit can cut its delete short. An
// answer other than removed is a note: git's removal follows, and refuses changes.
function removeSessions(
  env: WorktreeEnv,
  top: string,
  ids: string[],
  out: Out,
): void {
  for (const id of ids) {
    const result = env.runClaude(['rm', id], { cwd: top, timeoutMs: NO_LIMIT });
    const lines = saidRemoved(result)
      ? [`session ${id} removed`]
      : withText(
          `claude rm ${id} did not say removed, so remove goes on with git's own removal`,
          result,
        );
    for (const line of lines) out(line);
  }
}

// Step 7's git half, with the lock read once more: claude rm may have taken the worktree.
function removeListed(
  env: WorktreeEnv,
  top: string,
  worktree: string,
): string[] {
  const now = listWorktrees(env.runGit, top);
  if ('issue' in now) return [`git worktree list failed: ${now.issue}`];
  const entry = now.worktrees.find((e) => samePath(e.path, worktree));
  if (entry === undefined) return [];
  const lock = lockStateOf(entry.locked, env.isAlive);
  const issues = removeGitWorktree(env.runGit, top, entry.path, lock);
  if (issues.length === 0) return [];
  return [...issues, 'fix what git names, then run remove again'];
}

// Steps 6 to 8, run once the backup ref holds the head.
function removeChecked(
  env: WorktreeEnv,
  repo: Repo,
  checked: Checked,
  out: Out,
): string[] {
  const rows = recheck(env, repo, checked);
  if ('refused' in rows) return rows.refused;
  const { entry, branch, head } = checked;
  removeSessions(env, repo.top, exitedSessions(rows, entry.path), out);
  const worktree = removeListed(env, repo.top, entry.path);
  if (worktree.length > 0) return worktree;
  out(`worktree ${entry.path} removed`);
  if (branch === undefined) return [];
  const issues = branchGoneIssues(env.runGit, repo.top, branch, head);
  if (issues.length > 0) {
    return [
      ...issues,
      `the worktree is gone, and the branch ${branch} stays as it is`,
    ];
  }
  out(`branch ${branch} removed`);
  return [];
}

const fail = (lines: string[], err: Out): number => {
  for (const line of lines) err(line);
  return 1;
};

/** Removes the worktree `args` names, keeping its commits in a backup ref; returns the exit code. */
export function removeWorktree(
  args: RemoveArgs,
  env: WorktreeEnv,
  out: Out,
  err: Out,
): number {
  const repo = repoOf(env, err);
  if (repo === undefined) return 1;
  const checked = checkTarget(args, env, repo, out);
  if ('refused' in checked) return fail(checked.refused, err);
  const { ref, head } = checked;
  const kept = writeBackup(env.runGit, repo.top, ref, head);
  if (kept.length > 0) return fail([...kept, 'so remove deleted nothing'], err);
  const issues = removeChecked(env, repo, checked, out);
  if (issues.length > 0) {
    return fail([...issues, `the backup ref ${ref} keeps ${head}`], err);
  }
  out(`restore with: git branch ${checked.branch ?? checked.name} ${ref}`);
  return 0;
}
