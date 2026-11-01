/**
 * The desk's transcript lookup: `<config dir>/projects/<project>/<sessionId>.jsonl`,
 * found by scanning the project folders, which are listed once per snapshot.
 * A transcript's modification time says whether an idle interactive session
 * finished recently, and its tail gives a child's tokens and what a waiting
 * session last said.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { findInTail, readTailEntry } from './context-monitor.js';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The text of a message's content: a string, or the text of its text blocks.
function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .flatMap((block) =>
      isRecord(block) && block.type === 'text' && typeof block.text === 'string'
        ? [block.text]
        : [],
    )
    .join('\n');
}

function parsedLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

// A main-thread assistant entry's first line of text, or `{}` for one with no
// text, such as a tool call; undefined for any other line.
function saidOn(line: string): { said?: string } | undefined {
  const entry = parsedLine(line);
  if (!isRecord(entry) || entry.type !== 'assistant') return undefined;
  if (entry.isSidechain !== false || !isRecord(entry.message)) return undefined;
  const said = contentText(entry.message.content)
    .split('\n')
    .map((part) => part.trim())
    .find((part) => part !== '');
  return said === undefined ? {} : { said };
}

/**
 * The first line of text in the session's newest main-thread assistant entry:
 * what a waiting session last said. None when that entry is a tool call, or
 * when the transcript is missing or cannot be read, since the line only adds
 * to a row the listing already draws.
 */
export function askedOf(
  sessionId: string,
  find: TranscriptFinder,
): string | undefined {
  const transcript = find(sessionId);
  if (transcript === undefined) return undefined;
  try {
    return findInTail(transcript.file, saidOn)?.said;
  } catch {
    return undefined;
  }
}

/** Where a session started: the first transcript entry that records a `cwd`. */
export interface StartPlace {
  cwd: string;
  gitBranch: string | undefined;
}

const NEWLINE = 0x0a;

// The whole lines in the first `maxBytes` of a file. A buffer that filled may
// end mid-line, so it is cut at its last newline; a shorter one is the whole
// file. A newline byte never occurs inside a multi-byte UTF-8 sequence, so the
// cut is safe before decoding.
function wholeLinesFrom(file: string, maxBytes: number): string[] {
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    const read = fs.readSync(fd, buffer, 0, maxBytes, 0);
    const bytes = buffer.subarray(0, read);
    const end = read < maxBytes ? read : bytes.lastIndexOf(NEWLINE) + 1;
    return bytes.subarray(0, end).toString('utf-8').split('\n');
  } finally {
    fs.closeSync(fd);
  }
}

// The entry's place when it records a non-empty `cwd`.
function placeOf(entry: unknown): StartPlace | undefined {
  if (!isRecord(entry)) return undefined;
  const { cwd, gitBranch } = entry;
  if (typeof cwd !== 'string' || cwd === '') return undefined;
  // git forbids a branch named HEAD, or an empty name; Claude Code writes HEAD
  // for a detached HEAD.
  const isBranch =
    typeof gitBranch === 'string' && gitBranch !== 'HEAD' && gitBranch !== '';
  const branch = isBranch ? gitBranch : undefined;
  return { cwd, gitBranch: branch };
}

/**
 * Where the session started, from the first entry in the transcript's first
 * `maxBytes` that carries a `cwd`: the opening entries are queue operations
 * with none. Only whole lines count. None when the file is missing or
 * unreadable, or holds no such entry within the bound.
 */
export function firstPlace(
  file: string,
  maxBytes = 256 * 1024,
): StartPlace | undefined {
  try {
    return wholeLinesFrom(file, maxBytes)
      .map((line) => placeOf(parsedLine(line)))
      .find((place) => place !== undefined);
  } catch {
    return undefined;
  }
}
