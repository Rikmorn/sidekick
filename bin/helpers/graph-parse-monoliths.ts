/**
 * ops-2 — the ADR parser: `docs/adr/*.md` status lines and the edges they state.
 *
 * Parsing is deliberately conservative: only an `ADR-NNNN` token inside the
 * clause a status verb governs becomes an edge, so a construct the parser does
 * not recognise is dropped rather than guessed at.
 *
 * The `docs/EPIC.md` roadmap/crosswalk parser lived here until #30 retired the
 * graph's PM half. EPIC.md and EPIC-STATE.md stay in the tree as archived
 * records and enter the graph through the docs walk, as plain `doc` entities.
 */

import {
  type Edge,
  type EdgeRelation,
  emptyParse,
  type LintFinding,
  normalizeAdrRef,
  type ParseResult,
} from './graph-model.js';

function finding(
  code: LintFinding['code'],
  message: string,
  origin: string | null,
): LintFinding {
  return { code, message, origin };
}

// ---- ADRs -------------------------------------------------------------------

/**
 * Verbs an ADR status line uses, mapped to the vocabulary. `implements` and
 * `implemented by` both canonicalize to the repo's one direction for that
 * relation, so two ADRs naming the same relation cannot disagree about which
 * way the edge runs.
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
 * Parse one ADR into its entity plus the decision-to-decision edges its status
 * line states. Work-item references in that prose are no longer read (#30): the
 * items they pointed at are GitHub issues now, and the ADR text stays as it is.
 */
export function parseAdr(
  text: string,
  relPath: string,
  adrId: string,
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
 * matched as a period followed by whitespace so decimal-looking tokens survive.
 */
function clauseAfter(line: string, from: number): string {
  const rest = line.slice(from);
  const stop = /;|\.\s|\.$/.exec(rest);
  return stop ? rest.slice(0, stop.index) : rest;
}
