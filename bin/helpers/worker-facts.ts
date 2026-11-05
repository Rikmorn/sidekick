/**
 * The checkout facts `sidekick worker` reads once per command: the launching
 * checkout's top, the main checkout's top, the common git dir, the branch the
 * launching checkout holds, and the worktrees git lists.
 */

import type { Runner } from './pm-data.js';
import { listWorktrees, type WorktreeEntry } from './worker-listing.js';
import { HEADS } from './worker-repo.js';

/** What `sidekick worker` reads about the checkout it runs in and its repo. */
export interface CheckoutFacts {
  launchTop: string;
  mainTop: string;
  commonDir: string;
  /** The short name the launching checkout holds; undefined when detached or on a ref outside `refs/heads/`. */
  branch: string | undefined;
  worktrees: WorktreeEntry[];
}

/**
 * The launching checkout's top, the main checkout's top, the common git dir,
 * and the branch the launching checkout holds, from `cwd` or any folder below
 * it. Refuses outside a work tree.
 */
export function checkoutFacts(
  runGit: Runner,
  cwd: string,
): CheckoutFacts | { issues: string[] } {
  const result = runGit(
    'git',
    [
      'rev-parse',
      '--path-format=absolute',
      '--show-toplevel',
      '--git-common-dir',
    ],
    cwd,
  );
  if (result.code !== 0) {
    return {
      issues: [
        'not inside a git work tree: run sidekick worker from a checkout of the repo',
      ],
    };
  }
  // One path per line; only the final newline goes, since a path may hold spaces.
  const [launchTop, commonDir] = result.stdout.replace(/\n$/, '').split('\n');
  if (launchTop === undefined || commonDir === undefined) {
    return {
      issues: [`git rev-parse printed an unexpected answer: ${result.stdout}`],
    };
  }
  const listing = listWorktrees(runGit, cwd);
  if ('issue' in listing) return { issues: [listing.issue] };
  const held = heldBranch(runGit, cwd);
  if ('issue' in held) return { issues: [held.issue] };
  return {
    launchTop,
    mainTop: listing.worktrees[0].path,
    commonDir,
    branch: held.branch,
    worktrees: listing.worktrees,
  };
}

// The short name of the branch `cwd` holds; undefined when detached or on a
// ref outside refs/heads/. `--short` prints `heads/<name>` when a tag shares
// the name, so the prefix is stripped here.
function heldBranch(
  runGit: Runner,
  cwd: string,
): { branch: string | undefined } | { issue: string } {
  const result = runGit('git', ['symbolic-ref', '-q', 'HEAD'], cwd);
  // symbolic-ref exits 1 on a detached HEAD.
  if (result.code === 1) return { branch: undefined };
  if (result.code !== 0) {
    const why = result.stderr.trim();
    const lead = `git symbolic-ref HEAD failed with exit code ${result.code}`;
    return { issue: why === '' ? lead : `${lead}: ${why}` };
  }
  const ref = result.stdout.trim();
  return {
    branch: ref.startsWith(HEADS) ? ref.slice(HEADS.length) : undefined,
  };
}
