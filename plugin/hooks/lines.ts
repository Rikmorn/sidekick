// Line helpers the mods share. `width`, `cut`, and `fit` count columns: a code point is one, so a dash or an ellipsis is one, and an emoji is two, as the terminal draws it. `wrapRows` counts code points.

/** Cells the hint area keeps from the surface's width: 2 at the left and 2 at the right, read off the probe screens (docs/research/control-centre/2026-10-21-prompt-hint-probes.md): hint rows start 2 cells in, and the subagent panel's row ends at cell 108 of 110. */
export const HINT_INSET = 4;

const EMOJI = /\p{Emoji_Presentation}/u;

// The columns one code point takes.
function columnsOf(char: string): number {
  return EMOJI.test(char) ? 2 : 1;
}

/** The number of columns `text` takes. */
export function width(text: string): number {
  return [...text].reduce((total, char) => total + columnsOf(char), 0);
}

/** The mark a cut text carries. */
export const ELLIPSIS = '…';

/** The first `columns` columns of `text`, never splitting a code point, and leaving out an emoji that would cross the edge. */
export function cut(text: string, columns: number): string {
  const kept: string[] = [];
  let used = 0;
  for (const char of text) {
    used += columnsOf(char);
    if (used > columns) break;
    kept.push(char);
  }
  return kept.join('');
}

/** `text` within `room` columns, ending in an ellipsis when cut: room 1 keeps only the ellipsis, and room 0 or less keeps nothing. */
export function fit(text: string, room: number): string {
  if (room <= 0) return '';
  return width(text) <= room ? text : `${cut(text, room - 1)}${ELLIPSIS}`;
}

/** The rows a plain line takes at `columns`: broken at the last space that fits after its indent, or hard where a word is longer. An empty line is one empty row; none below one column. No row after the first is blank or led by a space. */
export function wrapRows(text: string, columns: number): string[] {
  if (columns < 1) return [];
  const rows: string[] = [];
  let rest = [...text];
  while (rest.length > columns) {
    const indent = rest.findIndex((char) => char !== ' ');
    const floor = indent === -1 ? rest.length : indent;
    const space = rest.slice(0, columns + 1).lastIndexOf(' ');
    const isHard = space <= floor;
    rows.push(
      isHard
        ? rest.slice(0, columns).join('')
        : rest.slice(0, space).join('').trimEnd(),
    );
    let next = isHard ? columns : space;
    while (rest[next] === ' ') next += 1;
    rest = rest.slice(next);
  }
  if (rest.length > 0 || rows.length === 0) rows.push(rest.join(''));
  return rows;
}

/** How many of a pane's rows its window hides once the first row holds the hint; 0 when they fit. */
export function hiddenRows(rows: number, bodyRows: number): number {
  return rows <= bodyRows ? 0 : rows - bodyRows + 1;
}

/** The keys that reach a pane's hidden rows. */
export function scrollKeys(isFocused: boolean): string {
  return isFocused ? '↓ to scroll' : 'ctrl+x tab to focus, then ↓';
}

/** A pane's first row while its rows exceed its body: how many the window hides, and the keys that reach them. Undefined when the rows fit. */
export function scrollHint(
  rows: number,
  bodyRows: number,
  isFocused: boolean,
): string | undefined {
  const hidden = hiddenRows(rows, bodyRows);
  if (hidden === 0) return undefined;
  return `+${hidden} rows · ${scrollKeys(isFocused)}`;
}
