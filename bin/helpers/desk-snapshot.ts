/**
 * The desk's snapshot: classifies the rows of `claude agents --json --all`,
 * joins them to the worker records, and orders the result. Pure: the caller
 * reads the listing, the records, git, and the transcripts.
 */

import type {
  DeskChild,
  DeskOther,
  DeskSnapshot,
  DeskWaiting,
} from '../../plugin/hooks/desk/contract.js';
import { DESK_VERSION } from '../../plugin/hooks/desk/contract.js';
import type { WorkerRecord } from './worker-record.js';

/** One listing row, parsed leniently: every field optional, values kept raw. */
export interface ListingRow {
  id?: string;
  sessionId?: string;
  name?: string;
  kind?: string;
  cwd?: string;
  pid?: number;
  state?: string;
  status?: string;
  waitingFor?: string;
}

/** What git and the transcript say about one child; absent fields were not available. */
export interface ChildFacts {
  worktreeExists: boolean;
  tokens?: number;
  plan?: string;
  lastCommit?: string;
  unintegrated: number;
  uncommitted: boolean;
}

export interface SnapshotInput {
  rows: ListingRow[];
  records: WorkerRecord[];
  /** Keyed by record name. */
  facts: ReadonlyMap<string, ChildFacts>;
  /** SessionIds whose transcript changed within the freshness window. */
  freshInteractive: ReadonlySet<string>;
  /** The caller's sessionId, left out. */
  self?: string;
  /** The caller's main checkout folder name; absent outside a repository. */
  repo?: string;
  warnings: string[];
}

type Class = 'waiting' | 'finished' | 'neither';

// The values the probes measured (docs/research/control-centre/2026-10-15-desk-probes.md
// §The listing, state by state). A value outside these tables is kept and warned about.
const STATE_CLASS: ReadonlyMap<string, Class> = new Map([
  ['working', 'neither'],
  ['blocked', 'waiting'],
  ['done', 'finished'],
  ['stopped', 'neither'],
  ['failed', 'neither'],
]);
const KNOWN_STATUSES: ReadonlySet<string> = new Set([
  'idle',
  'busy',
  'waiting',
]);
const KNOWN_KINDS: ReadonlySet<string> = new Set(['background', 'interactive']);

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

function parseRow(entry: Record<string, unknown>): ListingRow {
  const fields = {
    id: optionalString(entry.id),
    sessionId: optionalString(entry.sessionId),
    name: optionalString(entry.name),
    kind: optionalString(entry.kind),
    cwd: optionalString(entry.cwd),
    pid: typeof entry.pid === 'number' ? entry.pid : undefined,
    state: optionalString(entry.state),
    status: optionalString(entry.status),
    waitingFor: optionalString(entry.waitingFor),
  };
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The listing's JSON array as rows, and a warning per shape change (spec §2, the last two rows of Classification). */
export function parseListingRows(value: unknown): {
  rows: ListingRow[];
  warnings: string[];
} {
  if (!Array.isArray(value)) {
    return { rows: [], warnings: ['the listing is not an array'] };
  }
  const entries: unknown[] = value;
  return {
    rows: entries.filter(isRecord).map(parseRow),
    warnings: entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => !isRecord(entry))
      .map(({ index }) => `the listing's entry ${index} is not an object`),
  };
}

// A row is live when it carries a pid.
const isLive = (row: ListingRow): boolean => row.pid !== undefined;

const displayName = (row: ListingRow): string =>
  row.name ?? row.sessionId?.slice(0, 8) ?? row.id ?? 'unknown';

const WORKTREE_SUFFIX = /\/\.claude\/worktrees\/[^/]+\/?$/;

// The last folder of `cwd`, with a trailing `.claude/worktrees/<name>` removed.
function repoOf(cwd: string | undefined): string {
  if (cwd === undefined) return '';
  const top = cwd.replace(WORKTREE_SUFFIX, '').replace(/\/+$/, '');
  return top.slice(top.lastIndexOf('/') + 1);
}

interface Classified {
  class: Class;
  reason?: string;
}

function classify(row: ListingRow, fresh: ReadonlySet<string>): Classified {
  if (!isLive(row)) return { class: 'neither' };
  if (row.status === 'waiting') {
    return { class: 'waiting', reason: row.waitingFor ?? 'waiting' };
  }
  const stateClass =
    row.kind === 'background' && row.state !== undefined
      ? STATE_CLASS.get(row.state)
      : undefined;
  if (stateClass === 'waiting') {
    return { class: 'waiting', reason: row.waitingFor ?? 'blocked' };
  }
  if (stateClass === 'finished') return { class: 'finished' };
  const isFreshIdle =
    row.kind === 'interactive' &&
    row.status === 'idle' &&
    row.sessionId !== undefined &&
    fresh.has(row.sessionId);
  return { class: isFreshIdle ? 'finished' : 'neither' };
}

function rowWarnings(row: ListingRow): string[] {
  const who = displayName(row);
  const unknown = (field: string, value: string | undefined, known: boolean) =>
    value !== undefined && !known
      ? [`${who}: the listing has an unknown ${field} "${value}"`]
      : [];
  const shape = (missing: string) => [
    `${who}: the listing's shape changed, a ${missing}`,
  ];
  return [
    ...unknown('kind', row.kind, KNOWN_KINDS.has(row.kind ?? '')),
    ...unknown('state', row.state, STATE_CLASS.has(row.state ?? '')),
    ...unknown('status', row.status, KNOWN_STATUSES.has(row.status ?? '')),
    ...(isLive(row) && row.status === undefined
      ? shape('live row has no status')
      : []),
    ...(row.kind === 'background' && row.state === undefined
      ? shape('background row has no state')
      : []),
  ];
}

