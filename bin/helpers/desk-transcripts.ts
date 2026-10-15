/**
 * The desk's transcript lookup: `<config dir>/projects/<project>/<sessionId>.jsonl`,
 * found by scanning the project folders, which are listed once per snapshot.
 * A transcript's modification time says whether an idle interactive session
 * finished recently, and its tail gives a child's tokens.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { readTailEntry } from './context-monitor.js';
import type { ListingRow } from './desk-snapshot.js';

export interface Transcript {
  file: string;
  mtimeMs: number;
}

/** The session's transcript, or undefined when no project folder holds one. */
export type TranscriptFinder = (sessionId: string) => Transcript | undefined;

// A session id becomes part of a file name.
const SESSION_ID = /^[A-Za-z0-9-]{1,128}$/;

const reason = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const isMissing = (e: unknown): boolean =>
  e instanceof Error && 'code' in e && e.code === 'ENOENT';

// The project folders' names; a missing `projects/` holds none.
function projectFolders(projects: string): {
  folders: string[];
  warnings: string[];
} {
  try {
    const entries = fs.readdirSync(projects, { withFileTypes: true });
    return {
      folders: entries.filter((e) => e.isDirectory()).map((e) => e.name),
      warnings: [],
    };
  } catch (e) {
    if (isMissing(e)) return { folders: [], warnings: [] };
    return {
      folders: [],
      warnings: [`cannot list the transcripts in ${projects}: ${reason(e)}`],
    };
  }
}

// The file's modification time, or undefined when it cannot be read.
function modifiedAt(file: string): number | undefined {
  try {
    return fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs;
  } catch {
    return undefined;
  }
}

/** A finder over the project folders under `configDir`, listed now, once. */
export function transcriptFinder(configDir: string): {
  find: TranscriptFinder;
  warnings: string[];
} {
  const projects = path.join(configDir, 'projects');
  const { folders, warnings } = projectFolders(projects);
  const find: TranscriptFinder = (sessionId) => {
    if (!SESSION_ID.test(sessionId)) return undefined;
    for (const folder of folders) {
      const file = path.join(projects, folder, `${sessionId}.jsonl`);
      const mtimeMs = modifiedAt(file);
      if (mtimeMs !== undefined) return { file, mtimeMs };
    }
    return undefined;
  };
  return { find, warnings };
}

/**
 * The SessionIds of interactive rows whose transcript changed within the
 * window before `now`.
 */
export function freshSessions(
  rows: ListingRow[],
  find: TranscriptFinder,
  now: number,
  // An interactive session idle longer than this is parked, not finished.
  windowMs = 30 * 60_000,
): Set<string> {
  const isFresh = (sessionId: string): boolean => {
    const transcript = find(sessionId);
    return transcript !== undefined && now - transcript.mtimeMs <= windowMs;
  };
  return new Set(
    rows.flatMap(({ kind, sessionId }) =>
      kind === 'interactive' && sessionId !== undefined && isFresh(sessionId)
        ? [sessionId]
        : [],
    ),
  );
}

/**
 * The tokens in the tail of the session's transcript. No session or no
 * transcript gives none; a transcript that cannot be read gives a warning.
 */
export function tokensOf(
  name: string,
  sessionId: string | undefined,
  find: TranscriptFinder,
): { tokens?: number; warnings: string[] } {
  if (sessionId === undefined) return { warnings: [] };
  const transcript = find(sessionId);
  if (transcript === undefined) return { warnings: [] };
  try {
    const entry = readTailEntry(transcript.file);
    return entry === undefined
      ? { warnings: [] }
      : { tokens: entry.tokens, warnings: [] };
  } catch (e) {
    return {
      warnings: [
        `${name}: cannot read the transcript ${transcript.file}: ${reason(e)}`,
      ],
    };
  }
}
