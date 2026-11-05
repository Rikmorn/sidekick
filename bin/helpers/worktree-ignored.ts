/**
 * The ignored-file check. `git worktree remove` deletes ignored files without
 * a word, so this finds the ones removal would lose: absent from the main
 * checkout, or there with other contents.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Runner } from './pm-data.js';

/**
 * Names skipped at any depth, whatever the repo declares: `node_modules`, and
 * `.DS_Store` as a file only, since Finder writes one into each folder it opens.
 */
export const BUILT_IN_SKIPS: {
  folders: readonly string[];
  files: readonly string[];
} = { folders: ['node_modules'], files: ['.DS_Store'] };

/** `<commonDir>/sidekick/disposable`: one folder per line, relative to the repo top; `#` starts a comment. */
export function skipListPath(commonDir: string): string {
  return path.join(commonDir, 'sidekick', 'disposable');
}

// A skip line is a folder: drop the comment, a leading `./`, and trailing slashes.
function skipFolder(line: string): string {
  return line
    .replace(/#.*$/, '')
    .trim()
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

/** The repo's own skip folders. A missing list is none; an unreadable one is a warning. */
export function readSkips(commonDir: string): {
  folders: string[];
  warnings: string[];
} {
  const file = skipListPath(commonDir);
  try {
    const folders = fs
      .readFileSync(file, 'utf-8')
      .split('\n')
      .map(skipFolder)
      .filter((folder) => folder !== '');
    return { folders, warnings: [] };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { folders: [], warnings: [] };
    }
    const why = error instanceof Error ? error.message : String(error);
    return { folders: [], warnings: [`Cannot read ${file}: ${why}`] };
  }
}

/** Ignored files whose removal would lose data; `truncated` when more than `cap` exist. */
export interface Losses {
  paths: string[];
  truncated: boolean;
}

type Skips = (rel: string) => boolean;

function skipper(folders: string[]): Skips {
  return (rel) =>
    rel
      .split('/')
      .some((segment) => BUILT_IN_SKIPS.folders.includes(segment)) ||
    folders.some((folder) => rel === folder || rel.startsWith(`${folder}/`));
}

const isSkippedFile = (rel: string, stat: fs.Stats): boolean =>
  stat.isFile() && BUILT_IN_SKIPS.files.includes(path.posix.basename(rel));

function lstatOf(file: string): fs.Stats | undefined {
  try {
    return fs.lstatSync(file);
  } catch {
    return undefined;
  }
}

function sameBytes(a: string, b: string): boolean {
  try {
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch {
    return false;
  }
}

function sameLink(a: string, b: string): boolean {
  try {
    return fs.readlinkSync(a) === fs.readlinkSync(b);
  } catch {
    return false;
  }
}

// Whether removing `worktreeFile` would lose it: the main checkout lacks it or holds other contents.
function isLoss(worktreeFile: string, mainFile: string): boolean {
  const here = lstatOf(worktreeFile);
  const there = lstatOf(mainFile);
  if (here === undefined || there === undefined) return here !== undefined;
  if (here.isSymbolicLink()) {
    return !(there.isSymbolicLink() && sameLink(worktreeFile, mainFile));
  }
  if (!here.isFile()) return true;
  if (!there.isFile() || there.size !== here.size) return true;
  return !sameBytes(worktreeFile, mainFile);
}

// Every non-skipped file under `rel`, depth first, in name order. Symlinks are not followed.
function* filesUnder(
  worktree: string,
  rel: string,
  skipped: Skips,
): Generator<string> {
  if (skipped(rel)) return;
  const stat = lstatOf(path.join(worktree, rel));
  if (stat === undefined) return;
  if (!stat.isDirectory()) {
    if (!isSkippedFile(rel, stat)) yield rel;
    return;
  }
  const names = fs.readdirSync(path.join(worktree, rel)).sort();
  for (const name of names)
    yield* filesUnder(worktree, `${rel}/${name}`, skipped);
}

const IGNORED = '!! ';

// The ignored entries `git status` names, collapsed: a wholly ignored folder is one entry.
function ignoredEntries(
  runGit: Runner,
  worktree: string,
): string[] | { issue: string } {
  const status = runGit(
    'git',
    [
      '-C',
      worktree,
      'status',
      '--porcelain',
      '-z',
      '--ignored',
      '--untracked-files=normal',
    ],
    worktree,
  );
  if (status.code !== 0) return { issue: status.stderr.trim() };
  return status.stdout
    .split('\0')
    .filter((entry) => entry.startsWith(IGNORED))
    .map((entry) => entry.slice(IGNORED.length).replace(/\/+$/, ''));
}

/**
 * Ignored files removal would lose: absent from the main checkout, or there
 * with other contents, outside the skips. Paths are relative to the
 * worktree's top. The issue is git's message when its status fails.
 */
export function ignoredLosses(
  runGit: Runner,
  places: { mainTop: string; worktree: string; commonDir: string },
  { cap = 20 }: { cap?: number } = {},
): Losses | { issue: string } {
  const entries = ignoredEntries(runGit, places.worktree);
  if ('issue' in entries) return entries;
  const skipped = skipper(readSkips(places.commonDir).folders);
  const paths: string[] = [];
  for (const entry of entries) {
    for (const rel of filesUnder(places.worktree, entry, skipped)) {
      const lost = isLoss(
        path.join(places.worktree, rel),
        path.join(places.mainTop, rel),
      );
      if (!lost) continue;
      paths.push(rel);
      if (paths.length > cap)
        return { paths: paths.slice(0, cap), truncated: true };
    }
  }
  return { paths, truncated: false };
}
