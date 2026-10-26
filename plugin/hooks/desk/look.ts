// What both of the desk pane's forms draw alike: a session's state icon and
// word, its context, its marks, and the root's counts.

import type { ThemeKey } from 'claude-code';
import { width } from '../lines';
import { rowWidth, type StyledRow, type StyledRun } from '../styled';
import type { Context, Status, TreeChild, TreeRoot } from './tree';

/** One drawn row, and whether it heads a session that needs the operator, which the scroll hint counts. */
export interface PaneEntry {
  row: StyledRow;
  needsYou: boolean;
}

/** A state's icon, its word, and the tone both take. */
export interface Look {
  icon: string;
  label: string;
  tone: ThemeKey;
}

const LOOKS: Record<Exclude<Status['kind'], 'other'>, Look> = {
  needs: { icon: '●', label: 'needs you', tone: 'warning' },
  working: { icon: '◐', label: 'working', tone: 'suggestion' },
  done: { icon: '✓', label: 'done', tone: 'success' },
  idle: { icon: '○', label: 'idle', tone: 'inactive' },
};

export function lookOf(status: Status): Look {
  return status.kind === 'other'
    ? { icon: '○', label: status.word, tone: 'inactive' }
    : LOOKS[status.kind];
}

/** `N need you`, or `1 needs you`: the root row and the scroll hint both name it. */
export function needYouText(count: number): string {
  return `${count} ${count === 1 ? 'needs' : 'need'} you`;
}

const THOUSAND = 1_000;
// The first cell's tone, lit at any usage, and the number's under every level.
const BELOW_LEVELS: ThemeKey = 'success';
// Each further cell lights in its own tone once usage reaches its level. 65%
// and 75% are where the context monitor warns; 85% leaves little room.
const LEVELS: readonly { from: number; tone: ThemeKey }[] = [
  { from: 65, tone: 'warning' },
  { from: 75, tone: 'claude' },
  { from: 85, tone: 'error' },
];
const BAR_CELLS = 1 + LEVELS.length;
// Wide enough for `999k/100%`; a rarer `1234k/100%` takes one more.
const CONTEXT_TEXT_COLUMNS = 9;

/** The columns a context takes whole: the bar, a space, and the text, flush right. */
export const CONTEXT_COLUMNS = BAR_CELLS + 1 + CONTEXT_TEXT_COLUMNS;

// The lit cells' tones in order, and the last one's, which the number takes.
function levelOf(percent: number): { lit: ThemeKey[]; tone: ThemeKey } {
  const reached = LEVELS.filter(({ from }) => percent >= from).map(
    ({ tone }) => tone,
  );
  return {
    lit: [BELOW_LEVELS, ...reached],
    tone: reached.at(-1) ?? BELOW_LEVELS,
  };
}

function tokensText(tokens: number): string {
  return tokens < THOUSAND ? `${tokens}` : `${Math.round(tokens / THOUSAND)}k`;
}

// The text alone, ending where a whole context would end, when it fits in `room`.
function textRuns(text: string, tone: ThemeKey, room: number): StyledRun[] {
  if (width(text) > room) return [];
  return [{ text: text.padStart(Math.min(room, CONTEXT_COLUMNS)), tone }];
}

/**
 * A session's context in the room a row has left: four cells, one per level,
 * each lit in its own tone once usage reaches its level, the first at any
 * usage, then `tokens/percent` in the last lit cell's tone; or the text alone,
 * in that tone, when the bar does not fit whole; or nothing. With no published
 * limit, the tokens alone, inactive.
 */
export function contextRuns(
  context: Context | undefined,
  room: number,
): StyledRun[] {
  if (context === undefined) return [];
  const tokens = tokensText(context.used);
  const { used, limit } = context;
  if (limit === undefined || limit <= 0) {
    return textRuns(tokens, 'inactive', room);
  }
  const percent = (used * 100) / limit;
  const level = levelOf(percent);
  // Floored, as the context monitor does, so the number never reads a level its tone has not reached.
  const text = `${tokens}/${Math.floor(percent)}%`;
  if (room < CONTEXT_COLUMNS) return textRuns(text, level.tone, room);
  const runs: StyledRun[] = [
    ...level.lit.map((tone) => ({ text: '▰', tone })),
    { text: '▱'.repeat(BAR_CELLS - level.lit.length), tone: 'subtle' },
    { text: ` ${text.padStart(CONTEXT_TEXT_COLUMNS)}`, tone: level.tone },
  ];
  return runs.filter((run) => run.text !== '');
}

/** A child's marks: `⇡N` for N commits not integrated, `✎` for uncommitted changes. */
export function marksText(child: TreeChild): string {
  const marks = [
    ...(child.unintegrated > 0 ? [`⇡${child.unintegrated}`] : []),
    ...(child.uncommitted ? ['✎'] : []),
  ];
  return marks.join(' ');
}

/** The root's counts, whole phrases only: when the row has no room for all, the needs-you count goes first, then the workers. */
export function countRuns(root: TreeRoot, room: number): StyledRun[] {
  if (root.workers === 0) return [];
  const workers = `${root.workers} ${root.workers === 1 ? 'worker' : 'workers'}`;
  const bare: StyledRun[] = [{ text: workers, tone: 'inactive' }];
  const full: StyledRun[] =
    root.needYou === 0
      ? bare
      : [
          { text: `${workers} · `, tone: 'inactive' },
          { text: needYouText(root.needYou), tone: 'warning' },
        ];
  return [full, bare].find((runs) => rowWidth(runs) <= room) ?? [];
}
