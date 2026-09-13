/**
 * ops-2 (ADR-0007) — the knowledge graph's shared vocabulary and identity rules.
 *
 * Everything here is pure: no filesystem, no SQLite. The parsers produce
 * `Entity`/`Edge`/`LintFinding` values against these types; `graph-store.ts`
 * persists them. Keeping identity deterministic in one place is the graphify
 * lesson — the same source must yield the same ID on any pass.
 */

// ---- edge vocabulary (ADR-0007 D1; narrowed 2026-09 by #30) -----------------

/**
 * The closed relation set. An edge outside it is a lint finding, not an edge.
 *
 * `advances`, `deps` and `applies-to` left when the PM half retired (#30): they
 * were produced only by work-item frontmatter, the EPIC Deps column and backlog
 * `applies-to:`, none of which the compiler reads any more.
 */
export const EDGE_RELATIONS = [
  'grounds',
  'implements',
  'measures',
  'supersedes',
  'subsumes',
  'resolves',
  'unblocks',
  'spawns',
  'relates',
  'assesses',
  'triggered-by',
] as const;

export type EdgeRelation = (typeof EDGE_RELATIONS)[number];

const RELATION_SET: ReadonlySet<string> = new Set(EDGE_RELATIONS);

export function isEdgeRelation(value: string): value is EdgeRelation {
  return RELATION_SET.has(value);
}

/** Confidence tiers. v1 extracts only; INFERRED/AMBIGUOUS have no producers yet. */
export type EdgeTier = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';

// ---- exclusions (plan D5) ---------------------------------------------------

/**
 * Paths the compiler never reads. `docs/superpowers/` is the declared foreign
 * enclave (ADR-0007 D6); `evals/fixtures/` is seeded fixture content that would
 * otherwise pollute the graph with fake RFCs and decisions.
 *
 * Explicit and exported so `graph lint` can report the blind spots rather than
 * leaving them tribal.
 */
export const EXCLUDED_PREFIXES = [
  'docs/superpowers/',
  'evals/fixtures/',
  'node_modules/',
  '.kb/',
  '.worktrees/',
  '.claude/',
  'dist/',
] as const;

/**
 * The committed generated surfaces. They are derived views of the graph, so
 * they are not parsed back into it: a file that describes the corpus cannot be
 * part of the corpus it counts without making its own regeneration unstable.
 */
export const GENERATED_PATHS: ReadonlySet<string> = new Set([
  'docs/STATE.md',
  'MAP.md',
]);

/** True when a repo-relative POSIX path sits under an excluded prefix. */
export function isExcluded(relPath: string): boolean {
  const p = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
  return EXCLUDED_PREFIXES.some(
    (prefix) => p === prefix.slice(0, -1) || p.startsWith(prefix),
  );
}

// ---- entities and edges -----------------------------------------------------

/**
 * Entity kinds — the content corpus only (#30). `doc` is the fallback for a repo
 * file that carries no richer identity, which is how the archived monoliths,
 * `docs/work/**` and `docs/backlog/*.md` enter the graph: as records, not as
 * lifecycles. Work state lives on GitHub.
 */
export type EntityKind =
  | 'adr'
  | 'agent'
  | 'skill'
  | 'helper'
  | 'suite'
  | 'case'
  | 'research'
  | 'cert'
  | 'metric'
  | 'runset'
  | 'doc'
  | 'glob';

export interface Entity {
  id: string;
  kind: EntityKind;
  title: string;
  /** Lifecycle/state where the source declares one; else null. */
  status: string | null;
  /** Repo-relative POSIX path of the file the entity is declared in; null for globs. */
  path: string | null;
  /** Kind-specific extras, JSON-serialised into the store. */
  data?: Record<string, unknown>;
}

export interface Edge {
  src: string;
  rel: EdgeRelation;
  dst: string;
  tier: EdgeTier;
  /** `path:line` of the text the edge was extracted from. */
  origin: string;
}

