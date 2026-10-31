/**
 * Whether a branch's content already sits in a target commit, however it
 * landed: as itself, rebased, squashed, or squashed and then edited. It runs
 * git through a `Runner`, moves no ref, and touches no work tree;
 * `hash-object -w` and `merge-tree --write-tree` write objects.
 */

import type { Runner } from './pm-data.js';

/** Where `head`'s content was found, or why it was not. */
export type Landing =
  | { kind: 'landed'; at: string; how: 'ancestor' | 'tip' | 'history' }
  | { kind: 'not landed'; walked: number; capped: boolean }
  | { kind: 'error'; issue: string };

type Commit = { sha: string; tree: string };
type Failure = { issue: string };

/** How many commits the history walk lists before it stops. */
export const DEFAULT_CAP = 200;

/** `git merge-tree` exits 1 for a merge that conflicts. */
const CONFLICTED = 1;

const isFailure = (value: unknown): value is Failure =>
  typeof value === 'object' && value !== null && 'issue' in value;

// The empty tree's id in this repo's hash format, written so the object exists
// whatever the git version; `/dev/null` is an argument because the runner gives
// git no stdin.
function emptyTreeId(runGit: Runner, top: string): string | Failure {
  const result = runGit(
    'git',
    ['hash-object', '-w', '-t', 'tree', '/dev/null'],
    top,
  );
  if (result.code !== 0) {
    return { issue: `git hash-object failed: ${result.stderr.trim()}` };
  }
  return result.stdout.trim();
}

// The tree of a commit.
function treeOf(runGit: Runner, top: string, sha: string): string | Failure {
  const result = runGit('git', ['rev-parse', `${sha}^{tree}`], top);
  if (result.code !== 0) {
    return { issue: `git rev-parse failed: ${result.stderr.trim()}` };
  }
  return result.stdout.trim();
}

// Merging `head` into `commit` adds nothing when the merge is clean and yields
// `commit`'s own tree. In-tree attributes are not read, so a `merge=` driver in
// `.gitattributes` cannot fake a clean merge; `$GIT_DIR/info/attributes` still applies.
function mergeAddsNothing(
  runGit: Runner,
  top: string,
  emptyTree: string,
  commit: Commit,
  head: string,
): boolean | Failure {
  const result = runGit(
    'git',
    [
      `--attr-source=${emptyTree}`,
      'merge-tree',
      '--write-tree',
      commit.sha,
      head,
    ],
    top,
  );
  if (result.code === 0) return result.stdout.split('\n')[0] === commit.tree;
  if (result.code === CONFLICTED) return false;
  return {
    issue: `git merge-tree --write-tree failed, and finish needs git 2.40 or later: ${result.stderr.trim()}`,
  };
}

// The merge base, or null when the histories share none.
function mergeBase(
  runGit: Runner,
  top: string,
  refs: { target: string; head: string },
): string | null {
  const result = runGit('git', ['merge-base', refs.target, refs.head], top);
  return result.code === 0 ? result.stdout.trim() : null;
}

// The paths the branch changed since `base`. Without rename detection a rename
// counts as its two paths.
function branchFiles(
  runGit: Runner,
  top: string,
  base: string,
  head: string,
): string[] | Failure {
  const result = runGit(
    'git',
    ['diff', '--name-only', '--no-renames', '-z', base, head],
    top,
  );
  if (result.code !== 0) {
    return { issue: `git diff failed: ${result.stderr.trim()}` };
  }
  return result.stdout.split('\0').filter((file) => file !== '');
}

// Commits that touch those files, newest first, from the target's parents back
// to `base`. The target is out of the list before the cap applies, since the
// tip merge tried it. Literal pathspecs keep `:` and `*` in names plain.
function candidates(
  runGit: Runner,
  top: string,
  refs: { target: string; base: string },
  files: string[],
  cap: number,
): Commit[] | Failure {
  if (files.length === 0) return [];
  const result = runGit(
    'git',
    [
      '--literal-pathspecs',
      'log',
      '--full-history',
      '--no-show-signature',
      '--no-follow',
      '--format=%H %T',
      `--max-count=${cap}`,
      `${refs.target}^@`,
      `^${refs.base}`,
      '--',
      ...files,
    ],
    top,
  );
  if (result.code !== 0) {
    return { issue: `git log failed: ${result.stderr.trim()}` };
  }
  return result.stdout
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [sha = '', tree = ''] = line.split(' ');
      return { sha, tree };
    });
}

// Tries each candidate in order; the first whose merge adds nothing wins.
function walk(
  runGit: Runner,
  top: string,
  emptyTree: string,
  head: string,
  list: Commit[],
  cap: number,
): Landing {
  let walked = 0;
  for (const commit of list) {
    walked += 1;
    const added = mergeAddsNothing(runGit, top, emptyTree, commit, head);
    if (isFailure(added)) return { kind: 'error', issue: added.issue };
    if (added) return { kind: 'landed', at: commit.sha, how: 'history' };
  }
  return { kind: 'not landed', walked, capped: list.length >= cap };
}

// The history walk: the commits that touched the branch's files, past the tip.
function searchHistory(
  runGit: Runner,
  top: string,
  emptyTree: string,
  refs: { target: string; head: string },
  base: string,
  cap: number,
): Landing {
  const files = branchFiles(runGit, top, base, refs.head);
  if (isFailure(files)) return { kind: 'error', issue: files.issue };
  const list = candidates(
    runGit,
    top,
    { target: refs.target, base },
    files,
    cap,
  );
  if (isFailure(list)) return { kind: 'error', issue: list.issue };
  return walk(runGit, top, emptyTree, refs.head, list, cap);
}

/**
 * Looks for `head`'s content in `target`, both full shas: as an ancestor, as a
 * clean merge that changes nothing at the target's tip, or at a commit between
 * the merge base and the tip, which catches work landed and then edited. The
 * history walk lists at most `cap` commits, newest first.
 */
export function landedIn(
  runGit: Runner,
  top: string,
  refs: { target: string; head: string },
  { cap = DEFAULT_CAP }: { cap?: number } = {},
): Landing {
  const ancestor = runGit(
    'git',
    ['merge-base', '--is-ancestor', refs.head, refs.target],
    top,
  );
  if (ancestor.code === 0) {
    return { kind: 'landed', at: refs.target, how: 'ancestor' };
  }
  // Unrelated histories make merge-tree exit 128, so look for a base first.
  const base = mergeBase(runGit, top, refs);
  if (base === null) return { kind: 'not landed', walked: 0, capped: false };
  const emptyTree = emptyTreeId(runGit, top);
  if (isFailure(emptyTree)) return { kind: 'error', issue: emptyTree.issue };
  const tree = treeOf(runGit, top, refs.target);
  if (isFailure(tree)) return { kind: 'error', issue: tree.issue };
  const atTip = mergeAddsNothing(
    runGit,
    top,
    emptyTree,
    { sha: refs.target, tree },
    refs.head,
  );
  if (isFailure(atTip)) return { kind: 'error', issue: atTip.issue };
  if (atTip) return { kind: 'landed', at: refs.target, how: 'tip' };
  return searchHistory(runGit, top, emptyTree, refs, base, cap);
}
