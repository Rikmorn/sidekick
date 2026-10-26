import { expect, test } from 'claude-code/testing';
import { scrollHint, width } from '../lines';
import type { PublishedSession } from '../publish/contract';
import type { StyledRow } from '../styled';
import type { DeskChild, DeskOther, DeskSnapshot } from './contract';
import {
  bandLines,
  failureRow,
  hasChildren,
  hiddenNeeds,
  paneEntries,
  paneHint,
  paneRows,
  sameSnapshot,
} from './logic';

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
      text: '◐ workers    p8-board blocked · p7-desk working · p6-gauge done   2 finished',
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
  expect(lines).toEqual([{ tone: 'working', text: '◐ workers    a working' }]);
});

test('a failure snapshot gives one failure line, in the band and the pane', () => {
  const failed: DeskSnapshot = { version: 2, ok: false, error: 'boom' };
  const expected = [{ tone: 'failure', text: '⚠ desk: boom' }];
  expect(bandLines(failed, 120)).toEqual(expected);
  expect(failureRow('boom', 120)).toEqual([
    { text: '⚠ desk: boom', tone: 'error' },
  ]);
  expect(failureRow('boom', 9)).toEqual([{ text: '⚠ desk: b', tone: 'error' }]);
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
});

test('narrow bands keep whole entries and say how many were left out', () => {
  const lines = bandLines(full, 60);
  expect(lines[0]?.text).toBe(
    '● needs you  odin-ae · permission prompt +1 more',
  );
  expect(lines[1]?.text).toBe(
    '◐ workers    p8-board blocked · p7-desk working +2 more',
  );
});

test('when no entry fits the band shows the prefix and the count', () => {
  const lines = bandLines(full, 24);
  expect(lines[0]?.text).toBe('● needs you  +2 more');
  expect(lines[1]?.text).toBe('◐ workers    +4 more');
});

