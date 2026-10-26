/**
 * The desk's snapshot: classifies the rows of `claude agents --json --all`,
 * joins them to the worker records, and orders the result. Pure: the caller
 * reads the listing, the records, git, and the transcripts.
 */

import type {
  DeskChild,
  DeskOther,
  DeskSession,
  DeskSnapshot,
  DeskWaiting,
} from '../../plugin/hooks/desk/contract.js';
import { DESK_VERSION } from '../../plugin/hooks/desk/contract.js';
import type { JobState, JobStates } from './desk-jobs.js';
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
  /** Reads job state for the rows the snapshot draws: the current ones, and the rows of this main's children. */
  readJobs: (rows: ListingRow[]) => JobStates;
  /** What a waiting session last said: the first line of its last assistant message. Asked for waiting rows only. */
  readAsked: (sessionId: string) => string | undefined;
  /** The caller's sessionId: its row becomes `self`, and it chooses the children. */
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

const hasProcess = (row: ListingRow): boolean => row.pid !== undefined;

// The states in which a background row stays current after its process exits.
const CURRENT_WITHOUT_PROCESS: ReadonlySet<string> = new Set([
  'working',
  'blocked',
]);

// A row is current while it carries a pid, or while it is a background row
// still working or blocked: the rule `claude agents --json` uses without
// `--all` (agent-view docs, §List sessions as JSON).
export const isCurrent = (row: ListingRow): boolean =>
  hasProcess(row) ||
  (row.kind === 'background' && CURRENT_WITHOUT_PROCESS.has(row.state ?? ''));

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
  if (!isCurrent(row)) return { class: 'neither' };
  const stateClass =
    row.kind === 'background' && row.state !== undefined
      ? STATE_CLASS.get(row.state)
      : undefined;
  if (stateClass === 'waiting') {
    return { class: 'waiting', reason: row.waitingFor ?? 'blocked' };
  }
  // Current without a process, the row is a background one still working.
  if (!hasProcess(row)) return { class: 'neither' };
  if (row.status === 'waiting') {
    return { class: 'waiting', reason: row.waitingFor ?? 'waiting' };
  }
  if (stateClass === 'finished') return { class: 'finished' };
  const isFreshIdle =
    row.kind === 'interactive' &&
    row.status === 'idle' &&
    row.sessionId !== undefined &&
    fresh.has(row.sessionId);
  return { class: isFreshIdle ? 'finished' : 'neither' };
}

// The agent-view docs give `pid` and `status` together, only while the process
// is alive, so a missing status is a shape change only beside a pid.
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
    ...(hasProcess(row) && row.status === undefined
      ? shape('row with a pid has no status')
      : []),
    ...(row.kind === 'background' && row.state === undefined
      ? shape('background row has no state')
      : []),
  ];
}

/**
 * The record's row: by job id only when it has one, else by name, preferring
 * a current row, since `--all` keeps old rows of the same name.
 */
export function joinRow(
  record: WorkerRecord,
  rows: ListingRow[],
): ListingRow | undefined {
  if (record.job !== null) return rows.find((row) => row.id === record.job);
  const named = rows.filter((row) => row.name === record.name);
  return named.find(isCurrent) ?? named[0];
}

const ID_PREFIX_LENGTH = 8;

// What the snapshot reads beyond the listing: job state by job id, and what each waiting row's session asked.
interface RowFacts {
  jobs: ReadonlyMap<string, JobState>;
  asked: ReadonlyMap<ListingRow, string>;
}

