// The board's pure view: the state after each pickup run, and the one-row state line's segments and how they shed to fit.
import type { ThemeKey } from 'claude-code';
import { cut, ELLIPSIS, fit, width } from '../lines';
import type { BoardGlance, GlanceLevel, GlanceState } from './contract';
import { GLANCE_COMPLETE_WORD, parseGlance } from './contract';
import type { RunKind, RunOutcome } from './logic';

export type BoardView =
  | { state: 'empty' }
  | { state: 'ok'; glance: BoardGlance; takenAt: string }
  | { state: 'stale'; glance: BoardGlance; takenAt: string; failedAt: string }
  | { state: 'failed'; reason: string };

/** One drawn piece of the row; the adapter joins them with ` · ` and draws `board` as a Link. */
export type Segment =
  | { kind: 'repo' | 'milestone' | 'time'; text: string }
  | { kind: 'board'; text: string; href: string }
  | { kind: 'state'; text: string; level: GlanceLevel }
  | { kind: 'detail'; text: string }
  | { kind: 'failure'; text: string };

/** What the adapter joins the row's segments with; the row's widths count it. */
export const SEPARATOR = ' · ';

// A cut milestone shorter than this says nothing, so it drops instead.
const MIN_MILESTONE_KEPT = 6;

/** The tone each level draws in, on the line and in the pane's head row. */
export const LEVEL_TONES: Record<GlanceLevel, ThemeKey> = {
  good: 'success',
  warning: 'warning',
  bad: 'error',
  unknown: 'inactive',
};

const GLYPHS: Record<GlanceLevel, string> = {
  good: '◆',
  warning: '▲',
  bad: '▼',
  unknown: '○',
};

/** What a pickup run gave: no glance, as in an untracked repo; a glance; or a failure and its reason. */
export type RunRead =
  | { kind: 'empty' }
  | { kind: 'glance'; glance: BoardGlance }
  | { kind: 'failed'; reason: string };

/** Reads a run's output once: empty output is no glance, and output that does not parse is a failed run. */
export function readRun(run: RunOutcome): RunRead {
  if (!run.ok) return { kind: 'failed', reason: run.reason };
  if (run.stdout.trim() === '') return { kind: 'empty' };
  const parsed = parseGlance(run.stdout);
  return parsed.ok
    ? { kind: 'glance', glance: parsed.glance }
    : { kind: 'failed', reason: parsed.reason };
}

/** Why a run failed, for the debug log; undefined when it gave a glance or none. */
export function failureOf(read: RunRead): string | undefined {
  return read.kind === 'failed' ? read.reason : undefined;
}

/**
 * The view after a pickup run that ended at `at` (HH:MM). A failure with no
 * good glance to keep draws only when asked: pickup also fails in an untracked
 * repo when `gh`, its scope, or the network is missing.
 */
export function afterRun(
  previous: BoardView,
  read: RunRead,
  at: string,
  kind: RunKind,
): BoardView {
  if (read.kind === 'empty') return { state: 'empty' };
  if (read.kind === 'glance') {
    return { state: 'ok', glance: read.glance, takenAt: at };
  }
  if (previous.state === 'ok' || previous.state === 'stale') {
    return {
      state: 'stale',
      glance: previous.glance,
      takenAt: previous.takenAt,
      failedAt: at,
    };
  }
  return kind === 'asked' ? { state: 'failed', reason: read.reason } : previous;
}

/** The glyph and tone a state draws with: a tick for a finished milestone. */
export function stateLook(state: GlanceState): {
  glyph: string;
  tone: ThemeKey;
} {
  const { level, word } = state;
  const glyph =
    level === 'good' && word === GLANCE_COMPLETE_WORD ? '✓' : GLYPHS[level];
  return { glyph, tone: LEVEL_TONES[level] };
}

function stateText(glance: BoardGlance): string {
  return `${stateLook(glance.state).glyph} ${glance.state.word}`;
}

