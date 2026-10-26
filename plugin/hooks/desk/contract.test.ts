import { expect, test } from 'claude-code/testing';
import { parseDeskSnapshot } from './contract';

const waiting = [
  {
    name: 'w1',
    repo: 'sidekick',
    reason: 'needs a yes',
    child: true,
    sessionId: 'aaaa0001-x',
    kind: 'background',
    hasPid: true,
    status: 'waiting',
    waitingFor: 'permission prompt',
    detail: 'running tests',
    needs: 'a yes',
    asked: 'Shall I push?',
  },
];
const children = [
  {
    name: 'p7',
    state: 'running',
    reason: 'testing',
    tokens: 1200,
    plan: 'plan-7',
    lastCommit: 'abc1234 feat: x',
    unintegrated: 2,
    uncommitted: true,
    hasPid: true,
  },
  {
    name: 'p8',
    state: 'gone',
    unintegrated: 0,
    uncommitted: false,
    hasPid: false,
  },
];
const others = [
  {
    name: 'o1',
    repo: 'furnace',
    kind: 'job',
    state: 'idle',
    reason: 'r',
    hasPid: false,
  },
];
const self = {
  name: 'me',
  repo: 'sidekick',
  kind: 'interactive',
  state: 'idle',
  hasPid: true,
  sessionId: 'cccc0001-x',
};
const full = {
  version: 2,
  ok: true,
  repo: 'sidekick',
  self,
  waiting,
  children,
  finished: 3,
  others,
  warnings: ['one warning'],
  paneWarnings: ['a pane warning'],
  sessionIds: ['aaaa0001-x', 'cccc0001-x'],
};

function failureOf(text: string): string {
  const snapshot = parseDeskSnapshot(text);
  if (snapshot.ok) throw new Error('expected a failure snapshot');
  expect(snapshot.version).toBe(2);
  return snapshot.error;
}

function okWith(patch: Record<string, unknown>): string {
  return JSON.stringify({ ...full, ...patch });
}

test('a full ok snapshot round-trips unchanged', () => {
  expect(parseDeskSnapshot(JSON.stringify(full))).toEqual(full);
});

test('an ok:false snapshot keeps its error', () => {
  const text = JSON.stringify({ version: 2, ok: false, error: 'no gh' });
  expect(parseDeskSnapshot(text)).toEqual({
    version: 2,
    ok: false,
    error: 'no gh',
  });
});

test('text that is not a version-2 snapshot reads as a failure', () => {
  expect(failureOf('')).toContain('no JSON');
  expect(failureOf('not json')).toContain('no JSON');
  expect(failureOf('[]')).toContain('unknown shape');
  expect(failureOf(JSON.stringify({ ...full, version: 1 }))).toContain(
    'unknown shape',
  );
  expect(failureOf(JSON.stringify({ ...full, version: 3 }))).toContain(
    'unknown shape',
  );
});

test('an ok snapshot with a bad top-level field reads as a failure naming it', () => {
  const { children: _children, ...withoutChildren } = full;
  expect(failureOf(JSON.stringify(withoutChildren))).toContain('children');
  expect(failureOf(okWith({ warnings: 'x' }))).toContain('warnings');
  expect(failureOf(okWith({ others: {} }))).toContain('others');
  expect(failureOf(okWith({ waiting: null }))).toContain('waiting');
  expect(failureOf(okWith({ finished: '3' }))).toContain('finished');
  expect(failureOf(okWith({ paneWarnings: 'x' }))).toContain('paneWarnings');
  expect(failureOf(okWith({ sessionIds: [4] }))).toContain('sessionIds[0]');
  const { sessionIds: _ids, ...withoutIds } = full;
  expect(failureOf(JSON.stringify(withoutIds))).toContain('sessionIds');
});

test('a child with bad optional fields loses them and keeps the rest', () => {
  const child = {
    name: 'c',
    state: 'running',
    hasPid: true,
    sessionId: 7,
    kind: null,
    status: [],
    waitingFor: {},
    detail: 1,
    needs: false,
    asked: 3,
    tokens: '5',
    reason: 4,
    plan: null,
    lastCommit: [],
    unintegrated: 1,
    uncommitted: false,
  };
  const snapshot = parseDeskSnapshot(okWith({ children: [child] }));
  expect(snapshot.ok && snapshot.children).toEqual([
    {
      name: 'c',
      state: 'running',
      hasPid: true,
      unintegrated: 1,
      uncommitted: false,
    },
  ]);
});

