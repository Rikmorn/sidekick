/**
 * ops-3 — the consumption half: `query`, `coverage`, `gaps`, `applies`.
 *
 * Each of the operator's standing questions becomes a command rather than a
 * grep expedition. Two properties matter more than the queries themselves:
 * output is budgetable, so pointing an agent at the layer is cheap enough to be
 * the default; and every "no" is typed and carries its reason, so an empty
 * result is information rather than silence.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Edge, EdgeTier, Entity } from './graph-model.js';
import {
  allEdges,
  allEntities,
  allMetricValues,
  edgesFor,
  type GraphDb,
  getEntity,
  searchDocs,
} from './graph-store.js';

export interface CliResult {
  stdout: string;
  exitCode: number;
}

/** Rough token estimate. Four characters per token is close enough to budget on. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Tier order for budget degradation: the least trustworthy output is dropped
 * first, so a squeezed answer loses speculation before it loses fact.
 */
const TIER_DROP_ORDER: EdgeTier[] = ['AMBIGUOUS', 'INFERRED', 'EXTRACTED'];

// ---- query ------------------------------------------------------------------

export interface QueryOptions {
  term: string;
  budget?: number;
  json?: boolean;
}

interface NeighbourView {
  rel: string;
  id: string;
  kind: string | null;
  title: string | null;
  tier: EdgeTier;
  direction: 'out' | 'in';
}

/**
 * An entity and its typed neighbourhood, or an FTS term search when the
 * argument is not an ID. Budget trimming drops whole tiers in order and then
 * truncates within the surviving tier, always reporting how much it dropped —
 * a silently truncated answer would read as a complete one.
 */
export function runQuery(handle: GraphDb, opts: QueryOptions): CliResult {
  const entity = getEntity(handle, opts.term);

  if (entity === null) {
    const hits = searchDocs(handle, opts.term);
    if (opts.json === true) {
      return {
        stdout: JSON.stringify({ term: opts.term, matches: hits }, null, 2),
        exitCode: hits.length > 0 ? 0 : 1,
      };
    }
    if (hits.length === 0) {
      return {
        stdout: `no entity with id "${opts.term}" and no document matching it.`,
        exitCode: 1,
      };
    }
    const lines = [
      `no entity with id "${opts.term}"; ${hits.length} document match(es):`,
      ...hits.map((h) => `  ${h.id} — ${h.title}`),
    ];
    return { stdout: lines.join('\n'), exitCode: 0 };
  }

  const { out, in: incoming } = edgesFor(handle, entity.id);
  const neighbours: NeighbourView[] = [
    ...out.map((e) => view(handle, e, 'out')),
    ...incoming.map((e) => view(handle, e, 'in')),
  ];

  const trimmed = applyBudget(entity, neighbours, opts.budget);

  if (opts.json === true) {
    return {
      stdout: JSON.stringify(
        {
          entity,
          neighbours: trimmed.kept,
          omitted: trimmed.omitted,
        },
        null,
        2,
      ),
      exitCode: 0,
    };
  }
  return { stdout: renderEntity(entity, trimmed), exitCode: 0 };
}

function view(
  handle: GraphDb,
  edge: Edge,
  direction: 'out' | 'in',
): NeighbourView {
  const otherId = direction === 'out' ? edge.dst : edge.src;
  const other = getEntity(handle, otherId);
  return {
    rel: edge.rel,
    id: otherId,
    kind: other?.kind ?? null,
    title: other?.title ?? null,
    tier: edge.tier,
    direction,
  };
}

interface Trimmed {
  kept: NeighbourView[];
  omitted: number;
}

