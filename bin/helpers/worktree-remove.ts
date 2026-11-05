/**
 * `sidekick worktree remove <name|path> [--discard]`: removes one linked
 * worktree that no session holds and no worker owns. It deletes only the
 * branch Claude Code made for that worktree, `worktree-<name>`, and keeps any
 * other. The worktree's head, on any branch or detached, goes into a backup
 * ref before anything is deleted. It never forces, so git itself refuses a
 * worktree with changes. Each refusal names what it found.
 */

import * as path from 'node:path';
import type { Repo } from './desk-children.js';
import { isCurrent, type ListingRow } from './desk-snapshot.js';
import { shellArg } from './shell.js';
import { listWorktrees, type WorktreeEntry } from './worker-listing.js';
import { commitOf, HEADS, physical } from './worker-repo.js';
import {
  type BackupKind,
  backupRef,
  branchGoneIssues,
  NO_LIMIT,
  refSegment,
  saidRemoved,
  withText,
  writeBackup,
} from './worker-teardown.js';
import { nativeBranch } from './worker-worktree.js';
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
  commitsAt,
  diskState,
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

// What the checks settled: the entry, its verified head, and the branch's plan.
interface Checked {
  entry: WorktreeEntry;
  name: string;
  head: string;
  plan: BranchPlan;
}

const samePath = (a: string, b: string): boolean => physical(a) === physical(b);

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

// The states that keep a worktree, at the checks and at each re-check; none for the rest.
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

// The checks before the backup ref, which change nothing. A failed listing
// refuses with its reason; a record that would not read holds the worktree in
// the shared state, which names the record.
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

// A commit made since the checks is in no backup ref, and a detached one would
// go with the worktree.
function movedLines(entry: WorktreeEntry, head: string): string[] {
  if (entry.head === head) return [];
  return [
    `the HEAD of ${entry.path} moved from ${head} to ${entry.head ?? 'no commit'} since the checks, so remove deleted nothing: run remove again`,
  ];
}

// The session rows, records, lock, HEAD, and files, read again once the backup ref is written.
function recheck(
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
  const moved = movedLines(entry, checked.head);
  if (moved.length > 0) return refuse(...moved);
  const lock = lockStateOf(entry.locked, env.isAlive);
  const one = { ...src, repo: alone(repo, entry) };
  const state = stateOf(one, env.runGit, entry, lock);
  const kept = stateLines(state, entry, skipListPath(repo.commonDir));
  if (kept.length > 0) return refuse(...kept);
  return listing.rows;
}

