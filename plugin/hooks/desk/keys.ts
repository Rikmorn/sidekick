// The session keys the desk reads from sidekick's store, and the ones it
// deletes. Pure: the adapter reads and deletes, so the tests reach this directly.

import {
  HEARTBEAT_MS,
  keyOf,
  type PublishedSession,
  parsePublished,
} from '../publish/contract';

const PREFIX = keyOf('');

function sessionIdOf(storeKey: string): string | undefined {
  return storeKey.startsWith(PREFIX) && storeKey.length > PREFIX.length
    ? storeKey.slice(PREFIX.length)
    : undefined;
}

/** The store keys a session publishes under, in the order given. */
export function sessionKeys(storeKeys: readonly string[]): string[] {
  return storeKeys.filter((storeKey) => sessionIdOf(storeKey) !== undefined);
}

/** Each stored key this version reads, by session id. A key of another version, of a bad shape, or naming another session reads as no key. */
export function readKeys(
  stored: ReadonlyMap<string, unknown>,
): Map<string, PublishedSession> {
  return new Map(
    [...stored].flatMap(([storeKey, value]): [string, PublishedSession][] => {
      const sessionId = sessionIdOf(storeKey);
      const key = parsePublished(value);
      const isOwn = key !== undefined && key.sessionId === sessionId;
      return isOwn ? [[key.sessionId, key]] : [];
    }),
  );
}

/**
 * The session keys to delete after an ok snapshot: each whose session left
 * the listing. A key that parses and was published within a heartbeat stays,
 * since its session may have started after the listing ran.
 */
export function keysToDelete(
  stored: ReadonlyMap<string, unknown>,
  sessionIds: readonly string[],
  now: number,
): string[] {
  const listed = new Set(sessionIds);
  return [...stored]
    .filter(([storeKey, value]) => {
      const sessionId = sessionIdOf(storeKey);
      if (sessionId === undefined || listed.has(sessionId)) return false;
      const key = parsePublished(value);
      return key === undefined || now - key.publishedAt > HEARTBEAT_MS;
    })
    .map(([storeKey]) => storeKey);
}

// `publishedAt` is left out: a heartbeat rewrites it, and the pane does not draw it.
function drawnFacts(keys: ReadonlyMap<string, PublishedSession>): string {
  return JSON.stringify(
    [...keys].map(([sessionId, { publishedAt: _publishedAt, ...rest }]) => [
      sessionId,
      rest,
    ]),
  );
}

/** Whether two sets of live keys draw the same: by value and order. */
export function sameKeys(
  a: ReadonlyMap<string, PublishedSession>,
  b: ReadonlyMap<string, PublishedSession>,
): boolean {
  // `parsePublished` rebuilds each key with literal fields in a fixed order, so the serialised forms compare by value.
  return drawnFacts(a) === drawnFacts(b);
}
