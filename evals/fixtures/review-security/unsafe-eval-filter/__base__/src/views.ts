export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;

export interface Filter {
  column: string;
  op: 'eq' | 'gt' | 'lt';
  value: Cell;
}

/** Saved views filter a report's rows with a structured predicate. */
export function applyFilter(rows: Row[], filter: Filter): Row[] {
  return rows.filter((row) => {
    const cell = row[filter.column] ?? null;
    if (filter.op === 'eq') {
      return cell === filter.value;
    }
    if (cell === null || filter.value === null) {
      return false;
    }
    const left = Number(cell);
    const right = Number(filter.value);
    return filter.op === 'gt' ? left > right : left < right;
  });
}
