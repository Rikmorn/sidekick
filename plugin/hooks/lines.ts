// Line helpers the mods share: they count and cut by code point, so a dash or an ellipsis is one column.

/** The number of columns `text` takes, counted in code points. */
export function width(text: string): number {
  return [...text].length;
}

/** The first `columns` code points of `text`, never splitting one. */
export function cut(text: string, columns: number): string {
  return [...text].slice(0, columns).join('');
}

/** The rows a plain line takes at `columns`: broken at the last space that fits, or hard where a word is longer. An empty line is one empty row; none below one column. */
export function wrapRows(text: string, columns: number): string[] {
  if (columns < 1) return [];
  const rows: string[] = [];
  let rest = [...text];
  while (rest.length > columns) {
    const space = rest.slice(0, columns + 1).lastIndexOf(' ');
    if (space < 1) {
      rows.push(rest.slice(0, columns).join(''));
      rest = rest.slice(columns);
      continue;
    }
    rows.push(rest.slice(0, space).join('').trimEnd());
    let next = space;
    while (rest[next] === ' ') next += 1;
    rest = rest.slice(next);
  }
  rows.push(rest.join(''));
  return rows;
}

/** A pane's first row while its rows exceed its body: how many the window hides, and the keys that reach them. Undefined when the rows fit. */
export function scrollHint(
  rows: number,
  bodyRows: number,
  isFocused: boolean,
): string | undefined {
  if (rows <= bodyRows) return undefined;
  const hidden = `+${rows - bodyRows + 1} rows`;
  return isFocused
    ? `${hidden} · ↓ to scroll`
    : `${hidden} · ctrl+x tab to focus, then ↓`;
}
