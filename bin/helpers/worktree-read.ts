/**
 * What both `sidekick worktree` verbs read, and how they word what they find:
 * the repository holding the command, the sources of the shared checks, and the
 * words for a held state and for the dirty paths a state leaves out.
 */

import { readListing } from './desk.js';
import { findRepo, type Repo } from './desk-children.js';
import type { Runner } from './pm-data.js';
import type { ClaudeRunner } from './profile-launch.js';
import { readRecords } from './worker-record.js';
import { readSkips } from './worktree-ignored.js';
import type { CheapSources, Omitted } from './worktree-state.js';

export interface WorktreeEnv {
  cwd: string;
  runGit: Runner;
  runClaude: ClaudeRunner;
  isAlive: (pid: number) => boolean;
  /** The process environment, injected so a test run inside a worker does not read as one. */
  env: NodeJS.ProcessEnv;
}

export type Out = (line: string) => void;

/** The repository holding `env.cwd`; undefined outside one, with the reason printed to `err`. */
export function repoOf(env: WorktreeEnv, err: Out): Repo | undefined {
  const found = findRepo(env.runGit, env.cwd);
  for (const warning of found.warnings) err(warning);
  if (found.repo === undefined && found.warnings.length === 0) {
    err(`${env.cwd} is not inside a git repository`);
  }
  return found.repo;
}

export interface Sources {
  src: CheapSources;
  /** What `claude agents` gave; `src.rows` is undefined when it failed. */
  listing: ReturnType<typeof readListing>;
  /** The skip list's warnings. */
  skipWarnings: string[];
}

/** The shared checks' sources for `repo`, read now. */
export function readSources(env: WorktreeEnv, repo: Repo): Sources {
  const listing = readListing(env.runClaude, env.cwd);
  const skips = readSkips(repo.commonDir);
  const stored = readRecords(repo.commonDir);
  return {
    src: {
      repo,
      rows: 'error' in listing ? undefined : listing.rows,
      listingWarnings: 'error' in listing ? [] : listing.warnings,
      records: stored.records,
      unreadRecords: stored.warnings,
      isAlive: env.isAlive,
    },
    listing,
    skipWarnings: skips.warnings,
  };
}

/** `held by pid 4242`, or `held, unknown: <why>` when nothing says the worktree is free. */
export const heldWords = (by: string): string =>
  by.startsWith('unknown') ? `held, ${by}` : `held by ${by}`;

/** `, and N more` or `, and at least N more`; empty when nothing was left out. */
export function omittedWords(omitted: Omitted): string {
  if (omitted.count === 0) return '';
  const count = `${omitted.kind === 'at least' ? 'at least ' : ''}${omitted.count}`;
  return `, and ${count} more`;
}
