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
  expect(failureRow('boom', 9)).toEqual([{ text: '⚠ desk: …', tone: 'error' }]);
  expect(failureRow('boom', 10)).toEqual([
    { text: '⚠ desk: b…', tone: 'error' },
  ]);
  expect(failureRow('boom', 1)).toEqual([{ text: '…', tone: 'error' }]);
  expect(width(plain(failureRow('boom', 0)))).toBe(0);
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

test('when even that is too wide the text is cut, ending in an ellipsis', () => {
  expect(bandLines(full, 8).map((line) => line.text)).toEqual([
    '● needs…',
    '◐ worke…',
  ]);
});

test('a failure line or a lone finished count cut short ends in an ellipsis', () => {
  const failed: DeskSnapshot = { version: 2, ok: false, error: 'boom' };
  expect(bandLines(failed, 11)).toEqual([
    { tone: 'failure', text: '⚠ desk: bo…' },
  ]);
  expect(bandLines(snapshot({ warnings: ['git failed'] }), 11)).toEqual([
    { tone: 'failure', text: '⚠ desk: gi…' },
  ]);
  expect(bandLines(snapshot({ finished: 12 }), 8)).toEqual([
    { tone: 'muted', text: '12 fini…' },
  ]);
});

test('at one column each band line is the ellipsis alone', () => {
  const failed: DeskSnapshot = { version: 2, ok: false, error: 'boom' };
  for (const snap of [full, failed, snapshot({ finished: 12 })]) {
    for (const line of bandLines(snap, 1)) expect(line.text).toBe('…');
  }
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

// A row of `columns` with `left` at its start and `right` flush against its end.
const spread = (left: string, right: string, columns: number) =>
  left + ' '.repeat(columns - width(left) - width(right)) + right;

// A repo's header, ruled to the end of a row of `columns`.
const header = (repo: string, columns: number) =>
  `─ ${repo} ${'─'.repeat(columns - width(repo) - 3)}`;

test('from 80 columns each session takes one row, as the L1 inline plate', () => {
  const rows = paneRows(TREE, TREE_KEYS, 100, NOW).map(plain);
  expect(rows).toEqual([
    cell('', 3) +
      cell('□', 2) +
      cell('odin-review', 15) +
      cell('needs you', 11) +
      cell('which branch should I review?', 41) +
      cell('     odin', 14) +
      '▰▰▰▰  176k/88%',
    `${cell('▣ todo-app-ce', 20)}this main${' '.repeat(62)}2 workers`,
    cell('├', 3) +
      cell('◐', 2) +
      cell('add-greeting', 15) +
      cell('working', 11) +
      cell('Task 2 of 3', 41) +
      cell('', 14) +
      '▰▰▰▱  156k/78%',
    `${cell('│  └', 5)}${cell('◦ Explore', 18)}find callers of greet`,
    cell('└', 3) +
      cell('✓', 2) +
      cell('p7-desk', 15) +
      cell('done', 11) +
      cell('report sent', 41) +
      cell('⇡2', 14) +
      '140k'.padStart(14),
    '',
    cell('', 3) +
      cell('□', 2) +
      cell('pm-main', 15) +
      cell('idle', 11) +
      cell('', 41) +
      cell('     sidekick', 14) +
      '▰▱▱▱  120k/12%',
  ]);
});

test('below 80 columns the pane stacks: a group per repo, each session a head row and a detail row, its icon its state', () => {
  for (const columns of [60, 40]) {
    expect(paneRows(TREE, TREE_KEYS, columns, NOW).map(plain)).toEqual([
      header('odin', columns),
      spread('● odin-review', '▰▰▰▰  176k/88%', columns),
      '  which branch should I review?',
      header('sidekick', columns),
      spread('▣ todo-app-ce', '2 workers', columns),
      spread('├ ◐ add-greeting', '▰▰▰▱  156k/78%', columns),
      '│ │ Task 2 of 3',
      '│ └ ◐ Explore',
      '│     find callers of greet',
      spread('└ ✓ p7-desk ⇡2', '140k', columns),
      '    report sent',
      spread('○ pm-main', '▰▱▱▱  120k/12%', columns),
      '  idle',
    ]);
  }
});

test('stacked, a question reads in the warning tone, a worker by name in bold, a subagent by type in suggestion', () => {
  const rows = paneRows(TREE, TREE_KEYS, 60, NOW);
  expect(rows[0]).toEqual([
    { text: '─ ', tone: 'subtle' },
    { text: 'odin', tone: 'inactive', bold: true },
    { text: ` ${'─'.repeat(53)}`, tone: 'subtle' },
  ]);
  expect(runOf(rows[1], '●')?.tone).toBe('warning');
  expect(runOf(rows[1], 'odin-review')).toEqual({
    text: 'odin-review',
    tone: 'text',
  });
  expect(runOf(rows[2], 'which branch should I review?')?.tone).toBe('warning');
  expect(rows[4]?.[0]).toEqual({
    text: '▣ todo-app-ce',
    tone: 'claude',
    bold: true,
  });
  expect(runOf(rows[5], 'add-greeting')).toEqual({
    text: 'add-greeting',
    tone: 'text',
    bold: true,
  });
  expect(runOf(rows[6], 'Task 2 of 3')?.tone).toBe('inactive');
  expect(runOf(rows[7], '◐')?.tone).toBe('suggestion');
  expect(runOf(rows[7], 'Explore')?.tone).toBe('suggestion');
  expect(runOf(rows[8], 'find callers of greet')).toEqual({
    text: 'find callers of greet',
    tone: 'inactive',
    italic: true,
  });
  expect(runOf(rows[12], 'idle')?.tone).toBe('inactive');
});

// A worker with a long profile, a main with one, and a session without a key.
const PROFILED = snapshot({
  self: SELF,
  children: [child({ name: 'add-greeting', sessionId: 'add' })],
  others: [
    other({ name: 'pm-main', sessionId: 'pm', repo: 'sidekick' }),
    other({ name: 'bench', sessionId: 'bench', repo: 'sidekick' }),
  ],
});

const PROFILED_KEYS = keysOf(
  key({
    sessionId: 'add',
    profile: 'worker-opus',
    activity: 'Edit: plugin/hooks/desk/rows.ts',
  }),
  key({ sessionId: 'pm', role: 'main', profile: 'main' }),
);

test("stacked, a session's profile stands at the right of its detail row while the detail keeps 12 columns", () => {
  const rows = (columns: number) =>
    paneRows(PROFILED, PROFILED_KEYS, columns, NOW).map(plain);
  expect(rows(40)).toEqual([
    header('sidekick', 40),
    spread('▣ todo-app-ce', '1 worker', 40),
    '└ ◐ add-greeting',
    spread('    Edit: plugin/hooks/desk…', 'worker-opus', 40),
    '○ pm-main',
    spread('  idle', 'main', 40),
    '○ bench',
    '  idle',
  ]);
  expect(rows(28)[3]).toBe(spread('    Edit: plugi…', 'worker-opus', 28));
  expect(rows(27)[3]).toBe('    Edit: plugin/hooks/des…');
  const detail = paneRows(PROFILED, PROFILED_KEYS, 40, NOW)[3];
  expect(runOf(detail, 'worker-opus')?.tone).toBe('subtle');
});

test('no row is wider than its columns; inline only the gap row is empty, and stacked from 24 columns none is', () => {
  const withWarnings = {
    ...TREE,
    warnings: ['a warning'],
    paneWarnings: ['a job state warning'],
  };
  for (const snap of [TREE, withWarnings]) {
    for (let columns = 1; columns <= 130; columns += 1) {
      const rows = paneRows(snap, TREE_KEYS, columns, NOW);
      const empty = rows.filter((row) => row.length === 0);
      if (columns >= 80) expect(empty).toHaveLength(1);
      if (columns >= 24 && columns < 80) expect(empty).toHaveLength(0);
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

test('a row elsewhere leads with its kind: □ for a main, – for any other or no key, its name dim', () => {
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
    { text: cell('□', 2), tone: 'inactive' },
    { text: cell('–', 2), tone: 'inactive' },
    { text: cell('–', 2), tone: 'inactive' },
    { text: cell('–', 2), tone: 'inactive' },
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

test("another main's workers draw under it with the tree's glyphs, – and dim, its block lifted while one waits", () => {
  expect(paneRows(NESTED, NESTED_KEYS, 100, NOW).map(plain)).toEqual([
    cell('', 3) +
      cell('□', 2) +
      cell('demo-main', 15) +
      cell('working', 11) +
      cell('Edit: a.ts', 41) +
      '     demo',
    cell('', 3) +
      cell('├', 3) +
      cell('–', 2) +
      cell('wait-perm', 12) +
      cell('needs you', 11) +
      cell('approve Read: x', 41) +
      '     demo',
    cell('', 3) +
      cell('└', 3) +
      cell('–', 2) +
      cell('fan-out', 12) +
      cell('working', 11) +
      cell('', 41) +
      '     demo',
    `${cell('', 6)}└ ${cell('◦ Explore', 18)}find callers of greet`,
    `${cell('▣ todo-app-ce', 20)}this main`,
  ]);
  const worker = paneRows(NESTED, NESTED_KEYS, 100, NOW)[1];
  expect(runOf(worker, '–')?.tone).toBe('inactive');
  expect(runOf(worker, 'wait-perm')).toMatchObject({ tone: 'text', dim: true });
});

test("stacked, another main's workers hang from it, waiting first, and their subagents from them", () => {
  expect(paneRows(NESTED, NESTED_KEYS, 60, NOW).map(plain)).toEqual([
    header('demo', 60),
    '◐ demo-main',
    '│ Edit: a.ts',
    '├ ● wait-perm',
    '│   approve Read: x',
    '└ ◐ fan-out',
    '  │ working',
    '  └ ◐ Explore',
    '      find callers of greet',
    header('sidekick', 60),
    '▣ todo-app-ce',
  ]);
  const rows = paneRows(NESTED, NESTED_KEYS, 60, NOW);
  expect(runOf(rows[3], '●')?.tone).toBe('warning');
  expect(runOf(rows[4], 'approve Read: x')?.tone).toBe('warning');
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
    `${cell('', 3)}${cell('└', 3)}${cell('–', 2)}${cell('fan-out', 12)}${cell('idle', 11)}${cell('', 41)}     demo`,
  ]);
  expect(paneRows(snap, keys, 60, NOW).map(plain)).toEqual([
    header('sidekick', 60),
    '▣ todo-app-ce',
    header('demo', 60),
    '○ demo-main',
    '│ Edit: a.ts',
    '├ ◐ Explore',
    '│   find callers of greet',
    '└ ○ fan-out',
    '    idle',
  ]);
});

test("this main's own subagents hang from the root's trunk before its workers", () => {
  const keys = keysOf(
    key({ sessionId: 'self', role: 'main', subagents: [EXPLORE] }),
  );
  const snap = snapshot({
    self: SELF,
    children: [child({ name: 'add-greeting', sessionId: 'add' })],
  });
  const inline = paneRows(snap, keys, 100, NOW).map(plain);
  expect(inline[1]).toBe(`├ ${cell('◦ Explore', 18)}find callers of greet`);
  expect(
    inline[2]?.startsWith(`${cell('└', 3)}${cell('◐', 2)}add-greeting`),
  ).toBe(true);
  expect(paneRows(snap, keys, 60, NOW).map(plain)).toEqual([
    header('sidekick', 60),
    spread('▣ todo-app-ce', '1 worker', 60),
    '├ ◐ Explore',
    '│   find callers of greet',
    '└ ◐ add-greeting',
    '    working',
  ]);
});

test("this main's own subagents end its trunk when it has no workers", () => {
  const keys = keysOf(
    key({ sessionId: 'self', role: 'main', subagents: [EXPLORE] }),
  );
  const snap = snapshot({ self: SELF });
  expect(paneRows(snap, keys, 100, NOW).map(plain)).toEqual([
    `${cell('▣ todo-app-ce', 20)}this main`,
    `└ ${cell('◦ Explore', 18)}find callers of greet`,
  ]);
  expect(paneRows(snap, keys, 60, NOW).map(plain)).toEqual([
    header('sidekick', 60),
    '▣ todo-app-ce',
    '└ ◐ Explore',
    '    find callers of greet',
  ]);
});

test('each session draws at most three subagents, then one row that counts the rest, inactive', () => {
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
    `${cell('', 3)}${cell('–', 2)}${cell('bench', 15)}${cell('idle', 11)}${cell('', 41)}     other`,
    subagent('   ', '├', 'a', 18),
    subagent('   ', '├', 'b', 18),
    subagent('   ', '├', 'c', 18),
    '   └ ◦ +2 more',
  ]);
  const stacked = paneRows(snap, keys, 60, NOW);
  expect(stacked.map(plain)).toEqual([
    header('sidekick', 60),
    spread('▣ todo-app-ce', '1 worker', 60),
    '└ ◐ add-greeting',
    '  │ working',
    '  ├ ◐ a',
    '  │   a task',
    '  ├ ◐ b',
    '  │   b task',
    '  ├ ◐ c',
    '  │   c task',
    '  └ +1 more',
    header('other', 60),
    '○ bench',
    '│ idle',
    '├ ◐ a',
    '│   a task',
    '├ ◐ b',
    '│   b task',
    '├ ◐ c',
    '│   c task',
    '└ +2 more',
  ]);
  expect(runOf(stacked.at(-1), '+2 more')?.tone).toBe('inactive');
});

test('stacked, the context keeps its bar while the name keeps 8 columns, then its text alone, giving the name the rest, then gives way', () => {
  const head = (columns: number) =>
    plain(paneRows(TREE, TREE_KEYS, columns, NOW)[1] ?? []);
  expect(head(40)).toBe(spread('● odin-review', '▰▰▰▰  176k/88%', 40));
  expect(head(25)).toBe('● odin-re… ▰▰▰▰  176k/88%');
  expect(head(24)).toBe(spread('● odin-review', '176k/88%', 24));
  expect(head(19)).toBe('● odin-re… 176k/88%');
  expect(head(18)).toBe('● odin-review');
  for (let columns = 1; columns < 80; columns += 1) {
    for (const row of paneRows(TREE, TREE_KEYS, columns, NOW)) {
      const cells = plain(row).match(/[▰▱]/g) ?? [];
      expect(cells.length === 0 || cells.length === 4).toBe(true);
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
    paneRows(snap, new Map(), columns, NOW)
      .map(plain)
      .find((row) => row.startsWith('▣'));
  expect(root(100)).toEndWith('3 workers · 1 needs you');
  expect(root(60)).toBe(spread('▣ todo-app-ce', '3 workers · 1 needs you', 60));
  expect(root(32)).toBe(spread('▣ todo-app-ce', '3 workers', 32));
  expect(root(24)).toBe('▣ todo-app-ce  3 workers');
  expect(root(23)).toBe('▣ todo-app-ce');
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

test('the context bar lights a cell per level, each in its own tone: the first under 65%, then from 65%, 75%, and 85%; its number takes the last lit tone', () => {
  const expected = [
    { percent: 6, lit: ['success'], text: '12k/6%' },
    { percent: 64.9, lit: ['success'], text: '130k/64%' },
    { percent: 65, lit: ['success', 'warning'], text: '130k/65%' },
    { percent: 74, lit: ['success', 'warning'], text: '148k/74%' },
    { percent: 75, lit: ['success', 'warning', 'claude'], text: '150k/75%' },
    { percent: 84, lit: ['success', 'warning', 'claude'], text: '168k/84%' },
    {
      percent: 85,
      lit: ['success', 'warning', 'claude', 'error'],
      text: '170k/85%',
    },
    {
      percent: 94,
      lit: ['success', 'warning', 'claude', 'error'],
      text: '188k/94%',
    },
  ];
  for (const { percent, lit, text } of expected) {
    const runs = [
      ...lit.map((tone) => ({ text: '▰', tone })),
      ...(lit.length < 4
        ? [{ text: '▱'.repeat(4 - lit.length), tone: 'subtle' }]
        : []),
      { text: ` ${text.padStart(9)}`, tone: lit.at(-1) },
    ];
    expect(barAt(percent)?.slice(-runs.length)).toEqual(runs);
    expect(plain(barAt(percent) ?? []).match(/[▰▱]/g)).toHaveLength(4);
  }
});

test('from 95% a skull takes the four cells in the error tone, and the row keeps its width', () => {
  expect(barAt(95)?.slice(-2)).toEqual([
    { text: '💀  ', tone: 'error' },
    { text: '  190k/95%', tone: 'error' },
  ]);
  expect(barAt(100)?.slice(-2)).toEqual([
    { text: '💀  ', tone: 'error' },
    { text: ' 200k/100%', tone: 'error' },
  ]);
  const columns = width(plain(barAt(94) ?? []));
  expect(width(plain(barAt(95) ?? []))).toBe(columns);
  expect(width(plain(barAt(100) ?? []))).toBe(columns);
});

test('an empty bar lights its first cell', () => {
  expect(plain(barAt(0) ?? [])).toEndWith('▰▱▱▱      0/0%');
  expect(barAt(0)?.slice(-3)).toEqual([
    { text: '▰', tone: 'success' },
    { text: '▱▱▱', tone: 'subtle' },
    { text: '      0/0%', tone: 'success' },
  ]);
});

test("stacked, the context's text alone takes its level's tone, as the number beside the bar does", () => {
  const pm = paneRows(TREE, TREE_KEYS, 20, NOW).find((row) =>
    plain(row).startsWith('○ pm-main'),
  );
  expect(plain(pm ?? [])).toBe(spread('○ pm-main', '120k/12%', 20));
  expect(pm?.at(-1)).toEqual({ text: '120k/12%', tone: 'success' });
  const odin = paneRows(TREE, TREE_KEYS, 24, NOW)[1];
  expect(odin?.at(-1)).toEqual({ text: '176k/88%', tone: 'error' });
});

test('with no published limit the tokens stand alone, inactive', () => {
  const rows = paneRows(
    snapshot({ self: SELF, children: [child({ name: 'a', tokens: 31_000 })] }),
    new Map(),
    100,
    NOW,
  );
  expect(rows[1]?.at(-1)).toEqual({
    text: '31k'.padStart(14),
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

// A child whose name, state word, work line, subagent type, and subagent
// description each overflow their room, and a session elsewhere whose repo does.
const LONG = snapshot({
  self: SELF,
  children: [
    child({
      name: 'add-greeting-to-readme',
      sessionId: 'long',
      state: 'reconnecting',
    }),
  ],
  others: [
    other({ name: 'pm-main', sessionId: 'pm', repo: 'a-long-repository' }),
  ],
});

const LONG_DESCRIPTION =
  'find every caller of the cell helper in the desk, then in the board, and then in the gauge';

const LONG_KEYS = keysOf(
  key({
    sessionId: 'long',
    activity: 'Edit: plugin/hooks/desk/rows.ts, then its tests',
    subagents: [
      {
        type: 'general-purpose-agent',
        description: LONG_DESCRIPTION,
        status: 'running',
      },
    ],
  }),
);

test('inline, a cut name, state word, work line, repo, subagent type, or description ends in an ellipsis', () => {
  const rows = paneRows(LONG, LONG_KEYS, 100, NOW);
  expect(rows.slice(1).map(plain)).toEqual([
    cell('└', 3) +
      cell('○', 2) +
      cell('add-greeting-…', 15) +
      cell('reconnect…', 11) +
      'Edit: plugin/hooks/desk/rows.ts, then i…',
    `   └ ${cell('◦ general-purpos…', 18)}${LONG_DESCRIPTION.slice(0, 76)}…`,
    '',
    cell('', 3) +
      cell('–', 2) +
      cell('pm-main', 15) +
      cell('idle', 11) +
      cell('', 41) +
      '     a-long-…',
  ]);
  expect(rows[2]?.at(-1)).toEqual({
    text: `${LONG_DESCRIPTION.slice(0, 76)}…`,
    tone: 'inactive',
    italic: true,
  });
  for (const row of rows) expect(width(plain(row))).toBeLessThanOrEqual(100);
});

test('stacked, a cut name, work line, subagent type, or description ends in an ellipsis', () => {
  const rows = paneRows(LONG, LONG_KEYS, 24, NOW);
  expect(rows.slice(2, 6).map(plain)).toEqual([
    '└ ○ add-greeting-to-rea…',
    '  │ reconnecting · Edit…',
    '  └ ◐ general-purpose-a…',
    '      find every caller…',
  ]);
  expect(runOf(rows[2], 'add-greeting-to-rea…')).toEqual({
    text: 'add-greeting-to-rea…',
    tone: 'text',
    bold: true,
  });
  expect(runOf(rows[5], 'find every caller…')).toEqual({
    text: 'find every caller…',
    tone: 'inactive',
    italic: true,
  });
});

test('at one column a cut row is the ellipsis alone, in the tone of the run it cuts, and a head whose name has no room keeps its icon', () => {
  const rows = paneRows(TREE, TREE_KEYS, 1, NOW);
  expect(rows.map(plain)).toEqual([
    '…',
    '●',
    '…',
    '…',
    '…',
    '…',
    '…',
    '…',
    '…',
    '…',
    '…',
    '○',
    '…',
  ]);
  expect(rows[0]).toEqual([{ text: '…', tone: 'subtle' }]);
  expect(rows[1]).toEqual([{ text: '●', tone: 'warning' }]);
  expect(rows[4]).toEqual([{ text: '…', tone: 'claude', bold: true }]);
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

test("stacked, a subagent's icon is its state: ◐ running, ● waiting, ○ pending or a word the desk does not know", () => {
  const subagent = (status: string) => ({
    type: status,
    description: '',
    status,
  });
  const snap = snapshot({
    self: SELF,
    children: [
      child({ name: 'a', sessionId: 'a' }),
      child({ name: 'b', sessionId: 'b' }),
    ],
  });
  const keys = keysOf(
    key({
      sessionId: 'a',
      subagents: ['running', 'waiting', 'pending'].map(subagent),
    }),
    key({ sessionId: 'b', subagents: [subagent('constructor')] }),
  );
  const rows = paneRows(snap, keys, 40, NOW);
  const shown = [4, 5, 6, 9].map((index) => rows[index]);
  expect(shown.map((row) => plain(row ?? []))).toEqual([
    '│ ├ ◐ running',
    '│ ├ ● waiting',
    '│ └ ○ pending',
    '  └ ○ constructor',
  ]);
  expect(shown.map((row) => row?.[1]?.tone)).toEqual([
    'suggestion',
    'warning',
    'inactive',
    'inactive',
  ]);
});

test('stacked, a state word its icon cannot say leads the detail row, and stands alone without work', () => {
  const rows = (detail?: string) =>
    paneRows(
      snapshot({
        self: SELF,
        children: [
          child({
            name: 'g',
            state: 'gone',
            hasPid: false,
            ...(detail === undefined ? {} : { detail }),
          }),
        ],
      }),
      new Map(),
      40,
      NOW,
    );
  expect(rows('report sent').slice(2).map(plain)).toEqual([
    '└ ○ g',
    '    gone · report sent',
  ]);
  expect(runOf(rows('report sent')[3], 'gone ·')?.tone).toBe('inactive');
  expect(rows().slice(2).map(plain)).toEqual(['└ ○ g', '    gone']);
});

test("stacked, another repo with a session that needs you comes first, then this repo's waiting sessions, this main, and the rest", () => {
  const wait = (name: string, repo: string) => ({
    hasPid: true,
    name,
    repo,
    reason: 'permission prompt',
    child: false,
  });
  const snap = snapshot({
    self: SELF,
    waiting: [wait('w-main', 'beta'), wait('s-wait', 'sidekick')],
    children: [child({ name: 'kid' })],
    others: [
      other({ name: 'a-main', repo: 'alpha' }),
      other({ name: 's-other', repo: 'sidekick' }),
      other({ name: 'w-main', repo: 'beta', state: 'waiting' }),
      other({ name: 's-wait', repo: 'sidekick', state: 'waiting' }),
    ],
  });
  expect(paneRows(snap, new Map(), 60, NOW).map(plain)).toEqual([
    header('beta', 60),
    '● w-main',
    '  permission prompt',
    header('sidekick', 60),
    '● s-wait',
    '  permission prompt',
    spread('▣ todo-app-ce', '1 worker', 60),
    '└ ◐ kid',
    '    working',
    '○ s-other',
    '  idle',
    header('alpha', 60),
    '○ a-main',
    '  idle',
  ]);
});

test('stacked, a context or a profile shows whole or not at all, at every width from 24 columns', () => {
  const contexts = ['176k/88%', '156k/78%', '140k', '120k/12%'];
  for (let columns = 24; columns < 80; columns += 1) {
    for (const row of paneRows(TREE, TREE_KEYS, columns, NOW).map(plain)) {
      for (const text of contexts) {
        if (row.includes(text.slice(0, 4))) expect(row).toEndWith(text);
      }
    }
    const profiled = paneRows(PROFILED, PROFILED_KEYS, columns, NOW);
    for (const row of profiled.map(plain)) {
      if (row.includes('worker-o')) expect(row).toEndWith('worker-opus');
    }
  }
});

test("stacked, only the head row of a session that needs you counts for the hint: a child's, and another main's worker's", () => {
  const snap = {
    ...NESTED,
    waiting: [
      ...NESTED.waiting,
      {
        hasPid: true,
        name: 'fix',
        repo: 'sidekick',
        reason: 'permission prompt',
        child: true,
      },
    ],
    children: [
      child({ name: 'fix', state: 'blocked' }),
      child({ name: 'calm' }),
    ],
  };
  const flagged = paneEntries(snap, NESTED_KEYS, 40, NOW)
    .filter((entry) => entry.needsYou)
    .map((entry) => plain(entry.row));
  expect(flagged).toEqual(['├ ● wait-perm', '├ ● fix']);
});

test('stacked, a group with no repository name heads with a plain rule', () => {
  const { repo: _repo, ...bare } = TREE;
  const rows = paneRows(bare, TREE_KEYS, 40, NOW).map(plain);
  expect(rows.slice(3, 5)).toEqual([
    '─'.repeat(40),
    spread('▣ todo-app-ce', '2 workers', 40),
  ]);
  const nameless = snapshot({
    self: SELF,
    others: [other({ name: 'x', repo: '' })],
  });
  expect(paneRows(nameless, new Map(), 40, NOW).map(plain)).toEqual([
    header('sidekick', 40),
    '▣ todo-app-ce',
    '─'.repeat(40),
    '○ x',
    '  idle',
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
  expect(paneHint(entries, 11, false, 12)).toEqual([
    { text: '+4 rows · ', tone: 'inactive' },
    { text: '3…', tone: 'warning' },
  ]);
  expect(paneHint(entries, 11, false, 1)).toEqual([
    { text: '…', tone: 'inactive' },
  ]);
  expect(paneHint(entries, 11, false, 0)).toEqual([]);
});

test('with no needs-you row hidden the hint reads as the shared scroll hint', () => {
  const entries = paneEntries(TREE, TREE_KEYS, 100, NOW);
  expect(hiddenNeeds(entries, 3)).toBe(0);
  expect(paneHint(entries, 3, false, 100)).toEqual([
    { text: scrollHint(entries.length, 3, false) ?? '', tone: 'inactive' },
  ]);
  expect(paneHint(entries, 3, false, 10)).toEqual([
    { text: '+5 rows ·…', tone: 'inactive' },
  ]);
  expect(paneHint(entries, 3, false, 1)).toEqual([
    { text: '…', tone: 'inactive' },
  ]);
  expect(width(plain(paneHint(entries, 3, false, 0) ?? []))).toBe(0);
  expect(paneHint(entries, entries.length, false, 100)).toBeUndefined();
});

// Only a session's head counts: its work line names no one new.
test('stacked, the hint counts each hidden needs-you head once, not its detail row', () => {
  for (const columns of [24, 60]) {
    const stacked = paneEntries(CROWD, new Map(), columns, NOW);
    expect(stacked).toHaveLength(29);
    expect(hiddenNeeds(stacked, 11)).toBe(8);
  }
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
