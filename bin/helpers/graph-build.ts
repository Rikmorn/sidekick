/**
 * ops-2 — `sidekick graph build`: walk the live tree, route each source to its
 * parser, link the result, and write `.kb/graph.db`.
 *
 * The build is a full rebuild every run. At this corpus size incrementality
 * would buy nothing and cost a staleness class of bug, and a cache that is
 * cheap to throw away is a cache nobody is tempted to treat as authority.
 *
 * Builds run inline. Dispatching a build to a subagent is the graphify SIGTERM
 * lesson — a long-running child process that dies leaves a half-written store.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadMetricsRegistry } from './eval-metrics.js';
import {
  buildLabelIndex,
  computeMetrics,
  type MetricRecordLike,
} from './eval-report.js';
import {
  type Crosswalk,
  type Edge,
  type Entity,
  emptyCrosswalk,
  emptyParse,
  GENERATED_PATHS,
  isExcluded,
  type LintFinding,
  mergeParse,
  type ParseResult,
} from './graph-model.js';
import {
  parseAgentFile,
  parseCalibration,
  parseEvalCase,
  parseHelperFile,
  parseMetricsRegistrySource,
  parseRunRecords,
  parseSkillFile,
} from './graph-parse-machine.js';
import {
  parseAdr,
  parseCrosswalk,
  parseEpic,
} from './graph-parse-monoliths.js';
import {
  parseBacklogFile,
  parseNorthStar,
  parseResearchReport,
  parseWorkFile,
} from './graph-parse-work.js';
import {
  countEntities,
  type DocText,
  type GraphSnapshot,
  getMeta,
  type MetricValueRow,
  openGraphDb,
  type RunRow,
  SCHEMA_VERSION,
  writeGraph,
} from './graph-store.js';

export const DEFAULT_DB_PATH = '.kb/graph.db';

/** A rebuild losing more than this fraction of its entities is refused. */
const SHRINK_THRESHOLD = 0.5;

export interface BuildResult {
  snapshot: GraphSnapshot;
  findings: LintFinding[];
  crosswalk: Crosswalk;
}

// ---- filesystem helpers -----------------------------------------------------

function read(repoRoot: string, rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf-8');
}

function exists(repoRoot: string, rel: string): boolean {
  return fs.existsSync(path.join(repoRoot, rel));
}

