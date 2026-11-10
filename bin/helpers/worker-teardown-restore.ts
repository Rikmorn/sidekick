/**
 * The restore step of `sidekick worker finish`, for a removal an earlier run
 * cut short.
 */

import { DELETED, statusEntriesIn } from './worker-listing.js';
import type { Step } from './worker-teardown.js';

/** In a partial removal, writes the deleted files back from the index, so claude rm meets a clean worktree. */
export const restorePartial: Step = (ready, wenv, out) => {
  if (!ready.partial) return [];
  const status = statusEntriesIn(wenv.runGit, ready.mainTop, ready.worktree);
  if ('issue' in status) {
    return [
      `git status failed in the worktree ${ready.worktree}: ${status.issue}`,
    ];
  }
  const deleted = status.entries
    .filter((entry) => entry.code === DELETED)
    .map((entry) => entry.path);
  if (deleted.length === 0) return [];
  // checkout-index refuses to overwrite a file that exists.
  const result = wenv.runGit(
    'git',
    ['-C', ready.worktree, 'checkout-index', '--', ...deleted],
    ready.mainTop,
  );
  if (result.code !== 0) {
    return [
      `git checkout-index failed in the worktree ${ready.worktree}, so finish removed nothing: ${result.stderr.trim()}`,
    ];
  }
  const files = `${deleted.length} deleted ${deleted.length === 1 ? 'file' : 'files'}`;
  out(
    `restored ${files} in ${ready.worktree} from its index, so claude rm finds it clean`,
  );
  return [];
};
