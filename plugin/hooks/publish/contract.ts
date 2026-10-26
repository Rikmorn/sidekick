// What each session publishes about itself in sidekick's `$.store`, and how a
// reader knows a key still speaks for a live session. The publishing mod
// writes it, and the desk mod reads it. This file imports nothing, as the
// other mods' contracts do.

export const PUBLISH_VERSION = 1;

/** How often a session rewrites its key, so `publishedAt` stays fresh while nothing else changes. */
export const HEARTBEAT_MS = 60_000;

/** How old a key may be before readers ignore it: three heartbeats, so one slow or missed beat keeps it. */
export const STALE_MS = 180_000;

const KEY_PREFIX = 'session:';

const IDLE_PREFIX = 'idle since ';

/** The store key a session publishes under. */
export function keyOf(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

export type PublishedSession = {
  version: 1;
  sessionId: string;
  name?: string; // the name the listing gives this session
  role: 'main' | 'worker' | 'other';
  main?: string; // a worker's main, as SIDEKICK_MAIN names it
  profile?: string; // sidekick.profile from the flag settings
  activity?: string; // one line: the latest tool call while a turn runs, else the time the last turn ended
  subagents: { type: string; description: string; status: string }[]; // running, pending, or waiting only; at most 6
  context?: { used: number; limit: number }; // tokens, and the limit the gauge resolved
  publishedAt: number; // epoch ms
};

type Subagent = PublishedSession['subagents'][number];
type Role = PublishedSession['role'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRole(value: unknown): value is Role {
  return value === 'main' || value === 'worker' || value === 'other';
}

function isSubagent(value: unknown): value is Subagent {
  return (
    isRecord(value) &&
    isString(value.type) &&
    isString(value.description) &&
    isString(value.status)
  );
}

function isSubagentList(value: unknown): value is Subagent[] {
  return Array.isArray(value) && value.every(isSubagent);
}

// An optional field: a mistyped one reads as absent.
function optionalString(
  entry: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = entry[key];
  return isString(value) ? value : undefined;
}

function contextOf(value: unknown): PublishedSession['context'] {
  if (!isRecord(value)) return undefined;
  const { used, limit } = value;
  return isFiniteNumber(used) && isFiniteNumber(limit)
    ? { used, limit }
    : undefined;
}

/** The activity a session publishes once its main loop's turn has ended, at `clock`, the local time. */
export function idleActivity(clock: string): string {
  return `${IDLE_PREFIX}${clock}`;
}

/** Whether an activity line is the one `idleActivity` makes. */
export function isIdleActivity(activity: string): boolean {
  return activity.startsWith(IDLE_PREFIX);
}

/** A stored value as a key this version reads, or undefined for another version or a bad shape. */
export function parsePublished(value: unknown): PublishedSession | undefined {
  if (!isRecord(value) || value.version !== PUBLISH_VERSION) return undefined;
  const { sessionId, role, subagents, publishedAt } = value;
  const isShaped =
    isString(sessionId) &&
    sessionId !== '' &&
    isRole(role) &&
    isSubagentList(subagents) &&
    isFiniteNumber(publishedAt);
  if (!isShaped) return undefined;
  const name = optionalString(value, 'name');
  const main = optionalString(value, 'main');
  const profile = optionalString(value, 'profile');
  const activity = optionalString(value, 'activity');
  const context = contextOf(value.context);
  return {
    version: PUBLISH_VERSION,
    sessionId,
    ...(name === undefined ? {} : { name }),
    role,
    ...(main === undefined ? {} : { main }),
    ...(profile === undefined ? {} : { profile }),
    ...(activity === undefined ? {} : { activity }),
    subagents: subagents.map(({ type, description, status }) => ({
      type,
      description,
      status,
    })),
    ...(context === undefined ? {} : { context }),
    publishedAt,
  };
}

/** Whether a key still speaks for its session: the listing holds a row for it with a pid, and the key is no older than `STALE_MS`. */
export function isLive(
  key: PublishedSession,
  row: { hasPid: boolean } | undefined,
  now: number,
): boolean {
  if (row === undefined || !row.hasPid) return false;
  return now - key.publishedAt <= STALE_MS;
}
