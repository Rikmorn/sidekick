/**
 * ops-2 — the research parser: `docs/research/<topic>/REPORT.md` as the topic's
 * record, titled by its first H1.
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