/** Stable lint codes (plan D7 + the parse-time findings ops-2 mandates). */
export type LintCode =
  | 'unknown-relation'
  | 'unresolvable-ref'
  | 'ambiguous-ref'
  | 'undeclared-location'
  | 'missing-frontmatter'
  | 'generated-drift'
  | 'state-size-cap'
  | 'invalid-metric'
  | 'historical-ref';

export interface LintFinding {
  code: LintCode;
  message: string;
  /** `path:line` where the finding was raised, when known. */
  origin: string | null;
}

export interface ParseResult {
  entities: Entity[];
  edges: Edge[];
  findings: LintFinding[];
}

export function emptyParse(): ParseResult {
  return { entities: [], edges: [], findings: [] };
}

export function mergeParse(...results: ParseResult[]): ParseResult {
  const out = emptyParse();
  for (const r of results) {
    out.entities.push(...r.entities);
    out.edges.push(...r.edges);
    out.findings.push(...r.findings);
  }
  return out;
}

// ---- identity (plan D3) -----------------------------------------------------

/** `docs/adr/0006-eval-harness-contracts.md` → `adr-0006`. */
export function adrIdFromFilename(filename: string): string | null {
  const base = filename.split('/').pop() ?? filename;
  const m = /^(\d{4})-/.exec(base);
  return m ? `adr-${m[1]}` : null;
}

/** `ADR-0006`, `ADR 0006`, `adr-0006` → `adr-0006`. */
export function normalizeAdrRef(raw: string): string | null {
  const m = /^adr[-\s]?(\d{1,4})$/i.exec(raw.trim());
  return m ? `adr-${m[1].padStart(4, '0')}` : null;
}

// ---- frontmatter ------------------------------------------------------------

export interface Frontmatter {
  fields: Map<string, string | string[]>;
  /** 1-based line of the closing `---`, so bodies report accurate line numbers. */
  bodyStartLine: number;
  body: string;
  present: boolean;
}

/**
 * Minimal YAML-subset frontmatter reader: scalars, inline `[a, b]` arrays, and
 * block `- item` lists. That is the whole shape the corpus uses, and a hand
 * parser keeps the kernel dependency-free (the repo ships no YAML library).
 */
export function parseFrontmatter(text: string): Frontmatter {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') {
    return { fields: new Map(), bodyStartLine: 1, body: text, present: false };
  }
  const fields = new Map<string, string | string[]>();
  let i = 1;
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  const flush = (): void => {
    if (currentKey !== null && currentList !== null) {
      fields.set(currentKey, currentList);
    }
    currentKey = null;
    currentList = null;
  };

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '---') {
      flush();
      i++;
      break;
    }
    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem && currentList !== null) {
      currentList.push(stripScalar(listItem[1]));
      continue;
    }
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    flush();
    const [, key, rawValue] = kv;
    const value = rawValue.trim();
    if (value === '') {
      currentKey = key;
      currentList = [];
      fields.set(key, []);
      continue;
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      fields.set(
        key,
        inner === '' ? [] : inner.split(',').map((s) => stripScalar(s)),
      );
      continue;
    }
    fields.set(key, stripScalar(value));
  }
  flush();

  return {
    fields,
    bodyStartLine: i + 1,
    body: lines.slice(i).join('\n'),
    present: true,
  };
}

function stripScalar(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '');
}

/** Read a frontmatter field as a list regardless of scalar/array authoring. */
export function fieldAsList(fm: Frontmatter, key: string): string[] {
  const v = fm.fields.get(key);
  if (v === undefined) return [];
  return Array.isArray(v) ? v.filter((s) => s !== '') : v === '' ? [] : [v];
}

/** Read a frontmatter field as a scalar; arrays and absent fields give null. */
export function fieldAsScalar(fm: Frontmatter, key: string): string | null {
  const v = fm.fields.get(key);
  return typeof v === 'string' && v !== '' ? v : null;
}
