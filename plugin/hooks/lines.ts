// Line helpers the mods share: they count and cut by code point, so a dash or an ellipsis is one column.

/** The number of columns `text` takes, counted in code points. */
export function width(text: string): number {
  return [...text].length;
}

/** The first `columns` code points of `text`, never splitting one. */
export function cut(text: string, columns: number): string {
  return [...text].slice(0, columns).join('');
}
