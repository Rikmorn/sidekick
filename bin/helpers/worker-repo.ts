/**
 * Facts that `sidekick worker` reads through git: where the main checkout is,
 * its `HEAD`, whether its tracked files are clean, its branches and push URLs,
 * and the exclude entry for Claude Code's worktree folder. For a worktree:
 * what it has checked out, the entries `git status` names there with their
 * codes, whether `git worktree list` still names it, and its lock reason.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Runner } from './pm-data.js';

/** Where Claude Code makes `--worktree` folders, relative to the repo top. */
export const WORKTREES_FOLDER = '.claude/worktrees';

const EXCLUDE_ENTRY = `${WORKTREES_FOLDER}/`;

/** The full sha `rev` names in the repo at `top`, or undefined when it names no commit. */
export function commitOf(
  runGit: Runner,
  top: string,
  rev: string,
): string | undefined {
  const result = runGit(
    'git',
    ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`],
    top,
  );
  return result.code === 0 ? result.stdout.trim() : undefined;
}

/** The full sha of `HEAD`, or undefined before the first commit. */
export const headCommit = (runGit: Runner, top: string): string | undefined =>
  commitOf(runGit, top, 'HEAD');

/** Whether no tracked file has uncommitted changes; untracked files do not count. */
export function isTrackedClean(runGit: Runner, top: string): boolean {
  const result = runGit(
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    top,
  );
  return result.code === 0 && result.stdout.trim() === '';
}

/** Whether the local branch `branch` exists. */
export const branchExists = (
  runGit: Runner,
  top: string,
  branch: string,
): boolean =>
  runGit(
    'git',
    ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`],
    top,
  ).code === 0;

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

/** What `sidekick worker` reads about the checkout it runs in and its repo. */
export interface CheckoutFacts {
  launchTop: string;
  mainTop: string;
  commonDir: string;
  /** The short name the launching checkout holds; undefined when detached or on a ref outside `refs/heads/`. */
  branch: string | undefined;
  worktrees: WorktreeEntry[];
}

/**
 * The launching checkout's top, the main checkout's top, the common git dir,
 * and the branch the launching checkout holds, from `cwd` or any folder below
 * it. Refuses outside a work tree.
 */
export function checkoutFacts(
  runGit: Runner,
  cwd: string,
): CheckoutFacts | { issues: string[] } {
  const result = runGit(
    'git',
    [
      'rev-parse',
      '--path-format=absolute',
      '--show-toplevel',
      '--git-common-dir',
    ],
    cwd,
  );
  if (result.code !== 0) {
    return {
      issues: [
        'not inside a git work tree: run sidekick worker from a checkout of the repo',
      ],
    };
  }
  // One path per line; only the final newline goes, since a path may hold spaces.
  const [launchTop, commonDir] = result.stdout.replace(/\n$/, '').split('\n');
  if (launchTop === undefined || commonDir === undefined) {
    return {
      issues: [`git rev-parse printed an unexpected answer: ${result.stdout}`],
    };
  }
  const listing = listWorktrees(runGit, cwd);
  if ('issue' in listing) return { issues: [listing.issue] };
  const held = heldBranch(runGit, cwd);
  if ('issue' in held) return { issues: [held.issue] };
  return {
    launchTop,
    mainTop: listing.worktrees[0].path,
    commonDir,
    branch: held.branch,
    worktrees: listing.worktrees,
  };
}

const HEADS = 'refs/heads/';

// The short name of the branch `cwd` holds; undefined when detached or on a
// ref outside refs/heads/. `--short` prints `heads/<name>` when a tag shares
// the name, so the prefix is stripped here.
function heldBranch(
  runGit: Runner,
  cwd: string,
): { branch: string | undefined } | { issue: string } {
  const result = runGit('git', ['symbolic-ref', '-q', 'HEAD'], cwd);
  // symbolic-ref exits 1 on a detached HEAD.
  if (result.code === 1) return { branch: undefined };
  if (result.code !== 0) {
    const why = result.stderr.trim();
    const lead = `git symbolic-ref HEAD failed with exit code ${result.code}`;
    return { issue: why === '' ? lead : `${lead}: ${why}` };
  }
  const ref = result.stdout.trim();
  return {
    branch: ref.startsWith(HEADS) ? ref.slice(HEADS.length) : undefined,
  };
}

