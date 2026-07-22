/**
 * ops-2 — parsers for the authored prose sources: `docs/work/**`, the
 * north-star objective tree, research reports, and the backlog pool.
 *
 * These are the sources written in the new shape (ADR-0007 D6), so the edges
 * come from declared structure — frontmatter fields and typed wiki-links —
 * rather than from prose archaeology.
 */

import {
  type Crosswalk,
  EDGE_RELATIONS,
  type Edge,
  type EdgeRelation,
  type Entity,
  type EntityKind,
  emptyParse,
  type Frontmatter,
  fieldAsList,
  fieldAsScalar,
  isEdgeRelation,
  type LintFinding,
  normalizeEdgeTarget,
  objectiveIdFromHeading,
  type ParseResult,
  parseFrontmatter,
} from './graph-model.js';

/** Frontmatter keys that carry metadata rather than edges. */
const METADATA_KEYS = new Set([
  'id',
  'kind',
  'epic',
  'status',
  'title',
  'date',
  'name',
  'description',
]);

const ENTITY_KINDS = new Set<string>([
  'epic',
  'item',
  'adr',
  'objective',
  'agent',
  'skill',
  'helper',
  'suite',
  'case',
  'research',
  'backlog',
  'cert',
  'doc',
  'glob',
]);

function finding(
  code: LintFinding['code'],
  message: string,
  origin: string | null,
): LintFinding {
  return { code, message, origin };
}

/** First markdown H1 in a document, used as the entity title. */
function headingTitle(body: string, fallback: string): string {
  for (const line of body.split('\n')) {
    if (line.startsWith('# ')) {
      return line
        .replace(/^#\s*/, '')
        .replace(/^[A-Za-z0-9.-]+\s+—\s+/, '')
        .trim();
    }
  }
  return fallback;
}

/**
 * Turn a frontmatter relation field or a typed wiki-link into edges, reporting
 * targets that cannot be canonicalized instead of dropping them.
 */
function edgesFromTargets(
  src: string,
  rel: EdgeRelation,
  targets: string[],
  crosswalk: Crosswalk,
  origin: string,
  out: ParseResult,
): void {
  for (const raw of targets) {
    const resolved = normalizeEdgeTarget(raw, crosswalk);
    if (!resolved.ok) {
      out.findings.push(
        finding(
          resolved.reason === 'ambiguous'
            ? 'ambiguous-ref'
            : 'unresolvable-ref',
          `${src}: "${rel}: ${raw}" does not resolve to an entity ID.`,
          origin,
        ),
      );
      continue;
    }
    if (resolved.id === src) continue;
    out.edges.push({
      src,
      rel,
      dst: resolved.id,
      tier: 'EXTRACTED',
      origin,
    });
  }
}

/** `- implements [[adr-0007]]` — the basic-memory-style typed link convention. */
const WIKI_LINK = /^\s*-\s+([a-z][a-z-]*)\s+\[\[([^\]]+)\]\]/;

function parseWikiLinks(
  src: string,
  fm: Frontmatter,
  relPath: string,
  crosswalk: Crosswalk,
  out: ParseResult,
): void {
  fm.body.split('\n').forEach((line, i) => {
    const m = WIKI_LINK.exec(line);
    if (!m) return;
    const origin = `${relPath}:${fm.bodyStartLine + i}`;
    const [, rel, target] = m;
    if (!isEdgeRelation(rel)) {
      out.findings.push(
        finding(
          'unknown-relation',
          `${src}: "${rel}" is not in the closed edge vocabulary (typed link to "${target}").`,
          origin,
        ),
      );
      return;
    }
    edgesFromTargets(src, rel, [target], crosswalk, origin, out);
  });
}

// ---- docs/work/** -----------------------------------------------------------

/**
 * Parse one `docs/work/<epic>/<file>.md` into its entity and declared edges.
 *
 * Required frontmatter (id, kind, status) is the work-structure contract; a
 * file missing it is reported rather than guessed at from its filename, since a
 * guessed ID is exactly the silent-dangling-reference failure the crosswalk
 * discipline exists to prevent.
 */
export function parseWorkFile(
  text: string,
  relPath: string,
  crosswalk: Crosswalk,
): ParseResult {
  const out = emptyParse();
  const fm = parseFrontmatter(text);
  const origin = `${relPath}:1`;

  const id = fieldAsScalar(fm, 'id');
  if (!fm.present || id === null) {
    out.findings.push(
      finding(
        'missing-frontmatter',
        `${relPath}: work/ files require frontmatter with an "id" field.`,
        origin,
      ),
    );
    return out;
  }

  const declaredKind = fieldAsScalar(fm, 'kind') ?? 'item';
  const kind: EntityKind = ENTITY_KINDS.has(declaredKind)
    ? (declaredKind as EntityKind)
    : 'item';
  const status = fieldAsScalar(fm, 'status');
  if (status === null) {
    out.findings.push(
      finding(
        'missing-frontmatter',
        `${relPath}: work/ file "${id}" has no "status" field.`,
        origin,
      ),
    );
  }

  const data: Record<string, unknown> = {};
  const epic = fieldAsScalar(fm, 'epic');
  if (epic !== null) data.epic = epic;
  if (declaredKind !== kind) data.declared_kind = declaredKind;

  out.entities.push({
    id,
    kind,
    title: headingTitle(fm.body, id),
    status,
    path: relPath,
    data: Object.keys(data).length > 0 ? data : undefined,
  });

  for (const [key, value] of fm.fields) {
    if (METADATA_KEYS.has(key)) continue;
    if (!isEdgeRelation(key)) {
      out.findings.push(
        finding(
          'unknown-relation',
          `${relPath}: frontmatter key "${key}" is neither known metadata nor a vocabulary relation.`,
          origin,
        ),
      );
      continue;
    }
    const targets = Array.isArray(value) ? value : [value];
    edgesFromTargets(id, key, targets, crosswalk, origin, out);
  }

  parseWikiLinks(id, fm, relPath, crosswalk, out);
  return out;
}

