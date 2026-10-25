/**
 * Job state for the desk's pane: `<config dir>/jobs/<id>/state.json` of each
 * background row. The file is Claude Code's, not ours, so it is read
 * leniently: only `detail` and `needs` count, and a field of another type is
 * dropped with one warning line for the file.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ListingRow } from './desk-snapshot.js';

export interface JobState {
  detail?: string;
  needs?: string;
}

export interface JobStates {
  /** Keyed by the listing row's job id; a row with no readable file has no entry. */
  states: ReadonlyMap<string, JobState>;
  /** For the pane only: job state never reaches the band. */
  warnings: string[];
}

type Read = { state: JobState; warnings: string[] } | { warnings: string[] };

const reason = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

// Interactive sessions have no job folder, so a missing path is silent.
const isMissing = (e: unknown): boolean =>
  e instanceof Error &&
  'code' in e &&
  (e.code === 'ENOENT' || e.code === 'ENOTDIR');

// The id names a folder under `jobs/`, never a path out of it.
const isFolderName = (id: string): boolean =>
  id !== '' && id !== '.' && id !== '..' && path.basename(id) === id;

function parseJson(text: string): { value: unknown } | undefined {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// `needs` counts only while the listing reads blocked.
function stateOf(
  content: Record<string, unknown>,
  blocked: boolean,
): { state: JobState; wrong: string[] } {
  const { detail, needs } = content;
  const wanted: [string, unknown][] = [
    ['detail', detail],
    ...(blocked ? [['needs', needs] as [string, unknown]] : []),
  ];
  const wrong = wanted
    .filter(([, value]) => value !== undefined && typeof value !== 'string')
    .map(([key]) => `${key} is not a string`);
  return {
    state: {
      ...(typeof detail === 'string' ? { detail } : {}),
      ...(blocked && typeof needs === 'string' ? { needs } : {}),
    },
    wrong,
  };
}

function readOne(file: string, who: string, blocked: boolean): Read {
  const text = (() => {
    try {
      return fs.readFileSync(file, 'utf8');
    } catch (e) {
      return isMissing(e)
        ? undefined
        : { failed: `${who}: its job state was not read: ${reason(e)}` };
    }
  })();
  if (text === undefined) return { warnings: [] };
  if (typeof text !== 'string') return { warnings: [text.failed] };
  const json = parseJson(text);
  if (json === undefined)
    return { warnings: [`${who}: its job state is not JSON`] };
  if (!isRecord(json.value)) {
    return { warnings: [`${who}: its job state is not a JSON object`] };
  }
  const { state, wrong } = stateOf(json.value, blocked);
  return {
    state,
    warnings:
      wrong.length === 0
        ? []
        : [`${who}: its job state changed shape: ${wrong.join(', ')}`],
  };
}

/** Reads job state for each background row that has an id. */
export function readJobStates(
  configDir: string,
  rows: ListingRow[],
): JobStates {
  const reads = rows.flatMap((row) => {
    const { id } = row;
    if (row.kind !== 'background' || id === undefined || !isFolderName(id)) {
      return [];
    }
    const file = path.join(configDir, 'jobs', id, 'state.json');
    return [
      { id, read: readOne(file, row.name ?? id, row.state === 'blocked') },
    ];
  });
  return {
    states: new Map(
      reads.flatMap(({ id, read }) =>
        'state' in read ? [[id, read.state] as [string, JobState]] : [],
      ),
    ),
    warnings: reads.flatMap(({ read }) => read.warnings),
  };
}