test('when even that is too wide the text is cut without an ellipsis', () => {
  expect(bandLines(full, 8).map((line) => line.text)).toEqual([
    '● needs ',
    '◐ worker',
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
      const lines = bandLines(snap, columns);
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
    '◐ workers    a working · b working   3 finished',
  );
  expect(bandLines(snap, 42)[0]?.text).toBe(
    '◐ workers    a working · b working +1 more',
  );
  expect(bandLines(snap, 30)[0]?.text).toBe('◐ workers    a working +2 more');
});

// The pane: a tree of styled rows.

const plain = (row: StyledRow): string => row.map((run) => run.text).join('');

// The run whose text, without the padding around it, reads `text`.
const runOf = (row: StyledRow | undefined, text: string) =>
  row?.find((run) => run.text.trim() === text);

function other(over: Partial<DeskOther> & { name: string }): DeskOther {
  return {
    hasPid: true,
    repo: 'odin',
    kind: 'interactive',
    state: 'idle',
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

const SELF: DeskOther = {
  hasPid: true,
  sessionId: 'self',
  name: 'todo-app-ce',
  repo: 'todo-app',
  kind: 'interactive',
  state: 'idle',
};

// The L1 plates' sessions, short of the second worker.
const TREE = snapshot({
  self: SELF,
  waiting: [
    {
      hasPid: true,
      sessionId: 'odin',
      name: 'odin-review',
      repo: 'odin',
      reason: 'which branch should I review?',
      child: false,
    },
  ],
  children: [
    child({ name: 'add-greeting', sessionId: 'add', plan: 'The plan' }),
    child({
      name: 'p7-desk',
      sessionId: 'p7',
      state: 'done',
      hasPid: false,
      detail: 'report sent',
      tokens: 140_000,
      unintegrated: 2,
    }),
  ],
  others: [
    other({
      name: 'odin-review',
      sessionId: 'odin',
      state: 'waiting',
      reason: 'which branch should I review?',
    }),
    other({ name: 'pm-main', sessionId: 'pm', repo: 'sidekick' }),
  ],
});

const TREE_KEYS = keysOf(
  key({
    sessionId: 'odin',
    role: 'main',
    context: { used: 176_000, limit: 200_000 },
  }),
  key({
    sessionId: 'add',
    activity: 'Task 2 of 3',
    context: { used: 156_000, limit: 200_000 },
    subagents: [
      {
        type: 'Explore',
        description: 'find callers of greet',
        status: 'running',
      },
    ],
  }),
  key({
    sessionId: 'pm',
    role: 'main',
    context: { used: 120_000, limit: 1_000_000 },
  }),
);

// One cell of the plates: `text` padded to `cells`.
const cell = (text: string, cells: number) =>
  text + ' '.repeat(cells - width(text));

test('from 80 columns each session takes one row, as the L1 inline plate', () => {
  const rows = paneRows(TREE, TREE_KEYS, 100, NOW).map(plain);
  expect(rows).toEqual([
    cell('', 3) +
      cell('◇', 2) +
      cell('odin-review', 15) +
      cell('needs you', 11) +
      cell('which branch should I review?', 44) +
      cell('     odin', 14) +
      '▰▰▰▰▱  176k',
    `${cell('▣ todo-app-ce', 20)}this main${' '.repeat(62)}2 workers`,
    cell('├', 3) +
      cell('◐', 2) +
      cell('add-greeting', 15) +
      cell('working', 11) +
      cell('Task 2 of 3', 44) +
      cell('', 14) +
      '▰▰▰▰▱  156k',
    `${cell('│  └', 5)}${cell('◦ Explore', 18)}find callers of greet`,
    cell('└', 3) +
      cell('✓', 2) +
      cell('p7-desk', 15) +
      cell('done', 11) +
      cell('report sent', 44) +
      cell('⇡2', 14) +
      '       140k',
    '',
    cell('', 3) +
      cell('◇', 2) +
      cell('pm-main', 15) +
      cell('idle', 11) +
      cell('', 44) +
      cell('     sidekick', 14) +
      '▰▱▱▱▱  120k',
  ]);
});

test('below 80 columns each session takes two rows, head then work, as the L1 docked plate', () => {
  const rows = paneRows(TREE, TREE_KEYS, 60, NOW).map(plain);
  expect(rows).toEqual([
    `${cell('◇', 2)}${cell('odin-review', 15)}${cell('needs you', 12)}${cell('odin', 11)}▰▰▰▰▱  176k`,
    '      which branch should I review?',
    `${cell('▣ todo-app-ce', 19)}2 workers`,
    `${cell('├', 2)}${cell('◐', 2)}${cell('add-greeting', 15)}${cell('working', 12)}${cell('', 9)}▰▰▰▰▱  156k`,
    '│     Task 2 of 3',
    `│     └ ${cell('◦ Explore', 11)}find callers of greet`,
    `${cell('└', 2)}${cell('✓', 2)}${cell('p7-desk', 15)}${cell('done', 12)}${cell('⇡2', 9)}       140k`,
    '      report sent',
    '',
    `${cell('◇', 2)}${cell('pm-main', 15)}${cell('idle', 12)}${cell('sidekick', 11)}▰▱▱▱▱  120k`,
  ]);
});

test('below 40 columns each session takes its head row alone, cut from its end', () => {
  expect(paneRows(TREE, TREE_KEYS, 24, NOW).map(plain)).toEqual([
    '◇ odin-review    needs y',
    '▣ todo-app-ce',
    '├ ◐ add-greeting   worki',
    '└ ✓ p7-desk        done',
    '',
    '◇ pm-main        idle',
  ]);
});

test('subagent rows draw from 40 columns and not below, where the head stands alone', () => {
  const hasSubagent = (columns: number) =>
    paneRows(TREE, TREE_KEYS, columns, NOW)
      .map(plain)
      .some((row) => row.includes('Explore'));
  expect(hasSubagent(24)).toBe(false);
  expect(hasSubagent(39)).toBe(false);
  expect(hasSubagent(40)).toBe(true);
});

test('no row is wider than its columns, and only the gap row is empty', () => {
  const withWarnings = {
    ...TREE,
    warnings: ['a warning'],
    paneWarnings: ['a job state warning'],
  };
  for (const snap of [TREE, withWarnings]) {
    for (let columns = 1; columns <= 130; columns += 1) {
      const rows = paneRows(snap, TREE_KEYS, columns, NOW);
      expect(rows.filter((row) => row.length === 0)).toHaveLength(1);
      for (const row of rows) {
        expect(width(plain(row))).toBeLessThanOrEqual(columns);
        expect(row.filter((run) => run.text === '')).toEqual([]);
      }
    }
  }
});

test('the root row heads the tree: this main, its workers, and how many need you', () => {
  const blocked = snapshot({
    self: SELF,
    children: [
      child({ name: 'a', state: 'blocked' }),
      child({ name: 'b' }),
      child({ name: 'c', state: 'blocked' }),
    ],
  });
  const [root] = paneRows(blocked, new Map(), 100, NOW);
  expect(root?.[0]).toEqual({
    text: cell('▣ todo-app-ce', 20),
    tone: 'claude',
    bold: true,
  });
  expect(runOf(root, 'this main')?.tone).toBe('inactive');
  expect(plain(root ?? [])).toEndWith('3 workers · 2 need you');
  expect(runOf(root, '2 need you')?.tone).toBe('warning');
  const one = snapshot({
    self: SELF,
    children: [child({ name: 'a', state: 'blocked' })],
  });
  expect(plain(paneRows(one, new Map(), 100, NOW)[0] ?? [])).toEndWith(
    '1 worker · 1 needs you',
  );
  const calm = snapshot({ self: SELF, children: [child({ name: 'a' })] });
  expect(plain(paneRows(calm, new Map(), 100, NOW)[0] ?? [])).toEndWith(
    `this main${' '.repeat(63)}1 worker`,
  );
  expect(paneRows(snapshot({ self: SELF }), new Map(), 100, NOW)).toEqual([
    [
      { text: cell('▣ todo-app-ce', 20), tone: 'claude', bold: true },
      { text: 'this main', tone: 'inactive' },
    ],
  ]);
});

test('a child leads with its state icon after the tree glyph, and its name is bold', () => {
  const rows = paneRows(TREE, TREE_KEYS, 100, NOW);
  const [glyph, icon, name, state] = rows[2] ?? [];
  expect(glyph).toEqual({ text: cell('├', 3), tone: 'subtle' });
  expect(icon).toEqual({ text: cell('◐', 2), tone: 'suggestion' });
  expect(name).toEqual({
    text: cell('add-greeting', 15),
    tone: 'text',
    bold: true,
  });
  expect(state).toEqual({ text: cell('working', 11), tone: 'suggestion' });
  expect(runOf(rows[4], '✓')?.tone).toBe('success');
  expect(runOf(rows[4], 'done')?.tone).toBe('success');
});

test('a row elsewhere leads with its kind: ◇ for a main, ◌ for any other or no key, its name dim', () => {
  const snap = snapshot({
    self: SELF,
    others: [
      other({ name: 'pm-main', sessionId: 'pm' }),
      other({ name: 'bare', sessionId: 'bare', repo: 'furnace' }),
      other({ name: 'helper', sessionId: 'helper' }),
      other({ name: 'worker', sessionId: 'worker' }),
    ],
  });
  const keys = keysOf(
    key({ sessionId: 'pm', role: 'main' }),
    key({ sessionId: 'helper', role: 'other' }),
    key({ sessionId: 'worker', role: 'worker', main: 'gone-main' }),
  );
  const rows = paneRows(snap, keys, 100, NOW).slice(2);
  expect(rows.map((row) => row[1])).toEqual([
    { text: cell('◇', 2), tone: 'inactive' },
    { text: cell('◌', 2), tone: 'inactive' },
    { text: cell('◌', 2), tone: 'inactive' },
    { text: cell('◌', 2), tone: 'inactive' },
  ]);
  expect(rows[1]?.[2]).toEqual({
    text: cell('bare', 15),
    tone: 'text',
    dim: true,
  });
  expect(runOf(rows[1], 'furnace')?.tone).toBe('subtle');
  expect(runOf(rows[1], 'idle')?.tone).toBe('inactive');
});

const EXPLORE = {
  type: 'Explore',
  description: 'find callers of greet',
  status: 'running',
};

// demo-main, another main, with a waiting worker and a working one that runs a subagent.
const NESTED = snapshot({
  self: SELF,
  waiting: [
    {
      hasPid: true,
      sessionId: 'wait',
      name: 'wait-perm',
      repo: 'demo',
      reason: 'permission prompt',
      child: false,
    },
  ],
  others: [
    other({
      name: 'demo-main',
      sessionId: 'demo',
      repo: 'demo',
      state: 'working',
    }),
    other({
      name: 'wait-perm',
      sessionId: 'wait',
      repo: 'demo',
      kind: 'background',
      state: 'blocked',
      needs: 'approve Read: x',
    }),
    other({
      name: 'fan-out',
      sessionId: 'fan',
      repo: 'demo',
      kind: 'background',
      state: 'working',
    }),
  ],
});

const NESTED_KEYS = keysOf(
  key({ sessionId: 'demo', role: 'main', activity: 'Edit: a.ts' }),
  key({ sessionId: 'wait', main: 'demo-main' }),
  key({ sessionId: 'fan', main: 'demo-main', subagents: [EXPLORE] }),
);

test("another main's workers draw under it with the tree's glyphs, ◌ and dim, its block lifted while one waits", () => {
  expect(paneRows(NESTED, NESTED_KEYS, 100, NOW).map(plain)).toEqual([
    cell('', 3) +
      cell('◇', 2) +
      cell('demo-main', 15) +
      cell('working', 11) +
      cell('Edit: a.ts', 44) +
      '     demo',
    cell('', 3) +
      cell('├', 3) +
      cell('◌', 2) +
      cell('wait-perm', 12) +
      cell('needs you', 11) +
      cell('approve Read: x', 44) +
      '     demo',
    cell('', 3) +
      cell('└', 3) +
      cell('◌', 2) +
      cell('fan-out', 12) +
      cell('working', 11) +
      cell('', 44) +
      '     demo',
    `${cell('', 6)}└ ${cell('◦ Explore', 18)}find callers of greet`,
    `${cell('▣ todo-app-ce', 20)}this main`,
  ]);
  const worker = paneRows(NESTED, NESTED_KEYS, 100, NOW)[1];
  expect(runOf(worker, '◌')?.tone).toBe('inactive');
  expect(runOf(worker, 'wait-perm')).toMatchObject({ tone: 'text', dim: true });
});

test("docked, another main's workers hang from a trunk under its icon, and below 40 columns their heads stand alone", () => {
  expect(paneRows(NESTED, NESTED_KEYS, 60, NOW).map(plain)).toEqual([
    `${cell('◇', 2)}${cell('demo-main', 15)}${cell('working', 12)}demo`,
    `${cell('│', 6)}Edit: a.ts`,
    `${cell('├', 2)}${cell('◌', 2)}${cell('wait-perm', 13)}${cell('needs you', 12)}demo`,
    `${cell('│', 6)}approve Read: x`,
    `${cell('└', 2)}${cell('◌', 2)}${cell('fan-out', 13)}${cell('working', 12)}demo`,
    `${cell('', 6)}└ ${cell('◦ Explore', 11)}find callers of greet`,
    '▣ todo-app-ce',
  ]);
  expect(paneRows(NESTED, NESTED_KEYS, 24, NOW).map(plain)).toEqual([
    '◇ demo-main      working',
    '├ ◌ wait-perm    needs y',
    '└ ◌ fan-out      working',
    '▣ todo-app-ce',
  ]);
});

test("a main's own subagents hang from its trunk before its workers", () => {
  const keys = keysOf(
    key({
      sessionId: 'demo',
      role: 'main',
      activity: 'Edit: a.ts',
      subagents: [EXPLORE],
    }),
    key({ sessionId: 'fan', main: 'demo-main' }),
  );
  const snap = snapshot({
    self: SELF,
    others: [
      other({ name: 'demo-main', sessionId: 'demo', repo: 'demo' }),
      other({ name: 'fan-out', sessionId: 'fan', repo: 'demo' }),
    ],
  });
  expect(paneRows(snap, keys, 100, NOW).map(plain).slice(3, 5)).toEqual([
    `${cell('', 3)}├ ${cell('◦ Explore', 18)}find callers of greet`,
    `${cell('', 3)}${cell('└', 3)}${cell('◌', 2)}${cell('fan-out', 12)}${cell('idle', 11)}${cell('', 44)}     demo`,
  ]);
  expect(paneRows(snap, keys, 60, NOW).map(plain).slice(2, 6)).toEqual([
    `${cell('◇', 2)}${cell('demo-main', 15)}${cell('idle', 12)}demo`,
    `${cell('│', 6)}Edit: a.ts`,
    `${cell('│', 6)}└ ${cell('◦ Explore', 11)}find callers of greet`,
    `${cell('└', 2)}${cell('◌', 2)}${cell('fan-out', 13)}${cell('idle', 12)}demo`,
  ]);
});

test('each session draws at most three subagent rows, then ◦ +N more, inactive', () => {
  const five = ['a', 'b', 'c', 'd', 'e'].map((type) => ({
    type,
    description: `${type} task`,
    status: 'running',
  }));
  const snap = snapshot({
    self: SELF,
    children: [child({ name: 'add-greeting', sessionId: 'add' })],
    others: [other({ name: 'bench', sessionId: 'bench', repo: 'other' })],
  });
  const keys = keysOf(
    key({ sessionId: 'add', subagents: five.slice(0, 4) }),
    key({ sessionId: 'bench', role: 'other', subagents: five }),
  );
  const subagent = (
    lead: string,
    branch: string,
    type: string,
    cells: number,
  ) => `${lead}${branch} ${cell(`◦ ${type}`, cells)}${type} task`;
  expect(paneRows(snap, keys, 100, NOW).map(plain).slice(1)).toEqual([
    `${cell('└', 3)}${cell('◐', 2)}${cell('add-greeting', 15)}working`,
    subagent('   ', '├', 'a', 18),
    subagent('   ', '├', 'b', 18),
    subagent('   ', '├', 'c', 18),
    '   └ ◦ +1 more',
    '',
    `${cell('', 3)}${cell('◌', 2)}${cell('bench', 15)}${cell('idle', 11)}${cell('', 44)}     other`,
    subagent('   ', '├', 'a', 18),
    subagent('   ', '├', 'b', 18),
    subagent('   ', '├', 'c', 18),
    '   └ ◦ +2 more',
  ]);
  const docked = paneRows(snap, keys, 60, NOW);
  expect(docked.map(plain).slice(-4)).toEqual([
    subagent('      ', '├', 'a', 11),
    subagent('      ', '├', 'b', 11),
    subagent('      ', '├', 'c', 11),
    '      └ ◦ +2 more',
  ]);
  expect(runOf(docked.at(-1), '◦ +2 more')?.tone).toBe('inactive');
});

test('docked, a context bar that does not fit whole drops, and its tokens stay when they fit', () => {
  const head = `${cell('◇', 2)}${cell('odin-review', 15)}${cell('needs you', 12)}${cell('odin', 11)}`;
  const first = (columns: number) =>
    plain(paneRows(TREE, TREE_KEYS, columns, NOW)[0] ?? []);
  expect(first(51)).toBe(`${head}▰▰▰▰▱  176k`);
  expect(first(45)).toBe(`${head} 176k`);
  expect(first(44)).toBe(`${head}176k`);
  expect(first(43)).toBe(head.trimEnd());
  for (let columns = 1; columns < 80; columns += 1) {
    for (const row of paneRows(TREE, TREE_KEYS, columns, NOW)) {
      const cells = plain(row).match(/[▰▱]/g) ?? [];
      expect(cells.length === 0 || cells.length === 5).toBe(true);
    }
  }
});

test('the root count drops its needs-you phrase whole, then its workers, rather than cut either', () => {
  const snap = snapshot({
    self: SELF,
    waiting: [
      {
        hasPid: true,
        name: 'a',
        repo: 'todo-app',
        reason: 'permission prompt',
        child: true,
      },
    ],
    children: [
      child({ name: 'a', state: 'blocked' }),
      child({ name: 'b' }),
      child({ name: 'c' }),
    ],
  });
  const root = (columns: number) =>
    plain(paneRows(snap, new Map(), columns, NOW)[0] ?? []);
  expect(root(60)).toBe(`${cell('▣ todo-app-ce', 19)}3 workers · 1 needs you`);
  expect(root(32)).toBe(`${cell('▣ todo-app-ce', 19)}3 workers`);
  expect(root(27)).toBe('▣ todo-app-ce');
});

test('a session that needs you reads ● needs you on a child and needs you elsewhere, in the warning tone', () => {
  const rows = paneRows(
    snapshot({
      self: SELF,
      children: [
        child({ name: 'fix-readme', state: 'blocked', needs: 'approve Read' }),
      ],
    }),
    new Map(),
    100,
    NOW,
  );
  expect(runOf(rows[1], '●')?.tone).toBe('warning');
  expect(runOf(rows[1], 'needs you')?.tone).toBe('warning');
  expect(runOf(rows[1], 'approve Read')?.tone).toBe('inactive');
  expect(runOf(paneRows(TREE, TREE_KEYS, 100, NOW)[0], 'needs you')?.tone).toBe(
    'warning',
  );
});

test('any other state word reads raw beside ○, gone included', () => {
  const rows = paneRows(
    snapshot({
      self: SELF,
      children: [child({ name: 'g', state: 'gone', hasPid: false })],
    }),
    new Map(),
    100,
    NOW,
  );
  expect(runOf(rows[1], '○')?.tone).toBe('inactive');
  expect(runOf(rows[1], 'gone')?.tone).toBe('inactive');
});

const barAt = (percent: number): StyledRow | undefined => {
  const snap = snapshot({
    self: SELF,
    children: [child({ name: 'a', sessionId: 'a' })],
  });
  const used = percent * 2_000;
  const keys = keysOf(
    key({ sessionId: 'a', context: { used, limit: 200_000 } }),
  );
  return paneRows(snap, keys, 100, NOW)[1];
};

test('the context bar takes inactive below 65%, warning from 65%, claude from 75%, and error from 85%', () => {
  const expected = [
    { percent: 64, tone: 'inactive', filled: 3, tokens: '128k' },
    { percent: 65, tone: 'warning', filled: 3, tokens: '130k' },
    { percent: 75, tone: 'claude', filled: 4, tokens: '150k' },
    { percent: 85, tone: 'error', filled: 4, tokens: '170k' },
  ];
  for (const { percent, tone, filled, tokens } of expected) {
    const row = barAt(percent);
    expect(row?.slice(-3)).toEqual([
      { text: '▰'.repeat(filled), tone },
      { text: '▱'.repeat(5 - filled), tone: 'subtle' },
      { text: ` ${tokens}`.padStart(6), tone },
    ]);
  }
});

test('a full bar has no empty cells, and an empty one no filled cells', () => {
  expect(plain(barAt(100) ?? [])).toEndWith('▰▰▰▰▰  200k');
  expect(barAt(100)?.at(-2)?.text).toBe('▰▰▰▰▰');
  expect(plain(barAt(0) ?? [])).toEndWith('▱▱▱▱▱     0');
});

test('with no published limit the tokens stand alone, inactive', () => {
  const rows = paneRows(
    snapshot({ self: SELF, children: [child({ name: 'a', tokens: 31_000 })] }),
    new Map(),
    100,
    NOW,
  );
  expect(rows[1]?.at(-1)).toEqual({
    text: '31k'.padStart(11),
    tone: 'inactive',
  });
  expect(plain(rows[1] ?? [])).not.toMatch(/[▰▱]/);
});

test('tokens round to k, keep k above a million, and stay bare below 1,000', () => {
  const tokens = (n: number) =>
    paneRows(
      snapshot({ self: SELF, children: [child({ name: 'a', tokens: n })] }),
      new Map(),
      100,
      NOW,
    )[1]
      ?.at(-1)
      ?.text.trim();
  expect(tokens(412400)).toBe('412k');
  expect(tokens(999)).toBe('999');
  expect(tokens(1000)).toBe('1k');
  expect(tokens(1234000)).toBe('1234k');
});

test('a child marks commits not integrated with ⇡N and uncommitted changes with ✎, in warning, gone or not', () => {
  for (const state of ['working', 'gone']) {
    const rows = paneRows(
      snapshot({
        self: SELF,
        children: [
          child({ name: 'a', state, unintegrated: 2, uncommitted: true }),
        ],
      }),
      new Map(),
      100,
      NOW,
    );
    expect(runOf(rows[1], '⇡2 ✎')?.tone).toBe('warning');
  }
});

test('a subagent row names its type in suggestion, then its description, italic and inactive', () => {
  const row = paneRows(TREE, TREE_KEYS, 100, NOW)[3];
  expect(row).toEqual([
    { text: cell('│  └', 5), tone: 'subtle' },
    { text: cell('◦ Explore', 18), tone: 'suggestion' },
    { text: 'find callers of greet', tone: 'inactive', italic: true },
  ]);
});

test('the pane draws warnings and job state warnings after the tree, in error', () => {
  const rows = paneRows(
    { ...TREE, warnings: ['git failed'], paneWarnings: ['job state bad'] },
    TREE_KEYS,
    100,
    NOW,
  );
  expect(rows.slice(-2)).toEqual([
    [{ text: '⚠ desk: git failed', tone: 'error' }],
    [{ text: '⚠ desk: job state bad', tone: 'error' }],
  ]);
});

test('the pane is empty below one column', () => {
  expect(paneRows(TREE, TREE_KEYS, 0, NOW)).toEqual([]);
});

// Thirteen sessions elsewhere wait, so three of them fall past an 11-row body.
const CROWD = snapshot({
  self: SELF,
  waiting: Array.from({ length: 13 }, (_, index) => ({
    hasPid: true,
    name: `s${index}`,
    repo: 'odin',
    reason: 'permission prompt',
    child: false,
  })),
  others: Array.from({ length: 13 }, (_, index) =>
    other({ name: `s${index}`, state: 'waiting' }),
  ),
});

// Review Focus 4: no needs-you row is hidden without the hint naming it.
test('at 11 body rows, three needs-you rows past the fold are named in the hint', () => {
  const entries = paneEntries(CROWD, new Map(), 100, NOW);
  expect(entries).toHaveLength(14);
  expect(hiddenNeeds(entries, 11)).toBe(3);
  const hint = paneHint(entries, 11, false, 100);
  expect(plain(hint ?? [])).toBe(
    '+4 rows · 3 need you · ctrl+x tab to focus, then ↓',
  );
  expect(runOf(hint, '3 need you')?.tone).toBe('warning');
  expect(runOf(hint, '+4 rows ·')?.tone).toBe('inactive');
  expect(plain(paneHint(entries, 11, true, 100) ?? [])).toBe(
    '+4 rows · 3 need you · ↓ to scroll',
  );
});

test('a hint too narrow for the keys keeps the needs, then cuts from its end', () => {
  const entries = paneEntries(CROWD, new Map(), 100, NOW);
  expect(plain(paneHint(entries, 11, false, 24) ?? [])).toBe(
    '+4 rows · 3 need you',
  );
  expect(plain(paneHint(entries, 13, false, 24) ?? [])).toBe(
    '+2 rows · 1 needs you',
  );
  expect(plain(paneHint(entries, 11, false, 12) ?? [])).toBe('+4 rows · 3 ');
});

test('with no needs-you row hidden the hint reads as the shared scroll hint', () => {
  const entries = paneEntries(TREE, TREE_KEYS, 100, NOW);
  expect(hiddenNeeds(entries, 3)).toBe(0);
  expect(paneHint(entries, 3, false, 100)).toEqual([
    { text: scrollHint(entries.length, 3, false) ?? '', tone: 'inactive' },
  ]);
  expect(paneHint(entries, 3, false, 10)).toEqual([
    { text: '+5 rows · ', tone: 'inactive' },
  ]);
  expect(paneHint(entries, entries.length, false, 100)).toBeUndefined();
});

// Only a session's head counts: its work line names no one new.
test('at 24 docked columns the hint counts each hidden needs-you head once', () => {
  const docked = paneEntries(CROWD, new Map(), 24, NOW);
  expect(docked).toHaveLength(14);
  expect(hiddenNeeds(docked, 11)).toBe(3);
  const twoRows = paneEntries(CROWD, new Map(), 60, NOW);
  expect(twoRows).toHaveLength(27);
  expect(hiddenNeeds(twoRows, 11)).toBe(8);
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
