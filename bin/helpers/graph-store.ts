/**
 * ops-2 (ADR-0007 D2/D3) — the derived, rebuildable SQLite store.
 *
 * The graph is a cache: sources are text in git, `.kb/graph.db` is regenerated
 * whole on every build. Nothing here is authoritative, which is why the file is
 * gitignored and why a full rebuild is the only write path at this corpus size.
 *
 * `bun:sqlite` is deliberately imported here and nowhere near `bin/cli.ts`'s
 * static import graph — see `graph-cli.ts` for why the graph subcommand loads
 * through a runtime dynamic import.
 */

import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Edge, Entity } from './graph-model.js';

/** Bumped when the schema changes shape; `build` refuses a stale db by rebuilding. */
export const SCHEMA_VERSION = 1;

/** A run record derived from the eval harness records.jsonl files. */
export interface RunRow {
  run_id: string;
  case_id: string;
  suite: string;
  subject_kind: string;
  subject_name: string;
  model: string | null;
  cost_usd: number | null;
  num_turns: number | null;
  verdict: string | null;
  started_at: string | null;
  duration_ms: number | null;
}

/** Prose indexed for FTS5 term search — `query` falls back to it for non-IDs. */
export interface DocText {
  id: string;
  title: string;
  body: string;
}

export interface GraphSnapshot {
  entities: Entity[];
  edges: Edge[];
  runs: RunRow[];
  docs: DocText[];
  meta: Record<string, string>;
}

const SCHEMA_STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, status TEXT, path TEXT, data TEXT)',
  "CREATE TABLE IF NOT EXISTS edges (src TEXT NOT NULL, rel TEXT NOT NULL, dst TEXT NOT NULL, tier TEXT NOT NULL DEFAULT 'EXTRACTED', origin TEXT, PRIMARY KEY (src, rel, dst))",
  'CREATE INDEX IF NOT EXISTS edges_dst ON edges (dst)',
  'CREATE INDEX IF NOT EXISTS entities_kind ON entities (kind)',
  'CREATE TABLE IF NOT EXISTS runs (run_id TEXT NOT NULL, case_id TEXT NOT NULL, suite TEXT NOT NULL, subject_kind TEXT, subject_name TEXT, model TEXT, cost_usd REAL, num_turns INTEGER, verdict TEXT, started_at TEXT, duration_ms INTEGER)',
  'CREATE INDEX IF NOT EXISTS runs_suite ON runs (suite)',
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)',
  'CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(id UNINDEXED, title, body)',
] as const;

export interface GraphDb {
  db: Database;
  close(): void;
}

/** Open (creating parent dirs) and apply the schema. ':memory:' works for tests. */
export function openGraphDb(dbPath: string): GraphDb {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath, { create: true });
  db.run('PRAGMA journal_mode = WAL');
  for (const stmt of SCHEMA_STATEMENTS) db.run(stmt);
  return { db, close: () => db.close() };
}

/** Entity count of an existing store — the anti-shrink guard's input. */
export function countEntities(handle: GraphDb): number {
  const row = handle.db
    .query<{ n: number }, []>('SELECT COUNT(*) AS n FROM entities')
    .get();
  return row?.n ?? 0;
}

/**
 * Replace the whole graph in one transaction. Deterministic ordering (entities
 * and edges are sorted before insert) so two builds of the same tree produce
 * byte-comparable dumps — the property the generated-file drift check rests on.
 */
