// The desk's tree, pure: merges each snapshot row with its session's live
// published key, and orders the sessions the pane draws.

import { isLive, type PublishedSession } from '../publish/contract';
import type {
  DeskChild,
  DeskOther,
  DeskSession,
  DeskSnapshot,
  DeskWaiting,
} from './contract';

type OkSnapshot = Extract<DeskSnapshot, { ok: true }>;

type Subagent = PublishedSession['subagents'][number];

/** Where a session stands: it needs the operator, works, is done, idles, or reads the listing's own word. */
export type Status =
  | { kind: 'needs' }
  | { kind: 'working' }
  | { kind: 'done' }
  | { kind: 'idle' }
  | { kind: 'other'; word: string };

/** A session's context: its tokens, and the limit a live key published, if any. */
export interface Context {
  used: number;
  limit?: number;
}

export interface TreeSession {
  name: string;
  status: Status;
  /** One line: what it needs while it waits, else what it is doing. */
  work?: string;
  context?: Context;
}

/** A session that is neither this main nor one of its workers. */
export interface TreeOther extends TreeSession {
  repo: string;
  /** Whether its live key says it is a main. */
  isMain: boolean;
}

export interface TreeChild extends TreeSession {
  unintegrated: number;
  uncommitted: boolean;
  subagents: Subagent[];
}

export interface TreeRoot {
  name?: string;
  workers: number;
  needYou: number;
}

export interface DeskTree {
  /** Sessions elsewhere that need the operator, drawn above this main. */
  waiting: TreeOther[];
  root: TreeRoot;
  /** This main's workers: waiting first, then working, then the rest. */
  children: TreeChild[];
  /** The other sessions, in the listing's order. */
  others: TreeOther[];
}

type Keys = ReadonlyMap<string, PublishedSession>;

// A Map, since the listing's word is outside data and a plain object would answer `constructor`.
const WORD_STATUSES: ReadonlyMap<string, Status> = new Map<string, Status>([
  ['blocked', { kind: 'needs' }],
  ['working', { kind: 'working' }],
  ['busy', { kind: 'working' }],
  ['done', { kind: 'done' }],
  ['idle', { kind: 'idle' }],
]);

const STATUS_RANKS: Record<Status['kind'], number> = {
  needs: 0,
  working: 1,
  done: 2,
  idle: 2,
  other: 2,
};

function statusOf(state: string, isWaiting: boolean): Status {
  if (isWaiting) return { kind: 'needs' };
  return WORD_STATUSES.get(state) ?? { kind: 'other', word: state };
}

// The listing names a session by id where it has one, else by name.
function isSameSession(
  a: { name: string; sessionId?: string },
  b: { name: string; sessionId?: string },
): boolean {
  return a.sessionId !== undefined && b.sessionId !== undefined
    ? a.sessionId === b.sessionId
    : a.name === b.name;
}

function liveKey(
  keys: Keys,
  row: DeskSession,
  now: number,
): PublishedSession | undefined {
  if (row.sessionId === undefined) return undefined;
  const key = keys.get(row.sessionId);
  return key !== undefined && isLive(key, row, now) ? key : undefined;
}

// The snapshot gives the state word as the reason when the listing names none,
// and that says nothing the status does not.
function waitText(
  row: { needs?: string; reason?: string; state: string },
  entry: DeskWaiting | undefined,
): string | undefined {
  const reason = row.reason ?? entry?.reason;
  const isTelling =
    reason !== undefined && reason !== '' && reason !== row.state;
  return row.needs ?? (isTelling ? reason : undefined);
}

function workOf(
  status: Status,
  waits: string | undefined,
  doing: (string | undefined)[],
): string | undefined {
  const lines = status.kind === 'needs' ? [waits, ...doing] : doing;
  return lines.find((line) => line !== undefined);
}

function contextOf(
  key: PublishedSession | undefined,
  tokens: number | undefined,
): Context | undefined {
  if (key?.context !== undefined) return key.context;
  return tokens === undefined ? undefined : { used: tokens };
}

// Absent fields stay absent, so a row compares and prints as it reads.
function sessionOf(
  name: string,
  status: Status,
  work: string | undefined,
  context: Context | undefined,
): TreeSession {
  return {
    name,
    status,
    ...(work === undefined ? {} : { work }),
    ...(context === undefined ? {} : { context }),
  };
}

function childOf(
  child: DeskChild,
  waiting: readonly DeskWaiting[],
  keys: Keys,
  now: number,
): TreeChild {
  const entry = waiting.find(
    (session) => session.child && isSameSession(session, child),
  );
  const status = statusOf(child.state, entry !== undefined);
  const key = liveKey(keys, child, now);
  const doing = [key?.activity, child.detail, child.plan];
  return {
    ...sessionOf(
      child.name,
      status,
      workOf(status, waitText(child, entry), doing),
      contextOf(key, child.tokens),
    ),
    unintegrated: child.unintegrated,
    uncommitted: child.uncommitted,
    subagents: key?.subagents ?? [],
  };
}

function otherOf(
  other: DeskOther,
  waiting: readonly DeskWaiting[],
  keys: Keys,
  now: number,
): TreeOther {
  const entry = waiting.find(
    (session) => !session.child && isSameSession(session, other),
  );
  const status = statusOf(other.state, entry !== undefined);
  const key = liveKey(keys, other, now);
  const doing = [key?.activity, other.detail];
  return {
    ...sessionOf(
      other.name,
      status,
      workOf(status, waitText(other, entry), doing),
      contextOf(key, undefined),
    ),
    repo: other.repo,
    isMain: key?.role === 'main',
  };
}

// Waiting, then working, then the rest; each group keeps the snapshot's order.
function ordered(children: TreeChild[]): TreeChild[] {
  return children
    .map((child, index) => ({ child, index }))
    .sort(
      (a, b) =>
        STATUS_RANKS[a.child.status.kind] - STATUS_RANKS[b.child.status.kind] ||
        a.index - b.index,
    )
    .map(({ child }) => child);
}

/** The pane's sessions, each merged with its live key: a key whose row has no pid, or that is stale, reads as none. */
export function deskTree(
  snapshot: OkSnapshot,
  keys: Keys,
  now: number,
): DeskTree {
  const children = ordered(
    snapshot.children.map((child) =>
      childOf(child, snapshot.waiting, keys, now),
    ),
  );
  const others = snapshot.others.map((other) =>
    otherOf(other, snapshot.waiting, keys, now),
  );
  const name = snapshot.self?.name;
  return {
    waiting: others.filter((other) => other.status.kind === 'needs'),
    root: {
      ...(name === undefined ? {} : { name }),
      workers: children.length,
      needYou: children.filter((child) => child.status.kind === 'needs').length,
    },
    children,
    others: others.filter((other) => other.status.kind !== 'needs'),
  };
}

/** The keys the tree merges: those of its children and other sessions that pass `isLive`, in the snapshot's order. */
export function liveKeys(
  snapshot: OkSnapshot,
  keys: Keys,
  now: number,
): Map<string, PublishedSession> {
  const rows: DeskSession[] = [...snapshot.children, ...snapshot.others];
  return new Map(
    rows.flatMap((row): [string, PublishedSession][] => {
      const key = liveKey(keys, row, now);
      return key === undefined ? [] : [[key.sessionId, key]];
    }),
  );
}
