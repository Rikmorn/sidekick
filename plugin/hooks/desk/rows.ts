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
  TreeElsewhere,
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

// A layout at one width: its work column's width, and the columns its rows end at.
interface Frame {
  layout: Layout;
  work: number;
  columns: number;
}

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
// More would push the sessions after them out of a docked pane.
const SUBAGENT_ROWS_MAX = 3;

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

function barRuns(percent: number, tone: ThemeKey, tokens: string): StyledRun[] {
  const cells = Math.round(percent / PERCENT_PER_CELL);
  const filled = Math.min(BAR_CELLS, Math.max(0, cells));
  return [
    { text: '▰'.repeat(filled), tone },
    { text: '▱'.repeat(BAR_CELLS - filled), tone: 'subtle' },
    { text: ` ${tokens}`.padStart(CONTEXT_COLUMNS - BAR_CELLS), tone },
  ];
}

// The tokens alone, ending where the context column ends, when they fit in `room`.
function tokensRuns(tokens: string, tone: ThemeKey, room: number): StyledRun[] {
  if (width(tokens) > room) return [];
  return [{ text: tokens.padStart(Math.min(room, CONTEXT_COLUMNS)), tone }];
}

// Five cells against the published limit, then the tokens, when all fit in
// `room`; else the tokens alone in the level's tone. Never a cut bar.
function contextRuns(context: Context | undefined, room: number): StyledRun[] {
  if (context === undefined) return [];
  const tokens = tokensText(context.used);
  const { used, limit } = context;
  if (limit === undefined || limit <= 0) {
    return tokensRuns(tokens, 'inactive', room);
  }
  const percent = (used * 100) / limit;
  const tone = contextTone(percent);
  return room >= CONTEXT_COLUMNS
    ? barRuns(percent, tone, tokens)
    : tokensRuns(tokens, tone, room);
}

