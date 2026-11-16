/**
 * Hardened git into a worker's worktree. git finds a worktree's repository by
 * files the worker can write: the worktree's `.git` file names an admin folder
 * under `<common>/worktrees/`, whose `gitdir` and `commondir` files point back,
 * and a `commondir` in the main git dir sends git elsewhere from the main
 * checkout. A planted one sends git to another repository's config and hooks.
 * So sidekick checks those files first, then runs each git call it makes into
 * the worktree with hooks, fsmonitor, embedded repos, and replace refs off,
 * and with the git dir and work tree named outright.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Runner } from './pm-data.js';
import type { CheckoutFacts } from './worker-facts.js';
import { checkoutOf, physical } from './worker-repo.js';

/**
 * The flags that keep a git call from running the repo's hooks or its
 * fsmonitor, from reaching into an embedded repo, whose own config may name a
 * filter git would run, and from reading replace refs, which a worker can
 * plant to change what a commit holds. So such a call sees no work inside an
 * embedded repo.
 */
export const HARDENED_GIT_FLAGS: readonly string[] = [
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'diff.ignoreSubmodules=all',
  '-c',
  'core.useReplaceRefs=false',
];

const GITFILE_PREFIX = 'gitdir: ';
const COMMONDIR = 'commondir';
const GITDIR = 'gitdir';

type Read<T> = T | { issue: string };

// git drops a pointer file's trailing line ends.
function pointerText(file: string): Read<{ text: string }> {
  try {
    return { text: fs.readFileSync(file, 'utf-8').replace(/[\r\n]+$/, '') };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return { issue: `cannot read ${file}: ${why}` };
  }
}

function isFolder(at: string): boolean {
  try {
    return fs.statSync(at).isDirectory();
  } catch {
    return false;
  }
}

function lstatOf(at: string): fs.Stats | undefined {
  try {
    return fs.lstatSync(at);
  } catch {
    return undefined;
  }
}

// The folder a `.git` file names; git resolves a relative one from the file's folder.
function namedByGitFile(dotGit: string): Read<{ dir: string }> {
  const read = pointerText(dotGit);
  if ('issue' in read) return read;
  if (!read.text.startsWith(GITFILE_PREFIX)) {
    return {
      issue: `${dotGit} does not start with "${GITFILE_PREFIX}", so it names no admin folder`,
    };
  }
  const named = read.text.slice(GITFILE_PREFIX.length);
  return { dir: path.resolve(physical(path.dirname(dotGit)), named) };
}

// The admin folder a linked worktree's `.git` file names, which must be a folder.
function adminNamed(dotGit: string): Read<{ dir: string }> {
  const stat = lstatOf(dotGit);
  if (stat === undefined) {
    return {
      issue: `${dotGit} does not exist, so nothing links the worktree to its repo`,
    };
  }
  if (!stat.isFile()) {
    return {
      issue: `${dotGit} is not a file, so it is not the link git writes into a linked worktree`,
    };
  }
  const named = namedByGitFile(dotGit);
  if ('issue' in named) return named;
  if (!isFolder(named.dir)) {
    return { issue: `${dotGit} names ${named.dir}, which is not a folder` };
  }
  return named;
}

const plantedLine = (file: string): string =>
  `${file} exists, but a main git dir never holds one: git reads it to find the repository, so it may send git to another one`;

// A main git dir never holds `commondir`; git reads one there as the repository's real place.
function plantedIssues(gitDir: string): string[] {
  const file = path.join(gitDir, COMMONDIR);
  return lstatOf(file) === undefined ? [] : [plantedLine(file)];
}

// Where the admin folder sits: directly under `<common>/worktrees/`, and by
// `expected`'s name when one is given.
function placeIssues(
  dotGit: string,
  admin: string,
  commonDir: string,
  expected: string | undefined,
): string[] {
  const worktrees = path.join(commonDir, 'worktrees');
  if (path.dirname(physical(admin)) !== physical(worktrees)) {
    return [
      `${dotGit} names ${admin}, which is not directly under ${worktrees}, where git keeps each linked worktree's admin folder`,
    ];
  }
  const name = path.basename(physical(admin));
  if (expected === undefined || name === expected) return [];
  return [
    `${dotGit} names the admin folder ${name}, not ${expected}, the name it must have`,
  ];
}

// One of the admin folder's pointer files, which must lead to `want` by real
// path. git resolves a relative one from the admin folder's real path.
function pointerIssues(
  admin: string,
  file: string,
  want: string,
  wrong: (at: string, to: string) => string,
): string[] {
  const at = path.join(admin, file);
  const read = pointerText(at);
  if ('issue' in read) return [read.issue];
  const to = path.resolve(physical(admin), read.text);
  return physical(to) === physical(want) ? [] : [wrong(at, to)];
}

// The admin folder's `gitdir` must lead back to the worktree's `.git` file,
// and its `commondir` to the common git dir.
const backIssues = (
  admin: string,
  dotGit: string,
  commonDir: string,
): string[] => [
  ...pointerIssues(
    admin,
    GITDIR,
    dotGit,
    (at, to) => `${at} points to ${to}, not back to ${dotGit}`,
  ),
  ...pointerIssues(
    admin,
    COMMONDIR,
    commonDir,
    (at, to) => `${at} points to ${to}, not to the common git dir ${commonDir}`,
  ),
];