test('hasPid is required on every row kind', () => {
  const { hasPid: _hasPid, ...bare } = others[0] ?? {};
  expect(failureOf(okWith({ others: [bare] }))).toContain('others[0].hasPid');
  const badWaiting = [{ ...waiting[0], hasPid: 'yes' }];
  expect(failureOf(okWith({ waiting: badWaiting }))).toContain(
    'waiting[0].hasPid',
  );
});

test('a self that does not parse reads as absent', () => {
  for (const bad of [null, 'x', { ...self, hasPid: 1 }]) {
    const snapshot = parseDeskSnapshot(okWith({ self: bad }));
    expect(snapshot.ok && 'self' in snapshot).toBe(false);
  }
});

test('tokens must be a finite number to be kept', () => {
  const text = `{"version":2,"ok":true,"waiting":[],"children":[{"name":"c","state":"s","tokens":7,"unintegrated":0,"uncommitted":false,"hasPid":true},{"name":"d","state":"s","tokens":1e999,"unintegrated":0,"uncommitted":false,"hasPid":true}],"finished":0,"others":[],"warnings":[],"paneWarnings":[],"sessionIds":[]}`;
  const snapshot = parseDeskSnapshot(text);
  expect(snapshot.ok && snapshot.children.map((c) => c.tokens)).toEqual([
    7,
    undefined,
  ]);
});

test('a list entry missing a required field fails, naming list, index, and field', () => {
  const broken = [
    ...children,
    { state: 'running', unintegrated: 0, uncommitted: false, hasPid: true },
  ];
  expect(failureOf(okWith({ children: broken }))).toContain('children[2].name');
});

test('a required field of the wrong type fails the same way', () => {
  const badWaiting = [
    { name: 'a', repo: 'r', reason: 'x', child: 'yes', hasPid: true },
  ];
  const badOthers = [
    { name: 'a', repo: 'r', kind: 'k', state: 5, hasPid: true },
  ];
  const badChildren = [
    {
      name: 'a',
      state: 's',
      unintegrated: '1',
      uncommitted: false,
      hasPid: true,
    },
  ];
  expect(failureOf(okWith({ waiting: badWaiting }))).toContain(
    'waiting[0].child',
  );
  expect(failureOf(okWith({ others: badOthers }))).toContain('others[0].state');
  expect(failureOf(okWith({ children: badChildren }))).toContain(
    'children[0].unintegrated',
  );
});

test('an entry that is not an object fails naming list and index', () => {
  expect(failureOf(okWith({ others: ['x'] }))).toContain('others[0]');
  expect(failureOf(okWith({ warnings: ['ok', 4] }))).toContain('warnings[1]');
});

test('repo is kept when a non-empty string and dropped otherwise', () => {
  const kept = parseDeskSnapshot(okWith({ repo: 'sidekick' }));
  expect(kept.ok && kept.repo).toBe('sidekick');
  for (const repo of ['', 3]) {
    const dropped = parseDeskSnapshot(okWith({ repo }));
    expect(dropped.ok).toBe(true);
    expect(dropped.ok && 'repo' in dropped).toBe(false);
  }
});

test('unknown extra fields are ignored', () => {
  const text = JSON.stringify({
    version: 2,
    ok: true,
    extra: 1,
    waiting: [{ ...waiting[0], more: 1 }],
    children: [
      {
        name: 'c',
        state: 's',
        unintegrated: 0,
        uncommitted: false,
        hasPid: false,
        more: 2,
      },
    ],
    finished: 3,
    others: [{ ...others[0], more: 3 }],
    warnings: [],
    paneWarnings: [],
    sessionIds: [],
  });
  expect(parseDeskSnapshot(text)).toEqual({
    version: 2,
    ok: true,
    waiting,
    children: [
      {
        name: 'c',
        state: 's',
        unintegrated: 0,
        uncommitted: false,
        hasPid: false,
      },
    ],
    finished: 3,
    others,
    warnings: [],
    paneWarnings: [],
    sessionIds: [],
  });
});
