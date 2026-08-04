/**
 * ops-2 (ADR-0007) — the knowledge graph's shared vocabulary and identity rules.
 *
 * Everything here is pure: no filesystem, no SQLite. The parsers produce
 * `Entity`/`Edge`/`LintFinding` values against these types; `graph-store.ts`
 * persists them. Keeping identity deterministic in one place is the graphify
 * lesson — the same source must yield the same ID on any pass.
 */

// ---- edge vocabulary (ADR-0007 D1, reconciled 2026-07-22) -------------------

/** The closed relation set. An edge outside it is a lint finding, not an edge. */
export const EDGE_RELATIONS = [
  'grounds',
  'implements',
  'measures',
  'advances',
  'supersedes',
  'subsumes',
  'resolves',
  'unblocks',
  'spawns',
  'relates',
  'deps',
  'assesses',
  'triggered-by',
  'applies-to',
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
 * Entity kinds. `doc` is the fallback for a cited repo file that carries no
 * richer identity (e.g. `docs/research/README.md` cited by a north-star
 * objective) — it keeps citations resolvable without inventing structure.
 */
export type EntityKind =
  | 'epic'
  | 'item'
  | 'adr'
  | 'objective'
  | 'agent'
  | 'skill'
  | 'helper'
  | 'suite'
  | 'case'
  | 'research'
  | 'backlog'
  | 'cert'
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
  | 'dangling-applies-to'
  | 'invalid-metric';

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

/** EPIC monolith item IDs are namespaced `plat-` — the folder-as-namespace rule. */
export function platItemId(currentId: string): string {
  return `plat-${currentId}`;
}

/** `docs/research/knowledge-layer/REPORT.md` → `research:knowledge-layer`. */
export function researchIdFromPath(relPath: string): string | null {
  const m = /^docs\/research\/([^/]+)\//.exec(relPath);
  return m ? `research:${m[1]}` : null;
}

/** `docs/backlog/fixer-scope-widening.md` → `backlog:fixer-scope-widening`. */
export function backlogIdFromPath(relPath: string): string | null {
  const m = /^docs\/(?:work\/)?backlog\/([^/]+)\.md$/.exec(relPath);
  return m ? `backlog:${m[1]}` : null;
}

/** Slugify a heading for a north-star objective ID check (`## ns-foo — Title`). */
export function objectiveIdFromHeading(heading: string): string | null {
  const m = /^#{2,3}\s+(ns-[a-z0-9-]+)\b/.exec(heading.trim());
  return m ? m[1] : null;
}

// ---- crosswalk normalization (plan D3) --------------------------------------

/**
 * The EPIC crosswalk, parsed from `docs/EPIC.md`. Two independent maps:
 *
 * - `legacy` — `E#` → current `{phase}.{item}`, straight from the crosswalk
 *   table. A value the table records as split/ambiguous (E3) maps to null so
 *   the ref surfaces as a finding rather than a guess.
 * - `v2ToV3` — the re-baseline-3 delta (Phase 3 only). Applied *only* to refs
 *   read from a source dated before the re-baseline, because the same literal
 *   (`3.4`) is a v2 ID in an older document and a different, valid current ID
 *   in a newer one. Without the date guard, normalizing would corrupt live refs.
 */
export interface Crosswalk {
  legacy: Map<string, string | null>;
  v2ToV3: Map<string, string>;
  /** Every `{phase}.{item}` ID the EPIC tables declare — the resolution target set. */
  known: Set<string>;
}

/** The re-baseline that renumbered Phase 3; refs authored before it are v2. */
export const REBASELINE_3_DATE = '2026-07-03';

export function emptyCrosswalk(): Crosswalk {
  return { legacy: new Map(), v2ToV3: new Map(), known: new Set() };
}

export type RefResolution =
  | { ok: true; id: string }
  | { ok: false; reason: 'unresolvable' | 'ambiguous'; raw: string };

/**
 * Resolve a work-item reference to a canonical `plat-*` entity ID.
 *
 * `asOf` is the source document's own date (ISO). When it predates re-baseline
 * 3, Phase-3 refs go through the v2→v3 delta first. Callers that cannot
 * establish a date pass undefined and the ref is read as current — the
 * conservative choice, since every *new* document uses current IDs.
 */
export function resolveItemRef(
  raw: string,
  crosswalk: Crosswalk,
  asOf?: string,
): RefResolution {
  const token = raw.trim().replace(/^[`*]+|[`*]+$/g, '');

  const legacyMatch = /^E(\d{1,2})$/.exec(token);
  if (legacyMatch) {
    const key = `E${legacyMatch[1]}`;
    if (!crosswalk.legacy.has(key)) {
      return { ok: false, reason: 'unresolvable', raw: token };
    }
    const mapped = crosswalk.legacy.get(key);
    if (mapped === null || mapped === undefined) {
      return { ok: false, reason: 'ambiguous', raw: token };
    }
    return { ok: true, id: platItemId(mapped) };
  }

  const itemMatch = /^(\d+)\.(\d+)$/.exec(token);
  if (!itemMatch) return { ok: false, reason: 'unresolvable', raw: token };

  let id = token;
  if (asOf !== undefined && asOf < REBASELINE_3_DATE) {
    const remapped = crosswalk.v2ToV3.get(token);
    if (remapped !== undefined) id = remapped;
  }
  if (crosswalk.known.size > 0 && !crosswalk.known.has(id)) {
    return { ok: false, reason: 'unresolvable', raw: token };
  }
  return { ok: true, id: platItemId(id) };
}

/**
 * Turn an authored edge target into a canonical entity ID.
 *
 * Authors write targets the short way — `adr-0007`, `research/knowledge-layer`,
 * `ns-project-visibility`, `3.3`, `agents/sk-fixer.md`. Every form resolves
 * here so that two documents naming the same thing land on the same node.
 * A path-shaped target becomes a `glob:` node: `applies-to` deliberately points
 * at file patterns, and a pattern is a legitimate destination, not a dangling
 * reference.
 */
export function normalizeEdgeTarget(
  raw: string,
  crosswalk: Crosswalk,
  asOf?: string,
): RefResolution {
  const token = raw.trim().replace(/^[`*[]+|[`*\]]+$/g, '');
  if (token === '') return { ok: false, reason: 'unresolvable', raw };

  // Already-namespaced IDs and north-star objectives pass through untouched.
  if (
    /^(agent|skill|helper|suite|case|research|backlog|cert|doc|glob):/.test(
      token,
    ) ||
    /^ns-[a-z0-9-]+$/.test(token)
  ) {
    return { ok: true, id: token };
  }

  const adr = normalizeAdrRef(token);
  if (adr !== null) return { ok: true, id: adr };

  const slashNamespaced = /^(research|backlog)\/([A-Za-z0-9._-]+)$/.exec(token);
  if (slashNamespaced) {
    return {
      ok: true,
      id: `${slashNamespaced[1]}:${slashNamespaced[2].replace(/\.md$/, '')}`,
    };
  }

  if (/^(E\d{1,2}|\d+\.\d+)$/.test(token)) {
    return resolveItemRef(token, crosswalk, asOf);
  }

  // Path- or glob-shaped targets address files, not entities.
  if (/[/*]/.test(token) || /\.(md|ts|json|jsonl)$/.test(token)) {
    return { ok: true, id: `glob:${token}` };
  }

  // Bare slugs are epic-scoped work IDs (`ops`, `ops-2`) resolved at link time.
  if (/^[a-z][a-z0-9-]*$/.test(token)) return { ok: true, id: token };

  return { ok: false, reason: 'unresolvable', raw: token };
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
