// The board pane fitted to a width: worded rows in, styled rows no wider than the pane out.

import type { ThemeKey } from 'claude-code';
import { branchAt, trunkOf } from '../leads';
import { cut, width, wrapRows } from '../lines';
import { cutRow, rowWidth, type StyledRow, type StyledRun } from '../styled';
import type {
  BoardGlance,
  GlancePane,
  GlanceState,
  PaneMark,
  PaneNode,
  PanePlanState,
  PaneRow,
  PaneWeight,
} from './contract';
import { stateLook } from './view';

export interface PaneInput {
  board: BoardGlance['board'];
  milestone: string | null;
  state: GlanceState;
  pane: GlancePane;
  /** `as of HH:MM`, or `refresh failed HH:MM`. */
  stamp: string;
}

const ELLIPSIS = '…';
const INDENT = '  ';
const RULE = '─';
// A repo name cut shorter than this says nothing, so the board link drops instead.
const MIN_NAME_KEPT = 4;
const RULE_OPEN = '─ ';
const RULE_CLOSE = ' ─';
// Columns the rule keeps beside the name: the opening rule and space before it, a space and one rule cell after.
const NAME_FRAME = width(RULE_OPEN) + 2;
// The same, plus the space before the label and the close.
const LINK_FRAME = NAME_FRAME + 1 + width(RULE_CLOSE);

const MARK_LOOKS: Record<PaneMark, { glyph: string; tone: ThemeKey }> = {
  done: { glyph: '✓ ', tone: 'success' },
  running: { glyph: '◐ ', tone: 'suggestion' },
  next: { glyph: '► ', tone: 'claude' },
  later: { glyph: '○ ', tone: 'inactive' },
  group: { glyph: '◇ ', tone: 'inactive' },
  more: { glyph: '', tone: 'inactive' },
};

const WEIGHTS: Record<PaneWeight, { tone: ThemeKey; bold?: boolean }> = {
  strong: { tone: 'text', bold: true },
  plain: { tone: 'text' },
  quiet: { tone: 'inactive' },
};

const CELLS: Record<
  'done' | 'running' | 'rest',
  { glyph: string; tone: ThemeKey }
> = {
  done: { glyph: '█', tone: 'success' },
  running: { glyph: '▓', tone: 'suggestion' },
  rest: { glyph: '░', tone: 'subtle' },
};

const PROSE_LOOKS = {
  next: { lead: '→ ', leadTone: 'claude', text: { tone: 'claude' } },
  drift: { lead: '▲ ', leadTone: 'warning', text: { tone: 'warning' } },
  outcome: {
    lead: INDENT,
    leadTone: 'subtle',
    text: { tone: 'inactive', italic: true },
  },
} satisfies Record<
  Extract<PaneRow, { kind: 'prose' }>['mark'],
  {
    lead: string;
    leadTone: ThemeKey;
    text: Partial<StyledRun> & { tone: ThemeKey };
  }
>;

// `text` within `room` columns, ending in an ellipsis when cut.
function fit(text: string, room: number): string {
  if (room <= 0) return '';
  return width(text) <= room ? text : `${cut(text, room - 1)}${ELLIPSIS}`;
}

function run(
  text: string,
  tone: ThemeKey,
  more: Partial<StyledRun> = {},
): StyledRun {
  return { text, tone, ...more };
}

// The fact flush right gives way only when the text would keep no column.
function fitLine(
  lead: StyledRow,
  title: StyledRun,
  right: StyledRow,
  columns: number,
): StyledRow {
  const rightWidth = rowWidth(right);
  const room = columns - rowWidth(lead) - (rightWidth > 0 ? rightWidth + 1 : 0);
  if (rightWidth === 0 || room < 1) {
    const kept = fit(title.text, columns - rowWidth(lead));
    return [...lead, { ...title, text: kept }];
  }
  const kept = fit(title.text, room);
  const gap = columns - rowWidth(lead) - width(kept) - rightWidth;
  return [
    ...lead,
    { ...title, text: kept },
    run(' '.repeat(gap), 'subtle'),
    ...right,
  ];
}

function nameFor(board: BoardGlance['board'], room: number): string {
  const full = `${board.owner}/${board.repo}`;
  return width(full) <= room ? full : fit(board.repo, room);
}

function headerRow(input: PaneInput, columns: number): StyledRow {
  const { board } = input;
  const label = `board #${board.number}`;
  const linkRoom = columns - width(label) - LINK_FRAME;
  const hasLink = linkRoom >= MIN_NAME_KEPT;
  const name = nameFor(board, hasLink ? linkRoom : columns - NAME_FRAME);
  const used = width(RULE_OPEN) + width(name) + 1;
  const tail = hasLink ? width(label) + 1 + width(RULE_CLOSE) : 0;
  const fill = RULE.repeat(Math.max(1, columns - used - tail));
  return [
    run(RULE_OPEN, 'subtle'),
    run(name, 'inactive', { bold: true }),
    run(` ${fill}`, 'subtle'),
    ...(hasLink
      ? [
          run(' ', 'subtle'),
          run(label, 'suggestion', { href: board.url }),
          run(RULE_CLOSE, 'subtle'),
        ]
      : []),
  ];
}