/** A worktree's link to its repo: the admin folder git uses for it, or each break, naming its file. */
export type Chain = { gitDir: string } | { issues: string[] };

/**
 * The worktree's link to the repo at `commonDir`, read from files, never by
 * git, which would follow the links under test. Each file is compared by real
 * path. `expected` is the admin folder's name when it must have one, as a unit
 * worker's does; a plan worker's admin folder may take another name.
 */
export function chainOf(
  worktree: string,
  commonDir: string,
  expected?: string,
): Chain {
  const dotGit = path.join(worktree, '.git');
  const planted = plantedIssues(commonDir);
  const named = adminNamed(dotGit);
  if ('issue' in named) return { issues: [...planted, named.issue] };
  const admin = named.dir;
  const issues = [
    ...planted,
    ...placeIssues(dotGit, admin, commonDir, expected),
    ...backIssues(admin, dotGit, commonDir),
  ];
  return issues.length === 0 ? { gitDir: physical(admin) } : { issues };
}

/** `chainOf`'s breaks alone; none when the chain holds. */
export function chainIssues(
  worktree: string,
  commonDir: string,
  expected?: string,
): string[] {
  const chain = chainOf(worktree, commonDir, expected);
  return 'issues' in chain ? chain.issues : [];
}

// The main checkout's git dir, from files. Only a main checkout holds a `.git`
// folder, so the checkout `facts` came from is the main one when it holds one.
// Else the main checkout is the one git lists, whose top `--show-toplevel`
// gives; a bare main repo is listed as itself, with no work tree.
function mainGitDir(
  runGit: Runner,
  facts: Pick<CheckoutFacts, 'launchTop' | 'mainTop' | 'commonDir'>,
): Read<{ dir: string }> {
  const launchGit = path.join(facts.launchTop, '.git');
  if (isFolder(launchGit)) return { dir: launchGit };
  const found = checkoutOf(runGit, facts.mainTop);
  if ('top' in found) {
    const dotGit = path.join(found.top, '.git');
    return isFolder(dotGit) ? { dir: dotGit } : namedByGitFile(dotGit);
  }
  if (physical(facts.mainTop) === physical(facts.commonDir)) {
    return { dir: facts.mainTop };
  }
  return {
    issue: `git rev-parse --show-toplevel failed in the main checkout ${facts.mainTop}, so sidekick cannot find its git dir: ${found.issue}`,
  };
}

/**
 * Whether the repo's main git dir checks out, read from files: it holds no
 * `commondir`, and it is the common dir git reports. From the main checkout,
 * `git rev-parse --git-common-dir` already follows a planted `commondir`.
 */
export function mainGitDirIssues(
  runGit: Runner,
  facts: Pick<CheckoutFacts, 'launchTop' | 'mainTop' | 'commonDir'>,
): string[] {
  const main = mainGitDir(runGit, facts);
  if ('issue' in main) return [main.issue];
  const differs = physical(main.dir) !== physical(facts.commonDir);
  return [
    ...plantedIssues(main.dir),
    ...(differs
      ? [
          `git reports the common git dir ${facts.commonDir}, but the main checkout's git dir is ${main.dir}`,
        ]
      : []),
  ];
}

/** Where a worktree's git calls go once its chain holds: the worktree, and the admin folder `chainOf` gave. */
export interface GitPlace {
  worktree: string;
  gitDir: string;
}

// git's options before the subcommand that take their value as the next argument.
const VALUE_OPTIONS = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--config-env',
  '--attr-source',
]);

// The folder git works in: `cwd`, then each `-C` before the subcommand,
// each resolved from the folder before it.
function gitFolder(cwd: string, args: string[]): string {
  let folder = cwd;
  let at = 0;
  while (at < args.length && args[at].startsWith('-')) {
    if (args[at] === '-C') folder = path.resolve(folder, args[at + 1] ?? '');
    at += VALUE_OPTIONS.has(args[at]) ? 2 : 1;
  }
  return folder;
}

// Whole path segments only, so `/r/w1` never holds `/r/w10`.
function within(folder: string, root: string): boolean {
  const rel = path.relative(root, folder);
  if (rel === '') return true;
  const leaves = rel === '..' || rel.startsWith(`..${path.sep}`);
  return !leaves && !path.isAbsolute(rel);
}

/**
 * Whether git, run with `args` from `cwd`, works in `worktree` or below it, by
 * real path. git works in `cwd`, then in each `-C` before the subcommand.
 */
export const gitRunsIn = (
  worktree: string,
  cwd: string,
  args: string[],
): boolean => within(physical(gitFolder(cwd, args)), physical(worktree));

/**
 * `run`, with each git call that `gitRunsIn` the worktree led by
 * `HARDENED_GIT_FLAGS`, `--git-dir`, and `--work-tree`. Every other call
 * passes through unchanged.
 */
export function hardenedRunner(run: Runner, place: GitPlace): Runner {
  const root = physical(place.worktree);
  const prefix = [
    ...HARDENED_GIT_FLAGS,
    `--git-dir=${place.gitDir}`,
    `--work-tree=${root}`,
  ];
  return (cmd, args, cwd, opts) => {
    const inside = cmd === 'git' && gitRunsIn(root, cwd, args);
    return run(cmd, inside ? [...prefix, ...args] : args, cwd, opts);
  };
}
