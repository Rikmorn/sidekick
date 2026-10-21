// The board's pure view: the state after each pickup run, the one-row state line's segments and how they shed to fit, and the pane's lines.
import { cut, width } from '../lines';
import type { BoardGlance, GlanceLevel } from './contract';
import { parseGlance } from './contract';
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

export type PaneLine =
  | { tone: 'plain' | 'subtle' | 'failure'; text: string }
  | { tone: 'link'; text: string; href: string };

const SEPARATOR = ' · ';

// A cut milestone shorter than this says nothing, so it drops instead.
const MIN_MILESTONE_KEPT = 6;

const GLYPHS: Record<GlanceLevel, string> = {
  good: '●',
  warning: '▲',
  bad: '✗',
  unknown: '○',
};

/**
 * The view after a pickup run that ended at `at` (HH:MM). A failure with no
 * good glance to keep draws only when asked: pickup also fails in an untracked
 * repo when `gh`, its scope, or the network is missing.
 */
export function afterRun(
  previous: BoardView,
  run: RunOutcome,
  at: string,
  kind: RunKind,
): BoardView {
  if (run.ok && run.stdout.trim() === '') return { state: 'empty' };
  const parsed = run.ok ? parseGlance(run.stdout) : run;
  if (parsed.ok) return { state: 'ok', glance: parsed.glance, takenAt: at };
  if (previous.state === 'ok' || previous.state === 'stale') {
    return {
      state: 'stale',
      glance: previous.glance,
      takenAt: previous.takenAt,
      failedAt: at,
    };
  }
  return kind === 'asked'
    ? { state: 'failed', reason: parsed.reason }
    : previous;
}

function stateText(glance: BoardGlance): string {
  const { level, word } = glance.state;
  const glyph = level === 'good' && word === 'complete' ? '✓' : GLYPHS[level];
  return `${glyph} ${word}`;
}

function timeText(view: Extract<BoardView, { glance: BoardGlance }>): string {
  return view.state === 'stale'
    ? `refresh failed ${view.failedAt}`
    : view.takenAt;
}

function joinedWidth(segments: readonly Segment[]): number {
  return width(segments.map((segment) => segment.text).join(SEPARATOR));
}

/** Cuts the row itself to `columns`, dropping what has no room left. */
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
 * The row's segments for a view, shed to fit `columns`: the milestone first
 * (cut with an ellipsis, then dropped), then the board, the detail, and the
 * owner, and the repo. The state and the time stay; if they overflow, the row is cut.
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
          ? `▣ ${board.owner}/${board.repo}`
          : `▣ ${board.repo}`,
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
  if (joinedWidth(full) <= columns) return full;

  if (milestone !== null) {
    const kept = width(milestone) - (joinedWidth(full) - columns) - 1;
    if (kept >= MIN_MILESTONE_KEPT) {
      const trimmed = buildRow(glance, time, {
        ...keep,
        milestone: `${cut(milestone, kept)}…`,
      });
      if (joinedWidth(trimmed) <= columns) return trimmed;
    }
    keep.milestone = null;
    const bare = buildRow(glance, time, keep);
    if (joinedWidth(bare) <= columns) return bare;
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
    if (joinedWidth(row) <= columns) return row;
  }
  return cutRow(buildRow(glance, time, keep), columns);
}

/** The pane's lines: the brief whole, a blank line, the board's link, and the stamp. */
export function paneLines(view: BoardView): PaneLine[] {
  switch (view.state) {
    case 'empty':
      return [];
    case 'failed':
      return [{ tone: 'failure', text: `⚠ board: ${view.reason}` }];
    case 'ok':
    case 'stale':
      return [
        ...view.glance.brief
          .split(/\r?\n/)
          .map((text): PaneLine => ({ tone: 'plain', text })),
        { tone: 'plain', text: '' },
        {
          tone: 'link',
          text: view.glance.board.url,
          href: view.glance.board.url,
        },
        {
          tone: 'subtle',
          text:
            view.state === 'ok'
              ? `as of ${view.takenAt}`
              : `refresh failed ${view.failedAt}`,
        },
      ];
    default: {
      const exhaustive: never = view;
      throw new Error(`Unhandled view: ${JSON.stringify(exhaustive)}`);
    }
  }
}