// ---- docs/NORTH-STAR.md -----------------------------------------------------

/** A citation inside a Sources line that names a repo file. */
const SOURCE_PATH = /`([A-Za-z0-9._/-]+\.(?:md|ts|json|jsonl))`/g;

/**
 * Parse the north-star objective tree.
 *
 * Nesting is the tree: an `###` objective under an `##` objective advances its
 * parent, which is why the decomposition is a rollup rather than a flat list.
 * `Sources:` citations become `grounds` edges to the documents each objective
 * was consolidated from — the traceability ops-1 promised.
 */
export function parseNorthStar(
  text: string,
  relPath: string,
  fileExists: (repoRelative: string) => boolean,
): ParseResult {
  const out = emptyParse();
  const lines = text.split('\n');
  let current: string | null = null;
  let parent: string | null = null;

  lines.forEach((line, i) => {
    const origin = `${relPath}:${i + 1}`;
    const objectiveId = objectiveIdFromHeading(line);
    if (objectiveId !== null) {
      const isChild = line.startsWith('### ');
      const title = line.replace(/^#{2,3}\s+ns-[a-z0-9-]+\s*—?\s*/, '').trim();
      out.entities.push({
        id: objectiveId,
        kind: 'objective',
        title: title === '' ? objectiveId : title,
        status: null,
        path: relPath,
      });
      if (isChild && parent !== null) {
        out.edges.push({
          src: objectiveId,
          rel: 'advances',
          dst: parent,
          tier: 'EXTRACTED',
          origin,
        });
      } else if (!isChild) {
        parent = objectiveId;
      }
      current = objectiveId;
      return;
    }

    if (current === null || !line.trim().startsWith('**Sources:**')) return;
    for (const m of line.matchAll(SOURCE_PATH)) {
      const cited = m[1].replace(/^\.\//, '');
      const repoPath = cited.startsWith('docs/') ? cited : `docs/${cited}`;
      if (!fileExists(repoPath)) {
        out.findings.push(
          finding(
            'unresolvable-ref',
            `${current}: Sources cites "${cited}", which is not a file in the repo.`,
            origin,
          ),
        );
        continue;
      }
      out.edges.push({
        src: current,
        rel: 'grounds',
        dst: `doc:${repoPath}`,
        tier: 'EXTRACTED',
        origin,
      });
      out.entities.push({
        id: `doc:${repoPath}`,
        kind: 'doc',
        title: repoPath,
        status: null,
        path: repoPath,
      });
    }
  });

  return out;
}

// ---- research + backlog -----------------------------------------------------

/** `docs/research/<topic>/REPORT.md` is the topic's record. */
export function parseResearchReport(
  text: string,
  relPath: string,
  topic: string,
): ParseResult {
  const out = emptyParse();
  out.entities.push({
    id: `research:${topic}`,
    kind: 'research',
    title: headingTitle(text, topic),
    status: null,
    path: relPath,
  });
  return out;
}

/**
 * Backlog notes predate the frontmatter convention, so status is read from the
 * authored `**Status:**` line. Only the open set matters to `applies` — a
 * resolved note stays as a record but drops out of pre-work checks.
 */
export function parseBacklogFile(
  text: string,
  relPath: string,
  stem: string,
  crosswalk: Crosswalk,
): ParseResult {
  const out = emptyParse();
  const fm = parseFrontmatter(text);
  const id = `backlog:${stem}`;
  const statusLine = fm.body
    .split('\n')
    .find((l) => l.trim().startsWith('**Status:**'));
  const word = statusLine
    ? (/\*\*Status:\*\*\s*[^A-Za-z]*([A-Za-z]+)/.exec(statusLine)?.[1] ?? '')
    : '';
  const resolved = /^(resolved|decided)$/i.test(word);

  out.entities.push({
    id,
    kind: 'backlog',
    title: headingTitle(fm.body, stem),
    status: resolved ? 'resolved' : 'open',
    path: relPath,
    data: word === '' ? undefined : { status_word: word },
  });

  for (const [key, value] of fm.fields) {
    if (METADATA_KEYS.has(key) || !isEdgeRelation(key)) continue;
    const targets = Array.isArray(value) ? value : [value];
    edgesFromTargets(id, key, targets, crosswalk, `${relPath}:1`, out);
  }
  parseWikiLinks(id, fm, relPath, crosswalk, out);

  return out;
}

/** Exported for the lint check that the vocabulary stays closed at 14. */
export const VOCABULARY_SIZE = EDGE_RELATIONS.length;

export type { Edge, Entity };