/**
 * The record's row: by job id only when it has one, else by name, preferring
 * a live row, since `--all` keeps old rows of the same name.
 */
export function joinRow(
  record: WorkerRecord,
  rows: ListingRow[],
): ListingRow | undefined {
  if (record.job !== null) return rows.find((row) => row.id === record.job);
  const named = rows.filter((row) => row.name === record.name);
  return named.find(isLive) ?? named[0];
}

interface JoinedChild {
  child: DeskChild;
  rank: number;
  row?: ListingRow;
  waiting?: DeskWaiting;
}

const RANK_WAITING = 0;
const RANK_WORKING = 1;
const RANK_REST = 2;

function joinChild(
  record: WorkerRecord,
  row: ListingRow | undefined,
  facts: ChildFacts | undefined,
  fresh: ReadonlySet<string>,
): JoinedChild {
  const classified: Classified = row
    ? classify(row, fresh)
    : { class: 'neither' };
  const { reason } = classified;
  const isWorking =
    row !== undefined &&
    isLive(row) &&
    (row.state === 'working' || row.status === 'busy');
  const child: DeskChild = {
    name: record.name,
    state: row ? (row.state ?? row.status ?? 'unknown') : 'gone',
    ...(reason === undefined ? {} : { reason }),
    ...(facts?.tokens === undefined ? {} : { tokens: facts.tokens }),
    ...(facts?.plan === undefined ? {} : { plan: facts.plan }),
    ...(facts?.lastCommit === undefined
      ? {}
      : { lastCommit: facts.lastCommit }),
    unintegrated: facts?.unintegrated ?? 0,
    uncommitted: facts?.uncommitted ?? false,
  };
  if (classified.class === 'waiting') {
    const waiting: DeskWaiting = {
      name: record.name,
      repo: repoOf(row?.cwd),
      reason: reason ?? 'waiting',
      child: true,
    };
    return { child, row, rank: RANK_WAITING, waiting };
  }
  return { child, row, rank: isWorking ? RANK_WORKING : RANK_REST };
}

// Waiting, then working, then the rest; each group keeps record order.
function orderChildren(children: JoinedChild[]): JoinedChild[] {
  return children
    .map((joined, index) => ({ joined, index }))
    .sort((a, b) => a.joined.rank - b.joined.rank || a.index - b.index)
    .map(({ joined }) => joined);
}

// A record whose row is the caller's own session is left out with it.
function joinChildren(input: SnapshotInput): JoinedChild[] {
  const joined = input.records
    .map((record) => ({ record, row: joinRow(record, input.rows) }))
    .filter(
      ({ row }) => input.self === undefined || row?.sessionId !== input.self,
    )
    .map(({ record, row }) =>
      joinChild(
        record,
        row,
        input.facts.get(record.name),
        input.freshInteractive,
      ),
    );
  return orderChildren(joined);
}

function otherOf(row: ListingRow, classified: Classified): DeskOther {
  const reason = classified.reason ?? row.waitingFor;
  return {
    name: displayName(row),
    repo: repoOf(row.cwd),
    kind: row.kind ?? 'unknown',
    state: row.state ?? row.status ?? 'unknown',
    ...(reason === undefined ? {} : { reason }),
  };
}

export function buildSnapshot(input: SnapshotInput): DeskSnapshot {
  const children = joinChildren(input);
  const childRows = new Set(children.flatMap(({ row }) => (row ? [row] : [])));
  const others = input.rows
    .filter((row) => isLive(row) && !childRows.has(row))
    .filter((row) => input.self === undefined || row.sessionId !== input.self)
    .map((row) => ({ row, classified: classify(row, input.freshInteractive) }));
  const considered = [...childRows, ...others.map(({ row }) => row)];
  const warnings = [
    ...new Set([...input.warnings, ...considered.flatMap(rowWarnings)]),
  ];
  const waitingOthers: DeskWaiting[] = others
    .filter(({ classified }) => classified.class === 'waiting')
    .map(({ row, classified }) => ({
      name: displayName(row),
      repo: repoOf(row.cwd),
      reason: classified.reason ?? 'waiting',
      child: false,
    }));
  return {
    version: DESK_VERSION,
    ok: true,
    ...(input.repo === undefined ? {} : { repo: input.repo }),
    waiting: [
      ...children.flatMap(({ waiting }) => (waiting ? [waiting] : [])),
      ...waitingOthers,
    ],
    children: children.map(({ child }) => child),
    finished: others.filter(({ classified }) => classified.class === 'finished')
      .length,
    others: others.map(({ row, classified }) => otherOf(row, classified)),
    warnings,
  };
}

/** Names of records whose job is gone from the `--all` listing and whose worktree no longer exists. */
export function staleRecordNames(
  rows: ListingRow[],
  records: WorkerRecord[],
  facts: ReadonlyMap<string, ChildFacts>,
): string[] {
  return records
    .filter(
      (record) =>
        joinRow(record, rows) === undefined &&
        facts.get(record.name)?.worktreeExists === false,
    )
    .map((record) => record.name);
}
