/**
 * Narrow ambient declaration for the slice of `bun:sqlite` the graph helpers
 * use. The repo typechecks with `"types": ["node"]` and ships no `bun-types`
 * dependency; declaring just this surface keeps the kernel dependency-free and
 * avoids pulling Bun's global type overrides across every file.
 *
 * Runtime behaviour is covered by the graph store tests, which execute against
 * the real binding under `bun test`.
 */
declare module 'bun:sqlite' {
  export interface Statement<
    Row = unknown,
    Params extends unknown[] = unknown[],
  > {
    run(...params: Params): void;
    get(...params: Params): Row | null;
    all(...params: Params): Row[];
  }

  export class Database {
    constructor(
      filename?: string,
      options?: { create?: boolean; readonly?: boolean },
    );
    run(sql: string, ...params: unknown[]): void;
    prepare<Row = unknown, Params extends unknown[] = unknown[]>(
      sql: string,
    ): Statement<Row, Params>;
    query<Row = unknown, Params extends unknown[] = unknown[]>(
      sql: string,
    ): Statement<Row, Params>;
    transaction<Args extends unknown[], Result>(
      fn: (...args: Args) => Result,
    ): (...args: Args) => Result;
    close(): void;
  }
}
