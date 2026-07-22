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
  openGraphDb,
  type RunRow,
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

  for (const rel of walk(repoRoot, 'evals/results')) {
    if (!rel.endsWith('records.jsonl')) continue;
    const parsed = parseRunRecords(read(repoRoot, rel), rel);
    runs.push(...parsed.runs);
    results.push({ entities: [], edges: [], findings: parsed.findings });
  }

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
      docs,
      meta: { built_at_commit: headCommit(repoRoot) },
    },
    findings: merged.findings,
    crosswalk,
  };
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
