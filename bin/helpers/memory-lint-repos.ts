/**
 * What the memory lint learns about each linked repo outside the store: whether
 * its marker's root is still a checkout, whether its key points into the
 * store, which markers the store skips, and what Claude Code's default memory
 * folder holds beside the store's copy.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { findRepo } from './desk-children.js';
import { expandHome } from './home-path.js';
import { walkFolder } from './memory-link-facts.js';
import { readKeyAt } from './memory-settings.js';
import { folderNameIssue, MARKER_FILE, readMarker } from './memory-store.js';
import type { Runner } from './pm-data.js';

/** Realpath where the path exists, else lexical, as `repoView` resolves paths. */
export function resolvedPath(target: string): string {
  const lexical = path.resolve(target);
  try {
    return fs.realpathSync(lexical);
  } catch {
    return lexical;
  }
}

function isInside(folder: string, parent: string): boolean {
  const relative = path.relative(parent, folder);
  return (
    relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
  );
}

/**
 * What a marker's root is. `undecided` means git failed inside a repository,
 * which says nothing about the root, so no check reports on it.
 */
export type RootFact =
  | { kind: 'missing' }
  | { kind: 'outside-git' }
  | { kind: 'not-main'; top: string }
  | { kind: 'undecided' }
  | { kind: 'checkout'; key: string | undefined };

/** Whether `root` is the main checkout of a repository, and if so, the raw key in its local settings. */
export function rootFact(root: string, runGit: Runner): RootFact {
  if (!fs.existsSync(root)) return { kind: 'missing' };
  const found = findRepo(runGit, root);
  if (found.repo === undefined) {
    // findRepo warns only when git failed inside a repository.
    return found.warnings.length > 0
      ? { kind: 'undecided' }
      : { kind: 'outside-git' };
  }
  const top = resolvedPath(found.repo.top);
  if (top !== resolvedPath(root)) return { kind: 'not-main', top };
  // The key is read at the top this lookup found: a second lookup could fail alone and fake a missing key.
  return { kind: 'checkout', key: readKeyAt(found.repo.top) };
}

/** Whether a raw key names a folder inside `store`, which is already a real path. */
export function keyInStore(
  rawKey: string | undefined,
  store: string,
  home: string,
): boolean {
  if (rawKey === undefined) return false;
  // Claude Code takes an absolute or `~/` path; a relative key never counts as inside the store.
  const key = expandHome(rawKey, home);
  return path.isAbsolute(key) && isInside(resolvedPath(key), store);
}

/** A marker `readMarker` refuses, so `findMarkers` skips its folder. */
export interface InvalidMarker {
  /** Store-relative, with `/` separators. */
  folder: string;
  file: string;
  issue: string;
}

// The folders findMarkers looks in: not dot folders, not reserved names.
function candidates(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && folderNameIssue(e.name) === undefined)
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function invalidAt(dir: string, folder: string): InvalidMarker[] {
  const read = readMarker(dir);
  if (read.kind !== 'invalid') return [];
  return [{ folder, file: path.join(dir, MARKER_FILE), issue: read.issue }];
}

/** The invalid markers in the places `findMarkers` looks: one level down, and two below a folder without a valid marker. */
export function invalidMarkers(store: string): InvalidMarker[] {
  return candidates(store).flatMap((first) => {
    const dir = path.join(store, first);
    if (readMarker(dir).kind === 'marker') return [];
    const nested = candidates(dir).flatMap((second) =>
      invalidAt(path.join(dir, second), `${first}/${second}`),
    );
    return [...invalidAt(dir, first), ...nested];
  });
}

/** How Claude Code's default memory folder compares with the store's folder for the same repo. */
export type DefaultFolderDiff =
  | { kind: 'absent' }
  | { kind: 'unlisted'; why: string }
  | {
      kind: 'present';
      differs: string[];
      onlyThere: string[];
      onlyInStore: string[];
    };

const FENCE = '---';
// The keys Claude Code adds to a memory file's front matter on each write
// (docs/research/memory/2026-11-01-memory-link-probes.md, §Results).
const STAMP_LINE = /^\s*(?:node_type|originSessionId|modified):/;

// Claude Code adds or rewrites its stamps on each write, so they are no difference.
function withoutStamps(text: string): string {
  const lines = text.split('\n');
  if (lines[0]?.trimEnd() !== FENCE) return text;
  const end = lines.findIndex((line, i) => i > 0 && line.trimEnd() === FENCE);
  if (end === -1) return text;
  return lines
    .filter((line, i) => i === 0 || i >= end || !STAMP_LINE.test(line))
    .join('\n');
}

type CopyCompare = 'same' | 'differs' | 'absent';

// A file the lint cannot read counts as differing, since it cannot be shown to match.
function compareCopy(from: string, to: string): CopyCompare {
  if (!fs.existsSync(to)) return 'absent';
  try {
    const [a, b] = [fs.readFileSync(from), fs.readFileSync(to)];
    const same =
      a.equals(b) ||
      withoutStamps(a.toString('utf8')) === withoutStamps(b.toString('utf8'));
    return same ? 'same' : 'differs';
  } catch {
    return 'differs';
  }
}

/** A thrown error's `code` (`ENOENT`, `EACCES`), else its message. */
export function errorCode(error: unknown): string {
  if (error instanceof Error && 'code' in error) return String(error.code);
  return error instanceof Error ? error.message : String(error);
}

function filesUnder(dir: string): { files: string[] } | { why: string } {
  try {
    return { files: walkFolder(dir).files };
  } catch (error) {
    return { why: errorCode(error) };
  }
}

/**
 * Compares every file under `defaultDir` with the same path under `storeDir`,
 * and names the store's own files (`storeNames`) the default folder lacks.
 */
export function compareDefaultFolder(
  defaultDir: string,
  storeDir: string,
  storeNames: readonly string[],
): DefaultFolderDiff {
  if (!fs.existsSync(defaultDir)) return { kind: 'absent' };
  const listed = filesUnder(defaultDir);
  if ('why' in listed) return { kind: 'unlisted', why: listed.why };
  const compared = listed.files.map((rel) => ({
    rel,
    state: compareCopy(path.join(defaultDir, rel), path.join(storeDir, rel)),
  }));
  const named = (state: CopyCompare) =>
    compared.filter((entry) => entry.state === state).map((entry) => entry.rel);
  return {
    kind: 'present',
    differs: named('differs'),
    onlyThere: named('absent'),
    onlyInStore: storeNames.filter((name) => !listed.files.includes(name)),
  };
}
