import { describe, expect, it } from 'bun:test';
import { parseResearchReport } from './graph-parse-work.js';

describe('parseResearchReport', () => {
  it('names the topic entity from its directory', () => {
    const r = parseResearchReport(
      '# Knowledge layer — research report\n\nBody.',
      'docs/research/knowledge-layer/REPORT.md',
      'knowledge-layer',
    );
    expect(r.entities[0].id).toBe('research:knowledge-layer');
    // Only a single-token ID prefix (`ops-3 — `) is stripped; a real title
    // containing an em dash keeps both halves.
    expect(r.entities[0].title).toBe('Knowledge layer — research report');
  });
});
