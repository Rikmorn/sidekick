import { expect, test } from 'claude-code/testing';
import { width } from '../lines';
import type { BoardGlance, GlanceLevel } from './contract';
import type { BoardView } from './view';
import {
  afterRun,
  failureOf,
  leastWidth,
  paneLines,
  readRun,
  rowSegments,
} from './view';

const BRIEF = ['Pickup: milestone 9', 'In progress: #211', 'Drift: 3 unpushed'];

function glanceOf(
  level: GlanceLevel,
  word: string,
  detail: string | null,
  milestone: string | null = 'R9 — Control centre',
): BoardGlance {
  return {
    version: 1,
    board: {
      owner: 'Rikmorn',
      repo: 'sidekick',
      number: 2,
      url: 'https://github.com/users/Rikmorn/projects/2',
    },
    milestone,
    state: { level, word, detail },
    brief: BRIEF.join('\n'),
  };
}

const glance = glanceOf('warning', 'drift', '3 unpushed');
const ok: BoardView = { state: 'ok', glance, takenAt: '15:02' };
const stale: BoardView = {
  state: 'stale',
  glance,
  takenAt: '15:02',
  failedAt: '15:05',
};

const good = readRun({ ok: true, stdout: JSON.stringify(glance) });

function joined(view: BoardView, columns: number): string {
  return rowSegments(view, columns)
    .map((segment) => segment.text)
    .join(' · ');
}

test('readRun gives a glance for good output, and empty for none', () => {
  expect(readRun({ ok: true, stdout: `${JSON.stringify(glance)}\n` })).toEqual({
    kind: 'glance',
    glance,
  });
  for (const stdout of ['', '\n', '  \r\n']) {
    expect(readRun({ ok: true, stdout })).toEqual({ kind: 'empty' });
  }
});

test('readRun fails a run that failed, or whose output does not parse', () => {
  expect(readRun({ ok: false, reason: 'timed out' })).toEqual({
    kind: 'failed',
    reason: 'timed out',
  });
  const reason = "the pickup's output did not parse";
  const newer = JSON.stringify({ ...glance, version: 2 });
  for (const stdout of ['not json', newer, '{"version":1}']) {
    expect(readRun({ ok: true, stdout })).toEqual({ kind: 'failed', reason });
  }
});

test('failureOf names a failed read, and nothing for a glance or none', () => {
  expect(failureOf({ kind: 'failed', reason: 'timed out' })).toBe('timed out');
  expect(failureOf({ kind: 'glance', glance })).toBeUndefined();
  expect(failureOf({ kind: 'empty' })).toBeUndefined();
});

test('afterRun gives ok for a good glance, asked or not', () => {
  for (const kind of ['asked', 'unasked'] as const) {
    expect(afterRun({ state: 'empty' }, good, '15:02', kind)).toEqual(ok);
  }
});

test('afterRun gives empty for a run with no output', () => {
  const none = readRun({ ok: true, stdout: '\n' });
  expect(afterRun(ok, none, '15:05', 'asked')).toEqual({ state: 'empty' });
});

test('afterRun treats unparsed output as a failed run', () => {
  const read = readRun({ ok: true, stdout: 'not json' });
  const reason = "the pickup's output did not parse";
  expect(afterRun(ok, read, '15:05', 'unasked')).toEqual(stale);
  expect(afterRun({ state: 'empty' }, read, '15:05', 'asked')).toEqual({
    state: 'failed',
    reason,
  });
  expect(afterRun({ state: 'empty' }, read, '15:05', 'unasked')).toEqual({
    state: 'empty',
  });
});

test('afterRun keeps the last good glance when a run fails', () => {
  const read = readRun({ ok: false, reason: 'timed out' });
  expect(afterRun(ok, read, '15:05', 'unasked')).toEqual(stale);
  expect(afterRun(stale, read, '15:09', 'asked')).toEqual({
    ...stale,
    failedAt: '15:09',
  });
  expect(afterRun({ state: 'empty' }, read, '15:05', 'asked')).toEqual({
    state: 'failed',
    reason: 'timed out',
  });
});

test('rowSegments shows every segment at 160 columns', () => {
  expect(rowSegments(ok, 160)).toEqual([
    { kind: 'repo', text: '▣ Rikmorn/sidekick' },
    {
      kind: 'board',
      text: 'board #2',
      href: 'https://github.com/users/Rikmorn/projects/2',
    },
    { kind: 'state', text: '▲ drift', level: 'warning' },
    { kind: 'detail', text: '3 unpushed' },
    { kind: 'milestone', text: 'R9 — Control centre' },
    { kind: 'time', text: '15:02' },
  ]);
});

test('rowSegments reads refresh failed in a stale view', () => {
  const segments = rowSegments(stale, 160);
  expect(segments.at(-1)).toEqual({
    kind: 'time',
    text: 'refresh failed 15:05',
  });
});

test('rowSegments leaves out a missing milestone and detail', () => {
  const bare: BoardView = {
    state: 'ok',
    glance: glanceOf('good', 'on track', null, null),
    takenAt: '09:00',
  };
  expect(rowSegments(bare, 160).map((segment) => segment.kind)).toEqual([
    'repo',
    'board',
    'state',
    'time',
  ]);
});

test('rowSegments picks the glyph by level and for complete', () => {
  const cases: [GlanceLevel, string, string][] = [
    ['good', 'on track', '●'],
    ['good', 'complete', '✓'],
    ['warning', 'at risk', '▲'],
    ['bad', 'off track', '✗'],
    ['unknown', 'no update', '○'],
  ];
  for (const [level, word, glyph] of cases) {
    const view: BoardView = {
      state: 'ok',
      glance: glanceOf(level, word, null),
      takenAt: '09:00',
    };
    expect(rowSegments(view, 160)).toContainEqual({
      kind: 'state',
      text: `${glyph} ${word}`,
      level,
    });
  }
});

