import { expect, test } from 'claude-code/testing';
import { width } from '../lines';
import type { BoardGlance, GlanceLevel } from './contract';
import type { BoardView } from './view';
import { afterRun, paneLines, rowSegments } from './view';

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

function joined(view: BoardView, columns: number): string {
  return rowSegments(view, columns)
    .map((segment) => segment.text)
    .join(' · ');
}

test('afterRun gives ok for a good glance, asked or not', () => {
  for (const kind of ['asked', 'unasked'] as const) {
    expect(
      afterRun(
        { state: 'empty' },
        { ok: true, stdout: JSON.stringify(glance) },
        '15:02',
        kind,
      ),
    ).toEqual(ok);
  }
});

test('afterRun gives empty for a run with no output', () => {
  expect(afterRun(ok, { ok: true, stdout: '\n' }, '15:05', 'asked')).toEqual({
    state: 'empty',
  });
});

test('afterRun treats unparsed output as a failed run', () => {
  const run = { ok: true, stdout: 'not json' } as const;
  const reason = "the pickup's output did not parse";
  expect(afterRun(ok, run, '15:05', 'unasked')).toEqual(stale);
  expect(afterRun({ state: 'empty' }, run, '15:05', 'asked')).toEqual({
    state: 'failed',
    reason,
  });
  expect(afterRun({ state: 'empty' }, run, '15:05', 'unasked')).toEqual({
    state: 'empty',
  });
});

test('afterRun keeps the last good glance when a run fails', () => {
  const run = { ok: false, reason: 'timed out' } as const;
  expect(afterRun(ok, run, '15:05', 'unasked')).toEqual(stale);
  expect(afterRun(stale, run, '15:09', 'asked')).toEqual({
    ...stale,
    failedAt: '15:09',
  });
  expect(afterRun({ state: 'empty' }, run, '15:05', 'asked')).toEqual({
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

test('rowSegments sheds the milestone first, cut with an ellipsis and then dropped', () => {
  const full = joined(ok, 160);
  const cutRow = joined(ok, width(full) - 4);
  expect(cutRow).toContain('R9 — Control c…');
  expect(cutRow).toContain('board #2');
  const dropped = rowSegments(ok, width(full) - 17);
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

test('rowSegments keeps the joined row within the columns at every width from 20 to 160', () => {
  for (const view of [ok, stale]) {
    for (let columns = 20; columns <= 160; columns += 1) {
      expect(width(joined(view, columns))).toBeLessThanOrEqual(columns);
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
      expect(width(joined(view, columns))).toBeLessThanOrEqual(columns);
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

test('paneLines gives the brief whole, a blank line, the link, and the stamp', () => {
  expect(paneLines(ok)).toEqual([
    ...BRIEF.map((text) => ({ tone: 'plain', text })),
    { tone: 'plain', text: '' },
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