function applyBudget(
  entity: Entity,
  neighbours: NeighbourView[],
  budget?: number,
): Trimmed {
  if (budget === undefined || budget <= 0) {
    return { kept: neighbours, omitted: 0 };
  }
  let kept = [...neighbours];
  for (const tier of TIER_DROP_ORDER) {
    if (estimateTokens(renderEntity(entity, { kept, omitted: 0 })) <= budget) {
      break;
    }
    const survivors = kept.filter((n) => n.tier !== tier);
    // Never drop the last tier wholesale; truncate within it instead.
    if (survivors.length === 0) break;
    kept = survivors;
  }
  while (
    kept.length > 0 &&
    estimateTokens(
      renderEntity(entity, { kept, omitted: neighbours.length - kept.length }),
    ) > budget
  ) {
    kept.pop();
  }
  return { kept, omitted: neighbours.length - kept.length };
}

function renderEntity(entity: Entity, trimmed: Trimmed): string {
  const lines = [
    `${entity.id} (${entity.kind}) — ${entity.title}`,
    [entity.status !== null ? `status: ${entity.status}` : null, entity.path]
      .filter((s) => s !== null && s !== '')
      .join(' · '),
  ];
  const out = trimmed.kept.filter((n) => n.direction === 'out');
  const incoming = trimmed.kept.filter((n) => n.direction === 'in');
  if (out.length > 0) {
    lines.push('', 'out:');
    for (const n of out) lines.push(`  ${n.rel} → ${n.id}${suffix(n)}`);
  }
  if (incoming.length > 0) {
    lines.push('', 'in:');
    for (const n of incoming) lines.push(`  ${n.id} ${n.rel} →${suffix(n)}`);
  }
  if (trimmed.omitted > 0) {
    lines.push('', `(${trimmed.omitted} further edge(s) omitted for budget)`);
  }
  return lines.join('\n');
}

function suffix(n: NeighbourView): string {
  return n.title !== null ? ` — ${n.title}` : '';
}

// ---- coverage ---------------------------------------------------------------

/** Where the transparency ledger lives: authored, not generated. */
export const COVERAGE_EXCEPTIONS_PATH = 'evals/coverage-exceptions.md';

/**
 * Read the unmeasured-because ledger: lines of `- <subject-id> — <reason>`.
 * Absent file means no stated reasons, which is a legitimate state — every
 * unmeasured subject then reads as unmeasured *without* a reason, which is
 * exactly the visibility the ledger exists to create.
 */
export function readCoverageExceptions(repoRoot: string): Map<string, string> {
  const out = new Map<string, string>();
  const file = path.join(repoRoot, COVERAGE_EXCEPTIONS_PATH);
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const m = /^\s*-\s+`?([A-Za-z][\w:./-]*)`?\s*[—-]\s*(.+)$/.exec(line);
    if (m) out.set(m[1], m[2].trim());
  }
  return out;
}

export interface CoverageRow {
  id: string;
  kind: string;
  title: string;
  counts: Record<string, number>;
  total: number;
}

/** One subject x metric cell from the LATEST run set that computed it. */
export interface MetricCoverageCell {
  metric: string;
  run_id: string;
  value: number | null;
  n: number;
  meets_threshold: boolean | null;
  reason: string | null;
}

export interface CoverageReport {
  suites: string[];
  measured: CoverageRow[];
  unmeasured: Array<{ id: string; kind: string; reason: string | null }>;
  /** Per-metric read (bench-2): subject → latest cell per metric. */
  per_metric: Record<string, MetricCoverageCell[]>;
}

/**
 * Subject x suite matrix from `measures` edges, with the complement spelled
 * out. The complement is the point: a coverage view that lists only what is
 * covered is a marketing document.
 */
