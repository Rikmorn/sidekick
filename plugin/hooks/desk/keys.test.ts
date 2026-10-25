import { expect, test } from 'claude-code/testing';
import {
  HEARTBEAT_MS,
  keyOf,
  type PublishedSession,
} from '../publish/contract';
import { keysToDelete, readKeys, sameKeys, sessionKeys } from './keys';

const NOW = 1_792_966_244_079;

function key(sessionId: string, publishedAt = NOW): PublishedSession {
  return { version: 1, sessionId, role: 'worker', subagents: [], publishedAt };
}

test('readKeys reads each session key this version parses, by session id', () => {
  const stored = new Map<string, unknown>([
    [keyOf('a'), key('a')],
    [keyOf('v2'), { ...key('v2'), version: 2 }],
    [keyOf('bad'), { version: 1, sessionId: 'bad' }],
    [keyOf('elsewhere'), key('another-id')],
    ['unrelated', key('u')],
  ]);
  expect([...readKeys(stored)]).toEqual([['a', key('a')]]);
});

test('sessionKeys keeps the store keys a session publishes under', () => {
  expect(sessionKeys([keyOf('a'), 'unrelated', keyOf(''), keyOf('b')])).toEqual(
    [keyOf('a'), keyOf('b')],
  );
});

test('keysToDelete deletes a key whose session left the listing', () => {
  const stored = new Map<string, unknown>([
    [keyOf('listed'), key('listed', NOW - HEARTBEAT_MS * 10)],
    [keyOf('left'), key('left', NOW - HEARTBEAT_MS - 1)],
    ['unrelated', key('u', 0)],
  ]);
  expect(keysToDelete(stored, ['listed'], NOW)).toEqual([keyOf('left')]);
});

// A session that started after the listing ran publishes before it is listed.
test('keysToDelete spares an unlisted key published within a heartbeat', () => {
  const stored = new Map<string, unknown>([
    [keyOf('new'), key('new', NOW - HEARTBEAT_MS)],
  ]);
  expect(keysToDelete(stored, [], NOW)).toEqual([]);
});

// Another plugin version may own a key this one cannot read.
test('keysToDelete keeps an unparseable key while its session is listed, and deletes it once it leaves', () => {
  const foreign = { version: 2, sessionId: 'x', publishedAt: NOW };
  const stored = new Map<string, unknown>([[keyOf('x'), foreign]]);
  expect(keysToDelete(stored, ['x'], NOW)).toEqual([]);
  expect(keysToDelete(stored, [], NOW)).toEqual([keyOf('x')]);
});

// A heartbeat rewrites only `publishedAt`, which the pane does not draw.
test('sameKeys compares what the pane draws, by value and order', () => {
  const one = new Map([['a', key('a')]]);
  expect(sameKeys(one, new Map([['a', key('a')]]))).toBe(true);
  expect(sameKeys(one, new Map([['a', key('a', NOW + 1)]]))).toBe(true);
  const busy = { ...key('a'), activity: 'Bash: ls' };
  expect(sameKeys(one, new Map([['a', busy]]))).toBe(false);
  expect(sameKeys(one, new Map())).toBe(false);
  const two = new Map([
    ['a', key('a')],
    ['b', key('b')],
  ]);
  const swapped = new Map([
    ['b', key('b')],
    ['a', key('a')],
  ]);
  expect(sameKeys(two, swapped)).toBe(false);
});
