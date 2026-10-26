// The desk pane's rows, built from its tree at a width, as the L1 plates lay
// them out: one row per session from 80 columns; below that two, the head and
// then the work; below 40 the head alone, cut from its end.

import type { ThemeKey } from 'claude-code';
import { cut, width } from '../lines';
import {
  cutRow,
  rowWidth,
  type StyledRow,
  type StyledRun,
  trimRow,
} from '../styled';
import type {
  Context,
  DeskTree,
  Status,
  TreeChild,
  TreeOther,
  TreeRoot,
} from './tree';

/** One drawn row, and whether it heads a session that needs the operator, which the scroll hint counts. */
export interface PaneEntry {
  row: StyledRow;
  needsYou: boolean;
}

type Subagent = TreeChild['subagents'][number];

// Where a session's work line goes: in a column of its row, on a row of its own, or nowhere.
type WorkPlace = 'column' | 'row' | 'none';

interface Layout {
  work: WorkPlace;
  tree: number;
  /** The blank columns before a row elsewhere, so its icon stands under a child's. */
  indent: number;
  state: number;
  marks: number;
  repo: number;
  /** The blank columns before the repo inside its cell. */
  repoGap: number;
  subagentIndent: number;
  subagentType: number;
}

const INLINE: Layout = {
  work: 'column',
  tree: 3,
  indent: 3,
  state: 11,
  marks: 14,
  repo: 14,
  repoGap: 5,
  subagentIndent: 3,
  subagentType: 18,
};

const DOCKED: Layout = {
  work: 'row',
  tree: 2,
  indent: 0,
  state: 12,
  marks: 9,
  repo: 11,
  repoGap: 0,
  subagentIndent: 6,
  subagentType: 11,
};

const HEADS: Layout = { ...DOCKED, work: 'none' };

const ONE_ROW_COLUMNS = 80;
const TWO_ROW_COLUMNS = 40;
// Wider, the context column drifts away from the name it belongs to.
const WORK_COLUMNS_MAX = 60;
const ICON_COLUMNS = 2;
const NAME_COLUMNS = 15;
const CONTEXT_COLUMNS = 11;
const WORK_INDENT = 6;
const BAR_CELLS = 5;
const PERCENT_PER_CELL = 100 / BAR_CELLS;
const THOUSAND = 1_000;

// 65% and 75% are where the context monitor warns; 85% leaves little room.
const CONTEXT_TONES: readonly { from: number; tone: ThemeKey }[] = [
  { from: 85, tone: 'error' },
  { from: 75, tone: 'claude' },
  { from: 65, tone: 'warning' },
];

