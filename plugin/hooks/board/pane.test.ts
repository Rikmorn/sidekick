import { expect, test } from 'claude-code/testing';
import { width } from '../lines';
import { rowWidth, type StyledRow } from '../styled';
import {
  type BoardGlance,
  GLANCE_VERSION,
  type GlancePane,
  type PaneNode,
} from './contract';
import { boardPaneRows, fitPane, type PaneInput } from './pane';

const BOARD = {
  owner: 'Rikmorn',
  repo: 'sidekick',
  number: 9,
  url: 'https://github.com/users/Rikmorn/projects/9',
};

const STATE = { level: 'warning', word: 'at risk', detail: null } as const;

function node(over: Partial<PaneNode> & Pick<PaneNode, 'mark'>): PaneNode {
  return {
    ref: null,
    text: 'text',
    right: null,
    weight: 'plain',
    children: [],
    ...over,
  };
}

const TREE: PaneNode[] = [
  node({ mark: 'done', text: '2 plans done', weight: 'quiet' }),
  node({
    mark: 'running',
    text: 'Plan 13 usage guide and the board pane',
    weight: 'strong',
    children: [
      node({
        mark: 'running',
        ref: '#240',
        text: 'The guide, with its pictures of every screen',
        right: '9 d',
      }),
      node({ mark: 'more', text: '3 closed', weight: 'quiet' }),
    ],
  }),
  node({
    mark: 'next',
    text: 'Plan 14',
    right: 'next',
    children: [node({ mark: 'later', ref: '#250', text: 'The loop' })],
  }),
  node({ mark: 'later', text: 'Plan 15', right: '2 open', weight: 'quiet' }),
  node({ mark: 'group', text: 'unplanned', weight: 'quiet' }),
];

const PANE: GlancePane = {
  rows: [
    {
      kind: 'prose',
      mark: 'next',
      text: 'finish #240, then pick up #250 next',
    },
    { kind: 'prose', mark: 'drift', text: 'stale: #240 (9 d), #241 (2 d)' },
    {
      kind: 'prose',
      mark: 'outcome',
      text: 'A control centre that shows who needs you.',
    },
    {
      kind: 'cells',
      plans: ['done', 'done', 'running', 'next', 'later'],
      label: '2/5 plans',
    },
    { kind: 'tree', nodes: TREE },
  ],
};

function input(over: Partial<PaneInput> = {}): PaneInput {
  return {
    board: BOARD,
    milestone: 'R9 control centre',
    state: STATE,
    pane: PANE,
    stamp: 'as of 09:41',
    ...over,
  };
}

const text = (row: StyledRow): string => row.map((run) => run.text).join('');
const lines = (rows: StyledRow[]): string[] => rows.map(text);

function rowWith(rows: StyledRow[], needle: string): StyledRow {
  const row = rows.find((candidate) => text(candidate).includes(needle));
  if (row === undefined) throw new Error(`no row holds ${needle}`);
  return row;
}

function runWith(row: StyledRow, needle: string) {
  const run = row.find((candidate) => candidate.text.includes(needle));
  if (run === undefined) throw new Error(`no run holds ${needle}`);
  return run;
}

test('no row is wider than the pane, at the widths the dock gives and below them', () => {
  for (const columns of [100, 53, 40, 24, 10, 1, 0]) {
    for (const rows of [
      fitPane(input(), columns),
      fitPane(input({ milestone: null }), columns),
      fitPane(input({ milestone: 'A'.repeat(90) }), columns),
    ]) {
      for (const row of rows) {
        expect(rowWidth(row)).toBeLessThanOrEqual(columns);
      }
    }
  }
});

test('every width from 0 to 120 fits and throws nothing', () => {
  for (let columns = 0; columns <= 120; columns += 1) {
    for (const row of fitPane(input(), columns)) {
      expect(rowWidth(row)).toBeLessThanOrEqual(columns);
    }
  }
});