// A head row's runs, then its context in the room the row has left.
function withContext(
  runs: StyledRun[],
  context: Context | undefined,
  frame: Frame,
): StyledRow {
  return [...runs, ...contextRuns(context, frame.columns - rowWidth(runs))];
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

function indentRuns(layout: Layout): StyledRun[] {
  return layout.indent > 0
    ? [{ text: ' '.repeat(layout.indent), tone: 'subtle' }]
    : [];
}

function branchCell(isLast: boolean, layout: Layout): StyledRun {
  return cell(isLast ? '└' : '├', layout.tree, { tone: 'subtle' });
}

function childHead(child: TreeChild, isLast: boolean, frame: Frame): StyledRow {
  const { layout, work } = frame;
  const look = lookOf(child.status);
  const runs = [
    branchCell(isLast, layout),
    cell(look.icon, ICON_COLUMNS, { tone: look.tone }),
    cell(child.name, NAME_COLUMNS, { tone: 'text', bold: true }),
    cell(look.label, layout.state, { tone: look.tone }),
    ...workCell(child.work, work),
    cell(marksText(child), layout.marks, { tone: 'warning' }),
  ];
  return withContext(runs, child.context, frame);
}

// `lead` is the indent, and for another main's worker its branch, which the
// name gives up columns for so the state column stays in line.
function elsewhereHead(
  other: TreeOther,
  lead: StyledRun[],
  frame: Frame,
): StyledRow {
  const { layout, work } = frame;
  const look = lookOf(other.status);
  const repo = ' '.repeat(layout.repoGap) + other.repo;
  const nameColumns = NAME_COLUMNS - (rowWidth(lead) - layout.indent);
  const runs = [
    ...lead,
    cell(other.isMain ? '□' : '–', ICON_COLUMNS, { tone: 'inactive' }),
    cell(other.name, nameColumns, { tone: 'text', dim: true }),
    cell(look.label, layout.state, { tone: look.tone }),
    ...workCell(other.work, work),
    cell(repo, layout.repo, { tone: 'subtle' }),
  ];
  return withContext(runs, other.context, frame);
}

// `trunk` carries a tree's line, at `trunkColumn`, down past the rows under a
// session: `│` while more of that tree follows.
function workEntries(
  trunkColumn: number,
  trunk: string,
  work: string | undefined,
  layout: Layout,
): PaneEntry[] {
  if (layout.work !== 'row' || work === undefined) return [];
  const lead = ' '.repeat(trunkColumn) + trunk;
  const row: StyledRow = [
    cell(lead, trunkColumn + WORK_INDENT, { tone: 'subtle' }),
    { text: work, tone: 'inactive' },
  ];
  return [{ row, needsYou: false }];
}

function subagentRuns(subagent: Subagent, layout: Layout): StyledRun[] {
  return [
    cell(`◦ ${subagent.type}`, layout.subagentType, { tone: 'suggestion' }),
    { text: subagent.description, tone: 'inactive', italic: true },
  ];
}

// At most `SUBAGENT_ROWS_MAX` rows, then one that counts the rest, each
// branching after `lead`. `endsTrunk` is false when rows of the same tree
// hang from the same line after them. The heads-only form draws none.
function subagentEntries(
  subagents: readonly Subagent[],
  lead: string,
  endsTrunk: boolean,
  layout: Layout,
): PaneEntry[] {
  if (layout.work === 'none') return [];
  const shown = subagents.slice(0, SUBAGENT_ROWS_MAX);
  const more = subagents.length - shown.length;
  const items: StyledRun[][] = [
    ...shown.map((subagent) => subagentRuns(subagent, layout)),
    ...(more > 0
      ? [[{ text: `◦ +${more} more`, tone: 'inactive' as const }]]
      : []),
  ];
  const last = items.length - 1;
  return items.map((runs, index) => {
    const branch = endsTrunk && index === last ? '└' : '├';
    return {
      row: [{ text: `${lead}${branch} `, tone: 'subtle' }, ...runs],
      needsYou: false,
    };
  });
}

function childEntries(
  child: TreeChild,
  isLast: boolean,
  frame: Frame,
): PaneEntry[] {
  const { layout } = frame;
  const trunk = isLast ? ' ' : '│';
  const lead = trunk.padEnd(layout.subagentIndent);
  return [
    {
      row: childHead(child, isLast, frame),
      needsYou: child.status.kind === 'needs',
    },
    ...workEntries(0, trunk, child.work, layout),
    ...subagentEntries(child.subagents, lead, true, layout),
  ];
}

// A worker of another main, as this main's children hang from the root, from
// a trunk under that main's icon.
function workerEntries(
  worker: TreeOther,
  isLast: boolean,
  frame: Frame,
): PaneEntry[] {
  const { layout } = frame;
  const trunk = isLast ? ' ' : '│';
  const head = [...indentRuns(layout), branchCell(isLast, layout)];
  const lead = ' '.repeat(layout.indent) + trunk.padEnd(layout.subagentIndent);
  return [
    {
      row: elsewhereHead(worker, head, frame),
      needsYou: worker.status.kind === 'needs',
    },
    ...workEntries(layout.indent, trunk, worker.work, layout),
    ...subagentEntries(worker.subagents, lead, true, layout),
  ];
}

// Where a session's subagents branch from the trunk under its icon, they are
// rows of that trunk, before its workers; else the trunk runs past them.
function headSubagents(head: TreeElsewhere, layout: Layout): PaneEntry[] {
  const hasWorkers = head.workers.length > 0;
  if (layout.subagentIndent === layout.indent) {
    const lead = ' '.repeat(layout.indent);
    return subagentEntries(head.subagents, lead, !hasWorkers, layout);
  }
  const trunk = hasWorkers ? '│' : ' ';
  const lead = (' '.repeat(layout.indent) + trunk).padEnd(
    layout.subagentIndent,
  );
  return subagentEntries(head.subagents, lead, true, layout);
}

function elsewhereEntries(block: TreeElsewhere, frame: Frame): PaneEntry[] {
  const { layout } = frame;
  const trunk = block.workers.length > 0 ? '│' : ' ';
  const lastWorker = block.workers.length - 1;
  return [
    {
      row: elsewhereHead(block, indentRuns(layout), frame),
      needsYou: block.status.kind === 'needs',
    },
    ...workEntries(layout.indent, trunk, block.work, layout),
    ...headSubagents(block, layout),
    ...block.workers.flatMap((worker, index) =>
      workerEntries(worker, index === lastWorker, frame),
    ),
  ];
}

// Whole phrases only: when the row has no room for all, the needs-you count
// goes first, then the workers.
function countRuns(root: TreeRoot, room: number): StyledRun[] {
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

// Inline, the counts end where the context column ends; docked, they follow the name.
function rootRow(root: TreeRoot, frame: Frame): StyledRow {
  const { layout, columns } = frame;
  const headColumns = layout.tree + ICON_COLUMNS + NAME_COLUMNS;
  const name = root.name === undefined ? '▣' : `▣ ${root.name}`;
  const head = cell(name, headColumns, { tone: 'claude', bold: true });
  if (layout.work !== 'column') {
    return [head, ...countRuns(root, columns - headColumns)];
  }
  const label: StyledRun = { text: 'this main', tone: 'inactive' };
  const rowEnd = fixedColumns(layout) + frame.work;
  const before = headColumns + width(label.text) + 1;
  const counts = countRuns(root, rowEnd - before);
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

function frameAt(columns: number): Frame {
  if (columns < TWO_ROW_COLUMNS) return { layout: HEADS, work: 0, columns };
  if (columns < ONE_ROW_COLUMNS) return { layout: DOCKED, work: 0, columns };
  const work = Math.min(WORK_COLUMNS_MAX, columns - fixedColumns(INLINE));
  return { layout: INLINE, work, columns };
}

/** The tree's rows at `columns`, in the pane's order: sessions elsewhere that need you, with another main's workers under it, then this main, its children and their subagents, then a blank row and the other sessions. */
export function treeEntries(tree: DeskTree, columns: number): PaneEntry[] {
  const frame = frameAt(columns);
  const lastChild = tree.children.length - 1;
  const others =
    tree.others.length === 0
      ? []
      : [
          { row: [], needsYou: false },
          ...tree.others.flatMap((block) => elsewhereEntries(block, frame)),
        ];
  const entries: PaneEntry[] = [
    ...tree.waiting.flatMap((block) => elsewhereEntries(block, frame)),
    { row: rootRow(tree.root, frame), needsYou: false },
    ...tree.children.flatMap((child, index) =>
      childEntries(child, index === lastChild, frame),
    ),
    ...others,
  ];
  return entries.map((entry) => ({
    ...entry,
    row: trimRow(cutRow(entry.row, columns)),
  }));
}
