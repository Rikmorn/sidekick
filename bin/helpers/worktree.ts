/**
 * `sidekick worktree`: `list` prints a row for the main checkout naming who
 * works there, one line per linked worktree saying whether to keep or remove it,
 * the hint to remove one, then the backup refs earlier removals left, and
 * changes nothing. `move` lives in `worktree-move.ts`, and `remove` in
 * `worktree-remove.ts`. Usage errors and git failures print to stderr and
 * return 1.
 */

import type { Runner } from './pm-data.js';
import type { WorktreeEntry } from './worker-listing.js';
import { HEADS } from './worker-repo.js';
import { moveWorktree, parseMoveArgs } from './worktree-move.js';
import {
  heldWords,
  type Out,
  omittedWords,
  readSources,
  repoOf,
  type Sources,
  type WorktreeEnv,
} from './worktree-read.js';
import { parseRemoveArgs, removeWorktree } from './worktree-remove.js';
import {
  type CommitsAt,
  type MainUse,
  mainCheckoutUse,
  type WorktreeRow,
  type WorktreeState,
  worktreeRows,
} from './worktree-state.js';

export type { WorktreeEnv } from './worktree-read.js';

export const WORKTREE_USAGE_LINE =
  'sidekick worktree list | move <branch> [--from <base>] | move --pr <n> | remove <name|path> [--into <target>] [--discard]';

type Verb = (rest: string[], env: WorktreeEnv, out: Out, err: Out) => number;

const SEPARATOR = ' · ';
const BACKUP_REFS = 'refs/sidekick';
const REMOVE_HINT = 'remove one with: sidekick worktree remove <name>';

const usage = (err: Out): number => {
  err(`usage: ${WORKTREE_USAGE_LINE}`);
  return 1;
};

function stateWords(state: WorktreeState): string {
  switch (state.kind) {
    case 'held':
      return heldWords(state.by);
    case 'worker':
      return "a worker's: sidekick worker finish";
    case 'folder gone':
      return 'folder gone';
    case 'dirty':
      return `dirty: ${state.paths.join(', ')}${omittedWords(state.omitted)}`;
    case 'removable':
      return 'removable';
    default: {
      const _exhaustive: never = state;
      throw new Error(`Unhandled state: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function commitsWords(commits: CommitsAt): string {
  switch (commits.kind) {
    case 'landed':
      return `landed in ${commits.in}`;
    case 'pushed':
      return `pushed to ${commits.on}`;
    case 'only here':
      return `only here, ${commits.count} ${commits.count === 1 ? 'commit' : 'commits'}`;
    case 'unknown':
      return `commits unknown: ${commits.why}`;
    default: {
      const _exhaustive: never = commits;
      throw new Error(`Unhandled commits: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function rowLine(row: WorktreeRow): string {
  const fields = [row.name, stateWords(row.state)];
  if (row.commits !== undefined) fields.push(commitsWords(row.commits));
  fields.push(row.entry.branch?.replace(HEADS, '') ?? 'detached');
  fields.push(row.entry.path);
  return fields.join(SEPARATOR);
}

function mainUseWords(use: MainUse): string {
  switch (use.kind) {
    case 'free':
      return 'free';
    case 'in use':
      return `in use by ${use.by.join(', ')}`;
    case 'unknown':
      return `unknown: ${use.why}`;
    default: {
      const _exhaustive: never = use;
      throw new Error(`Unhandled use: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// A contract line with plan 11b's skill: the fields and their order.
function mainCheckoutLine(main: WorktreeEntry, use: MainUse): string {
  return [
    'main checkout',
    mainUseWords(use),
    main.branch?.replace(HEADS, '') ?? 'detached',
    main.path,
  ].join(SEPARATOR);
}

// The ref holds no creation date, so the date is its commit's.
function backupRefLines(
  runGit: Runner,
  top: string,
): string[] | { issue: string } {
  const refs = runGit(
    'git',
    ['for-each-ref', '--format=%(refname) %(committerdate:short)', BACKUP_REFS],
    top,
  );
  if (refs.code !== 0) {
    return { issue: `git for-each-ref failed: ${refs.stderr.trim()}` };
  }
  const lines = refs.stdout.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];
  const entries = lines.map((line) => {
    const space = line.lastIndexOf(' ');
    return `${line.slice(0, space)}${SEPARATOR}commit dated ${line.slice(space + 1)}`;
  });
  return ['backup refs:', ...entries];
}

const UNCONFIRMED =
  'so every worktree that would otherwise read folder gone, dirty, or removable reads held, unknown';

// A listing that failed or was read in part leaves no worktree confirmed free.
function listingWarnings(listing: Sources['listing']): string[] {
  if ('error' in listing) {
    return [`claude agents failed, ${UNCONFIRMED}: ${listing.error}`];
  }
  return listing.warnings.map(
    (warning) =>
      `claude agents gave a partial listing, ${UNCONFIRMED}: ${warning}`,
  );
}

const listVerb: Verb = (rest, env, out, err) => {
  if (rest.length > 0) return usage(err);
  const repo = repoOf(env, err);
  if (repo === undefined) return 1;
  const { src, listing, skipWarnings } = readSources(env, repo);
  const warnings = [
    ...listingWarnings(listing),
    ...skipWarnings,
    ...src.unreadRecords,
  ];
  for (const warning of warnings) out(warning);
  out(mainCheckoutLine(repo.worktrees[0], mainCheckoutUse(src)));
  const rows = worktreeRows(src, env.runGit);
  if (rows.length === 0) out('no linked worktrees');
  for (const row of rows) out(rowLine(row));
  const goes = rows.some(
    (row) => row.state.kind === 'removable' || row.state.kind === 'folder gone',
  );
  if (goes) out(REMOVE_HINT);
  const backups = backupRefLines(env.runGit, repo.top);
  if ('issue' in backups) {
    err(backups.issue);
    return 1;
  }
  for (const line of backups) out(line);
  return 0;
};

const moveVerb: Verb = (rest, env, out, err) => {
  const args = parseMoveArgs(rest);
  if (args === undefined) return usage(err);
  return moveWorktree(args, env, out, err);
};

const removeVerb: Verb = (rest, env, out, err) => {
  const args = parseRemoveArgs(rest);
  if (args === undefined) return usage(err);
  return removeWorktree(args, env, out, err);
};

const VERBS: Record<string, Verb> = {
  list: listVerb,
  move: moveVerb,
  remove: removeVerb,
};

/** Dispatch one `worktree` verb; returns the process exit code. */
export function runWorktreeCli(
  rest: string[],
  env: WorktreeEnv,
  out: Out,
  err: Out,
): number {
  const [name, ...args] = rest;
  if (name === undefined || !Object.hasOwn(VERBS, name)) return usage(err);
  return VERBS[name](args, env, out, err);
}
