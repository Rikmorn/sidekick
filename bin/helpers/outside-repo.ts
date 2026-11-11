/**
 * How a failed `git rev-parse` reads: outside every repository, which each
 * caller words its own way, or any other failure, whose line it quotes.
 */

import * as fs from 'node:fs';

// How `git rev-parse` words a path outside every repository; a git that translates its messages words it otherwise.
const NOT_A_REPO = 'not a git repository';

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
 * repository: git said "not a git repository", said nothing, or never ran
 * because `target` is no folder. A spawn that fails in a folder, as with git
 * missing from PATH, is a failure to quote.
 */
export function outsideRepo(revParseIssue: string, target: string): boolean {
  return (
    revParseIssue === '' ||
    revParseIssue.includes(NOT_A_REPO) ||
    !isFolder(target)
  );
}
