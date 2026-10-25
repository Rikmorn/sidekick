import { expect, test } from 'claude-code/testing';
import type { DeskChild, DeskSnapshot } from './contract';
import { bandLines, hasChildren, paneLines, sameSnapshot } from './logic';

type OkSnapshot = Extract<DeskSnapshot, { ok: true }>;

function child(over: Partial<DeskChild> & { name: string }): DeskChild {
  return {
    hasPid: true,
    state: 'working',
    unintegrated: 0,
    uncommitted: false,
    ...over,
  };
}

function snapshot(over: Partial<OkSnapshot> = {}): OkSnapshot {
  return {
    version: 2,
    ok: true,
    repo: 'sidekick',
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

const full = snapshot({
  waiting: [
    {
      hasPid: true,
      name: 'odin-ae',
      repo: 'odin',
      reason: 'permission prompt',
      child: false,
    },
    {
      hasPid: true,
      name: 'p8-board',
      repo: 'sidekick',
      reason: 'blocked',
      child: true,
    },
  ],
  children: [
    child({
      name: 'p8-board',
      state: 'blocked',
      reason: 'permission prompt',
      tokens: 412000,
      plan: 'The board',
      lastCommit: 'feat: a thing',
      unintegrated: 3,
      uncommitted: true,
    }),
    child({ name: 'p7-desk', state: 'working', tokens: 640 }),
    child({ name: 'p6-gauge', state: 'done' }),
  ],
  finished: 2,
  others: [
    {
      hasPid: true,
      name: 'odin-ae',
      repo: 'odin',
      kind: 'interactive',
      state: 'blocked',
      reason: 'permission prompt',
    },
    {
      hasPid: true,
      name: 'scratch',
      repo: 'furnace',
      kind: 'interactive',
      state: 'idle',
    },
  ],
});

test('the band lists who waits, then the workers with the finished count', () => {
  expect(bandLines(full, 120)).toEqual([
    {
      tone: 'waiting',
      text: '● needs you  odin-ae · permission prompt   p8-board · blocked',
    },
    {
      tone: 'working',
      text: '◆ workers    p8-board blocked · p7-desk working · p6-gauge done   2 finished',
    },
  ]);
});

test('the first entries of both band lines start in the same column', () => {
  const [waiting, workers] = bandLines(full, 120);
  expect(waiting?.text.indexOf('odin-ae')).toBe(
    workers?.text.indexOf('p8-board'),
  );
  expect(waiting?.text.indexOf('odin-ae')).toBeGreaterThan(0);
});

test('with no children the finished count stands alone on a muted line', () => {
  expect(bandLines(snapshot({ finished: 4 }), 120)).toEqual([
    { tone: 'muted', text: '4 finished' },
  ]);
});

test('the band is empty when nothing waits, finished, or is a child', () => {
  expect(bandLines(snapshot(), 120)).toEqual([]);
});

test('a workers line with nothing finished has no finished entry', () => {
  const lines = bandLines(snapshot({ children: [child({ name: 'a' })] }), 120);
  expect(lines).toEqual([{ tone: 'working', text: '◆ workers    a working' }]);
});

test('a failure snapshot gives one failure line, in the band and the pane', () => {
  const failed: DeskSnapshot = { version: 2, ok: false, error: 'boom' };
  const expected = [{ tone: 'failure', text: '⚠ desk: boom' }];
  expect(bandLines(failed, 120)).toEqual(expected);
  expect(paneLines(failed, 120)).toEqual(expected);
});

test('a warning adds one failure line after the others', () => {
  const lines = bandLines(
    snapshot({ finished: 1, warnings: ['git failed', 'second'] }),
    120,
  );
  expect(lines).toEqual([
    { tone: 'muted', text: '1 finished' },
    { tone: 'failure', text: '⚠ desk: git failed' },
  ]);
  expect(bandLines(full, 120)).toHaveLength(2);
  expect(bandLines({ ...full, warnings: ['w'] }, 120)).toHaveLength(3);
  expect(paneLines(snapshot({ warnings: ['w'] }), 120).at(-1)).toEqual({
    tone: 'failure',
    text: '⚠ desk: w',
  });
});

test('narrow bands keep whole entries and say how many were left out', () => {
  const lines = bandLines(full, 60);
  expect(lines[0]?.text).toBe(
    '● needs you  odin-ae · permission prompt +1 more',
  );
  expect(lines[1]?.text).toBe(
    '◆ workers    p8-board blocked · p7-desk working +2 more',
  );
});

test('when no entry fits the band shows the prefix and the count', () => {
  const lines = bandLines(full, 24);
  expect(lines[0]?.text).toBe('● needs you  +2 more');
  expect(lines[1]?.text).toBe('◆ workers    +4 more');
});

test('when even that is too wide the text is cut without an ellipsis', () => {
  expect(bandLines(full, 8).map((line) => line.text)).toEqual([
    '● needs ',
    '◆ worker',
  ]);
});

test('no line is empty or wider than the width, at any width', () => {
  const failed: DeskSnapshot = {
    version: 2,
    ok: false,
    error: 'a long error text',
  };
  const withWarning = { ...full, warnings: ['a long warning text here'] };
  for (const snap of [full, withWarning, failed, snapshot({ finished: 12 })]) {
    for (let columns = 1; columns <= 130; columns += 1) {
      const lines = [...bandLines(snap, columns), ...paneLines(snap, columns)];
      for (const line of lines) {
        expect([...line.text].length).toBeLessThanOrEqual(columns);
        expect(line.text).not.toBe('');
      }
    }
  }
});

test('the finished count is an entry the cut can drop', () => {
  const snap = snapshot({
    children: [child({ name: 'a' }), child({ name: 'b' })],
    finished: 3,
  });
  expect(bandLines(snap, 120)[0]?.text).toBe(
    '◆ workers    a working · b working   3 finished',
  );
  expect(bandLines(snap, 42)[0]?.text).toBe(
    '◆ workers    a working · b working +1 more',
  );
  expect(bandLines(snap, 30)[0]?.text).toBe('◆ workers    a working +2 more');
});

test('the pane heads the children with the repository, one block each', () => {
  const lines = paneLines(full, 120);
  expect(lines.slice(0, 9)).toEqual([
    { tone: 'heading', text: 'CHILDREN · sidekick' },
    { tone: 'waiting', text: 'p8-board blocked · permission prompt' },
    { tone: 'muted', text: '412k tokens · The board' },
    { tone: 'muted', text: 'feat: a thing' },
    { tone: 'mark', text: '3 commits not integrated' },
    { tone: 'mark', text: 'uncommitted changes' },
    { tone: 'working', text: 'p7-desk working' },
    { tone: 'muted', text: '640 tokens' },
    { tone: 'done', text: 'p6-gauge done' },
  ]);
});

test('the pane heading drops the repository when the snapshot has none', () => {
  const { repo: _repo, ...rest } = full;
  expect(paneLines(rest, 120)[0]).toEqual({
    tone: 'heading',
    text: 'CHILDREN',
  });
});

test('a gone or unknown child state reads muted', () => {
  const snap = snapshot({
    children: [
      child({ name: 'a', state: 'gone' }),
      child({ name: 'b', state: 'odd' }),
    ],
  });
  expect(paneLines(snap, 120).slice(1)).toEqual([
    { tone: 'muted', text: 'a gone' },
    { tone: 'muted', text: 'b odd' },
    { tone: 'heading', text: 'OTHER SESSIONS' },
    { tone: 'muted', text: 'none' },
  ]);
});

test('the pane lists other sessions, waiting ones in the waiting tone', () => {
  const lines = paneLines(full, 120);
  const at = lines.findIndex((line) => line.text === 'OTHER SESSIONS');
  expect(lines[at]?.tone).toBe('heading');
  expect(lines.slice(at + 1)).toEqual([
    { tone: 'waiting', text: 'odin-ae · odin · blocked · permission prompt' },
    { tone: 'muted', text: 'scratch · furnace · idle' },
  ]);
});

test('a reason that only repeats the state prints once', () => {
  const snap = snapshot({
    children: [child({ name: 'w', state: 'blocked', reason: 'blocked' })],
    others: [
      {
        hasPid: true,
        name: 'm',
        repo: 'todo',
        kind: 'background',
        state: 'blocked',
        reason: 'blocked',
      },
    ],
  });
  expect(paneLines(snap, 120).map((line) => line.text)).toEqual([
    'CHILDREN · sidekick',
    'w blocked',
    'OTHER SESSIONS',
    'm · todo · blocked',
  ]);
});

test('with no children the pane has no CHILDREN block and others read none', () => {
  expect(paneLines(snapshot(), 120)).toEqual([
    { tone: 'heading', text: 'OTHER SESSIONS' },
    { tone: 'muted', text: 'none' },
  ]);
});

test('tokens round to k, keep k above a million, and stay bare below 1,000', () => {
  const tokens = (n: number) =>
    paneLines(snapshot({ children: [child({ name: 'a', tokens: n })] }), 120)[2]
      ?.text;
  expect(tokens(412400)).toBe('412k tokens');
  expect(tokens(999)).toBe('999 tokens');
  expect(tokens(1000)).toBe('1k tokens');
  expect(tokens(1234000)).toBe('1234k tokens');
});

test('hasChildren is true only for an ok snapshot with children', () => {
  expect(hasChildren(full)).toBe(true);
  expect(hasChildren(snapshot())).toBe(false);
  expect(hasChildren({ version: 2, ok: false, error: 'x' })).toBe(false);
});

test('sameSnapshot compares by value', () => {
  const build = () =>
    snapshot({ children: [child({ name: 'a' })], finished: 1 });
  expect(sameSnapshot(build(), build())).toBe(true);
  const other = snapshot({
    children: [child({ name: 'a', state: 'done' })],
    finished: 1,
  });
  expect(sameSnapshot(build(), other)).toBe(false);
  expect(sameSnapshot(build(), { version: 2, ok: false, error: 'x' })).toBe(
    false,
  );
});