export function buildCoverage(
  handle: GraphDb,
  exceptions: Map<string, string>,
): CoverageReport {
  const entities = allEntities(handle);
  const edges = allEdges(handle).filter((e) => e.rel === 'measures');
  const suites = entities
    .filter((e) => e.kind === 'suite')
    .map((e) => e.id.replace(/^suite:/, ''))
    .sort();

  const subjects = entities.filter(
    (e) => e.kind === 'agent' || e.kind === 'skill',
  );
  const counts = new Map<string, Record<string, number>>();
  for (const edge of edges) {
    if (!edge.src.startsWith('case:')) continue; // count cases, not suites
    const suite = edge.src.replace(/^case:/, '').split('/')[0];
    const row = counts.get(edge.dst) ?? {};
    row[suite] = (row[suite] ?? 0) + 1;
    counts.set(edge.dst, row);
  }

  const measured: CoverageRow[] = [];
  const unmeasured: CoverageReport['unmeasured'] = [];
  for (const subject of subjects) {
    const row = counts.get(subject.id);
    if (row === undefined) {
      unmeasured.push({
        id: subject.id,
        kind: subject.kind,
        reason: exceptions.get(subject.id) ?? null,
      });
      continue;
    }
    measured.push({
      id: subject.id,
      kind: subject.kind,
      title: subject.title,
      counts: row,
      total: Object.values(row).reduce((a, b) => a + b, 0),
    });
  }

  measured.sort((a, b) => (a.id < b.id ? -1 : 1));
  unmeasured.sort((a, b) => (a.id < b.id ? -1 : 1));

  // allMetricValues is ordered by started_at, so the last row per
  // subject x metric IS the latest run set's cell.
  const latest = new Map<string, Map<string, MetricCoverageCell>>();
  for (const row of allMetricValues(handle)) {
    if (!latest.has(row.subject)) latest.set(row.subject, new Map());
    latest.get(row.subject)?.set(row.metric, {
      metric: row.metric,
      run_id: row.run_id,
      value: row.value,
      n: row.n,
      meets_threshold: row.meets === null ? null : row.meets === 1,
      reason: row.reason,
    });
  }
  const perMetric: Record<string, MetricCoverageCell[]> = {};
  for (const [subject, cells] of [...latest.entries()].sort()) {
    perMetric[subject] = [...cells.values()].sort((a, b) =>
      a.metric < b.metric ? -1 : 1,
    );
  }

  return { suites, measured, unmeasured, per_metric: perMetric };
}

export function runCoverage(
  handle: GraphDb,
  repoRoot: string,
  json: boolean,
): CliResult {
  const report = buildCoverage(handle, readCoverageExceptions(repoRoot));
  if (json) {
    return { stdout: JSON.stringify(report, null, 2), exitCode: 0 };
  }

  const lines = [
    `coverage — ${report.measured.length} measured subject(s) across ${report.suites.length} suite(s)`,
    '',
  ];
  for (const row of report.measured) {
    const cells = Object.entries(row.counts)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([suite, n]) => `${suite} ${n}`)
      .join(', ');
    lines.push(`  ${row.id}  —  ${cells}`);
  }
  const perMetricIds = Object.keys(report.per_metric);
  if (perMetricIds.length > 0) {
    lines.push('', 'per-metric (latest run set per subject):');
    for (const id of perMetricIds) {
      const cells = report.per_metric[id]
        .map((c) => {
          if (c.value === null) return `${c.metric} —`;
          const mark =
            c.meets_threshold === null
              ? ''
              : c.meets_threshold
                ? ' ok'
                : ' BELOW';
          return `${c.metric} ${c.value.toFixed(2)}${mark}`;
        })
        .join(' · ');
      lines.push(`  ${id}  —  ${cells}`);
    }
  }
  lines.push('', `unmeasured (${report.unmeasured.length}):`);
  for (const row of report.unmeasured) {
    lines.push(
      `  ${row.id} — ${row.reason ?? `no stated reason (add one to ${COVERAGE_EXCEPTIONS_PATH})`}`,
    );
  }
  return { stdout: lines.join('\n'), exitCode: 0 };
}

// ---- gaps -------------------------------------------------------------------

export interface Gap {
  type: string;
  id: string;
  why: string;
}

/**
 * Unmatched-edge queries. Each gap is typed and carries a `why` line, because a
 * gap list without reasons produces exactly one reaction: disbelief.
 */
