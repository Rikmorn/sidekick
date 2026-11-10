/**
 * `sidekick worktree remove <name|path> [--into <target>] [--discard]`:
 * removes one linked worktree that no session holds and no worker owns. It
 * deletes only the worktree's own branch: `worktree-<name>`, which Claude Code
 * made for it, or a branch `sidekick worktree move` made for it and marked.
 * It keeps any other. `--into` adds a local branch or remote-tracking ref to
 * the landed check. The worktree's head, on any branch or detached, goes into
 * a backup ref before anything is deleted. It never forces, so git itself
 * refuses a worktree with changes. Each refusal names what it found. The
 * checks live in `worktree-remove-checks.ts`; the deletions live here.
 */

import type { Repo } from './desk-children.js';
import { isCurrent, type ListingRow } from './desk-snapshot.js';
import { shellArg } from './shell.js';
import { refSegment, writeBackup } from './worker-backup.js';
import {
  listWorktrees,
  lockReasonOf,
  type WorktreeEntry,
} from './worker-listing.js';
import { NO_LIMIT, saidRemoved, withText } from './worker-teardown.js';
import { branchGoneIssues } from './worker-teardown-leftovers.js';
import { nativeBranch } from './worker-worktree.js';
import { skipListPath } from './worktree-ignored.js';
import { lockStateOf, removeGitWorktree } from './worktree-lock.js';
import { type Out, repoOf, type WorktreeEnv } from './worktree-read.js';
import {
  type Checked,
  checkTarget,
  KEPT_WORKTREE,
  movedLines,
  type RemoveArgs,
  recheck,
  samePath,
  stateLines,
} from './worktree-remove-checks.js';
import { diskState, insideOf } from './worktree-state.js';

export {
  parseRemoveArgs,
  type RemoveArgs,
} from './worktree-remove-checks.js';

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
// answer other than removed is a note: git's removal follows, and refuses
// changes. Returns the ids claude rm said it removed.
function removeSessions(
  env: WorktreeEnv,
  top: string,
  ids: string[],
  out: Out,
): string[] {
  const removed: string[] = [];
  for (const id of ids) {
    const result = env.runClaude(['rm', id], { cwd: top, timeoutMs: NO_LIMIT });
    const said = saidRemoved(result);
    if (said) removed.push(id);
    const lines = said
      ? [`session ${id} removed`]
      : withText(
          `claude rm ${id} did not say removed, so remove goes on with git's own removal`,
          result,
        );
    for (const line of lines) out(line);
  }
  return removed;
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
// alone there. Returns the ids claude rm removed.
function endSessions(
  env: WorktreeEnv,
  repo: Repo,
  worktree: string,
  rows: ListingRow[],
  out: Out,
): string[] {
  const ids = exitedSessions(rows, worktree);
  const enclosing = enclosingWorktree(repo, worktree);
  if (enclosing === undefined) return removeSessions(env, repo.top, ids, out);
  for (const id of ids) {
    out(
      `claude rm ${id} skipped: ${worktree} sits inside the worktree ${enclosing.path}, which claude rm might remove too, so session ${id} stays listed in claude agents`,
    );
  }
  return [];
}

// git's removal, with HEAD and files read once more, then the lock: claude rm
// may have taken the worktree, git deletes an ignored file written meanwhile,
// and a session may lock the worktree during the files check.
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
  const moved = movedLines(entry, checked.head, KEPT_WORKTREE);
  if (moved.length > 0) return moved;
  const disk = diskState(env.runGit, repo, entry);
  const skipList = skipListPath(repo.commonDir);
  const dirty = stateLines(disk, entry, skipList, KEPT_WORKTREE);
  if (dirty.length > 0) return dirty;
  const reason = lockReasonOf(env.runGit, top, entry.path);
  const lock = lockStateOf(reason, env.isAlive);
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
        `branch ${plan.branch} kept: remove deletes only ${nativeBranch(name)} or a branch sidekick worktree move made for this worktree`,
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
  const ended = endSessions(env, repo, entry.path, rows, out);
  const worktree = removeListed(env, repo, checked);
  if (worktree.length > 0) return [...worktree, ...endedLines(ended)];
  out(`worktree ${entry.path} removed`);
  return settleBranch(env, repo.top, checked, out);
}

// A refusal after claude rm names the sessions it removed, since a re-run finds them gone.
function endedLines(ids: string[]): string[] {
  if (ids.length === 0) return [];
  const sessions = `${ids.length === 1 ? 'session' : 'sessions'} ${ids.join(', ')}`;
  return [
    `claude rm removed ${sessions} before this; remove itself deleted no worktree and no branch`,
  ];
}

// git accepts any encoded segment behind this prefix: it then starts with a
// letter, and the encoding leaves no `..`, trailing `.`, or `.lock` suffix.
const RESTORED = 'restored-';

// With no branch deleted, the line names a branch after the folder, as the
// ref encodes it. A name git refuses as a branch, `HEAD` among them, takes the
// prefix, as does one a branch holds or nests under: a kept branch often
// shares the folder's name. A prefixed name already taken adds the head.
function restoreBranch(
  env: WorktreeEnv,
  top: string,
  checked: Checked,
): string {
  if (checked.plan.kind === 'delete') return checked.plan.branch;
  const segment = refSegment(checked.name);
  const prefixed = `${RESTORED}${segment}`;
  const free = [segment, prefixed].find((b) => isFreeBranch(env, top, b));
  return free ?? `${prefixed}-${checked.head}`;
}

// A name git accepts as a branch, with no branch at it or under it: git
// refuses `feat` beside `feat/x`. for-each-ref's pattern matches both.
function isFreeBranch(env: WorktreeEnv, top: string, branch: string): boolean {
  const git = (args: string[]) => env.runGit('git', args, top);
  const accepted = git(['check-ref-format', '--branch', branch]).code === 0;
  if (!accepted) return false;
  const listed = git(['for-each-ref', '--count=1', `refs/heads/${branch}`]);
  return listed.code === 0 && listed.stdout.trim() === '';
}

// Quoted for a POSIX shell, as finish's own restore line is.
const restoreLine = (branch: string, checked: Checked): string =>
  `restore with: git branch ${shellArg(branch)} ${shellArg(checked.plan.ref)}`;

const fail = (lines: string[], err: Out): number => {
  for (const line of lines) err(line);
  return 1;
};

/**
 * Removes the worktree `args` names, and deletes its branch only when that
 * branch is the worktree's own: `worktree-<name>`, or one `sidekick worktree
 * move` marked for it. The landed check tries `args.into` first. The head is
 * kept in a backup ref first, the head of a kept branch included. Returns the
 * exit code.
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
  out(restoreLine(restoreBranch(env, repo.top, checked), checked));
  return 0;
}
