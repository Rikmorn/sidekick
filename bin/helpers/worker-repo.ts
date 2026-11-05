/**
 * Facts that `sidekick worker` reads through git about a repo: the full sha of
 * a rev and of `HEAD`, whether the tracked files are clean, whether a branch
 * exists, the checkout that holds a folder, a path's physical form, and the
 * remotes that set a push URL.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Runner } from './pm-data.js';

/** Where Claude Code makes `--worktree` folders, relative to the repo top. */
export const WORKTREES_FOLDER = '.claude/worktrees';

/** The full sha `rev` names in the repo at `top`, or undefined when it names no commit. */
export function commitOf(
  runGit: Runner,
  top: string,
  rev: string,
): string | undefined {
  const result = runGit(
    'git',
    ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`],
    top,
  );
  return result.code === 0 ? result.stdout.trim() : undefined;
}

/** The full sha of `HEAD`, or undefined before the first commit. */
export const headCommit = (runGit: Runner, top: string): string | undefined =>
  commitOf(runGit, top, 'HEAD');

/** Whether no tracked file has uncommitted changes; untracked files do not count. */
export function isTrackedClean(runGit: Runner, top: string): boolean {
  const result = runGit(
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    top,
  );
  return result.code === 0 && result.stdout.trim() === '';
}

/** Whether the local branch `branch` exists. */
export const branchExists = (
  runGit: Runner,
  top: string,
  branch: string,
): boolean =>
  runGit(
    'git',
    ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`],
    top,
  ).code === 0;

/** The prefix of a branch's full ref, such as `refs/heads/w1`. */
export const HEADS = 'refs/heads/';

/** The top of the checkout holding `folder`, or git's message when it is in no work tree. */
export function checkoutOf(
  runGit: Runner,
  folder: string,
): { top: string } | { issue: string } {
  const result = runGit(
    'git',
    ['rev-parse', '--path-format=absolute', '--show-toplevel'],
    folder,
  );
  if (result.code !== 0) return { issue: result.stderr.trim() };
  return { top: result.stdout.replace(/\n$/, '') };
}

/**
 * Resolves symlinks through the nearest existing ancestor, so a path not yet
 * made still compares physically against git's listing.
 */
export function physical(p: string): string {
  const abs = path.resolve(p);
  const rest: string[] = [];
  let dir = abs;
  for (;;) {
    try {
      return path.join(fs.realpathSync(dir), ...rest);
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) return abs;
      rest.unshift(path.basename(dir));
      dir = parent;
    }
  }
}

const PUSH_URL_KEY = /^remote\.(.+)\.pushurl$/;

/** The remotes that set an explicit `pushurl`, each once, in config order. */
export function remotesWithPushUrl(runGit: Runner, top: string): string[] {
  const result = runGit(
    'git',
    ['config', '--get-regexp', '^remote\\..+\\.pushurl$'],
    top,
  );
  // Exit 1 means no key matched.
  if (result.code !== 0) return [];
  const names = result.stdout
    .split('\n')
    .map((line) => PUSH_URL_KEY.exec(line.split(' ')[0])?.[1])
    .filter((name) => name !== undefined);
  return [...new Set(names)];
}
