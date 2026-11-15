/**
 * The link check of `sidekick worker finish`. Once finish finds the worker's
 * worktree and the worktree's link to the repo holds, each git call finish
 * makes there runs through the hardened runner. finish reads that link again
 * once the job is gone.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WorkerEnv } from './worker.js';
import type { Subject } from './worker-finish-subject.js';
import { chainOf, type GitPlace, hardenedRunner } from './worker-git.js';
import type { Ready } from './worker-teardown.js';

/** The lead of finish's refusal when the repo's main git dir does not check out. */
export const MAIN_GIT_DIR_LEAD =
  "the repo's main git dir does not check out, so finish removed nothing:";

/**
 * The name the admin folder must have: a unit worker's own name. A plan
 * worker's may take another, as when another worktree took the name first.
 */
export const adminNameOf = (subject: Subject): string | undefined =>
  subject.read?.brief.kind === 'unit' ? subject.name : undefined;

/** `wenv` with each git call into the worktree hardened. */
export const worktreeEnv = (wenv: WorkerEnv, place: GitPlace): WorkerEnv => ({
  ...wenv,
  runGit: hardenedRunner(wenv.runGit, place),
});

/** The worktree's link when finish first checks it. */
export type ChainAt =
  | { kind: 'linked'; gitDir: string }
  /**
   * A folder that is gone holds no link to follow, and git cannot run in it,
   * so the worktree checks refuse it with their own lines. `lines` stand when
   * none does.
   */
  | { kind: 'gone'; lines: string[] }
  | { kind: 'broken'; lines: string[] };

/** The worktree's link to the repo at `commonDir`, with the refusal's lines when it breaks. */
export function chainAt(
  worktree: string,
  commonDir: string,
  adminName: string | undefined,
): ChainAt {
  const chain = chainOf(worktree, commonDir, adminName);
  if (!('issues' in chain)) return { kind: 'linked', gitDir: chain.gitDir };
  const lines = [
    `the worktree ${worktree} is not linked to its repo the way git links a worktree, so finish ran no git there and removed nothing:`,
    ...chain.issues,
  ];
  return fs.existsSync(worktree)
    ? { kind: 'broken', lines }
    : { kind: 'gone', lines };
}

/**
 * The worktree's link read again once the job is gone: each break, or a line
 * when its `.git` file now names another admin folder than finish checked. A
 * folder gone since then leaves the other checks to refuse it.
 */
export function chainNowIssues(
  ready: Pick<Ready, 'worktree' | 'commonDir' | 'gitDir' | 'adminName'>,
): string[] {
  if (!fs.existsSync(ready.worktree)) return [];
  const chain = chainOf(ready.worktree, ready.commonDir, ready.adminName);
  if ('issues' in chain) return chain.issues;
  if (chain.gitDir === ready.gitDir) return [];
  return [
    `${path.join(ready.worktree, '.git')} names the admin folder ${chain.gitDir}, not ${ready.gitDir}, the one finish checked`,
  ];
}
