/**
 * A worktree's lock, read as a state, and the removal that honours it. Claude
 * Code locks each worktree it makes with a reason naming the session's pid, so
 * a dead pid in that lock marks a lock nobody holds; any other lock holds.
 * `finish`, `worktree list`, and `worktree remove` all read the lock through
 * here.
 */

import type { Runner } from './pm-data.js';

// The lock reads `claude session <name> (pid <n> start <date>)`.
const LOCK_PID = /\(pid (\d+)\b/;

// The largest pid `process.kill` accepts; a pid outside 1 to this reads as none.
const MAX_KILL_PID = 0x7fffffff;

/** The pid when it lies in `process.kill`'s range, else `undefined`. */
export const usablePid = (pid: number | undefined): number | undefined =>
  pid !== undefined && Number.isInteger(pid) && pid > 0 && pid <= MAX_KILL_PID
    ? pid
    : undefined;

/**
 * The lock's pid, when it names one. kill(0, 0) signals the process group, so
 * the pid counts when `usablePid` accepts it: 1 to `process.kill`'s largest pid.
 */
export function lockPid(reason: string | undefined): number | undefined {
  if (reason === undefined) return undefined;
  const pid = Number(LOCK_PID.exec(reason)?.[1]);
  return usablePid(pid);
}

export type LockState =
  | { kind: 'none' }
  /** A Claude Code session's lock whose process has exited. */
  | { kind: 'dead'; pid: number }
  | { kind: 'live'; pid: number }
  /** Any other lock, one naming a pid or `''` included. */
  | { kind: 'other'; reason: string };

// Only Claude Code's own lock says what its pid means; another tool's may name
// a pid that is not its holder.
const SESSION_LOCK = 'claude session ';

/**
 * Reads the `locked` field of a `git worktree list` entry. Only a lock whose
 * reason starts `claude session ` and names a pid reads as live or dead.
 */
export function lockStateOf(
  locked: string | undefined,
  isAlive: (pid: number) => boolean,
): LockState {
  if (locked === undefined) return { kind: 'none' };
  const pid = locked.startsWith(SESSION_LOCK) ? lockPid(locked) : undefined;
  if (pid === undefined) return { kind: 'other', reason: locked };
  return isAlive(pid) ? { kind: 'live', pid } : { kind: 'dead', pid };
}

const gitIssue = (verb: string, stderr: string): string =>
  `git worktree ${verb} failed: ${stderr.trim()}`;

/**
 * Unlocks a dead lock, then runs `git worktree remove <path>`, never with
 * `--force`, so git refuses a worktree holding untracked files. A live lock
 * refuses before anything changes, and so does an `other` one: any lock but a
 * Claude Code session's that names a pid, another tool's naming a pid
 * included. Returns the issues, else [].
 */
export function removeGitWorktree(
  runGit: Runner,
  top: string,
  path: string,
  lock: LockState,
): string[] {
  if (lock.kind === 'live') {
    return [`${path} is locked by a live session (pid ${lock.pid})`];
  }
  if (lock.kind === 'other') {
    return [`${path} is locked${lock.reason === '' ? '' : `: ${lock.reason}`}`];
  }
  if (lock.kind === 'dead') {
    const unlock = runGit('git', ['worktree', 'unlock', path], top);
    if (unlock.code !== 0) return [gitIssue('unlock', unlock.stderr)];
  }
  const removed = runGit('git', ['worktree', 'remove', path], top);
  return removed.code === 0 ? [] : [gitIssue('remove', removed.stderr)];
}
