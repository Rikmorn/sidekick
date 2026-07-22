/**
 * ops-2 — parsers for the two pre-work/ monoliths: `docs/EPIC.md` (item tables
 * plus the ID crosswalk) and `docs/adr/*.md` (status line and its edge prose).
 *
 * Both are "interleaved entity soups" (ADR-0007 D6) that stay parse sources
 * until the work/ migration empties them. Parsing is deliberately conservative:
 * a construct that does not match a known shape becomes a lint finding, never a
 * heuristic guess. The fork policy is explicit — a source whose structure
 * defeats this parser gets reported, not worked around.
 */

import {
  type Crosswalk,
  type Edge,
  type EdgeRelation,
  type Entity,
  emptyCrosswalk,
  emptyParse,
  type LintFinding,
  normalizeAdrRef,
  type ParseResult,
  platItemId,
  researchIdFromPath,
  resolveItemRef,
} from './graph-model.js';

// ---- shared helpers ---------------------------------------------------------

/** Split a markdown table row into trimmed cells, dropping the outer pipes. */
function tableCells(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return [];
  return trimmed
    .slice(1, trimmed.endsWith('|') ? -1 : undefined)
    .split('|')
    .map((c) => c.trim());
}

/** Strip markdown decoration so a cell's text can be matched as plain prose. */
function plain(cell: string): string {
  return cell.replace(/[`*~]/g, '').trim();
}

const ID_TOKEN = /\b(E\d{1,2}|\d+\.\d+)\b/g;
/** `E19–E22` and friends: a range names members it does not spell out. */
const RANGE_TOKEN = /\bE\d{1,2}\s*[–—-]\s*E\d{1,2}\b/;

function finding(
  code: LintFinding['code'],
  message: string,
  origin: string | null,
): LintFinding {
  return { code, message, origin };
}

// ---- crosswalk --------------------------------------------------------------

/**
 * Read `docs/EPIC.md`'s crosswalk: the `E#` table, the re-baseline-3 delta, and
 * the set of item IDs the roadmap tables declare.
 *
 * The re-baseline-2 delta is deliberately NOT read: its right-hand IDs are v2,
 * an intermediate baseline no live document cites. Composing it would produce
 * mappings for IDs that never appear as written refs.
 */
export function parseCrosswalk(text: string): Crosswalk {
  const cw = emptyCrosswalk();
  const lines = text.split('\n');

  for (const line of lines) {
    const cells = tableCells(line);
    // The crosswalk table packs three (E#, New) pairs per row.
    if (cells.length >= 2 && /^E\d{1,2}$/.test(plain(cells[0]))) {
      for (let i = 0; i + 1 < cells.length; i += 2) {
        const key = plain(cells[i]);
        const value = plain(cells[i + 1]);
        if (!/^E\d{1,2}$/.test(key)) continue;
        cw.legacy.set(key, /^\d+\.\d+$/.test(value) ? value : null);
      }
    }
    // Roadmap rows declare the live ID set: `| **3.3** ✅ | ... |`.
    const idCell = cells[0] !== undefined ? plain(cells[0]) : '';
    const idMatch = /^(\d+\.\d+)/.exec(idCell);
    if (idMatch && cells.length >= 3) cw.known.add(idMatch[1]);
  }

  // Re-baseline 3 delta: `3.9→3.1` pairs, scoped to that paragraph alone.
  const deltaLine = lines.find((l) => /Re-baseline 3 delta/.test(l));
  if (deltaLine !== undefined) {
    for (const m of deltaLine.matchAll(/(\d+\.\d+)\s*→\s*(\d+\.\d+)/g)) {
      cw.v2ToV3.set(m[1], m[2]);
    }
  }

  return cw;
}

// ---- EPIC item tables -------------------------------------------------------

interface TableShape {
  id: number;
  item: number;
  sources: number;
  deps: number;
}

/** Match a header row to column positions; phases differ (some carry `Was`). */
function readHeader(cells: string[]): TableShape | null {
  const lower = cells.map((c) => plain(c).toLowerCase());
  const id = lower.indexOf('id');
  const item = lower.indexOf('item');
  if (id < 0 || item < 0) return null;
  return {
    id,
    item,
    sources: lower.indexOf('sources'),
    deps: lower.indexOf('deps'),
  };
}

/**
 * Extract the entity title from an item cell: the leading bold phrase where the
 * author supplied one, else the text before the first em dash.
 */
function itemTitle(cell: string): string {
  const bold = /\*\*(.+?)\*\*/.exec(cell);
  if (bold) return bold[1].replace(/[`]/g, '').trim();
  const head = cell.split('—')[0];
  return plain(head).slice(0, 100).trim() || 'untitled item';
}

/**
 * Parse the roadmap tables of `docs/EPIC.md` into `plat-*` item entities plus
 * their `grounds` (Sources column) and `deps`/`relates` (Deps column) edges.
 */
export function parseEpic(
  text: string,
  relPath: string,
  crosswalk: Crosswalk,
  knownResearchTopics: ReadonlySet<string> = new Set(),
): ParseResult {
  const out = emptyParse();
  const lines = text.split('\n');
  let shape: TableShape | null = null;
  let phase: string | null = null;

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const origin = `${relPath}:${lineNo}`;

    const heading = /^###\s+Phase\s+(\d+)/.exec(line);
    if (heading) {
      phase = heading[1];
      shape = null;
      return;
    }

    const cells = tableCells(line);
    if (cells.length === 0) return;
    if (/^-+:?$/.test(plain(cells[0]))) return; // separator row

    const header = readHeader(cells);
    if (header) {
      shape = header;
      return;
    }
    if (shape === null) return;

    const idCell = plain(cells[shape.id] ?? '');
    const idMatch = /^(\d+\.\d+)/.exec(idCell);
    if (!idMatch) return;

    const id = platItemId(idMatch[1]);
    const itemCell = cells[shape.item] ?? '';
    const entity: Entity = {
      id,
      kind: 'item',
      title: itemTitle(itemCell),
      status: idCell.includes('✅') ? 'done' : 'open',
      path: relPath,
      data: phase !== null ? { phase } : undefined,
    };
    out.entities.push(entity);

    if (shape.sources >= 0) {
      const sourcesCell = cells[shape.sources] ?? '';
      out.edges.push(
        ...sourceEdges(id, sourcesCell, origin, knownResearchTopics, out),
      );
    }
    if (shape.deps >= 0) {
      const depsResult = depsEdges(
        id,
        cells[shape.deps] ?? '',
        origin,
        crosswalk,
      );
      out.edges.push(...depsResult.edges);
      out.findings.push(...depsResult.findings);
    }
  });

  return out;
}

/**
 * Sources cells cite ADRs, research topics, backlog notes, and review docs. Each
 * resolvable citation becomes a `grounds` edge from the item to what grounds it
 * — the same direction the work/ frontmatter convention uses.
 */
function sourceEdges(
  src: string,
  cell: string,
  origin: string,
  knownResearchTopics: ReadonlySet<string>,
  out: ParseResult,
): Edge[] {
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const push = (dst: string): void => {
    if (dst === src || seen.has(dst)) return;
    seen.add(dst);
    edges.push({ src, rel: 'grounds', dst, tier: 'EXTRACTED', origin });
  };

  for (const m of cell.matchAll(/ADR-\d{4}/gi)) {
    const adr = normalizeAdrRef(m[0]);
    if (adr !== null) push(adr);
  }
  // Backtick-quoted research topic names, e.g. `agentic-loops`.
  for (const m of cell.matchAll(/`([a-z0-9][a-z0-9-]+)`/g)) {
    if (knownResearchTopics.has(m[1])) push(`research:${m[1]}`);
  }
  // Explicit markdown links into the repo.
  for (const m of cell.matchAll(/\]\(\.\/([^)#\s]+)/g)) {
    const rel = `docs/${m[1]}`;
    const research = researchIdFromPath(rel);
    if (research !== null) {
      push(research);
      continue;
    }
    const backlog = /^docs\/backlog\/([^/]+)\.md$/.exec(rel);
    if (backlog) {
      push(`backlog:${backlog[1]}`);
      continue;
    }
    push(`doc:${rel}`);
    out.entities.push({
      id: `doc:${rel}`,
      kind: 'doc',
      title: rel,
      status: null,
      path: rel,
    });
  }
  return edges;
}

/**
 * Deps cells mix real dependencies with prose that merely mentions IDs
 * ("4.2 reuses", "binding ← 3.3"). Only two shapes are trusted: a segment that
 * is nothing but ID tokens, and an explicit `relates` list. Any other segment
 * carrying an ID is surfaced as ambiguous so a human decides — the alternative
 * is inventing edges, including backwards ones.
 */
function depsEdges(
  src: string,
  cell: string,
  origin: string,
  crosswalk: Crosswalk,
): { edges: Edge[]; findings: LintFinding[] } {
  const edges: Edge[] = [];
  const findings: LintFinding[] = [];

  for (const rawSegment of cell.split(';')) {
    const segment = plain(rawSegment);
    if (segment === '' || segment === '—' || segment === '-') continue;

    const relates = /^relates\s+(.*)$/i.exec(segment);
    const body = relates ? relates[1] : segment;
    const rel: EdgeRelation = relates ? 'relates' : 'deps';

    const tokens = [...body.matchAll(ID_TOKEN)].map((m) => m[0]);
    if (tokens.length === 0) continue;

    // Trusted only when the segment is exactly its ID list plus separators.
    const skeleton = body.replace(ID_TOKEN, '').replace(/[\s,/]/g, '');
    if (skeleton !== '') {
      findings.push(
        finding(
          'ambiguous-ref',
          `Deps segment "${segment}" mentions ${tokens.join(', ')} inside prose; no edge created (direction is not determinable).`,
          origin,
        ),
      );
      continue;
    }

    for (const token of tokens) {
      const resolved = resolveItemRef(token, crosswalk);
      if (!resolved.ok) {
        findings.push(
          finding(
            resolved.reason === 'ambiguous'
              ? 'ambiguous-ref'
              : 'unresolvable-ref',
            `Deps reference "${token}" does not resolve to a current item ID.`,
            origin,
          ),
        );
        continue;
      }
      if (resolved.id !== src) {
        edges.push({ src, rel, dst: resolved.id, tier: 'EXTRACTED', origin });
      }
    }
  }
  return { edges, findings };
}

// ---- ADRs -------------------------------------------------------------------

/**
 * Verbs an ADR status line uses, mapped to the vocabulary. `implements` and
 * `implemented by` both canonicalize to the repo's one direction for that
 * relation — work item implements decision — matching how work/ frontmatter
 * writes it, so the two sources cannot disagree about which way the edge runs.
 */
const ADR_VERBS: Array<{
  pattern: RegExp;
  rel: EdgeRelation;
  /** True when the referenced entity is the edge source, not the ADR. */
  inverted: boolean;
}> = [
  { pattern: /\bimplemented[- ]by\b/gi, rel: 'implements', inverted: true },
  { pattern: /\bimplements\b/gi, rel: 'implements', inverted: true },
  { pattern: /\bsupersedes\b/gi, rel: 'supersedes', inverted: false },
  { pattern: /\bsubsumes\b/gi, rel: 'subsumes', inverted: false },
  { pattern: /\bresolves\b/gi, rel: 'resolves', inverted: false },
  { pattern: /\bunblocks\b/gi, rel: 'unblocks', inverted: false },
  { pattern: /\bspawns\b/gi, rel: 'spawns', inverted: false },
  { pattern: /\brelates\b/gi, rel: 'relates', inverted: false },
  { pattern: /\bgrounds\b/gi, rel: 'grounds', inverted: false },
];

export interface AdrHeader {
  id: string;
  title: string;
  state: string | null;
  date: string | null;
  statusLine: string | null;
  statusLineNo: number;
}

/** Read an ADR's identity and status line. The line's position varies — two
 * ADRs open with an editorial pointer blockquote — so it is found by content. */
export function parseAdrHeader(text: string, adrId: string): AdrHeader {
  const lines = text.split('\n');
  const titleLine = lines.find((l) => l.startsWith('# '));
  const title = titleLine
    ? titleLine
        .replace(/^#\s*/, '')
        .replace(/^ADR-\d+\s*—\s*/, '')
        .trim()
    : adrId;

  const statusIndex = lines.findIndex((l) =>
    l.trim().startsWith('**Status:**'),
  );
  if (statusIndex < 0) {
    return {
      id: adrId,
      title,
      state: null,
      date: null,
      statusLine: null,
      statusLineNo: 0,
    };
  }
  const statusLine = lines[statusIndex];
  const stateMatch = /\*\*Status:\*\*\s*([A-Za-z-]+)/.exec(statusLine);
  const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(statusLine);
  return {
    id: adrId,
    title,
    state: stateMatch ? stateMatch[1] : null,
    date: dateMatch ? dateMatch[1] : null,
    statusLine,
    statusLineNo: statusIndex + 1,
  };
}

/**
 * Parse one ADR into its entity plus the edges its status line states.
 *
 * The status line's date drives crosswalk normalization: an ADR accepted before
 * re-baseline 3 spells Phase-3 items in v2 IDs, and this is what reproduces the
 * editorial pointers ADR-0004 and ADR-0005 carry by hand.
 */
export function parseAdr(
  text: string,
  relPath: string,
  adrId: string,
  crosswalk: Crosswalk,
): ParseResult {
  const out = emptyParse();
  const header = parseAdrHeader(text, adrId);

  out.entities.push({
    id: adrId,
    kind: 'adr',
    title: header.title,
    status: header.state,
    path: relPath,
    data: header.date !== null ? { decided: header.date } : undefined,
  });

  if (header.statusLine === null) {
    out.findings.push(
      finding(
        'missing-frontmatter',
        `${adrId} has no "**Status:**" line; state and edge prose could not be read.`,
        `${relPath}:1`,
      ),
    );
    return out;
  }

  const origin = `${relPath}:${header.statusLineNo}`;
  const seen = new Set<string>();

  for (const { pattern, rel, inverted } of ADR_VERBS) {
    for (const match of header.statusLine.matchAll(pattern)) {
      const clause = clauseAfter(
        header.statusLine,
        match.index + match[0].length,
      );

      if (RANGE_TOKEN.test(clause)) {
        out.findings.push(
          finding(
            'ambiguous-ref',
            `${adrId} status prose "${rel} ${clause.trim().slice(0, 60)}" uses an ID range; members are not spelled out, so no edges were created.`,
            origin,
          ),
        );
        continue;
      }

      for (const adrMatch of clause.matchAll(/ADR-\d{4}/gi)) {
        const target = normalizeAdrRef(adrMatch[0]);
        if (target === null || target === adrId) continue;
        addEdge(out, seen, {
          src: inverted ? target : adrId,
          rel,
          dst: inverted ? adrId : target,
          tier: 'EXTRACTED',
          origin,
        });
      }

      for (const idMatch of clause.matchAll(ID_TOKEN)) {
        const resolved = resolveItemRef(
          idMatch[0],
          crosswalk,
          header.date ?? undefined,
        );
        if (!resolved.ok) {
          out.findings.push(
            finding(
              resolved.reason === 'ambiguous'
                ? 'ambiguous-ref'
                : 'unresolvable-ref',
              `${adrId} status prose references "${idMatch[0]}" after "${rel}", which does not resolve to a current item ID.`,
              origin,
            ),
          );
          continue;
        }
        addEdge(out, seen, {
          src: inverted ? resolved.id : adrId,
          rel,
          dst: inverted ? adrId : resolved.id,
          tier: 'EXTRACTED',
          origin,
        });
      }
    }
  }

  return out;
}

function addEdge(out: ParseResult, seen: Set<string>, edge: Edge): void {
  const key = [edge.src, edge.rel, edge.dst].join(' ');
  if (seen.has(key)) return;
  seen.add(key);
  out.edges.push(edge);
}

/**
 * The text a verb governs: up to the next clause boundary. Sentence ends are
 * matched as a period followed by whitespace so item IDs like `3.3` survive.
 */
function clauseAfter(line: string, from: number): string {
  const rest = line.slice(from);
  const stop = /;|\.\s|\.$/.exec(rest);
  return stop ? rest.slice(0, stop.index) : rest;
}