export function findGaps(handle: GraphDb, repoRoot: string): Gap[] {
  const entities = allEntities(handle);
  const edges = allEdges(handle);
  const gaps: Gap[] = [];

  const incoming = new Map<string, Edge[]>();
  const outgoing = new Map<string, Edge[]>();
  for (const edge of edges) {
    incoming.set(edge.dst, [...(incoming.get(edge.dst) ?? []), edge]);
    outgoing.set(edge.src, [...(outgoing.get(edge.src) ?? []), edge]);
  }

  for (const objective of entities.filter((e) => e.kind === 'objective')) {
    const pointed = (incoming.get(objective.id) ?? []).filter(
      (e) => e.rel === 'advances' || e.rel === 'implements',
    );
    if (pointed.length === 0) {
      gaps.push({
        type: 'objective-unadvanced',
        id: objective.id,
        why: 'no work item or epic declares that it advances this objective, so progress on it is not derivable.',
      });
    }
  }

  const superseded = new Set(
    edges.filter((e) => e.rel === 'supersedes').map((e) => e.dst),
  );
  for (const entity of entities) {
    for (const edge of outgoing.get(entity.id) ?? []) {
      if (edge.rel !== 'grounds' && edge.rel !== 'implements') continue;
      if (!superseded.has(edge.dst)) continue;
      gaps.push({
        type: 'cites-superseded',
        id: entity.id,
        why: `it ${edge.rel} ${edge.dst}, which a later decision supersedes.`,
      });
    }
  }

  for (const backlog of entities.filter(
    (e) => e.kind === 'backlog' && e.status !== 'resolved',
  )) {
    for (const edge of outgoing.get(backlog.id) ?? []) {
      if (edge.rel !== 'applies-to' || !edge.dst.startsWith('glob:')) continue;
      const pattern = edge.dst.slice('glob:'.length);
      if (matchRepoPaths(repoRoot, pattern).length === 0) {
        gaps.push({
          type: 'dangling-applies-to',
          id: backlog.id,
          why: `its applies-to pattern "${pattern}" matches no file in the repo, so the pre-work check can never fire.`,
        });
      }
    }
  }

  const measuredSubjects = new Set(
    edges.filter((e) => e.rel === 'measures').map((e) => e.dst),
  );
  for (const subject of entities.filter(
    (e) => e.kind === 'agent' || e.kind === 'skill',
  )) {
    if (!measuredSubjects.has(subject.id)) {
      gaps.push({
        type: 'subject-unmeasured',
        id: subject.id,
        why: 'no eval case names it as a subject, so a regression in it would not be caught by the bench.',
      });
    }
  }

  // Partially measured (bench-2): the subject runs on the bench, but a metric
  // that applies to it has never computed a value in any run set.
  const valueSeen = new Map<string, boolean>();
  for (const row of allMetricValues(handle)) {
    const key = `${row.subject} ${row.metric}`;
    valueSeen.set(key, (valueSeen.get(key) ?? false) || row.value !== null);
  }
  for (const [key, everComputed] of [...valueSeen.entries()].sort()) {
    if (everComputed) continue;
    const [subject, metric] = key.split(' ');
    gaps.push({
      type: 'metric-unmeasured',
      id: subject,
      why: `measured on the bench, but "${metric}" has never computed a value for it — nothing in its corpus feeds that metric.`,
    });
  }

  return gaps.sort((a, b) =>
    a.type === b.type ? (a.id < b.id ? -1 : 1) : a.type < b.type ? -1 : 1,
  );
}

export function runGaps(
  handle: GraphDb,
  repoRoot: string,
  json: boolean,
): CliResult {
  const gaps = findGaps(handle, repoRoot);
  if (json) return { stdout: JSON.stringify({ gaps }, null, 2), exitCode: 0 };
  if (gaps.length === 0) return { stdout: 'no gaps found.', exitCode: 0 };

  const lines = [`${gaps.length} gap(s):`];
  let lastType = '';
  for (const gap of gaps) {
    if (gap.type !== lastType) {
      lines.push('', `${gap.type}:`);
      lastType = gap.type;
    }
    lines.push(`  ${gap.id}`, `      why: ${gap.why}`);
  }
  return { stdout: lines.join('\n'), exitCode: 0 };
}

