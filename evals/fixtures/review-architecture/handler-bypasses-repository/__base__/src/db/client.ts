export type Row = Record<string, unknown>;

interface Pool {
  execute(sql: string, params: unknown[]): Promise<Row[]>;
  affectedRows(): number;
}

let pool: Pool | null = null;

export function configure(p: Pool): void {
  pool = p;
}

export async function query(sql: string, params: unknown[]): Promise<Row[]> {
  if (pool === null) throw new Error('db pool not configured');
  return pool.execute(sql, params);
}

export function lastAffected(): number {
  if (pool === null) throw new Error('db pool not configured');
  return pool.affectedRows();
}
