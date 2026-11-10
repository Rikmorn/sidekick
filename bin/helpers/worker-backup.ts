/**
 * The backup ref that keeps a worker's commits, written before the session
 * and worktree go. `worktree remove` reuses the ref's name and its write, and
 * `worker-finish-tree.ts` reads it.
 */

import type { Runner } from './pm-data.js';
import { commitOf } from './worker-repo.js';
import type { Ready, Step } from './worker-teardown.js';

const BACKUP_KINDS = ['landed', 'pushed', 'discarded', 'kept'] as const;

/**
 * Where the kept commits lived: landed, on a remote-tracking ref, discarded on
 * the operator's word, or on a branch `worktree remove` keeps, held only there
 * or where it cannot tell.
 */
export type BackupKind = (typeof BACKUP_KINDS)[number];

// A byte a ref segment keeps as it is; every other is percent-encoded, `%`
// included, so two names never share a segment.
const REF_SAFE = /^[A-Za-z0-9._-]$/;

const percent = (byte: number): string =>
  `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;

const encodeByte = (byte: number): string => {
  const char = String.fromCharCode(byte);
  return REF_SAFE.test(char) ? char : percent(byte);
};

const DOT = percent('.'.charCodeAt(0));

/**
 * `name` as one segment that git check-ref-format accepts inside a ref. Each
 * UTF-8 byte outside `[A-Za-z0-9._-]` is percent-encoded, and so are a
 * leading `.` or `-`, a `.` before another, a trailing `.`, and the `.` of a
 * `.lock` suffix. A name already in that form, every worker's name among
 * them, stays as it is. git may still refuse a segment as a branch name, as
 * it refuses `HEAD`.
 */
export function refSegment(name: string): string {
  return [...Buffer.from(name, 'utf8')]
    .map(encodeByte)
    .join('')
    .replace(/^[.-]/, (char) => percent(char.charCodeAt(0)))
    .replace(/\.(?=\.)/g, DOT)
    .replace(/\.$/, DOT)
    .replace(/\.lock$/, `${DOT}lock`);
}

/**
 * The backup ref that keeps `head` under `name`, its kind saying where the
 * commits lived. `name` goes in as `refSegment` encodes it.
 */
export const backupRef = (
  kind: BackupKind,
  name: string,
  head: string,
): string => `refs/sidekick/${kind}/${refSegment(name)}/${head}`;

/** The first backup ref of any kind that holds `head`, else undefined. */
export function heldBackup(
  runGit: Runner,
  top: string,
  name: string,
  head: string,
): string | undefined {
  return BACKUP_KINDS.map((kind) => backupRef(kind, name, head)).find(
    (ref) => commitOf(runGit, top, ref) === head,
  );
}

/** The backup ref `ready` writes, its kind taken from the verdict. */
export function readyBackup(ready: Ready): string {
  const { verdict } = ready;
  switch (verdict.kind) {
    case 'landed':
      return backupRef('landed', ready.name, ready.head);
    case 'discard':
      return backupRef('discarded', ready.name, ready.head);
    default: {
      const unhandled: never = verdict;
      throw new Error(`unhandled verdict: ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * Writes `ref` at `head`, create-only: update-ref's empty old value refuses an
 * existing ref. A ref already holding `head` counts as written, so a re-run
 * passes. Returns the issues, else [].
 */
export function writeBackup(
  runGit: Runner,
  top: string,
  ref: string,
  head: string,
): string[] {
  if (commitOf(runGit, top, ref) === head) return [];
  const result = runGit('git', ['update-ref', ref, head, ''], top);
  if (result.code === 0) return [];
  return [`cannot keep ${ref}: ${result.stderr.trim()}`];
}

/** Writes the backup ref at the verified head. */
export const keepBackup: Step = (ready, wenv) =>
  writeBackup(wenv.runGit, ready.mainTop, readyBackup(ready), ready.head);