test('the header is a rule that names the repo and links the board', () => {
  const rows = fitPane(input(), 53);
  expect(text(rows[0] ?? [])).toMatch(/^─ Rikmorn\/sidekick ─+ board #9 ─$/);
  expect(width(text(rows[0] ?? []))).toBe(53);
  const link = runWith(rows[0] ?? [], 'board #9');
  expect(link.href).toBe(BOARD.url);
  expect(link.tone).toBe('suggestion');
});

test('the owner goes before the repo is cut', () => {
  const first = text(fitPane(input(), 24)[0] ?? []);
  expect(first).toContain('sidekick');
  expect(first).not.toContain('Rikmorn');
  expect(first).toContain('board #9');
  expect(width(first)).toBe(24);

  const long = input({
    board: { ...BOARD, owner: 'o', repo: 'a-very-long-repository-name' },
  });
  const cutRepo = text(fitPane(long, 24)[0] ?? []);
  expect(cutRepo).toContain('a-very-l…');
  expect(cutRepo).not.toContain('o/');
  expect(cutRepo).toContain('board #9');
  expect(width(cutRepo)).toBe(24);
});

test('the head row sets the state word flush right while it fits with the title', () => {
  const head = fitPane(input(), 53)[1] ?? [];
  expect(text(head)).toMatch(/^▲ R9 control centre +at risk$/);
  expect(width(text(head))).toBe(53);
  expect(head[0]).toEqual({ text: '▲ ', tone: 'warning' });
  expect(runWith(head, 'R9 control').tone).toBe('text');
  expect(runWith(head, 'R9 control').bold).toBe(true);
  expect(runWith(head, 'at risk').tone).toBe('warning');
});

test('the word takes its own row, indented two, when the title leaves it no room', () => {
  const rows = fitPane(input(), 24);
  expect(rows[1] ? text(rows[1]) : '').toBe('▲ R9 control centre');
  expect(rows[2] ? text(rows[2]) : '').toBe('  at risk');
  expect(runWith(rows[2] ?? [], 'at risk').tone).toBe('warning');
});

test('a title wider than the row alone is cut, and the word takes its own row', () => {
  const rows = fitPane(input({ milestone: 'T'.repeat(60) }), 24);
  expect(rows[1] ? text(rows[1]) : '').toBe(`▲ ${'T'.repeat(21)}…`);
  expect(rows[2] ? text(rows[2]) : '').toBe('  at risk');
});

test('with no milestone the head row is the state word alone, bold in its tone', () => {
  const rows = fitPane(
    input({
      milestone: null,
      state: { level: 'unknown', word: 'no milestone', detail: null },
      pane: { rows: [] },
    }),
    40,
  );
  expect(lines(rows).slice(1)).toEqual([
    '○ no milestone',
    'as of 09:41'.padStart(40),
  ]);
  expect(rows[1]?.[1]).toEqual({
    text: 'no milestone',
    tone: 'inactive',
    bold: true,
  });
});

test('the head row draws the state as the line does: a tick for complete, ▼ for off track', () => {
  const done = fitPane(
    input({ state: { level: 'good', word: 'complete', detail: null } }),
    53,
  )[1];
  expect(done?.[0]).toEqual({ text: '✓ ', tone: 'success' });
  const bad = fitPane(
    input({ state: { level: 'bad', word: 'off track', detail: null } }),
    53,
  )[1];
  expect(bad?.[0]).toEqual({ text: '▼ ', tone: 'error' });
});

test('the head row carries no drift detail', () => {
  const rows = fitPane(
    input({
      state: { level: 'warning', word: 'at risk', detail: 'stale #240' },
    }),
    100,
  );
  expect(text(rows[1] ?? [])).not.toContain('stale');
});

test('prose wraps with a two-column hanging indent, each kind in its lead and tone', () => {
  const rows = fitPane(
    input({
      pane: {
        rows: [
          {
            kind: 'prose',
            mark: 'next',
            text: 'finish the guide, then pick up the loop design next',
          },
          {
            kind: 'prose',
            mark: 'drift',
            text: 'stale: #240 (9 d), #241 (2 d)',
          },
          {
            kind: 'prose',
            mark: 'outcome',
            text: 'A control centre that shows who needs you.',
          },
        ],
      },
    }),
    24,
  );
  const body = lines(rows).slice(3, -1);
  expect(body.length).toBeGreaterThan(3);
  for (const line of body) expect(width(line)).toBeLessThanOrEqual(24);
  const next = rows.slice(3).filter((row) => row[0]?.text === '→ ');
  expect(next).toHaveLength(1);
  expect(next[0]?.[0]).toEqual({ text: '→ ', tone: 'claude' });
  expect(next[0]?.[1]?.tone).toBe('claude');
  const firstNext = rows.findIndex((row) => row[0]?.text === '→ ');
  expect(rows[firstNext + 1]?.[0]).toEqual({ text: '  ', tone: 'subtle' });
  const drift = rowWith(rows, 'stale');
  expect(drift[0]).toEqual({ text: '▲ ', tone: 'warning' });
  expect(runWith(drift, 'stale').tone).toBe('warning');
  const outcome = rowWith(rows, 'A control');
  expect(outcome[0]?.text).toBe('  ');
  expect(runWith(outcome, 'A control')).toMatchObject({
    tone: 'inactive',
    italic: true,
  });
});

test('cells draw one per plan in their tones, with the label flush right', () => {
  const row = rowWith(fitPane(input(), 40), '2/5 plans');
  expect(text(row)).toBe(`  ██▓░░${' '.repeat(40 - 2 - 5 - 9)}2/5 plans`);
  expect(runWith(row, '█')).toEqual({ text: '██', tone: 'success' });
});

test('cells scale below one per plan and keep a running cell', () => {
  const plans = [
    ...Array<'done'>(10).fill('done'),
    'running' as const,
    ...Array<'later'>(19).fill('later'),
  ];
  const rows = fitPane(
    input({ pane: { rows: [{ kind: 'cells', plans, label: '10/30 plans' }] } }),
    24,
  );
  const row = rowWith(rows, '10/30 plans');
  expect(width(text(row))).toBe(24);
  const cells = [...text(row)].filter((char) => '█▓░'.includes(char));
  expect(cells.length).toBeLessThan(30);
  expect(cells.length).toBe(24 - 2 - 1 - 11);
  expect(cells).toContain('▓');
  expect(runWith(row, '▓').tone).toBe('suggestion');
  expect(text(row).endsWith('10/30 plans')).toBe(true);
});

test('cells keep a running cell even when it rounds to none', () => {
  const plans = ['running' as const, ...Array<'later'>(40).fill('later')];
  const row = rowWith(
    fitPane(
      input({
        pane: { rows: [{ kind: 'cells', plans, label: '0/41 plans' }] },
      }),
      24,
    ),
    '0/41 plans',
  );
  expect(text(row)).toContain('▓');
});

test('cells with no states are the label alone', () => {
  const rows = fitPane(
    input({
      pane: {
        rows: [{ kind: 'cells', plans: [], label: '3 closed · 4 open' }],
      },
    }),
    40,
  );
  expect(rows.map(text)).toContain('  3 closed · 4 open');
});

test('each mark draws its glyph and tone, and the text its weight', () => {
  const rows = fitPane(input(), 100);
  const done = rowWith(rows, '2 plans done');
  expect(done.find((run) => run.text === '✓ ')?.tone).toBe('success');
  expect(runWith(done, '2 plans done').tone).toBe('inactive');

  const running = rowWith(rows, 'Plan 13');
  expect(running.find((run) => run.text === '◐ ')?.tone).toBe('suggestion');
  expect(runWith(running, 'Plan 13')).toMatchObject({
    tone: 'text',
    bold: true,
  });

  const next = rowWith(rows, 'Plan 14');
  expect(next.find((run) => run.text === '► ')?.tone).toBe('claude');
  expect(runWith(next, 'Plan 14')).toMatchObject({ tone: 'text' });
  expect(next.at(-1)).toEqual({ text: 'next', tone: 'claude' });

  const later = rowWith(rows, 'Plan 15');
  expect(later.find((run) => run.text === '○ ')?.tone).toBe('inactive');
  expect(later.at(-1)).toEqual({ text: '2 open', tone: 'inactive' });

  const group = rowWith(rows, 'unplanned');
  expect(group.find((run) => run.text === '◇ ')?.tone).toBe('inactive');

  const more = rowWith(rows, '3 closed');
  expect(
    more.some((run) => ['✓ ', '◐ ', '► ', '○ ', '◇ '].includes(run.text)),
  ).toBe(false);
  expect(runWith(more, '3 closed').tone).toBe('inactive');
});

test('a ref draws before its text in a quiet tone, and a right fact is quiet unless the mark is next', () => {
  const row = rowWith(fitPane(input(), 100), '#240 The');
  expect(runWith(row, '#240')).toEqual({ text: '#240 ', tone: 'inactive' });
  expect(row.at(-1)).toEqual({ text: '9 d', tone: 'inactive' });
  expect(text(row)).toMatch(
    /#240 The guide, with its pictures of every screen +9 d$/,
  );
});

test('children take the trunk of their parent branch', () => {
  const rows = lines(fitPane(input(), 100));
  const plan13 = rows.findIndex((row) => row.includes('Plan 13'));
  expect(rows[plan13]?.startsWith('├ ')).toBe(true);
  expect(rows[plan13 + 1]?.startsWith('│ ├ ')).toBe(true);
  expect(rows[plan13 + 2]?.startsWith('│ └ ')).toBe(true);
  const plan14 = rows.findIndex((row) => row.includes('Plan 14'));
  expect(rows[plan14 + 1]?.startsWith('│ └ ')).toBe(true);
  const last = rows.findIndex((row) => row.includes('unplanned'));
  expect(rows[last]?.startsWith('└ ')).toBe(true);
});

test('a title is cut before its right fact gives way', () => {
  const rows = fitPane(input(), 24);
  const row = rowWith(rows, '◐ #240');
  expect(width(text(row))).toBe(24);
  expect(text(row)).toContain('…');
  expect(text(row).endsWith(' 9 d')).toBe(true);
  expect(text(row)).toMatch(/^│ ├ ◐ #240 \S.*… 9 d$/);
});

test('a node never wraps: it stays one row at any width', () => {
  const at = (columns: number) =>
    fitPane(input(), columns).filter((row) => text(row).includes('Plan 13'));
  for (const columns of [24, 40, 53, 100]) expect(at(columns)).toHaveLength(1);
});

test('the stamp stands flush right in a quiet tone', () => {
  const stamp = fitPane(input({ stamp: 'refresh failed 09:41' }), 40).at(-1);
  expect(stamp ? text(stamp) : '').toBe('refresh failed 09:41'.padStart(40));
  expect(stamp?.at(-1)).toEqual({
    text: 'refresh failed 09:41',
    tone: 'subtle',
  });
});

test('a pane with no rows draws the header, the head row, and the stamp, with no blank row', () => {
  const rows = fitPane(input({ pane: { rows: [] } }), 53);
  expect(rows).toHaveLength(3);
  expect(rows.every((row) => text(row).trim() !== '')).toBe(true);
});

test('a tree row with no nodes draws no row at all', () => {
  const rows = fitPane(
    input({ pane: { rows: [{ kind: 'tree', nodes: [] }] } }),
    53,
  );
  expect(rows).toHaveLength(3);
});

test('the full pane has no blank row', () => {
  for (const columns of [100, 53, 40, 24]) {
    const rows = fitPane(input(), columns);
    expect(rows.every((row) => text(row).trim() !== '')).toBe(true);
  }
});

const GLANCE: BoardGlance = {
  version: GLANCE_VERSION,
  board: BOARD,
  milestone: 'R9',
  state: STATE,
  pane: PANE,
};

test('boardPaneRows: an empty view has no rows', () => {
  expect(boardPaneRows({ state: 'empty' }, 60)).toEqual([]);
});

test('boardPaneRows: an ok view ends in the as-of stamp', () => {
  const rows = boardPaneRows(
    { state: 'ok', glance: GLANCE, takenAt: '09:41' },
    60,
  );
  expect(text(rows.at(-1) ?? [])).toContain('as of 09:41');
});

test('boardPaneRows: a stale view ends in the refresh-failed stamp', () => {
  const rows = boardPaneRows(
    { state: 'stale', glance: GLANCE, takenAt: '09:41', failedAt: '10:02' },
    60,
  );
  expect(text(rows.at(-1) ?? [])).toContain('refresh failed 10:02');
});

test('boardPaneRows: a failed view is the reason wrapped, each row one run in error', () => {
  const rows = boardPaneRows({ state: 'failed', reason: 'gh is down' }, 10);
  expect(rows.map(text)).toEqual(['⚠ board:', 'gh is down']);
  for (const row of rows) {
    expect(row).toEqual([{ text: row[0]?.text, tone: 'error' }]);
  }
});
