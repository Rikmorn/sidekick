/** Thin accessor over the Postgres pool the API handlers share. */

export interface QueryResult<T> {
  rows: T[];
}

export interface Pool {
  query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}

let pool: Pool | null = null;

export function setPool(next: Pool): void {
  pool = next;
}

export function db(): Pool {
  if (pool === null) {
    throw new Error('pool not initialised — call setPool() during boot');
  }
  return pool;
}
