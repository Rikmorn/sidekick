/**
 * ops-2 — the research-report parser.
 *
 * The `docs/work/**` item parser, the north-star objective parser and the
 * backlog-pool parser lived here until #30 retired the graph's PM half. Those
 * files stay in the tree as records and enter the graph through the docs walk,
 * as plain `doc` entities; work state itself lives on GitHub.
 */

import { emptyParse, type ParseResult } from './graph-model.js';

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
