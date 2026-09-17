import { describe, expect, it } from 'bun:test';
import {
  adrIdFromFilename,
  EDGE_RELATIONS,
  fieldAsList,
  fieldAsScalar,
  isExcluded,
  normalizeAdrRef,
  parseFrontmatter,
} from './graph-model.js';

describe('edge vocabulary', () => {
  it('is the closed set ADR-0007 D1 declares, narrowed by the #30 retirement', () => {
    expect([...EDGE_RELATIONS]).toEqual([
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
    ]);
    expect(new Set(EDGE_RELATIONS).size).toBe(EDGE_RELATIONS.length);
  });
});

describe('isExcluded', () => {
  it('excludes the foreign enclave and seeded fixtures', () => {
    expect(isExcluded('docs/superpowers/plans/x.md')).toBe(true);
    expect(isExcluded('evals/fixtures/coherence/rfc-clean/RFC.md')).toBe(true);
    expect(isExcluded('.claude/rules/sk-agent-prompts.md')).toBe(true);
    expect(isExcluded('node_modules/foo/index.js')).toBe(true);
    expect(isExcluded('.kb/graph.db')).toBe(true);
  });

  it('keeps real sources, including the archived records and eval cases', () => {
    expect(isExcluded('docs/work/ops/2-compiler-core.md')).toBe(false);
    expect(isExcluded('evals/cases/coherence-agent/rfc-clean/case.json')).toBe(
      false,
    );
    expect(isExcluded('docs/EPIC.md')).toBe(false);
  });

  it('normalizes leading ./ and backslashes before testing', () => {
    expect(isExcluded('./docs/superpowers/x.md')).toBe(true);
    expect(isExcluded('docs\\superpowers\\x.md')).toBe(true);
  });
});

describe('deterministic IDs', () => {
  it('derives ADR ids from the filename number', () => {
    expect(adrIdFromFilename('docs/adr/0006-eval-harness-contracts.md')).toBe(
      'adr-0006',
    );
    expect(adrIdFromFilename('README.md')).toBeNull();
  });

  it('normalizes ADR references as written in prose', () => {
    expect(normalizeAdrRef('ADR-0005')).toBe('adr-0005');
    expect(normalizeAdrRef('adr 7')).toBe('adr-0007');
    expect(normalizeAdrRef('ADR')).toBeNull();
  });
});

describe('parseFrontmatter', () => {
  it('reads scalars, inline arrays and block lists', () => {
    const fm = parseFrontmatter(
      [
        '---',
        'slug: knowledge-layer',
        'kind: rfc',
        'status: open',
        'tags: []',
        'implements: [adr-0007]',
        'reviewers:',
        '  - sk-coherence-checker',
        '  - sk-crossref-checker',
        '---',
        '',
        '# Knowledge layer — RFC',
      ].join('\n'),
    );
    expect(fm.present).toBe(true);
    expect(fieldAsScalar(fm, 'slug')).toBe('knowledge-layer');
    expect(fieldAsScalar(fm, 'status')).toBe('open');
    expect(fieldAsList(fm, 'tags')).toEqual([]);
    expect(fieldAsList(fm, 'implements')).toEqual(['adr-0007']);
    expect(fieldAsList(fm, 'reviewers')).toEqual([
      'sk-coherence-checker',
      'sk-crossref-checker',
    ]);
    expect(fm.body.trimStart().startsWith('# Knowledge layer')).toBe(true);
  });

  it('reports absence rather than throwing on a file with no frontmatter', () => {
    const fm = parseFrontmatter('# A note\n\n**Status:** Parked.');
    expect(fm.present).toBe(false);
    expect(fm.fields.size).toBe(0);
    expect(fm.bodyStartLine).toBe(1);
  });

  it('tracks the body start line so body findings cite real line numbers', () => {
    const fm = parseFrontmatter(
      ['---', 'slug: thing', 'kind: rfc', '---', '', '# Thing'].join('\n'),
    );
    expect(fm.bodyStartLine).toBe(5);
  });

  it('reads a scalar field as a single-element list', () => {
    const fm = parseFrontmatter('---\nsubject: agents/sk-fixer.md\n---\n');
    expect(fieldAsList(fm, 'subject')).toEqual(['agents/sk-fixer.md']);
    expect(fieldAsList(fm, 'absent')).toEqual([]);
    expect(fieldAsScalar(fm, 'absent')).toBeNull();
  });
});
