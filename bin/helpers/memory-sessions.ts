/**
 * Which of Claude Code's listed sessions are open in a repo. `sidekick memory
 * link` refuses while another one is, since that session keeps writing to the
 * old memory folder.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { isCurrent } from './desk-snapshot.js';
import type { Job } from './worker-jobs.js';

// The real path, or the resolved literal when the folder is gone.
function realOrResolved(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

// Equal to the checkout, or under it by whole path segments.
function isInside(dir: string, checkout: string): boolean {
  const rel = path.relative(checkout, dir);
  return (
    rel === '' ||
    !(rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
  );
}

/**
 * Split the sessions open in the repo into the running one and the rest. A job
 * is in the repo when its `cwd` equals a checkout or lies under one, compared
 * as real paths. A job is open by the desk's rule, `isCurrent`: it carries a
 * `pid`, or it is a background job still `working` or `blocked`. A `stopped` or
 * `done` job with no `pid` has no process to write to the old folder, and
 * resuming it starts a new process that reads the new key.
 * `self` is the in-repo job whose `sessionId` equals `selfId`; it is
 * `undefined` when no id is given or that session is outside the repo, since
 * only an in-repo session keeps the old folder.
 */
export function sessionsInRepo(
  jobs: Job[],
  checkouts: string[],
  selfId: string | undefined,
): { self: Job | undefined; others: Job[] } {
  const roots = checkouts.map(realOrResolved);
  const inRepo = jobs.filter(
    (j) =>
      isCurrent(j) &&
      j.cwd !== undefined &&
      roots.some((root) => isInside(realOrResolved(j.cwd ?? ''), root)),
  );
  const hasSelf = selfId !== undefined && selfId !== '';
  const self = hasSelf ? inRepo.find((j) => j.sessionId === selfId) : undefined;
  return { self, others: inRepo.filter((j) => j !== self) };
}
