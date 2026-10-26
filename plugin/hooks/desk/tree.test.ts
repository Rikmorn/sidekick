import { expect, test } from 'claude-code/testing';
import { keyOf, type PublishedSession, STALE_MS } from '../publish/contract';
import type {
  DeskChild,
  DeskOther,
  DeskSnapshot,
  DeskWaiting,
} from './contract';
import { readKeys } from './keys';
import { deskTree, liveKeys } from './tree';

type OkSnapshot = Extract<DeskSnapshot, { ok: true }>;

const NOW = 1_792_966_244_079;

function child(over: Partial<DeskChild> & { name: string }): DeskChild {
  return {
    hasPid: true,
    state: 'working',
    unintegrated: 0,
    uncommitted: false,
    ...over,
  };
}

function other(over: Partial<DeskOther> & { name: string }): DeskOther {
  return {
    hasPid: true,
    repo: 'odin',
    kind: 'interactive',
    state: 'idle',
    ...over,
  };
}

function waiting(over: Partial<DeskWaiting> & { name: string }): DeskWaiting {
  return {
    hasPid: true,
    repo: 'odin',
    reason: 'permission prompt',
    child: false,
    ...over,
  };
}

function snapshot(over: Partial<OkSnapshot> = {}): OkSnapshot {
  return {
    version: 2,
    ok: true,
    repo: 'todo-app',
    self: {
      hasPid: true,
      sessionId: 'self',
      name: 'todo-app-ce',
      repo: 'todo-app',
      kind: 'interactive',
      state: 'idle',
    },
    waiting: [],
    children: [],
    finished: 0,
    others: [],
    warnings: [],
    paneWarnings: [],
    sessionIds: [],
    ...over,
  };
}

function key(
  over: Partial<PublishedSession> & { sessionId: string },
): PublishedSession {
  return {
    version: 1,
    role: 'worker',
    subagents: [],
    publishedAt: NOW - 1_000,
    ...over,
  };
}

function keysOf(...keys: PublishedSession[]): Map<string, PublishedSession> {
  return new Map(keys.map((entry) => [entry.sessionId, entry]));
}

const EXPLORE = {
  type: 'Explore',
  description: 'find callers of greet',
  status: 'running',
};

test('a waiting session elsewhere sorts above this main, and draws once', () => {
  const tree = deskTree(
    snapshot({
      waiting: [waiting({ name: 'odin-review', sessionId: 'odin' })],
      others: [
        other({ name: 'pm-main', sessionId: 'pm' }),
        other({
          name: 'odin-review',
          sessionId: 'odin',
          state: 'waiting',
          reason: 'permission prompt',
        }),
      ],
    }),
    new Map(),
    NOW,
  );
  expect(tree.waiting.map((session) => session.name)).toEqual(['odin-review']);
  expect(tree.waiting[0]?.status).toEqual({ kind: 'needs' });
  expect(tree.others.map((session) => session.name)).toEqual(['pm-main']);
  expect(tree.root).toEqual({ name: 'todo-app-ce', workers: 0, needYou: 0 });
});

test('a waiting child sorts first among its siblings, then working, then the rest', () => {
  const tree = deskTree(
    snapshot({
      waiting: [waiting({ name: 'fix-readme', child: true, sessionId: 'fix' })],
      children: [
        child({ name: 'p7-desk', state: 'done', hasPid: false }),
        child({ name: 'add-greeting', state: 'working' }),
        child({ name: 'fix-readme', state: 'blocked', sessionId: 'fix' }),
      ],
    }),
    new Map(),
    NOW,
  );
  expect(tree.children.map((session) => session.name)).toEqual([
    'fix-readme',
    'add-greeting',
    'p7-desk',
  ]);
  expect(tree.children.map((session) => session.status)).toEqual([
    { kind: 'needs' },
    { kind: 'working' },
    { kind: 'done' },
  ]);
  expect(tree.root).toEqual({ name: 'todo-app-ce', workers: 3, needYou: 1 });
});

test('a child in the waiting list needs the operator whatever its state word', () => {
  const tree = deskTree(
    snapshot({
      waiting: [waiting({ name: 'w', child: true })],
      children: [child({ name: 'v' }), child({ name: 'w', state: 'busy' })],
    }),
    new Map(),
    NOW,
  );
  expect(tree.children.map((session) => session.name)).toEqual(['w', 'v']);
  expect(tree.children[0]?.status).toEqual({ kind: 'needs' });
});

