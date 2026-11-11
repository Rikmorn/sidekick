/**
 * The index entries a worktree flags, which `git status` hides whether the
 * file is edited or missing. `git ls-files -v` tags each entry, and the tag
 * says which route reads it: a skip-worktree file's edits come from git's
 * sparse-checkout recovery status. A present assume-unchanged file counts as
 * dirty by `lstat` alone, since nothing can tell whether it holds edits.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { MAX_OUTPUT, type Runner } from './pm-data.js';
import { type StatusEntry, statusEntriesIn } from './worker-listing.js';

/** The flagged entries of one worktree, as paths relative to its top. */
export interface Flagged {
  /** Every path tagged `S`, present or missing. */
  skipWorktree: Set<string>;
  /** Every path with a lowercase tag that is on disk, in listing order. */
  assumed: string[];
}

const TAG_LENGTH = 'T '.length;

function onDisk(file: string): boolean {
  try {
    fs.lstatSync(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * The flagged entries of the worktree at `worktree`. A lowercase tag, `s`
 * included, is assume-unchanged. The issue is git's message when the listing
 * fails.
 */
export function flaggedEntries(
  runGit: Runner,
  top: string,
  worktree: string,
): Flagged | { issue: string } {
  const listed = runGit('git', ['-C', worktree, 'ls-files', '-v', '-z'], top, {
    maxBuffer: MAX_OUTPUT,
  });
  if (listed.code !== 0) return { issue: listed.stderr.trim() };
  const entries = listed.stdout
    .split('\0')
    .filter((entry) => entry !== '')
    .map((entry) => ({ tag: entry.charAt(0), path: entry.slice(TAG_LENGTH) }));
  return {
    skipWorktree: new Set(
      entries.filter((e) => e.tag === 'S').map((e) => e.path),
    ),
    assumed: entries
      .filter(
        (e) =>
          e.tag !== e.tag.toUpperCase() && onDisk(path.join(worktree, e.path)),
      )
      .map((e) => e.path),
  };
}

/** A worktree's status entries by whether a flag hides the file, and the files no status reads. */
export interface FlaggedStatus {
  /** The entries of files no flag hides. */
  changed: StatusEntry[];
  /** The entries of edited skip-worktree files. */
  skipWorktree: StatusEntry[];
  /** Every present assume-unchanged file, `s` included, in listing order. */
  assumed: string[];
}

/**
 * git status in the worktree at `worktree`, read after the listing of its
 * flagged entries. The status reads skip-worktree edits only when the listing
 * names an `S` entry. A path in `assumed` leaves the entries, so each path
 * has one kind. `command` names the git command that failed.
 */
export function flaggedStatus(
  runGit: Runner,
  top: string,
  worktree: string,
): FlaggedStatus | { command: string; issue: string } {
  const flagged = flaggedEntries(runGit, top, worktree);
  if ('issue' in flagged) {
    return { command: 'git ls-files', issue: flagged.issue };
  }
  const { skipWorktree } = flagged;
  const status = statusEntriesIn(runGit, top, worktree, {
    skipWorktree: skipWorktree.size > 0,
  });
  if ('issue' in status) return { command: 'git status', issue: status.issue };
  const assumed = new Set(flagged.assumed);
  const seen = status.entries.filter((entry) => !assumed.has(entry.path));
  return {
    changed: seen.filter((entry) => !skipWorktree.has(entry.path)),
    skipWorktree: seen.filter((entry) => skipWorktree.has(entry.path)),
    assumed: flagged.assumed,
  };
}
