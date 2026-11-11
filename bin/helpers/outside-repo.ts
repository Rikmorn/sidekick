/**
 * How a failed `git rev-parse` reads: outside every repository, which each
 * caller words its own way, or any other failure, whose line it quotes.
 */

import * as fs from 'node:fs';

// The stem both of git's outside messages share; a git that translates its messages words them otherwise.
const OUTSIDE_EVERY_REPO = 'not a git repository (or any';

function isFolder(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/** The first line of a failed `git rev-parse`'s stderr, the line `outsideRepo` reads and callers quote. */
export const revParseLine = (stderr: string): string =>
  stderr.trim().split('\n')[0];

/**
 * Whether a failed `git rev-parse` in `target` means `target` is outside every
 * repository: git said nothing, `target` is no folder so git never ran, or git
 * gave one of its two outside messages:
 * - `not a git repository (or any of the parent directories): .git`
 * - `not a git repository (or any parent up to mount point <dir>)`
 *
 * Any other line is a failure to quote. That includes a dangling worktree's
 * `not a git repository: <gitdir>`, and a spawn that fails in a folder, as
 * with git missing from PATH.
 */
export function outsideRepo(revParseIssue: string, target: string): boolean {
  return (
    revParseIssue === '' ||
    revParseIssue.includes(OUTSIDE_EVERY_REPO) ||
    !isFolder(target)
  );
}