test('state words map to working, done, idle, or the raw word', () => {
  const tree = deskTree(
    snapshot({
      others: [
        other({ name: 'a', state: 'busy' }),
        other({ name: 'b', state: 'done' }),
        other({ name: 'c', state: 'idle' }),
        other({ name: 'd', state: 'stopped' }),
      ],
      children: [child({ name: 'g', state: 'gone', hasPid: false })],
    }),
    new Map(),
    NOW,
  );
  expect(tree.others.map((session) => session.status)).toEqual([
    { kind: 'working' },
    { kind: 'done' },
    { kind: 'idle' },
    { kind: 'other', word: 'stopped' },
  ]);
  expect(tree.children[0]?.status).toEqual({ kind: 'other', word: 'gone' });
});

test("a live key gives a child its activity, context, and subagents, and another main's row its kind", () => {
  const tree = deskTree(
    snapshot({
      children: [
        child({ name: 'add-greeting', sessionId: 'add', plan: 'The plan' }),
      ],
      others: [other({ name: 'pm-main', sessionId: 'pm' })],
    }),
    keysOf(
      key({
        sessionId: 'add',
        activity: 'Edit: greeting.js',
        context: { used: 156_000, limit: 200_000 },
        subagents: [EXPLORE],
      }),
      key({ sessionId: 'pm', role: 'main', activity: 'idle since 14:02' }),
    ),
    NOW,
  );
  expect(tree.children[0]).toMatchObject({
    work: 'Edit: greeting.js',
    context: { used: 156_000, limit: 200_000 },
    subagents: [EXPLORE],
  });
  expect(tree.others[0]).toMatchObject({
    isMain: true,
    work: 'idle since 14:02',
  });
});

// Review Focus 1: a crashed session's key must not draw running subagents or a stale activity.
test('a key whose row has no pid is ignored, so no subagents draw and the row reads from listing facts', () => {
  const tree = deskTree(
    snapshot({
      children: [
        child({
          name: 'p7-desk',
          sessionId: 'p7',
          state: 'working',
          hasPid: false,
          detail: 'report sent',
          tokens: 140_000,
        }),
      ],
    }),
    keysOf(
      key({
        sessionId: 'p7',
        activity: 'Bash: bun run test',
        context: { used: 150_000, limit: 200_000 },
        subagents: [EXPLORE],
      }),
    ),
    NOW,
  );
  expect(tree.children[0]).toEqual({
    name: 'p7-desk',
    status: { kind: 'working' },
    work: 'report sent',
    context: { used: 140_000 },
    unintegrated: 0,
    uncommitted: false,
    subagents: [],
  });
});

test('a key older than STALE_MS is ignored', () => {
  const stale = key({
    sessionId: 'pm',
    role: 'main',
    publishedAt: NOW - STALE_MS - 1,
  });
  const tree = deskTree(
    snapshot({ others: [other({ name: 'pm-main', sessionId: 'pm' })] }),
    keysOf(stale),
    NOW,
  );
  expect(tree.others[0]?.isMain).toBe(false);
});

// Review Focus 3: a key of another version reads as no key, never as a crash or a misdraw.
test('a key of version 2, or of a bad shape, is ignored', () => {
  const stored = new Map<string, unknown>([
    [
      keyOf('pm'),
      {
        version: 2,
        sessionId: 'pm',
        role: 'main',
        activity: 'from the future',
        subagents: [],
        publishedAt: NOW,
      },
    ],
    [keyOf('odd'), { version: 1, sessionId: 'odd', role: 'boss' }],
  ]);
  const tree = deskTree(
    snapshot({
      others: [
        other({ name: 'pm-main', sessionId: 'pm' }),
        other({ name: 'odd-one', sessionId: 'odd' }),
      ],
    }),
    readKeys(stored),
    NOW,
  );
  expect(tree.others).toEqual([
    {
      name: 'pm-main',
      repo: 'odin',
      isMain: false,
      status: { kind: 'idle' },
    },
    {
      name: 'odd-one',
      repo: 'odin',
      isMain: false,
      status: { kind: 'idle' },
    },
  ]);
});

test('a row with no key is not a main, and draws from listing facts alone', () => {
  const tree = deskTree(
    snapshot({
      others: [
        other({
          name: 'nightly-bench',
          repo: 'furnace',
          kind: 'background',
          state: 'working',
          detail: 'bench suite 3 of 7',
        }),
      ],
    }),
    new Map(),
    NOW,
  );
  expect(tree.others).toEqual([
    {
      name: 'nightly-bench',
      repo: 'furnace',
      isMain: false,
      status: { kind: 'working' },
      work: 'bench suite 3 of 7',
    },
  ]);
});

