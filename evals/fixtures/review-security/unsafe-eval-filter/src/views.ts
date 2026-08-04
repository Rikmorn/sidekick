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

export interface Request {
  body: { expression?: string };
  session: { userId: string } | null;
}

/**
 * Advanced filters let power users type a JS expression over the row, e.g.
 * `row.total > 100 && row.status === 'open'` — the structured Filter shape
 * could not express the boolean combinations support kept asking for.
 */
export function applyExpression(rows: Row[], expression: string): Row[] {
  const predicate = new Function('row', `return (${expression});`) as (
    row: Row,
  ) => boolean;
  return rows.filter((row) => predicate(row));
}

/** POST /views/preview — runs the expression the user just typed. */
export function previewView(req: Request, rows: Row[]): Row[] {
  if (req.session === null) {
    throw new Error('unauthenticated');
  }
  return applyExpression(rows, req.body.expression ?? 'true');
}
