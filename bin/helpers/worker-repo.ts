/**
 * Facts about the main checkout that `sidekick worker` reads through git: where
 * it is, its `HEAD`, whether its tracked files are clean, its branches and
 * push URLs, and the exclude entry for Claude Code's worktree folder.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Runner } from './pm-data.js';

/** Where Claude Code makes `--worktree` folders, relative to the repo top. */
export const WORKTREES_FOLDER = '.claude/worktrees';

const EXCLUDE_ENTRY = `${WORKTREES_FOLDER}/`;

/**
 * The main checkout's top and common git dir, from `cwd` or any folder below
 * it. Refuses outside a work tree, and inside a linked worktree, whose git dir
 * is not the common one.
 */
export function mainCheckout(
  runGit: Runner,
  cwd: string,
): { top: string; commonDir: string } | { issues: string[] } {
  const result = runGit(
    'git',
    [
      'rev-parse',
      '--path-format=absolute',
      '--show-toplevel',
      '--absolute-git-dir',
      '--git-common-dir',
    ],
    cwd,
  );
  if (result.code !== 0) {
    return {
      issues: [
        "not inside a git work tree: run sidekick worker from the repo's main checkout",
      ],
    };
  }
  // One path per line; only the final newline goes, since a path may hold spaces.
  const [top, gitDir, commonDir] = result.stdout.replace(/\n$/, '').split('\n');
  if (top === undefined || gitDir === undefined || commonDir === undefined) {
    return {
      issues: [`git rev-parse printed an unexpected answer: ${result.stdout}`],
    };
  }
  if (gitDir !== commonDir) {
    return {
      issues: [
        `${top} is a linked worktree: run sidekick worker from the main checkout, whose git dir is ${commonDir}`,
      ],
    };
  }
  return { top, commonDir };
}

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