// Background sessions that have exited with their cwd at the worktree's top.
// One whose cwd is only inside it may belong to another worktree, which claude
// rm could remove and nothing checked, so it stays.
function exitedSessions(rows: ListingRow[], worktree: string): string[] {
  return rows.flatMap((row) => {
    const exited = row.kind === 'background' && !isCurrent(row);
    const atTop = row.cwd !== undefined && samePath(row.cwd, worktree);
    return exited && atTop && row.id !== undefined ? [row.id] : [];
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

// A linked worktree, not the main checkout, that holds `worktree`.
function enclosingWorktree(
  repo: Repo,
  worktree: string,
): WorktreeEntry | undefined {
  return repo.worktrees
    .slice(1)
    .find(
      (other) =>
        !samePath(other.path, worktree) && insideOf(worktree, other.path),
    );
}

// A session at a nested worktree's top may still belong to the enclosing one,
// which claude rm could remove and nothing checked, so git's removal goes
// alone there.
function endSessions(
  env: WorktreeEnv,
  repo: Repo,
  worktree: string,
  rows: ListingRow[],
  out: Out,
): void {
  const ids = exitedSessions(rows, worktree);
  const enclosing = enclosingWorktree(repo, worktree);
  if (enclosing === undefined) {
    removeSessions(env, repo.top, ids, out);
    return;
  }
  for (const id of ids) {
    out(
      `claude rm ${id} skipped: ${worktree} sits inside the worktree ${enclosing.path}, which claude rm might remove too, so session ${id} stays listed in claude agents`,
    );
  }
}

// git's removal, with the lock, HEAD, and files read once more: claude rm may
// have taken the worktree, and git deletes an ignored file written meanwhile.
function removeListed(
  env: WorktreeEnv,
  repo: Repo,
  checked: Pick<Checked, 'entry' | 'head'>,
): string[] {
  const { top } = repo;
  const now = listWorktrees(env.runGit, top);
  if ('issue' in now) return [`git worktree list failed: ${now.issue}`];
  const entry = now.worktrees.find((e) => samePath(e.path, checked.entry.path));
  if (entry === undefined) return [];
  const moved = movedLines(entry, checked.head);
  if (moved.length > 0) return moved;
  const disk = diskState(env.runGit, repo, entry);
  const dirty = stateLines(disk, entry, skipListPath(repo.commonDir));
  if (dirty.length > 0) return dirty;
  const lock = lockStateOf(entry.locked, env.isAlive);
  const issues = removeGitWorktree(env.runGit, top, entry.path, lock);
  if (issues.length === 0) return [];
  return [...issues, 'fix what git names, then run remove again'];
}

// Deletes the branch made for this worktree at the verified head; any other stays.
function settleBranch(
  env: WorktreeEnv,
  top: string,
  checked: Checked,
  out: Out,
): string[] {
  const { plan, name, head } = checked;
  switch (plan.kind) {
    case 'detached':
      return [];
    case 'keep':
      out(
        `branch ${plan.branch} kept: remove deletes only ${nativeBranch(name)}, the branch made for this worktree`,
      );
      return [];
    case 'delete': {
      const issues = branchGoneIssues(env.runGit, top, plan.branch, head);
      if (issues.length > 0) {
        return [
          ...issues,
          `the worktree is gone, and the branch ${plan.branch} stays as it is`,
        ];
      }
      out(`branch ${plan.branch} removed`);
      return [];
    }
    default: {
      const _exhaustive: never = plan;
      throw new Error(`Unhandled plan: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// The re-check and the deletions, run once the backup ref holds the head.
function removeChecked(
  env: WorktreeEnv,
  repo: Repo,
  checked: Checked,
  out: Out,
): string[] {
  const rows = recheck(env, repo, checked);
  if ('refused' in rows) return rows.refused;
  const { entry } = checked;
  endSessions(env, repo, entry.path, rows, out);
  const worktree = removeListed(env, repo, checked);
  if (worktree.length > 0) return worktree;
  out(`worktree ${entry.path} removed`);
  return settleBranch(env, repo.top, checked, out);
}

// The branch a restore creates: the deleted one, else the worktree's name as
// the backup ref encodes it, which is a valid branch name for any folder name.
const restoreBranch = (checked: Checked): string =>
  checked.plan.kind === 'delete'
    ? checked.plan.branch
    : refSegment(checked.name);

// Quoted for a POSIX shell, as finish's own restore line is.
const restoreLine = (checked: Checked): string =>
  `restore with: git branch ${shellArg(restoreBranch(checked))} ${shellArg(checked.plan.ref)}`;

const fail = (lines: string[], err: Out): number => {
  for (const line of lines) err(line);
  return 1;
};

/**
 * Removes the worktree `args` names, and deletes its branch only when Claude
 * Code made that branch for it. The head is kept in a backup ref first, the
 * head of a kept branch included. Returns the exit code.
 */
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
  const { head } = checked;
  const { ref } = checked.plan;
  const kept = writeBackup(env.runGit, repo.top, ref, head);
  if (kept.length > 0) return fail([...kept, 'so remove deleted nothing'], err);
  const issues = removeChecked(env, repo, checked, out);
  if (issues.length > 0) {
    return fail([...issues, `the backup ref ${ref} keeps ${head}`], err);
  }
  out(restoreLine(checked));
  return 0;
}
