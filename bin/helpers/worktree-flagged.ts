/**
 * The index entries a worktree flags, which `git status` hides whether the
 * file is edited or missing. `git ls-files -v` tags each entry, and the tag
 * says which route reads it: a skip-worktree file's edits show in a status run
 * with sparse checkout on, and an assume-unchanged file's need a read of the
 * file itself.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { MAX_OUTPUT, type Runner } from './pm-data.js';

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