/** The top of the checkout holding `folder`, or git's message when it is in no work tree. */
export function checkoutOf(
  runGit: Runner,
  folder: string,
): { top: string } | { issue: string } {
  const result = runGit(
    'git',
    ['rev-parse', '--path-format=absolute', '--show-toplevel'],
    folder,
  );
  if (result.code !== 0) return { issue: result.stderr.trim() };
  return { top: result.stdout.replace(/\n$/, '') };
}

/**
 * Resolves symlinks through the nearest existing ancestor, so a path not yet
 * made still compares physically against git's listing.
 */
export function physical(p: string): string {
  const abs = path.resolve(p);
  const rest: string[] = [];
  let dir = abs;
  for (;;) {
    try {
      return path.join(fs.realpathSync(dir), ...rest);
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) return abs;
      rest.unshift(path.basename(dir));
      dir = parent;
    }
  }
}

const PUSH_URL_KEY = /^remote\.(.+)\.pushurl$/;

/** The remotes that set an explicit `pushurl`, each once, in config order. */
export function remotesWithPushUrl(runGit: Runner, top: string): string[] {
  const result = runGit(
    'git',
    ['config', '--get-regexp', '^remote\\..+\\.pushurl$'],
    top,
  );
  // Exit 1 means no key matched.
  if (result.code !== 0) return [];
  const names = result.stdout
    .split('\n')
    .map((line) => PUSH_URL_KEY.exec(line.split(' ')[0])?.[1])
    .filter((name) => name !== undefined);
  return [...new Set(names)];
}

// Whether git already ignores the worktrees folder; the probe path need not exist.
const isIgnored = (runGit: Runner, top: string): boolean =>
  runGit(
    'git',
    ['check-ignore', '-q', '--no-index', `${WORKTREES_FOLDER}/x`],
    top,
  ).code === 0;

const reason = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const isMissing = (e: unknown): boolean =>
  e instanceof Error && 'code' in e && e.code === 'ENOENT';

// The file's text, empty when it does not exist; any other failure is an issue.
function readExclude(file: string): { text: string } | { issues: string[] } {
  try {
    return { text: fs.readFileSync(file, 'utf-8') };
  } catch (e) {
    if (isMissing(e)) return { text: '' };
    return {
      issues: [
        `cannot read ${file}, where dispatch adds ${EXCLUDE_ENTRY}: ${reason(e)}. Fix the file, then run dispatch again`,
      ],
    };
  }
}

// Keeps the file's last line whole.
function appendExclude(file: string, text: string): string[] {
  const separator = text === '' || text.endsWith('\n') ? '' : '\n';
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${separator}${EXCLUDE_ENTRY}\n`);
    return [];
  } catch (e) {
    return [
      `cannot add ${EXCLUDE_ENTRY} to ${file}: ${reason(e)}. Fix the file, then run dispatch again`,
    ];
  }
}

/**
 * Appends `.claude/worktrees/` to `<commonDir>/info/exclude` unless git already
 * ignores that folder, creating `info/` when missing and keeping the file's
 * last line whole. Gives the line to print when it writes, or the issue when
 * it cannot read or write the file.
 */
export function ensureWorktreesExcluded(
  runGit: Runner,
  top: string,
  commonDir: string,
): { line: string | undefined } | { issues: string[] } {
  if (isIgnored(runGit, top)) return { line: undefined };
  const file = path.join(commonDir, 'info', 'exclude');
  const read = readExclude(file);
  if ('issues' in read) return read;
  // An entry that a later .gitignore negation overrides is not added twice.
  if (read.text.split(/\r?\n/).includes(EXCLUDE_ENTRY)) {
    return { line: undefined };
  }
  const issues = appendExclude(file, read.text);
  if (issues.length > 0) return { issues };
  return { line: `added ${EXCLUDE_ENTRY} to ${file}` };
}