/** The stamp for a pickup that failed, naming when it did. */
export function refreshFailed(at: string): string {
  return `refresh failed ${at}`;
}

function timeText(view: Extract<BoardView, { glance: BoardGlance }>): string {
  return view.state === 'stale' ? refreshFailed(view.failedAt) : view.takenAt;
}

function shortestMilestone(text: string): string {
  return fit(text, MIN_MILESTONE_KEPT + width(ELLIPSIS));
}

/** The fewest cells a row needs: its milestone, which the layout may cut, counted at its shortest. */
export function leastWidth(segments: readonly Segment[]): number {
  return width(
    segments
      .map((segment) =>
        segment.kind === 'milestone'
          ? shortestMilestone(segment.text)
          : segment.text,
      )
      .join(SEPARATOR),
  );
}

// Cuts the row itself to `columns`, dropping what has no room left.
function cutRow(segments: readonly Segment[], columns: number): Segment[] {
  const row: Segment[] = [];
  let room = columns;
  for (const segment of segments) {
    if (room <= 0) break;
    row.push({ ...segment, text: cut(segment.text, room) });
    room -= width(segment.text) + SEPARATOR.length;
  }
  return row;
}

/**
 * The row's segments for a view, shed to fit `columns`. The milestone stays
 * whole while its shortest form fits, since the adapter's layout cuts it; then
 * it drops, and the board, the detail, the owner, and the repo follow. The state
 * and the time stay; if they overflow, the row is cut.
 */
export function rowSegments(view: BoardView, columns: number): Segment[] {
  switch (view.state) {
    case 'empty':
      return [];
    case 'failed':
      return [
        { kind: 'failure', text: cut(`⚠ board: ${view.reason}`, columns) },
      ];
    case 'ok':
    case 'stale':
      return shed(view.glance, timeText(view), columns);
    default: {
      const exhaustive: never = view;
      throw new Error(`Unhandled view: ${JSON.stringify(exhaustive)}`);
    }
  }
}

interface Keep {
  repo: 'full' | 'short' | 'none';
  board: boolean;
  detail: boolean;
  milestone: string | null;
}

function buildRow(glance: BoardGlance, time: string, keep: Keep): Segment[] {
  const { board, state } = glance;
  const row: Segment[] = [];
  if (keep.repo !== 'none') {
    row.push({
      kind: 'repo',
      text:
        keep.repo === 'full'
          ? `▤ ${board.owner}/${board.repo}`
          : `▤ ${board.repo}`,
    });
  }
  if (keep.board) {
    row.push({
      kind: 'board',
      text: `board #${board.number}`,
      href: board.url,
    });
  }
  row.push({ kind: 'state', text: stateText(glance), level: state.level });
  if (keep.detail && state.detail !== null) {
    row.push({ kind: 'detail', text: state.detail });
  }
  if (keep.milestone !== null) {
    row.push({ kind: 'milestone', text: keep.milestone });
  }
  row.push({ kind: 'time', text: time });
  return row;
}

function shed(glance: BoardGlance, time: string, columns: number): Segment[] {
  const { milestone } = glance;
  const keep: Keep = { repo: 'full', board: true, detail: true, milestone };
  const full = buildRow(glance, time, keep);
  if (leastWidth(full) <= columns) return full;

  if (milestone !== null) {
    keep.milestone = null;
    const bare = buildRow(glance, time, keep);
    if (leastWidth(bare) <= columns) return bare;
  }
  const steps: ((keep: Keep) => void)[] = [
    (k) => {
      k.board = false;
    },
    (k) => {
      k.detail = false;
    },
    (k) => {
      k.repo = 'short';
    },
    (k) => {
      k.repo = 'none';
    },
  ];
  for (const step of steps) {
    step(keep);
    const row = buildRow(glance, time, keep);
    if (leastWidth(row) <= columns) return row;
  }
  return cutRow(buildRow(glance, time, keep), columns);
}