/** Repo-relative POSIX paths under `dir`, sorted, honouring the exclusion list. */
function walk(repoRoot: string, dir: string): string[] {
  const abs = path.join(repoRoot, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  const recurse = (current: string): void => {
    const entries = fs
      .readdirSync(path.join(repoRoot, current), { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const rel = `${current}/${entry.name}`;
      if (isExcluded(rel)) continue;
      if (entry.isDirectory()) recurse(rel);
      else if (entry.isFile()) out.push(rel);
    }
  };
  recurse(dir.replace(/\/$/, ''));
  return out;
}

/** Research topics are directories under `docs/research/` carrying a REPORT.md. */
function researchTopics(repoRoot: string): string[] {
  const base = path.join(repoRoot, 'docs/research');
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() && fs.existsSync(path.join(base, d.name, 'REPORT.md')),
    )
    .map((d) => d.name)
    .sort();
}

// ---- collection -------------------------------------------------------------

/**
 * Parse the whole tree into a snapshot plus findings. Pure with respect to the
 * store: nothing is written here, so tests can assert on the graph a tree
 * produces without a database.
 */
export function collectGraph(repoRoot: string): BuildResult {
  const results: ParseResult[] = [];
  const runs: RunRow[] = [];
  const docs: DocText[] = [];
  const topics = new Set(researchTopics(repoRoot));

  // The crosswalk has to exist before any parser resolves an item reference.
  const epicPath = 'docs/EPIC.md';
  const crosswalk = exists(repoRoot, epicPath)
    ? parseCrosswalk(read(repoRoot, epicPath))
    : emptyCrosswalk();

  if (exists(repoRoot, epicPath)) {
    results.push(
      parseEpic(read(repoRoot, epicPath), epicPath, crosswalk, topics),
    );
  }

  for (const rel of walk(repoRoot, 'docs/adr')) {
    const m = /^docs\/adr\/(\d{4})-.*\.md$/.exec(rel);
    if (!m) continue;
    results.push(parseAdr(read(repoRoot, rel), rel, `adr-${m[1]}`, crosswalk));
  }

  for (const rel of walk(repoRoot, 'docs/work')) {
    if (!rel.endsWith('.md')) continue;
    if (/^docs\/work\/backlog\//.test(rel)) continue; // handled with the pool
    results.push(parseWorkFile(read(repoRoot, rel), rel, crosswalk));
  }

  const northStar = 'docs/NORTH-STAR.md';
  if (exists(repoRoot, northStar)) {
    results.push(
      parseNorthStar(read(repoRoot, northStar), northStar, (p) =>
        exists(repoRoot, p),
      ),
    );
  }

  for (const topic of topics) {
    const rel = `docs/research/${topic}/REPORT.md`;
    results.push(parseResearchReport(read(repoRoot, rel), rel, topic));
  }

  for (const dir of ['docs/backlog', 'docs/work/backlog']) {
    for (const rel of walk(repoRoot, dir)) {
      if (!rel.endsWith('.md')) continue;
      const stem = (rel.split('/').pop() ?? rel).replace(/\.md$/, '');
      if (stem === 'README') continue;
      results.push(parseBacklogFile(read(repoRoot, rel), rel, stem, crosswalk));
    }
  }

  for (const rel of walk(repoRoot, 'evals/cases')) {
    const m = /^evals\/cases\/([^/]+)\/([^/]+)\/case\.json$/.exec(rel);
    if (!m) continue;
    results.push(parseEvalCase(read(repoRoot, rel), rel, m[1], m[2]));
  }

  const rawRecordsByPath = new Map<string, string>();
  for (const rel of walk(repoRoot, 'evals/results')) {
    if (!rel.endsWith('records.jsonl')) continue;
    const raw = read(repoRoot, rel);
    rawRecordsByPath.set(rel, raw);
    const parsed = parseRunRecords(raw, rel);
    runs.push(...parsed.runs);
    results.push({ entities: [], edges: [], findings: parsed.findings });
    results.push(runsetParse(parsed.runs, rel));
  }

  const metricsRegistry = 'evals/metrics.json';
  if (exists(repoRoot, metricsRegistry)) {
    results.push(
      parseMetricsRegistrySource(
        read(repoRoot, metricsRegistry),
        metricsRegistry,
      ),
    );
  }
  const metricValues = computeStoredMetricValues(repoRoot, rawRecordsByPath);

  for (const rel of walk(repoRoot, '.sidekick/calibrations')) {
    if (!rel.endsWith('.json')) continue;
    results.push(parseCalibration(read(repoRoot, rel), rel));
  }

  for (const rel of walk(repoRoot, 'agents')) {
    if (!rel.endsWith('.md')) continue;
    results.push(parseAgentFile(read(repoRoot, rel), rel));
  }

  for (const rel of walk(repoRoot, 'skills')) {
    if (!rel.endsWith('SKILL.md')) continue;
    results.push(parseSkillFile(read(repoRoot, rel), rel));
  }

  for (const rel of walk(repoRoot, 'bin/helpers')) {
    if (
      !rel.endsWith('.ts') ||
      rel.endsWith('.test.ts') ||
      rel.endsWith('.d.ts')
    ) {
      continue;
    }
    results.push(parseHelperFile(read(repoRoot, rel), rel));
  }

  const merged = mergeParse(...results);

  // Steering docs, reviews, and the remaining prose get plain doc entities so
  // citations to them resolve and the map can list what actually exists.
  const claimed = new Set(
    merged.entities.map((e) => e.path).filter((p): p is string => p !== null),
  );
  // A doc entity may already exist as a citation target, created by whichever
  // parser referenced it and titled with its path. Give it the real heading:
  // an entry that names a file twice tells a reader nothing.
  // Grouped, not keyed: the same doc is often cited by several sources, so
  // every instance needs the upgrade — dedupe picks one of them arbitrarily.
  const docEntities = new Map<string, Entity[]>();
  for (const e of merged.entities) {
    if (e.kind !== 'doc') continue;
    docEntities.set(e.id, [...(docEntities.get(e.id) ?? []), e]);
  }
  for (const rel of [...walk(repoRoot, 'docs'), 'AGENTS.md', 'README.md']) {
    if (!rel.endsWith('.md') || !exists(repoRoot, rel)) continue;
    if (GENERATED_PATHS.has(rel)) continue;
    const heading = firstHeading(read(repoRoot, rel)) ?? rel;
    const existing = docEntities.get(`doc:${rel}`);
    if (existing !== undefined) {
      for (const entity of existing) {
        if (entity.title === rel) entity.title = heading;
      }
      continue;
    }
    if (claimed.has(rel)) continue;
    merged.entities.push({
      id: `doc:${rel}`,
      kind: 'doc',
      title: heading,
      status: null,
      path: rel,
    });
  }

  const deduped = dedupeEntities(merged.entities);
  merged.findings.push(...linkCheck(deduped, merged.edges));

  for (const entity of deduped) {
    if (entity.path === null || !entity.path.endsWith('.md')) continue;
    if (!exists(repoRoot, entity.path)) continue;
    docs.push({
      id: entity.id,
      title: entity.title,
      body: read(repoRoot, entity.path),
    });
  }

  return {
    snapshot: {
      entities: deduped,
      edges: merged.edges,
      runs,
      metricValues,
      docs,
      meta: { built_at_commit: headCommit(repoRoot) },
    },
    findings: merged.findings,
    crosswalk,
  };
}

/**
 * A run set is one committed sweep: entity `runset:<run_id>` plus a `measures`
 * edge per subject it exercised (bench-2). Coverage keeps counting cases, not
 * run sets — its counter filters on `case:` sources — so these edges add
 * traversal, not double-counting.
 */
function runsetParse(runRows: RunRow[], relPath: string): ParseResult {
  const out = emptyParse();
  const byRunId = new Map<string, RunRow[]>();
  for (const r of runRows) {
    if (!byRunId.has(r.run_id)) byRunId.set(r.run_id, []);
    byRunId.get(r.run_id)?.push(r);
  }
  for (const [runId, rows] of byRunId) {
    const suites = [...new Set(rows.map((r) => r.suite))].sort();
    const dates = rows
      .map((r) => r.started_at)
      .filter((d): d is string => d !== null)
      .sort();
    out.entities.push({
      id: `runset:${runId}`,
      kind: 'runset',
      title: `run set ${runId} — ${rows.length} record(s), ${suites.length} suite(s)`,
      status: null,
      path: relPath,
      data: {
        records: rows.length,
        suites,
        first_started: dates[0] ?? null,
        last_started: dates[dates.length - 1] ?? null,
      },
    });
    const subjects = new Set(
      rows
        .filter((r) => r.subject_kind !== '' && r.subject_name !== '')
        .map((r) => `${r.subject_kind}:${r.subject_name}`),
    );
    for (const subject of [...subjects].sort()) {
      out.edges.push({
        src: `runset:${runId}`,
        rel: 'measures',
        dst: subject,
        tier: 'EXTRACTED',
        origin: `${relPath}:1`,
      });
    }
  }
  return out;
}

/**
 * The kernel's computeMetrics, run per run set at build time and persisted —
 * one computation point that coverage, gaps, STATE, and the dashboard all
 * read (bench-2). An absent or invalid registry yields no rows; the registry
 * parse already reports invalidity as error-tier findings.
 */
function computeStoredMetricValues(
  repoRoot: string,
  rawRecordsByPath: Map<string, string>,
): MetricValueRow[] {
  const registry = loadMetricsRegistry(repoRoot);
  if (registry.status !== 'ok') return [];

  const byRunId = new Map<string, MetricRecordLike[]>();
  for (const raw of rawRecordsByPath.values()) {
    for (const line of raw.split('\n')) {
      if (line.trim() === '') continue;
      let rec: MetricRecordLike & { run_id?: string };
      try {
        rec = JSON.parse(line);
      } catch {
        continue; // the record parser already reported the corrupt line
      }
      const runId = rec.run_id;
      if (typeof runId !== 'string' || runId === '') continue;
      if (!byRunId.has(runId)) byRunId.set(runId, []);
      byRunId.get(runId)?.push(rec);
    }
  }

  const rows: MetricValueRow[] = [];
  for (const [runId, records] of [...byRunId.entries()].sort()) {
    const labels = buildLabelIndex(
      repoRoot,
      new Set(records.map((r) => r.suite)),
    );
    const section = computeMetrics(records, registry.registry, labels);
    const dates = records
      .map((r) => (r as { started_at?: string }).started_at ?? null)
      .filter((d): d is string => d !== null)
      .sort();
    const lastStarted = dates[dates.length - 1] ?? null;
    for (const [subject, sm] of Object.entries(section.per_subject)) {
      for (const [metric, v] of Object.entries(sm.metrics)) {
        rows.push({
          run_id: runId,
          subject,
          metric,
          computation: v.computation,
          value: v.value,
          n: v.n,
          threshold: v.threshold,
          meets: v.meets_threshold === null ? null : v.meets_threshold ? 1 : 0,
          reason: v.reason ?? null,
          started_at: lastStarted,
        });
      }
    }
  }
  return rows;
}

function firstHeading(text: string): string | null {
  for (const line of text.split('\n')) {
    if (line.startsWith('# ')) return line.replace(/^#\s*/, '').trim();
  }
  return null;
}

/**
 * The same entity is legitimately declared by more than one source (a doc cited
 * by two objectives, a suite named by every case in it). The richest record
 * wins: one carrying a status or data outranks a bare placeholder.
 */
function dedupeEntities(entities: Entity[]): Entity[] {
  const byId = new Map<string, Entity>();
  for (const entity of entities) {
    const existing = byId.get(entity.id);
    if (existing === undefined) {
      byId.set(entity.id, entity);
      continue;
    }
    if (richness(entity) > richness(existing)) byId.set(entity.id, entity);
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

function richness(entity: Entity): number {
  return (
    (entity.status !== null ? 2 : 0) +
    (entity.data !== undefined ? 1 : 0) +
    (entity.kind !== 'doc' ? 4 : 0)
  );
}

/**
 * Every edge endpoint must name an entity that exists. `glob:` destinations are
 * patterns rather than nodes — `applies-to` points at file shapes on purpose —
 * so they are checked by the dangling-applies-to lint instead.
 */
function linkCheck(entities: Entity[], edges: Edge[]): LintFinding[] {
  const ids = new Set(entities.map((e) => e.id));
  const findings: LintFinding[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    if (edge.dst.startsWith('glob:')) continue;
    if (ids.has(edge.dst)) continue;
    const key = `${edge.src}|${edge.rel}|${edge.dst}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      code: 'unresolvable-ref',
      message: `edge "${edge.src} ${edge.rel} ${edge.dst}" points at an entity the build did not find.`,
      origin: edge.origin,
    });
  }
  return findings;
}

function headCommit(repoRoot: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

// ---- CLI --------------------------------------------------------------------

/** Delete the store (and WAL companions) when its stamped schema is not ours. */
function recreateIfStaleSchema(dbPath: string): void {
  if (!fs.existsSync(dbPath)) return;
  let stale = false;
  try {
    const handle = openGraphDb(dbPath);
    try {
      stale = getMeta(handle, 'schema_version') !== String(SCHEMA_VERSION);
    } finally {
      handle.close();
    }
  } catch {
    stale = true; // unreadable is stale
  }
  if (stale) {
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(`${dbPath}${suffix}`, { force: true });
    }
  }
}

export interface BuildCliOptions {
  repoRoot: string;
  dbPath?: string;
  force?: boolean;
  json?: boolean;
}

export interface CliResult {
  stdout: string;
  exitCode: number;
}

/**
 * Build the graph and report what landed. The anti-shrink guard refuses a
 * rebuild that loses most of its entities without `--force`: the usual cause is
 * running against the wrong root or a half-checked-out tree, and silently
 * replacing a good store with an empty one is the expensive failure.
 */
export function runGraphBuildCli(opts: BuildCliOptions): CliResult {
  const dbPath = path.join(opts.repoRoot, opts.dbPath ?? DEFAULT_DB_PATH);
  const built = collectGraph(opts.repoRoot);

  // A stale-schema store cannot be migrated by CREATE IF NOT EXISTS; the db is
  // a derived cache, so the version check just recreates the file.
  recreateIfStaleSchema(dbPath);
  const handle = openGraphDb(dbPath);
  try {
    const before = countEntities(handle);
    const after = built.snapshot.entities.length;
    if (
      opts.force !== true &&
      before > 0 &&
      after < before * SHRINK_THRESHOLD
    ) {
      return {
        stdout: JSON.stringify(
          {
            error: 'anti_shrink_guard',
            message: `rebuild would drop ${before} entities to ${after}; re-run with --force if that is intended.`,
            before,
            after,
          },
          null,
          2,
        ),
        exitCode: 1,
      };
    }
    writeGraph(handle, built.snapshot);
  } finally {
    handle.close();
  }

  const summary = {
    db: path.relative(opts.repoRoot, dbPath),
    built_at_commit: built.snapshot.meta.built_at_commit,
    entities: built.snapshot.entities.length,
    edges: built.snapshot.edges.length,
    runs: built.snapshot.runs.length,
    findings: built.findings.length,
    by_kind: countBy(built.snapshot.entities.map((e) => e.kind)),
    by_relation: countBy(built.snapshot.edges.map((e) => e.rel)),
  };

  if (opts.json === true) {
    return {
      stdout: JSON.stringify({ ...summary, lint: built.findings }, null, 2),
      exitCode: 0,
    };
  }

  const lines = [
    `built ${summary.entities} entities, ${summary.edges} edges, ${summary.runs} runs → ${summary.db}`,
    `commit ${summary.built_at_commit}`,
    `entities: ${formatCounts(summary.by_kind)}`,
    `edges: ${formatCounts(summary.by_relation)}`,
    `lint findings: ${summary.findings}${summary.findings > 0 ? ' (run `sidekick graph lint` for detail)' : ''}`,
  ];
  return { stdout: lines.join('\n'), exitCode: 0 };
}

export function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  );
}

function formatCounts(counts: Record<string, number>): string {
  const parts = Object.entries(counts).map(([k, v]) => `${k} ${v}`);
  return parts.length > 0 ? parts.join(', ') : 'none';
}

export { emptyParse };