export function writeGraph(handle: GraphDb, snapshot: GraphSnapshot): void {
  const { db } = handle;
  const entities = [...snapshot.entities].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const edges = [...snapshot.edges].sort((a, b) => {
    const ka = edgeKey(a);
    const kb = edgeKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  const insertEntity = db.prepare(
    'INSERT OR REPLACE INTO entities (id, kind, title, status, path, data) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertEdge = db.prepare(
    'INSERT OR IGNORE INTO edges (src, rel, dst, tier, origin) VALUES (?, ?, ?, ?, ?)',
  );
  const insertRun = db.prepare(
    'INSERT INTO runs (run_id, case_id, suite, subject_kind, subject_name, model, cost_usd, num_turns, verdict, started_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const insertDoc = db.prepare(
    'INSERT INTO docs_fts (id, title, body) VALUES (?, ?, ?)',
  );
  const insertMeta = db.prepare(
    'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
  );

  db.transaction(() => {
    db.run('DELETE FROM entities');
    db.run('DELETE FROM edges');
    db.run('DELETE FROM runs');
    db.run('DELETE FROM docs_fts');
    db.run('DELETE FROM meta');
    for (const e of entities) {
      insertEntity.run(
        e.id,
        e.kind,
        e.title,
        e.status ?? null,
        e.path ?? null,
        e.data ? JSON.stringify(e.data) : null,
      );
    }
    for (const e of edges) {
      insertEdge.run(e.src, e.rel, e.dst, e.tier, e.origin);
    }
    for (const r of snapshot.runs) {
      insertRun.run(
        r.run_id,
        r.case_id,
        r.suite,
        r.subject_kind,
        r.subject_name,
        r.model,
        r.cost_usd,
        r.num_turns,
        r.verdict,
        r.started_at,
        r.duration_ms,
      );
    }
    for (const d of snapshot.docs) {
      insertDoc.run(d.id, d.title, d.body);
    }
    insertMeta.run('schema_version', String(SCHEMA_VERSION));
    for (const [key, value] of Object.entries(snapshot.meta)) {
      insertMeta.run(key, value);
    }
  })();
}

function edgeKey(e: Edge): string {
  return [e.src, e.rel, e.dst].join(' ');
}

// ---- reads ------------------------------------------------------------------

interface EntityRow {
  id: string;
  kind: string;
  title: string;
  status: string | null;
  path: string | null;
  data: string | null;
}

function toEntity(row: EntityRow): Entity {
  return {
    id: row.id,
    kind: row.kind as Entity['kind'],
    title: row.title,
    status: row.status,
    path: row.path,
    data: row.data ? JSON.parse(row.data) : undefined,
  };
}

export function getEntity(handle: GraphDb, id: string): Entity | null {
  const row = handle.db
    .query<EntityRow, [string]>('SELECT * FROM entities WHERE id = ?')
    .get(id);
  return row ? toEntity(row) : null;
}

export function allEntities(handle: GraphDb): Entity[] {
  return handle.db
    .query<EntityRow, []>('SELECT * FROM entities ORDER BY id')
    .all()
    .map(toEntity);
}

export function entitiesOfKind(handle: GraphDb, kind: string): Entity[] {
  return handle.db
    .query<EntityRow, [string]>(
      'SELECT * FROM entities WHERE kind = ? ORDER BY id',
    )
    .all(kind)
    .map(toEntity);
}

export function allEdges(handle: GraphDb): Edge[] {
  return handle.db
    .query<Edge, []>('SELECT * FROM edges ORDER BY src, rel, dst')
    .all();
}

/** Edges touching an id in either direction — the `query` neighbourhood. */
export function edgesFor(
  handle: GraphDb,
  id: string,
): { out: Edge[]; in: Edge[] } {
  const out = handle.db
    .query<Edge, [string]>(
      'SELECT * FROM edges WHERE src = ? ORDER BY rel, dst',
    )
    .all(id);
  const incoming = handle.db
    .query<Edge, [string]>(
      'SELECT * FROM edges WHERE dst = ? ORDER BY rel, src',
    )
    .all(id);
  return { out, in: incoming };
}

export function allRuns(handle: GraphDb): RunRow[] {
  return handle.db
    .query<RunRow, []>(
      'SELECT * FROM runs ORDER BY suite, case_id, run_id, started_at',
    )
    .all();
}

export function getMeta(handle: GraphDb, key: string): string | null {
  const row = handle.db
    .query<{ value: string }, [string]>('SELECT value FROM meta WHERE key = ?')
    .get(key);
  return row?.value ?? null;
}

/**
 * FTS5 term search. The term is escaped as a quoted phrase so operator input
 * containing FTS syntax cannot turn into a malformed MATCH expression.
 */
export function searchDocs(
  handle: GraphDb,
  term: string,
  limit = 20,
): Array<{ id: string; title: string }> {
  const phrase = `"${term.replace(/"/g, '""')}"`;
  return handle.db
    .query<{ id: string; title: string }, [string, number]>(
      'SELECT id, title FROM docs_fts WHERE docs_fts MATCH ? ORDER BY rank LIMIT ?',
    )
    .all(phrase, limit);
}
