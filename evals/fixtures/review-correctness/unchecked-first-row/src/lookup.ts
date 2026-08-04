export interface Row {
  id: string;
  name: string;
  active: boolean;
}

export function activeRows(rows: Row[]): Row[] {
  return rows.filter((r) => r.active);
}

/** The id of the first active row, used as the default selection. */
export function defaultSelection(rows: Row[]): string {
  const first = activeRows(rows)[0];
  return first.id;
}