test("a waiting row's work line is its needs, else a reason that says more than the state", () => {
  const tree = deskTree(
    snapshot({
      waiting: [
        waiting({ name: 'fix-readme', child: true }),
        waiting({ name: 'w2', child: true, reason: 'blocked' }),
        waiting({ name: 'odin-review', reason: 'permission prompt' }),
      ],
      children: [
        child({
          name: 'fix-readme',
          state: 'blocked',
          reason: 'permission prompt',
          needs: 'approve Read …/fix-readme-brief.md',
          plan: 'The plan',
        }),
        child({
          name: 'w2',
          state: 'blocked',
          reason: 'blocked',
          plan: 'The plan',
        }),
      ],
      others: [
        other({
          name: 'odin-review',
          state: 'waiting',
          reason: 'permission prompt',
          detail: 'reading files',
        }),
      ],
    }),
    new Map(),
    NOW,
  );
  expect(tree.children.map((session) => session.work)).toEqual([
    'approve Read …/fix-readme-brief.md',
    'The plan',
  ]);
  expect(tree.waiting[0]?.work).toBe('permission prompt');
});

test("a child's work line is its activity, else job state's detail, else its plan", () => {
  const tree = deskTree(
    snapshot({
      children: [
        child({ name: 'a', sessionId: 'a', detail: 'detail', plan: 'plan' }),
        child({ name: 'b', detail: 'detail', plan: 'plan' }),
        child({ name: 'c', plan: 'plan' }),
        child({ name: 'd' }),
      ],
    }),
    keysOf(key({ sessionId: 'a', activity: 'activity' })),
    NOW,
  );
  expect(tree.children.map((session) => session.work)).toEqual([
    'activity',
    'detail',
    'plan',
    undefined,
  ]);
});

test('text from outside is cut to its first non-empty line: needs, detail, reason, and a subagent description', () => {
  const tree = deskTree(
    snapshot({
      waiting: [
        waiting({
          name: 'ask',
          sessionId: 'ask',
          child: true,
          reason: '\n  first reason  \nsecond reason',
        }),
      ],
      children: [
        child({
          name: 'ask',
          sessionId: 'ask',
          state: 'blocked',
          needs: '\nWhich branch?\nA or B',
        }),
        child({ name: 'detail', detail: '\n\nreport sent\nmore text' }),
      ],
    }),
    keysOf(
      key({
        sessionId: 'ask',
        subagents: [
          { type: 'Explore', description: 'find\ncallers', status: 'running' },
        ],
      }),
    ),
    NOW,
  );
  expect(tree.children.find((s) => s.name === 'ask')).toMatchObject({
    work: 'Which branch?',
    subagents: [{ description: 'find' }],
  });
  expect(tree.children.find((s) => s.name === 'detail')?.work).toBe(
    'report sent',
  );
});

test('with no published context the tokens stand alone: the key, else the snapshot', () => {
  const tree = deskTree(
    snapshot({
      children: [
        child({ name: 'a', tokens: 31_000 }),
        child({ name: 'b' }),
        child({ name: 'c', sessionId: 'c', tokens: 1 }),
      ],
    }),
    keysOf(key({ sessionId: 'c', context: { used: 62_000, limit: 0 } })),
    NOW,
  );
  expect(tree.children.map((session) => session.context)).toEqual([
    { used: 31_000 },
    undefined,
    { used: 62_000, limit: 0 },
  ]);
});

test('subagents nest under children only: the root and other sessions draw none', () => {
  const withSubagents = (sessionId: string, role: PublishedSession['role']) =>
    key({ sessionId, role, subagents: [EXPLORE] });
  const tree = deskTree(
    snapshot({ others: [other({ name: 'pm-main', sessionId: 'pm' })] }),
    keysOf(withSubagents('self', 'main'), withSubagents('pm', 'main')),
    NOW,
  );
  expect(tree.others[0]).not.toHaveProperty('subagents');
  expect(tree.root).not.toHaveProperty('subagents');
});

test('the root reads no name when the snapshot has no self row', () => {
  const { self: _self, ...rest } = snapshot();
  expect(deskTree(rest, new Map(), NOW).root).toEqual({
    workers: 0,
    needYou: 0,
  });
});

test('liveKeys keeps only the keys of drawn rows that pass isLive', () => {
  const snap = snapshot({
    children: [
      child({ name: 'a', sessionId: 'a' }),
      child({ name: 'gone', sessionId: 'gone', hasPid: false }),
    ],
    others: [other({ name: 'pm', sessionId: 'pm' })],
  });
  const keys = keysOf(
    key({ sessionId: 'a' }),
    key({ sessionId: 'gone' }),
    key({ sessionId: 'pm', publishedAt: NOW - STALE_MS - 1 }),
    key({ sessionId: 'unlisted' }),
  );
  expect([...liveKeys(snap, keys, NOW).keys()]).toEqual(['a']);
});
