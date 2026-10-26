// The desk's tree, pure: merges each snapshot row with its session's live
// published key, and orders the sessions the pane draws.

import { firstLine } from '../failures';
import {
  isIdleActivity,
  isLive,
  type PublishedSession,
} from '../publish/contract';
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
  /** The profile its live key names. */
  profile?: string;
}

/** A session that is neither this main nor one of its workers. */
export interface TreeOther extends TreeSession {
  repo: string;
  /** Whether its live key says it is a main. */
  isMain: boolean;
  subagents: Subagent[];
}

/** A session elsewhere, with the workers its live key's main names nested under it when it is a main: waiting first. */
export interface TreeElsewhere extends TreeOther {
  workers: TreeOther[];
}

export interface TreeChild extends TreeSession {
  unintegrated: number;
  uncommitted: boolean;
  subagents: Subagent[];
}

export interface TreeRoot {
  name?: string;
  repo?: string;
  workers: number;
  needYou: number;
}

export interface DeskTree {
  /** Sessions elsewhere that need the operator, or whose nested worker does, drawn above this main. */
  waiting: TreeElsewhere[];
  root: TreeRoot;
  /** This main's workers: waiting first, then working, then the rest. */
  children: TreeChild[];
  /** The other sessions, in the listing's order. */
  others: TreeElsewhere[];
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

// The CLI's reasons when the listing names none; like the state word, they say nothing the status does not.
const FALLBACK_REASONS: ReadonlySet<string> = new Set(['waiting', 'blocked']);

// What Claude Code's background service writes as `needs` for a session idle at its prompt (2.1.310).
const GENERIC_NEEDS: ReadonlySet<string> = new Set(['send a prompt to start']);

// While a session waits: what it needs, else what it last asked, else a reason that says more than the status.
function waitText(
  row: { needs?: string; asked?: string; reason?: string; state: string },
  entry: DeskWaiting | undefined,
): string | undefined {
  const reason = row.reason ?? entry?.reason;
  const isTellingReason =
    reason !== undefined &&
    reason !== '' &&
    reason !== row.state &&
    !FALLBACK_REASONS.has(reason);
  const needs = row.needs?.trim();
  const isTellingNeeds = needs !== undefined && !GENERIC_NEEDS.has(needs);
  return (
    (isTellingNeeds ? row.needs : undefined) ??
    row.asked ??
    entry?.asked ??
    (isTellingReason ? reason : undefined)
  );
}

// An idle line says less than job state's detail, which then comes first.
function doingOf(
  activity: string | undefined,
  detail: string | undefined,
): (string | undefined)[] {
  const isIdle = activity !== undefined && isIdleActivity(activity);
  return isIdle && detail !== undefined
    ? [detail, activity]
    : [activity, detail];
}

// Text from outside may hold a question or a report; a row is one line.
function firstLineOf(text: string | undefined): string | undefined {
  return text === undefined ? undefined : firstLine(text);
}

function workOf(
  status: Status,
  waits: string | undefined,
  doing: (string | undefined)[],
): string | undefined {
  const lines = status.kind === 'needs' ? [waits, ...doing] : doing;
  return lines.map(firstLineOf).find((line) => line !== undefined);
}

function subagentsOf(key: PublishedSession | undefined): Subagent[] {
  return (key?.subagents ?? []).map((subagent) => ({
    ...subagent,
    description: firstLineOf(subagent.description) ?? '',
  }));
}

function contextOf(
  key: PublishedSession | undefined,
  tokens: number | undefined,
): Context | undefined {
  if (key?.context !== undefined) return key.context;
  return tokens === undefined ? undefined : { used: tokens };
}

function profileOf(key: PublishedSession | undefined): { profile?: string } {
  return key?.profile === undefined ? {} : { profile: key.profile };
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
  const doing = [...doingOf(key?.activity, child.detail), child.plan];
  return {
    ...sessionOf(
      child.name,
      status,
      workOf(status, waitText(child, entry), doing),
      contextOf(key, child.tokens),
    ),
    ...profileOf(key),
    unintegrated: child.unintegrated,
    uncommitted: child.uncommitted,
    subagents: subagentsOf(key),
  };
}

// A session elsewhere, and the main its live key names, which nests it.
interface Placed {
  session: TreeOther;
  main: string | undefined;
}

function otherOf(
  other: DeskOther,
  waiting: readonly DeskWaiting[],
  keys: Keys,
  now: number,
): Placed {
  const entry = waiting.find(
    (session) => !session.child && isSameSession(session, other),
  );
  const status = statusOf(other.state, entry !== undefined);
  const key = liveKey(keys, other, now);
  const doing = doingOf(key?.activity, other.detail);
  const session: TreeOther = {
    ...sessionOf(
      other.name,
      status,
      workOf(status, waitText(other, entry), doing),
      contextOf(key, undefined),
    ),
    ...profileOf(key),
    repo: other.repo,
    isMain: key?.role === 'main',
    subagents: subagentsOf(key),
  };
  return { session, main: key?.main };
}

// Waiting, then working, then the rest; each group keeps the given order.
function ordered<T extends { status: Status }>(sessions: T[]): T[] {
  return sessions
    .map((session, index) => ({ session, index }))
    .sort(
      (a, b) =>
        STATUS_RANKS[a.session.status.kind] -
          STATUS_RANKS[b.session.status.kind] || a.index - b.index,
    )
    .map(({ session }) => session);
}

// One level: a worker nests under the first listed main of the name its key
// gives, and a main never nests. The rest stay in the listing's order.
function nested(placed: readonly Placed[]): TreeElsewhere[] {
  // Reversed, so the first listed main of a name is the one the Map keeps.
  const mains = new Map(
    placed
      .flatMap(({ session }, index): [string, number][] =>
        session.isMain ? [[session.name, index]] : [],
      )
      .reverse(),
  );
  const hostOf = ({ session, main }: Placed): number | undefined =>
    session.isMain || main === undefined ? undefined : mains.get(main);
  return placed.flatMap((entry, index): TreeElsewhere[] =>
    hostOf(entry) === undefined
      ? [
          {
            ...entry.session,
            workers: ordered(
              placed
                .filter((worker) => hostOf(worker) === index)
                .map(({ session }) => session),
            ),
          },
        ]
      : [],
  );
}

function needsYou(session: TreeElsewhere): boolean {
  return [session, ...session.workers].some(
    ({ status }) => status.kind === 'needs',
  );
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
  const elsewhere = nested(
    snapshot.others.map((other) => otherOf(other, snapshot.waiting, keys, now)),
  );
  const name = snapshot.self?.name;
  const { repo } = snapshot;
  return {
    waiting: elsewhere.filter(needsYou),
    root: {
      ...(name === undefined ? {} : { name }),
      ...(repo === undefined ? {} : { repo }),
      workers: children.length,
      needYou: children.filter((child) => child.status.kind === 'needs').length,
    },
    children,
    others: elsewhere.filter((session) => !needsYou(session)),
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