// The adapter lets the layout cut the milestone at the row's real width, so
// the view keeps it whole while its shortest form fits.
test('rowSegments keeps the milestone whole while its least width fits, then drops it', () => {
  const full = joined(ok, 160);
  const least =
    '▣ Rikmorn/sidekick · board #2 · ▲ drift · 3 unpushed · R9 — C…';
  const leastRow = `${least} · 15:02`;
  for (const columns of [width(full) - 4, width(leastRow)]) {
    expect(rowSegments(ok, columns)).toContainEqual({
      kind: 'milestone',
      text: 'R9 — Control centre',
    });
    expect(leastWidth(rowSegments(ok, columns))).toBe(width(leastRow));
  }
  const dropped = rowSegments(ok, width(leastRow) - 1);
  expect(dropped.map((segment) => segment.kind)).toEqual([
    'repo',
    'board',
    'state',
    'detail',
    'time',
  ]);
});

test('rowSegments then sheds the board, the detail, and the owner in order', () => {
  const kindsAt = (columns: number): string[] =>
    rowSegments(ok, columns).map((segment) => segment.kind);
  const owner = rowSegments(ok, 160)[0];
  expect(owner).toEqual({ kind: 'repo', text: '▣ Rikmorn/sidekick' });
  const noMilestone =
    '▣ Rikmorn/sidekick · board #2 · ▲ drift · 3 unpushed · 15:02';
  expect(kindsAt(width(noMilestone) - 1)).toEqual([
    'repo',
    'state',
    'detail',
    'time',
  ]);
  const noBoard = '▣ Rikmorn/sidekick · ▲ drift · 3 unpushed · 15:02';
  expect(kindsAt(width(noBoard) - 1)).toEqual(['repo', 'state', 'time']);
  const noDetail = '▣ Rikmorn/sidekick · ▲ drift · 15:02';
  expect(kindsAt(width(noDetail) - 1)).toEqual(['repo', 'state', 'time']);
  expect(rowSegments(ok, width(noDetail) - 1)[0]).toEqual({
    kind: 'repo',
    text: '▣ sidekick',
  });
  expect(joined(ok, width('▣ sidekick · ▲ drift · 15:02'))).toBe(
    '▣ sidekick · ▲ drift · 15:02',
  );
});

test('rowSegments keeps the row’s least width within the columns at every width from 20 to 160', () => {
  for (const view of [ok, stale]) {
    for (let columns = 20; columns <= 160; columns += 1) {
      expect(leastWidth(rowSegments(view, columns))).toBeLessThanOrEqual(
        columns,
      );
    }
  }
});

test('rowSegments keeps the exact state and time at every width where they fit together', () => {
  const cases: [BoardView, string][] = [
    [ok, '15:02'],
    [stale, 'refresh failed 15:05'],
  ];
  for (const [view, time] of cases) {
    const least = width(`▲ drift · ${time}`);
    for (let columns = least; columns <= 160; columns += 1) {
      const segments = rowSegments(view, columns);
      expect(segments).toContainEqual({ kind: 'time', text: time });
      expect(segments).toContainEqual({
        kind: 'state',
        text: '▲ drift',
        level: 'warning',
      });
      expect(leastWidth(rowSegments(view, columns))).toBeLessThanOrEqual(
        columns,
      );
    }
  }
});

test('rowSegments leaves only the state and the time at the width they need', () => {
  const kinds = (view: BoardView, columns: number): string[] =>
    rowSegments(view, columns).map((segment) => segment.kind);
  expect(kinds(ok, width('▲ drift · 15:02'))).toEqual(['state', 'time']);
  expect(kinds(stale, width('▲ drift · refresh failed 15:05'))).toEqual([
    'state',
    'time',
  ]);
});

test('rowSegments cuts the row when the state and the time alone overflow', () => {
  const columns = width('▲ drift · 15:02') - 3;
  const text = joined(ok, columns);
  expect(text).toBe('▲ drift · 15:02'.slice(0, columns));
  expect(width(joined(stale, 12))).toBeLessThanOrEqual(12);
});

test('rowSegments cuts a failed view to the columns', () => {
  const view: BoardView = { state: 'failed', reason: 'gh is not installed' };
  for (let columns = 0; columns <= 40; columns += 1) {
    expect(width(joined(view, columns))).toBeLessThanOrEqual(columns);
  }
  expect(joined(view, 10)).toBe('⚠ board: g');
});

test('rowSegments gives one failure segment for a failed view and none for empty', () => {
  expect(rowSegments({ state: 'failed', reason: 'gh missing' }, 160)).toEqual([
    { kind: 'failure', text: '⚠ board: gh missing' },
  ]);
  expect(rowSegments({ state: 'empty' }, 160)).toEqual([]);
});

test('paneLines gives the brief whole, a gap, the link, and the stamp', () => {
  expect(paneLines(ok)).toEqual([
    ...BRIEF.map((text) => ({ tone: 'plain', text })),
    { tone: 'gap' },
    {
      tone: 'link',
      text: 'https://github.com/users/Rikmorn/projects/2',
      href: 'https://github.com/users/Rikmorn/projects/2',
    },
    { tone: 'subtle', text: 'as of 15:02' },
  ]);
  expect(paneLines(stale).at(-1)).toEqual({
    tone: 'subtle',
    text: 'refresh failed 15:05',
  });
});

test('paneLines gives nothing for empty and the reason for failed', () => {
  expect(paneLines({ state: 'empty' })).toEqual([]);
  expect(paneLines({ state: 'failed', reason: 'gh missing' })).toEqual([
    { tone: 'failure', text: '⚠ board: gh missing' },
  ]);
});