// What the listing, job state, and a waiting session's transcript say about
// one row; a child with no row has only `hasPid: false`.
function sessionOf(row: ListingRow | undefined, known: RowFacts): DeskSession {
  if (row === undefined) return { hasPid: false };
  const job = row.id === undefined ? undefined : known.jobs.get(row.id);
  const asked = known.asked.get(row);
  return {
    ...(row.sessionId === undefined ? {} : { sessionId: row.sessionId }),
    ...(row.kind === undefined ? {} : { kind: row.kind }),
    hasPid: hasProcess(row),
    ...(row.status === undefined ? {} : { status: row.status }),
    ...(row.waitingFor === undefined ? {} : { waitingFor: row.waitingFor }),
    ...(job?.detail === undefined ? {} : { detail: job.detail }),
    ...(job?.needs === undefined ? {} : { needs: job.needs }),
    ...(asked === undefined ? {} : { asked }),
  };
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
  known: RowFacts,
): JoinedChild {
  const classified: Classified = row
    ? classify(row, fresh)
    : { class: 'neither' };
  const { reason } = classified;
  const isWorking =
    row !== undefined &&
    isCurrent(row) &&
    (row.state === 'working' || row.status === 'busy');
  const session = sessionOf(row, known);
  const child: DeskChild = {
    ...session,
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
      ...session,
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

// The names a record's `main` may hold for the caller: its listing name, or its id prefix.
function mainNames(
  self: string | undefined,
  selfRow: ListingRow | undefined,
): string[] {
  if (self === undefined) return [];
  return [
    ...(selfRow?.name === undefined ? [] : [selfRow.name]),
    self.slice(0, ID_PREFIX_LENGTH),
  ];
}

// The names a record's `main` may hold for a listing row: its name, or its id prefix.
const rowNames = (row: ListingRow): string[] => [
  ...(row.name === undefined ? [] : [row.name]),
  ...(row.sessionId === undefined
    ? []
    : [row.sessionId.slice(0, ID_PREFIX_LENGTH)]),
];

// A record whose row is the caller's own session is left out with it. With a
// caller, only its own workers and those of no live main are children.
interface OwnRecord {
  record: WorkerRecord;
  row: ListingRow | undefined;
}

function ownRecords(
  input: SnapshotInput,
  selfRow: ListingRow | undefined,
): OwnRecord[] {
  const names = mainNames(input.self, selfRow);
  const live = input.rows.filter(isCurrent).flatMap(rowNames);
  // A worker whose main is gone from the listing must stay on a desk, for its marks.
  const isOrphan = (main: string): boolean => !live.includes(main);
  const isMine = (record: WorkerRecord): boolean =>
    input.self === undefined ||
    record.main === null ||
    names.includes(record.main) ||
    isOrphan(record.main);
  return input.records
    .filter(isMine)
    .map((record) => ({ record, row: joinRow(record, input.rows) }))
    .filter(
      ({ row }) => input.self === undefined || row?.sessionId !== input.self,
    );
}

function joinChildren(
  own: OwnRecord[],
  input: SnapshotInput,
  known: RowFacts,
): JoinedChild[] {
  return orderChildren(
    own.map(({ record, row }) =>
      joinChild(
        record,
        row,
        input.facts.get(record.name),
        input.freshInteractive,
        known,
      ),
    ),
  );
}

function otherOf(
  row: ListingRow,
  classified: Classified,
  known: RowFacts,
): DeskOther {
  const reason = classified.reason ?? row.waitingFor;
  return {
    ...sessionOf(row, known),
    name: displayName(row),
    repo: repoOf(row.cwd),
    kind: row.kind ?? 'unknown',
    state: row.state ?? row.status ?? 'unknown',
    ...(reason === undefined ? {} : { reason }),
  };
}

// What each waiting row's session last said; no other row is read, nor the
// caller's own, whose row draws no work line.
function askedRows(input: SnapshotInput): Map<ListingRow, string> {
  return new Map(
    input.rows.flatMap((row): [ListingRow, string][] => {
      const isWaiting =
        classify(row, input.freshInteractive).class === 'waiting';
      const { sessionId } = row;
      if (!isWaiting || sessionId === undefined) return [];
      if (sessionId === input.self) return [];
      const asked = input.readAsked(sessionId);
      return asked === undefined ? [] : [[row, asked]];
    }),
  );
}

export function buildSnapshot(input: SnapshotInput): DeskSnapshot {
  const selfRow =
    input.self === undefined
      ? undefined
      : input.rows.find((row) => row.sessionId === input.self);
  const own = ownRecords(input, selfRow);
  // A done child has no pid, so it is not current, yet its row is drawn.
  const ownRows = new Set(own.flatMap(({ row }) => (row ? [row] : [])));
  const read = input.readJobs(
    input.rows.filter((row) => isCurrent(row) || ownRows.has(row)),
  );
  const known: RowFacts = { jobs: read.states, asked: askedRows(input) };
  const children = joinChildren(own, input, known);
  const childRows = new Set(children.flatMap(({ row }) => (row ? [row] : [])));
  const others = input.rows
    .filter((row) => isCurrent(row) && !childRows.has(row))
    .filter((row) => input.self === undefined || row.sessionId !== input.self)
    .map((row) => ({ row, classified: classify(row, input.freshInteractive) }));
  const self =
    selfRow === undefined
      ? undefined
      : otherOf(selfRow, classify(selfRow, input.freshInteractive), known);
  const considered = [...childRows, ...others.map(({ row }) => row)];
  const warnings = [
    ...new Set([...input.warnings, ...considered.flatMap(rowWarnings)]),
  ];
  const waitingOthers: DeskWaiting[] = others
    .filter(({ classified }) => classified.class === 'waiting')
    .map(({ row, classified }) => ({
      ...sessionOf(row, known),
      name: displayName(row),
      repo: repoOf(row.cwd),
      reason: classified.reason ?? 'waiting',
      child: false,
    }));
  return {
    version: DESK_VERSION,
    ok: true,
    ...(input.repo === undefined ? {} : { repo: input.repo }),
    ...(self === undefined ? {} : { self }),
    waiting: [
      ...children.flatMap(({ waiting }) => (waiting ? [waiting] : [])),
      ...waitingOthers,
    ],
    children: children.map(({ child }) => child),
    finished: others.filter(({ classified }) => classified.class === 'finished')
      .length,
    others: others.map(({ row, classified }) =>
      otherOf(row, classified, known),
    ),
    warnings,
    paneWarnings: read.warnings,
    sessionIds: [
      ...new Set(input.rows.flatMap(({ sessionId }) => sessionId ?? [])),
    ],
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