interface Look {
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

function lookOf(status: Status): Look {
  return status.kind === 'other'
    ? { icon: '○', label: status.word, tone: 'inactive' }
    : LOOKS[status.kind];
}

/** `N need you`, or `1 needs you`: the root row and the scroll hint both name it. */
export function needYouText(count: number): string {
  return `${count} ${count === 1 ? 'needs' : 'need'} you`;
}

// A cell keeps its last column blank, so the next cell never touches it.
function cell(
  text: string,
  columns: number,
  style: Omit<StyledRun, 'text'>,
): StyledRun {
  const kept = cut(text, columns - 1);
  return { ...style, text: kept + ' '.repeat(columns - width(kept)) };
}

function tokensText(tokens: number): string {
  return tokens < THOUSAND ? `${tokens}` : `${Math.round(tokens / THOUSAND)}k`;
}

function contextTone(percent: number): ThemeKey {
  return CONTEXT_TONES.find(({ from }) => percent >= from)?.tone ?? 'inactive';
}

// Five cells against the published limit, then the tokens; without a limit, the tokens alone.
function contextRuns(context: Context | undefined): StyledRun[] {
  if (context === undefined) return [];
  const tokens = tokensText(context.used);
  const { used, limit } = context;
  if (limit === undefined || limit <= 0) {
    return [{ text: tokens.padStart(CONTEXT_COLUMNS), tone: 'inactive' }];
  }
  const percent = (used * 100) / limit;
  const cells = Math.round(percent / PERCENT_PER_CELL);
  const filled = Math.min(BAR_CELLS, Math.max(0, cells));
  const tone = contextTone(percent);
  return [
    { text: '▰'.repeat(filled), tone },
    { text: '▱'.repeat(BAR_CELLS - filled), tone: 'subtle' },
    { text: ` ${tokens}`.padStart(CONTEXT_COLUMNS - BAR_CELLS), tone },
  ];
}

function marksText(child: TreeChild): string {
  const marks = [
    ...(child.unintegrated > 0 ? [`⇡${child.unintegrated}`] : []),
    ...(child.uncommitted ? ['✎'] : []),
  ];
  return marks.join(' ');
}

function workCell(work: string | undefined, columns: number): StyledRun[] {
  return columns > 0 ? [cell(work ?? '', columns, { tone: 'inactive' })] : [];
}

function childHead(
  child: TreeChild,
  isLast: boolean,
  layout: Layout,
  work: number,
): StyledRow {
  const look = lookOf(child.status);
  return [
    cell(isLast ? '└' : '├', layout.tree, { tone: 'subtle' }),
    cell(look.icon, ICON_COLUMNS, { tone: look.tone }),
    cell(child.name, NAME_COLUMNS, { tone: 'text', bold: true }),
    cell(look.label, layout.state, { tone: look.tone }),
    ...workCell(child.work, work),
    cell(marksText(child), layout.marks, { tone: 'warning' }),
    ...contextRuns(child.context),
  ];
}

function elsewhereHead(
  other: TreeOther,
  layout: Layout,
  work: number,
): StyledRow {
  const look = lookOf(other.status);
  const indent: StyledRun[] =
    layout.indent > 0
      ? [{ text: ' '.repeat(layout.indent), tone: 'subtle' }]
      : [];
  const repo = ' '.repeat(layout.repoGap) + other.repo;
  return [
    ...indent,
    cell(other.isMain ? '◇' : '◌', ICON_COLUMNS, { tone: 'inactive' }),
    cell(other.name, NAME_COLUMNS, { tone: 'text', dim: true }),
    cell(look.label, layout.state, { tone: look.tone }),
    ...workCell(other.work, work),
    cell(repo, layout.repo, { tone: 'subtle' }),
    ...contextRuns(other.context),
  ];
}

// `trunk` carries the tree's line down past the rows under a child: `│` unless it is the last.
function workEntries(
  trunk: string,
  work: string | undefined,
  layout: Layout,
): PaneEntry[] {
  if (layout.work !== 'row' || work === undefined) return [];
  const row: StyledRow = [
    cell(trunk, WORK_INDENT, { tone: 'subtle' }),
    { text: work, tone: 'inactive' },
  ];
  return [{ row, needsYou: false }];
}

function subagentRow(
  subagent: Subagent,
  trunk: string,
  isLast: boolean,
  layout: Layout,
): StyledRow {
  const branch = isLast ? '└' : '├';
  return [
    {
      text: `${trunk.padEnd(layout.subagentIndent)}${branch} `,
      tone: 'subtle',
    },
    cell(`◦ ${subagent.type}`, layout.subagentType, { tone: 'suggestion' }),
    { text: subagent.description, tone: 'inactive', italic: true },
  ];
}

function childEntries(
  child: TreeChild,
  isLast: boolean,
  layout: Layout,
  work: number,
): PaneEntry[] {
  const trunk = isLast ? ' ' : '│';
  // The heads-only form draws the head alone.
  const drawn = layout.work === 'none' ? [] : child.subagents;
  const subagents = drawn.map((subagent, index) => ({
    row: subagentRow(subagent, trunk, index === drawn.length - 1, layout),
    needsYou: false,
  }));
  return [
    {
      row: childHead(child, isLast, layout, work),
      needsYou: child.status.kind === 'needs',
    },
    ...workEntries(trunk, child.work, layout),
    ...subagents,
  ];
}

function elsewhereEntries(
  other: TreeOther,
  layout: Layout,
  work: number,
): PaneEntry[] {
  return [
    {
      row: elsewhereHead(other, layout, work),
      needsYou: other.status.kind === 'needs',
    },
    ...workEntries('', other.work, layout),
  ];
}

function countRuns(root: TreeRoot): StyledRun[] {
  if (root.workers === 0) return [];
  const workers = `${root.workers} ${root.workers === 1 ? 'worker' : 'workers'}`;
  if (root.needYou === 0) return [{ text: workers, tone: 'inactive' }];
  return [
    { text: `${workers} · `, tone: 'inactive' },
    { text: needYouText(root.needYou), tone: 'warning' },
  ];
}

// Inline, the counts end where the context column ends; docked, they follow the name.
function rootRow(root: TreeRoot, layout: Layout, rowEnd: number): StyledRow {
  const headColumns = layout.tree + ICON_COLUMNS + NAME_COLUMNS;
  const name = root.name === undefined ? '▣' : `▣ ${root.name}`;
  const head = cell(name, headColumns, { tone: 'claude', bold: true });
  const counts = countRuns(root);
  if (layout.work !== 'column') return [head, ...counts];
  const label: StyledRun = { text: 'this main', tone: 'inactive' };
  if (counts.length === 0) return [head, label];
  const room = rowEnd - headColumns - width(label.text) - rowWidth(counts);
  const gap: StyledRun = {
    text: ' '.repeat(Math.max(1, room)),
    tone: 'inactive',
  };
  return [head, label, gap, ...counts];
}

function fixedColumns(layout: Layout): number {
  return (
    layout.tree +
    ICON_COLUMNS +
    NAME_COLUMNS +
    layout.state +
    layout.marks +
    CONTEXT_COLUMNS
  );
}

function layoutAt(columns: number): { layout: Layout; work: number } {
  if (columns < TWO_ROW_COLUMNS) return { layout: HEADS, work: 0 };
  if (columns < ONE_ROW_COLUMNS) return { layout: DOCKED, work: 0 };
  const work = Math.min(WORK_COLUMNS_MAX, columns - fixedColumns(INLINE));
  return { layout: INLINE, work };
}

/** The tree's rows at `columns`, in the pane's order: sessions elsewhere that need you, this main, its children and their subagents, then a blank row and the other sessions. */
export function treeEntries(tree: DeskTree, columns: number): PaneEntry[] {
  const { layout, work } = layoutAt(columns);
  const rowEnd = fixedColumns(layout) + work;
  const lastChild = tree.children.length - 1;
  const others =
    tree.others.length === 0
      ? []
      : [
          { row: [], needsYou: false },
          ...tree.others.flatMap((other) =>
            elsewhereEntries(other, layout, work),
          ),
        ];
  const entries: PaneEntry[] = [
    ...tree.waiting.flatMap((other) => elsewhereEntries(other, layout, work)),
    { row: rootRow(tree.root, layout, rowEnd), needsYou: false },
    ...tree.children.flatMap((child, index) =>
      childEntries(child, index === lastChild, layout, work),
    ),
    ...others,
  ];
  return entries.map((entry) => ({
    ...entry,
    row: trimRow(cutRow(entry.row, columns)),
  }));
}