// ---- applies ----------------------------------------------------------------

/** Translate a repo glob into a regexp. `**` crosses directories, `*` does not. */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .split('**')
    .map((part) => part.replace(/\*/g, '[^/]*'))
    .join('.*');
  return new RegExp(`^${escaped}$`);
}

function matchRepoPaths(repoRoot: string, pattern: string): string[] {
  const re = globToRegExp(pattern);
  const out: string[] = [];
  const walk = (rel: string): void => {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (child.startsWith('.git') || child === 'node_modules') continue;
      if (entry.isDirectory()) walk(child);
      else if (re.test(child)) out.push(child);
    }
  };
  // A pattern with no wildcard is just a path.
  if (!pattern.includes('*')) {
    return fs.existsSync(path.join(repoRoot, pattern)) ? [pattern] : [];
  }
  walk('');
  return out;
}

export interface AppliesHit {
  id: string;
  title: string;
  target: string;
  matched: string;
}

/**
 * The pre-work check: which open backlog items bear on what I am about to touch.
 *
 * An argument matches a target four ways — same entity ID, a path the target's
 * glob covers, the path an entity lives at, or a bare name naming an entity.
 * The bare-name form is what makes `applies fixer` work the way an operator
 * would type it, rather than demanding `agent:sk-fixer`.
 */
export function findApplies(handle: GraphDb, args: string[]): AppliesHit[] {
  const entities = allEntities(handle);
  const byId = new Map(entities.map((e) => [e.id, e]));
  const edges = allEdges(handle).filter((e) => e.rel === 'applies-to');
  const hits: AppliesHit[] = [];

  for (const edge of edges) {
    const item = byId.get(edge.src);
    if (item === undefined || item.status === 'resolved') continue;
    const target = edge.dst.startsWith('glob:')
      ? edge.dst.slice('glob:'.length)
      : edge.dst;

    for (const arg of args) {
      if (!argMatchesTarget(arg, edge.dst, target, byId)) continue;
      hits.push({
        id: item.id,
        title: item.title,
        target,
        matched: arg,
      });
      break;
    }
  }
  return hits.sort((a, b) => (a.id < b.id ? -1 : 1));
}

function argMatchesTarget(
  arg: string,
  dst: string,
  target: string,
  byId: Map<string, Entity>,
): boolean {
  if (arg === dst || arg === target) return true;

  const looksLikePath = arg.includes('/') || /\.[a-z]+$/.test(arg);
  if (looksLikePath) {
    if (dst.startsWith('glob:') && globToRegExp(target).test(arg)) return true;
    const entity = byId.get(dst);
    return entity?.path === arg;
  }

  // A bare name: does it name the entity this target addresses?
  const entity = byId.get(dst);
  const haystacks = [dst, target, entity?.path ?? ''];
  return haystacks.some((h) => h.toLowerCase().includes(arg.toLowerCase()));
}

export function runApplies(
  handle: GraphDb,
  args: string[],
  json: boolean,
): CliResult {
  if (args.length === 0) {
    return {
      stdout: 'Usage: sidekick graph applies <item-id|path|name>...',
      exitCode: 1,
    };
  }
  const hits = findApplies(handle, args);
  if (json) {
    return {
      stdout: JSON.stringify({ args, applies: hits }, null, 2),
      exitCode: 0,
    };
  }
  if (hits.length === 0) {
    return {
      stdout: `no open backlog item applies to ${args.join(', ')}.`,
      exitCode: 0,
    };
  }
  const lines = [`${hits.length} open backlog item(s) apply:`];
  for (const hit of hits) {
    lines.push(
      `  ${hit.id} — ${hit.title}`,
      `      via applies-to ${hit.target}`,
    );
  }
  return { stdout: lines.join('\n'), exitCode: 0 };
}
