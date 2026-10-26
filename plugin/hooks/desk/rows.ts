// The desk pane's rows, built from its tree at a width. From 80 columns each
// session takes one row of aligned columns, as the L1 inline plate lays them
// out; narrower, the pane takes the stacked form in `stacked.ts`.

import { fit, width } from '../lines';
import {
  fitRow,
  rowWidth,
  type StyledRow,
  type StyledRun,
  trimRow,
} from '../styled';
import {
  CONTEXT_COLUMNS,
  contextRuns,
  countRuns,
  lookOf,
  marksText,
  type PaneEntry,
} from './look';
import { stackedEntries } from './stacked';
import type {
  Context,
  DeskTree,
  TreeChild,
  TreeElsewhere,
  TreeOther,
  TreeRoot,
} from './tree';

type Subagent = TreeChild['subagents'][number];

const ONE_ROW_COLUMNS = 80;
// Wider, the context column drifts away from the name it belongs to.
const WORK_COLUMNS_MAX = 60;
const TREE_COLUMNS = 3;
// The blank columns before a row elsewhere, so its icon stands under a child's.
const INDENT_COLUMNS = TREE_COLUMNS;
const ICON_COLUMNS = 2;
const NAME_COLUMNS = 15;
const STATE_COLUMNS = 11;
const MARKS_COLUMNS = 14;
const REPO_COLUMNS = 14;
// The blank columns before the repo inside its cell.
const REPO_GAP = 5;
const SUBAGENT_TYPE_COLUMNS = 18;
// More would push the sessions after them out of the pane.
const SUBAGENT_ROWS_MAX = 3;

const FIXED_COLUMNS =
  TREE_COLUMNS +
  ICON_COLUMNS +
  NAME_COLUMNS +
  STATE_COLUMNS +
  MARKS_COLUMNS +
  CONTEXT_COLUMNS;

// A cell keeps its last column blank, so the next cell never touches it.
function cell(
  text: string,
  columns: number,
  style: Omit<StyledRun, 'text'>,
): StyledRun {
  const kept = fit(text, columns - 1);
  return { ...style, text: kept + ' '.repeat(columns - width(kept)) };
}

// The inline form at one width: its work column's width, and the columns its rows end at.
interface Frame {
  work: number;
  columns: number;
}

// A head row's runs, then its context in the room the row has left.
function withContext(
  runs: StyledRun[],
  context: Context | undefined,
  frame: Frame,
): StyledRow {
  return [...runs, ...contextRuns(context, frame.columns - rowWidth(runs))];
}

function workCell(work: string | undefined, columns: number): StyledRun {
  return cell(work ?? '', columns, { tone: 'inactive' });
}

function indentRun(): StyledRun {
  return { text: ' '.repeat(INDENT_COLUMNS), tone: 'subtle' };
}

function branchCell(isLast: boolean): StyledRun {
  return cell(isLast ? '└' : '├', TREE_COLUMNS, { tone: 'subtle' });
}

