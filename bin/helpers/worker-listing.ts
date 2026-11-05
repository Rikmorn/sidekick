/**
 * What `git worktree list` and `git status` say about worktrees: the entries
 * of the list with their lock and prunable marks, whether a path is listed,
 * what a worktree has checked out, and the entries `git status` names there
 * with their codes.
 */

import type { Runner } from './pm-data.js';
import { physical } from './worker-repo.js';

/**
 * What the work tree at `dir` has checked out: a ref such as
 * `refs/heads/main`, or `a detached HEAD`, or `an unreadable HEAD (<why>)`.
 */
export function checkedOut(runGit: Runner, dir: string): string {
  const result = runGit('git', ['symbolic-ref', '-q', 'HEAD'], dir);
  if (result.code === 0) return result.stdout.trim();
  // symbolic-ref exits 1 on a detached HEAD.
  if (result.code === 1) return 'a detached HEAD';
  return `an unreadable HEAD (${result.stderr.trim()})`;
}

// A rename or copy entry carries its source path in the next field.
const RENAMED = /^(?:[RC].|.[RC]) /;
const STATUS_CODE_LENGTH = 'XY'.length;
const STATUS_PREFIX = 'XY '.length;

/** One path that `git status` names, with porcelain's two `XY` characters. */
export interface StatusEntry {
  code: string;
  path: string;
}

/** Porcelain's code for a tracked file deleted from the work tree, unstaged. */
export const DELETED = ' D';

// Every entry `git status --porcelain -z` names, sources of renames included.
function statusEntries(stdout: string): StatusEntry[] {
  const fields = stdout.split('\0').filter((field) => field !== '');
  const entries: StatusEntry[] = [];
  let i = 0;
  while (i < fields.length) {
    const entry = fields[i];
    const code = entry.slice(0, STATUS_CODE_LENGTH);
    const source = RENAMED.test(entry) ? fields.at(i + 1) : undefined;
    entries.push({ code, path: entry.slice(STATUS_PREFIX) });
    if (source !== undefined) entries.push({ code, path: source });
    i += source === undefined ? 1 : 2;
  }
  return entries;
}

/**
 * Every entry `git status` names in the work tree at `dir`, with its `XY`
 * code and a path relative to the top: each untracked file by its own path,
 * and a rename's source as its own entry with the rename's code. The issue is
 * git's message when the status fails.
 */
export function statusEntriesIn(
  runGit: Runner,
  top: string,
  dir: string,
): { entries: StatusEntry[] } | { issue: string } {
  // -uall names each untracked file, where the default names only its folder.
  const status = runGit(
    'git',
    ['-C', dir, 'status', '--porcelain', '-z', '--untracked-files=all'],
    top,
  );
  if (status.code !== 0) return { issue: status.stderr.trim() };
  return { entries: statusEntries(status.stdout) };
}

/**
 * Whether `git worktree list` names `worktree`. git still lists a worktree
 * whose `.git` file is gone, marked prunable. The issue is git's message when
 * the listing fails.
 */
export function worktreeListed(
  runGit: Runner,
  top: string,
  worktree: string,
): { listed: boolean } | { issue: string } {
  const list = listWorktrees(runGit, top);
  if ('issue' in list) return list;
  const wanted = physical(worktree);
  return {
    listed: list.worktrees.some((entry) => physical(entry.path) === wanted),
  };
}

/** One entry of `git worktree list`. */
export interface WorktreeEntry {
  /** Physical, as git lists it. */
  path: string;
  head: string | undefined;
  /** A full ref, `refs/heads/<x>`; undefined when detached. */
  branch: string | undefined;
  /** The lock reason, `''` when locked with none, undefined when not locked. */
  locked: string | undefined;
  /** git's reason, `''` when it gives none, undefined when not prunable. */
  prunable: string | undefined;
}

// A field is `<key>` or `<key> <value>`; the value keeps any further spaces.
function fieldOf(field: string): { key: string; value: string } {
  const space = field.indexOf(' ');
  if (space === -1) return { key: field, value: '' };
  return { key: field.slice(0, space), value: field.slice(space + 1) };
}

// A record without a `worktree` field is not an entry.
function entryOf(fields: string[]): WorktreeEntry | undefined {
  const entry: WorktreeEntry = {
    path: '',
    head: undefined,
    branch: undefined,
    locked: undefined,
    prunable: undefined,
  };
  let named = false;
  for (const { key, value } of fields.map(fieldOf)) {
    if (key === 'worktree') {
      entry.path = value;
      named = true;
    } else if (key === 'HEAD') entry.head = value;
    else if (key === 'branch') entry.branch = value;
    else if (key === 'locked') entry.locked = value;
    else if (key === 'prunable') entry.prunable = value;
  }
  return named ? entry : undefined;
}

/**
 * The entries of `git worktree list --porcelain -z`: a NUL ends each field
 * and an empty field ends each record. The first entry is the main checkout.
 */
export function parseWorktrees(porcelainZ: string): WorktreeEntry[] {
  const records: string[][] = [[]];
  for (const field of porcelainZ.split('\0')) {
    if (field === '') records.push([]);
    else records[records.length - 1].push(field);
  }
  return records.flatMap((fields) => entryOf(fields) ?? []);
}

/** The worktrees git lists for the repo holding `dir`, or git's message when it fails. */
export function listWorktrees(
  runGit: Runner,
  dir: string,
): { worktrees: WorktreeEntry[] } | { issue: string } {
  const list = runGit('git', ['worktree', 'list', '--porcelain', '-z'], dir);
  if (list.code !== 0) return { issue: list.stderr.trim() };
  const worktrees = parseWorktrees(list.stdout);
  if (worktrees.length === 0) {
    return { issue: 'git worktree list printed no worktrees' };
  }
  return { worktrees };
}

/**
 * The lock reason `git worktree list` gives `worktree`, matched by physical
 * path: `''` when locked with none, undefined when not locked, not listed, or
 * when the listing fails. git names a worktree's admin folder after the path's
 * last segment, suffixed when that name is taken, so only the listing finds
 * the lock that belongs to a path.
 */
export function lockReasonOf(
  runGit: Runner,
  top: string,
  worktree: string,
): string | undefined {
  const list = listWorktrees(runGit, top);
  if ('issue' in list) return undefined;
  const wanted = physical(worktree);
  const entry = list.worktrees.find((w) => physical(w.path) === wanted);
  return entry === undefined ? undefined : entry.locked;
}