function headRows(input: PaneInput, columns: number): StyledRow[] {
  const { glyph, tone } = stateLook(input.state);
  const { milestone } = input;
  const head = [run(`${glyph} `, tone)];
  if (milestone === null) {
    return [
      fitLine(head, run(input.state.word, tone, { bold: true }), [], columns),
    ];
  }
  const title = run(milestone, 'text', { bold: true });
  const word = input.state.word;
  const together =
    rowWidth(head) + width(milestone) + 1 + width(word) <= columns;
  if (together) return [fitLine(head, title, [run(word, tone)], columns)];
  return [
    fitLine(head, title, [], columns),
    fitLine([run(INDENT, 'subtle')], run(word, tone), [], columns),
  ];
}

function proseRows(
  row: Extract<PaneRow, { kind: 'prose' }>,
  columns: number,
): StyledRow[] {
  const { lead, leadTone, text: look } = PROSE_LOOKS[row.mark];
  return wrapRows(row.text, Math.max(1, columns - width(lead))).map(
    (text, index) => [
      index === 0 ? run(lead, leadTone) : run(INDENT, 'subtle'),
      { ...look, text, tone: look.tone },
    ],
  );
}

function cellsRow(
  row: Extract<PaneRow, { kind: 'cells' }>,
  columns: number,
): StyledRow {
  const { plans, label } = row;
  const labelRun = run(label, 'inactive');
  if (plans.length === 0) return [run(INDENT, 'subtle'), labelRun];
  const count = (state: PanePlanState): number =>
    plans.filter((plan) => plan === state).length;
  const room = columns - width(INDENT) - 1 - width(label);
  const cells = Math.max(1, Math.min(plans.length, room));
  const scale = cells / plans.length;
  const running =
    count('running') > 0
      ? Math.max(1, Math.round(count('running') * scale))
      : 0;
  const done = Math.min(Math.round(count('done') * scale), cells - running);
  const rest = cells - done - running;
  const gap = Math.max(1, columns - width(INDENT) - cells - width(label));
  return [
    run(INDENT, 'subtle'),
    run(CELLS.done.glyph.repeat(done), CELLS.done.tone),
    run(CELLS.running.glyph.repeat(running), CELLS.running.tone),
    run(CELLS.rest.glyph.repeat(rest), CELLS.rest.tone),
    run(' '.repeat(gap), 'subtle'),
    labelRun,
  ];
}

function nodeRows(
  nodes: readonly PaneNode[],
  prefix: string,
  columns: number,
): StyledRow[] {
  return nodes.flatMap((node, index) => {
    const branch = branchAt(index, nodes.length);
    const look = MARK_LOOKS[node.mark];
    const weight = WEIGHTS[node.weight];
    const lead: StyledRow = [
      run(prefix + branch, 'subtle'),
      ...(look.glyph === '' ? [] : [run(look.glyph, look.tone)]),
      ...(node.ref === null ? [] : [run(`${node.ref} `, 'inactive')]),
    ];
    const right =
      node.right === null
        ? []
        : [run(node.right, node.mark === 'next' ? 'claude' : 'inactive')];
    return [
      fitLine(
        lead,
        run(node.text, weight.tone, weight.bold ? { bold: true } : {}),
        right,
        columns,
      ),
      ...nodeRows(node.children, prefix + trunkOf(branch), columns),
    ];
  });
}

function paneRows(row: PaneRow, columns: number): StyledRow[] {
  switch (row.kind) {
    case 'prose':
      return proseRows(row, columns);
    case 'cells':
      return [cellsRow(row, columns)];
    case 'tree':
      return nodeRows(row.nodes, '', columns);
    default: {
      const unhandled: never = row;
      throw new Error(`unhandled pane row: ${JSON.stringify(unhandled)}`);
    }
  }
}

function stampRow(stamp: string, columns: number): StyledRow {
  const kept = cut(stamp, columns);
  return [
    run(' '.repeat(columns - width(kept)), 'subtle'),
    run(kept, 'subtle'),
  ];
}

/** The pane's rows at `columns`: the header, the head row, the worded rows, and the stamp. No row is wider than `columns`, down to none. */
export function fitPane(input: PaneInput, columns: number): StyledRow[] {
  const room = Math.max(0, columns);
  const rows = [
    headerRow(input, room),
    ...headRows(input, room),
    ...input.pane.rows.flatMap((row) => paneRows(row, room)),
    stampRow(input.stamp, room),
  ];
  return rows.map((row) => cutRow(row, room));
}