function childHead(child: TreeChild, isLast: boolean, frame: Frame): StyledRow {
  const look = lookOf(child.status);
  const runs = [
    branchCell(isLast),
    cell(look.icon, ICON_COLUMNS, { tone: look.tone }),
    cell(child.name, NAME_COLUMNS, { tone: 'text', bold: true }),
    cell(look.label, STATE_COLUMNS, { tone: look.tone }),
    workCell(child.work, frame.work),
    cell(marksText(child), MARKS_COLUMNS, { tone: 'warning' }),
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
  const look = lookOf(other.status);
  const repo = ' '.repeat(REPO_GAP) + other.repo;
  const nameColumns = NAME_COLUMNS - (rowWidth(lead) - INDENT_COLUMNS);
  const runs = [
    ...lead,
    cell(other.isMain ? '□' : '–', ICON_COLUMNS, { tone: 'inactive' }),
    cell(other.name, nameColumns, { tone: 'text', dim: true }),
    cell(look.label, STATE_COLUMNS, { tone: look.tone }),
    workCell(other.work, frame.work),
    cell(repo, REPO_COLUMNS, { tone: 'subtle' }),
  ];
  return withContext(runs, other.context, frame);
}

function subagentRuns(subagent: Subagent): StyledRun[] {
  return [
    cell(`◦ ${subagent.type}`, SUBAGENT_TYPE_COLUMNS, { tone: 'suggestion' }),
    { text: subagent.description, tone: 'inactive', italic: true },
  ];
}

// At most `SUBAGENT_ROWS_MAX` rows, then one that counts the rest, each
// branching after `lead`. `endsTrunk` is false when rows of the same tree
// hang from the same line after them.
function subagentEntries(
  subagents: readonly Subagent[],
  lead: string,
  endsTrunk: boolean,
): PaneEntry[] {
  const shown = subagents.slice(0, SUBAGENT_ROWS_MAX);
  const more = subagents.length - shown.length;
  const items: StyledRun[][] = [
    ...shown.map(subagentRuns),
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
  const lead = (isLast ? ' ' : '│').padEnd(TREE_COLUMNS);
  return [
    {
      row: childHead(child, isLast, frame),
      needsYou: child.status.kind === 'needs',
    },
    ...subagentEntries(child.subagents, lead, true),
  ];
}

// A worker of another main, as this main's children hang from the root, from
// a trunk under that main's icon.
function workerEntries(
  worker: TreeOther,
  isLast: boolean,
  frame: Frame,
): PaneEntry[] {
  const head = [indentRun(), branchCell(isLast)];
  const lead =
    ' '.repeat(INDENT_COLUMNS) + (isLast ? ' ' : '│').padEnd(TREE_COLUMNS);
  return [
    {
      row: elsewhereHead(worker, head, frame),
      needsYou: worker.status.kind === 'needs',
    },
    ...subagentEntries(worker.subagents, lead, true),
  ];
}

// A session's subagents branch from the trunk under its icon, before its workers.
function elsewhereEntries(block: TreeElsewhere, frame: Frame): PaneEntry[] {
  const lastWorker = block.workers.length - 1;
  return [
    {
      row: elsewhereHead(block, [indentRun()], frame),
      needsYou: block.status.kind === 'needs',
    },
    ...subagentEntries(
      block.subagents,
      ' '.repeat(INDENT_COLUMNS),
      block.workers.length === 0,
    ),
    ...block.workers.flatMap((worker, index) =>
      workerEntries(worker, index === lastWorker, frame),
    ),
  ];
}

// The counts end where the context column ends.
function rootRow(root: TreeRoot, frame: Frame): StyledRow {
  const headColumns = TREE_COLUMNS + ICON_COLUMNS + NAME_COLUMNS;
  const name = root.name === undefined ? '▣' : `▣ ${root.name}`;
  const head = cell(name, headColumns, { tone: 'claude', bold: true });
  const label: StyledRun = { text: 'this main', tone: 'inactive' };
  const rowEnd = FIXED_COLUMNS + frame.work;
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

function inlineEntries(tree: DeskTree, columns: number): PaneEntry[] {
  const frame = {
    work: Math.min(WORK_COLUMNS_MAX, columns - FIXED_COLUMNS),
    columns,
  };
  const lastChild = tree.children.length - 1;
  const others =
    tree.others.length === 0
      ? []
      : [
          { row: [], needsYou: false },
          ...tree.others.flatMap((block) => elsewhereEntries(block, frame)),
        ];
  return [
    ...tree.waiting.flatMap((block) => elsewhereEntries(block, frame)),
    { row: rootRow(tree.root, frame), needsYou: false },
    ...tree.children.flatMap((child, index) =>
      childEntries(child, index === lastChild, frame),
    ),
    ...others,
  ];
}

/** The tree's rows at `columns`, in the pane's order: sessions that need you first, then this main and its workers, then the rest. From 80 columns one aligned row per session; below, the stacked form. */
export function treeEntries(tree: DeskTree, columns: number): PaneEntry[] {
  const entries =
    columns < ONE_ROW_COLUMNS
      ? stackedEntries(tree, columns)
      : inlineEntries(tree, columns);
  // Trimmed before the fit, so only text past the end takes an ellipsis, never trailing spaces.
  return entries.map((entry) => ({
    ...entry,
    row: fitRow(trimRow(entry.row), columns),
  }));
}
