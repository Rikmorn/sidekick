// Styled rows the mods share: a row is runs of text, each in a theme key, and
// draws as one Box row with a Text per run. Widths count as `lines.ts` counts.

import type { RenderElement, ThemeKey } from 'claude-code';
import { cut, ELLIPSIS, width } from './lines';

/** One run of a row: its text, its theme key, and how it is weighted and styled. */
export type StyledRun = {
  text: string;
  tone: ThemeKey;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  /** Draws the run as a link to this address. */
  href?: string;
};

/** One drawn row; an empty row draws as a blank one. */
export type StyledRow = StyledRun[];

/** The columns a row takes. */
export function rowWidth(row: readonly StyledRun[]): number {
  return row.reduce((total, run) => total + width(run.text), 0);
}

/** The row cut to `columns` from its end: a run across the cut is cut, and the runs past it, or left empty, drop. */
export function cutRow(row: readonly StyledRun[], columns: number): StyledRow {
  const kept: StyledRun[] = [];
  let room = Math.max(0, columns);
  for (const run of row) {
    const text = cut(run.text, room);
    if (text !== '') kept.push({ ...run, text });
    room -= width(text);
  }
  return kept;
}

/** The row within `columns`, drawn as `cutRow` draws it when it fits, else ending in an ellipsis in the style of the run that holds its last column: one column keeps only the ellipsis, and none keeps nothing. */
export function fitRow(row: readonly StyledRun[], columns: number): StyledRow {
  if (rowWidth(row) <= columns) return cutRow(row, columns);
  if (columns < 1) return [];
  const kept: StyledRun[] = [];
  let room = columns;
  for (const run of row) {
    const runWidth = width(run.text);
    if (runWidth >= room) {
      return [...kept, { ...run, text: cut(run.text, room - 1) + ELLIPSIS }];
    }
    if (runWidth > 0) kept.push(run);
    room -= runWidth;
  }
  return kept;
}

/** The row without the spaces at its end, and without the runs they leave empty. */
export function trimRow(row: readonly StyledRun[]): StyledRow {
  const end = row.findLastIndex((run) => run.text.trimEnd() !== '');
  const last = row[end];
  if (last === undefined) return [];
  return [...row.slice(0, end), { ...last, text: last.text.trimEnd() }];
}

function runElement(run: StyledRun): RenderElement {
  return {
    type: 'Text',
    props: {
      color: run.tone,
      ...(run.bold === true ? { weight: 'bold' } : {}),
      ...(run.dim === true ? { dimColor: true } : {}),
      ...(run.italic === true ? { italic: true } : {}),
      wrap: 'truncate-end',
    },
    children: [
      run.href === undefined
        ? run.text
        : { type: 'Link', props: { href: run.href }, children: [run.text] },
    ],
  };
}

/** One row as the engine draws it: a row Box with a Text per run, each truncated rather than wrapped, so a row never takes two. A blank row is a Box one row high, since an empty Text takes no row. */
export function rowElement(row: readonly StyledRun[]): RenderElement {
  if (row.length === 0) return { type: 'Box', props: { height: 1 } };
  return {
    type: 'Box',
    props: { flexDirection: 'row' },
    children: row.map(runElement),
  };
}
