export interface Row {
  id: string;
  name: string;
  active: boolean;
}

export function activeRows(rows: Row[]): Row[] {
  return rows.filter((r) => r.active);
}
