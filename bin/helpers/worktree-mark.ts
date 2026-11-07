/**
 * The git config mark that names the worktree `sidekick worktree move` made a
 * branch for, so `remove` can tell that branch from one it must keep.
 */

import type { Runner } from './pm-data.js';
import { nativeBranch } from './worker-worktree.js';

/** The key under `branch.<b>` naming the worktree `sidekick worktree move` made the branch for. */
export const MARK_KEY = 'sidekickWorktree';

/** The config key that holds `branch`'s mark. */
export const markKeyOf = (branch: string): string =>
  `branch.${branch}.${MARK_KEY}`;

/** The worktree name `branch` is marked for; undefined when unmarked or when git cannot read it. */
export function markOf(
  runGit: Runner,
  top: string,
  branch: string,
): string | undefined {
  // Any failure reads as unmarked: `remove` then keeps the branch, the safe side.
  const result = runGit(
    'git',
    ['config', '--local', '--get', markKeyOf(branch)],
    top,
  );
  if (result.code !== 0) {
    return undefined;
  }
  const name = result.stdout.trim();
  return name === '' ? undefined : name;
}

/** Marks `branch` as made for the worktree `name`, in the repo's local config. The issues, else []. */
export function writeMark(
  runGit: Runner,
  top: string,
  branch: string,
  name: string,
): string[] {
  // In a linked worktree, `--local` writes the common config, so every checkout sees it.
  const result = runGit(
    'git',
    ['config', '--local', markKeyOf(branch), name],
    top,
  );
  return result.code === 0
    ? []
    : [`git config ${markKeyOf(branch)} failed: ${result.stderr.trim()}`];
}

/** Removes `branch`'s mark from the repo's local config. The issues, else []. */
export function clearMark(
  runGit: Runner,
  top: string,
  branch: string,
): string[] {
  const args = ['config', '--local', '--unset', markKeyOf(branch)];
  const result = runGit('git', args, top);
  return result.code === 0
    ? []
    : [`git ${args.join(' ')} failed: ${result.stderr.trim()}`];
}

/** Whether `branch` is the worktree `name`'s own: `worktree-<name>`, or marked for `name`. */
export function isOwnBranch(
  runGit: Runner,
  top: string,
  branch: string,
  name: string,
): boolean {
  return branch === nativeBranch(name) || markOf(runGit, top, branch) === name;
}
