import { describe, expect, it } from 'bun:test';
import {
  adrIdFromFilename,
  backlogIdFromPath,
  type Crosswalk,
  EDGE_RELATIONS,
  emptyCrosswalk,
  fieldAsList,
  fieldAsScalar,
  isEdgeRelation,
  isExcluded,
  normalizeAdrRef,
  objectiveIdFromHeading,
  parseFrontmatter,
  researchIdFromPath,
  resolveItemRef,
} from './graph-model.js';

describe('edge vocabulary', () => {
  it('is the closed 14-relation set from the reconciled ADR-0007 D1', () => {
    expect([...EDGE_RELATIONS]).toEqual([
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
    ]);
    expect(EDGE_RELATIONS.length).toBe(14);
  });

  it('rejects relations outside the vocabulary', () => {
    expect(isEdgeRelation('implements')).toBe(true);
    expect(isEdgeRelation('applies-to')).toBe(true);
    expect(isEdgeRelation('consumes')).toBe(false);
    expect(isEdgeRelation('implemented-by')).toBe(false);
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

  it('keeps real sources, including eval cases next to the fixtures', () => {
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

  it('derives research and backlog ids from their paths', () => {
    expect(researchIdFromPath('docs/research/knowledge-layer/REPORT.md')).toBe(
      'research:knowledge-layer',
    );
    expect(researchIdFromPath('docs/research/README.md')).toBeNull();
    expect(backlogIdFromPath('docs/backlog/fixer-scope-widening.md')).toBe(
      'backlog:fixer-scope-widening',
    );
    expect(backlogIdFromPath('docs/work/backlog/some-item.md')).toBe(
      'backlog:some-item',
    );
  });

  it('reads north-star objective ids from their headings', () => {
    expect(
      objectiveIdFromHeading('## ns-oversight-harness — External oversight'),
    ).toBe('ns-oversight-harness');
    expect(objectiveIdFromHeading('### ns-calibrated-gates — Gates bind')).toBe(
      'ns-calibrated-gates',
    );
    expect(objectiveIdFromHeading('## Options considered')).toBeNull();
  });
});

describe('resolveItemRef', () => {
  const crosswalk = (): Crosswalk => {
    const cw = emptyCrosswalk();
    cw.legacy.set('E13', '3.3');
    cw.legacy.set('E7', '3.2');
    cw.legacy.set('E3', null); // the crosswalk records E3 as split — not a single ID
    cw.v2ToV3.set('3.4', '3.3');
    cw.v2ToV3.set('3.9', '3.1');
    cw.v2ToV3.set('3.3', '3.5');
    for (const id of ['0.2', '1.2', '3.1', '3.2', '3.3', '3.4', '3.5', '5.1']) {
      cw.known.add(id);
    }
    return cw;
  };

  it('maps legacy E# through the crosswalk table', () => {
    expect(resolveItemRef('E13', crosswalk())).toEqual({
      ok: true,
      id: 'plat-3.3',
    });
  });

  it('refuses to guess when the crosswalk records a split mapping', () => {
    expect(resolveItemRef('E3', crosswalk())).toEqual({
      ok: false,
      reason: 'ambiguous',
      raw: 'E3',
    });
  });

  it('reports an unknown E# as unresolvable rather than dropping it', () => {
    expect(resolveItemRef('E99', crosswalk())).toEqual({
      ok: false,
      reason: 'unresolvable',
      raw: 'E99',
    });
  });

  it('reads a bare item ref as current when the source is undated', () => {
    expect(resolveItemRef('3.4', crosswalk())).toEqual({
      ok: true,
      id: 'plat-3.4',
    });
  });

  it('applies the v2→v3 delta only to sources predating re-baseline 3', () => {
    // ADR-0005 (2026-07-02) says `3.4` and means the eval keystone, now 3.3.
    expect(resolveItemRef('3.4', crosswalk(), '2026-07-02')).toEqual({
      ok: true,
      id: 'plat-3.3',
    });
    // ADR-0006 (2026-07-07) says `3.4` and means the sizing signal.
    expect(resolveItemRef('3.4', crosswalk(), '2026-07-07')).toEqual({
      ok: true,
      id: 'plat-3.4',
    });
  });

  it('reproduces ADR-0004s hand-authored editorial pointer', () => {
    // "In this body, `3.3` (forcing-function) is now **`3.5`**"
    expect(resolveItemRef('3.3', crosswalk(), '2026-06-18')).toEqual({
      ok: true,
      id: 'plat-3.5',
    });
  });

  it('flags an item ref no EPIC table declares', () => {
    expect(resolveItemRef('9.9', crosswalk())).toEqual({
      ok: false,
      reason: 'unresolvable',
      raw: '9.9',
    });
  });

  it('strips backtick and bold decoration around refs', () => {
    expect(resolveItemRef('`3.2`', crosswalk())).toEqual({
      ok: true,
      id: 'plat-3.2',
    });
    expect(resolveItemRef('**3.2**', crosswalk())).toEqual({
      ok: true,
      id: 'plat-3.2',
    });
  });
});

describe('parseFrontmatter', () => {
  it('reads scalars, inline arrays and block lists', () => {
    const fm = parseFrontmatter(
      [
        '---',
        'id: ops-2',
        'kind: item',
        'status: open',
        'deps: []',
        'implements: [adr-0007]',
        'advances:',
        '  - ns-project-visibility',
        '  - ns-adaptive-harness',
        '---',
        '',
        '# ops-2 — Compiler core',
      ].join('\n'),
    );
    expect(fm.present).toBe(true);
    expect(fieldAsScalar(fm, 'id')).toBe('ops-2');
    expect(fieldAsScalar(fm, 'status')).toBe('open');
    expect(fieldAsList(fm, 'deps')).toEqual([]);
    expect(fieldAsList(fm, 'implements')).toEqual(['adr-0007']);
    expect(fieldAsList(fm, 'advances')).toEqual([
      'ns-project-visibility',
      'ns-adaptive-harness',
    ]);
    expect(fm.body.trimStart().startsWith('# ops-2')).toBe(true);
  });

  it('reports absence rather than throwing on a file with no frontmatter', () => {
    const fm = parseFrontmatter('# Backlog: something\n\n**Status:** Parked.');
    expect(fm.present).toBe(false);
    expect(fm.fields.size).toBe(0);
    expect(fm.bodyStartLine).toBe(1);
  });

  it('tracks the body start line so body findings cite real line numbers', () => {
    const fm = parseFrontmatter(
      ['---', 'id: ops', 'kind: epic', '---', '', '# ops'].join('\n'),
    );
    expect(fm.bodyStartLine).toBe(5);
  });

  it('reads a scalar field as a single-element list', () => {
    const fm = parseFrontmatter('---\napplies-to: agents/sk-fixer.md\n---\n');
    expect(fieldAsList(fm, 'applies-to')).toEqual(['agents/sk-fixer.md']);
    expect(fieldAsList(fm, 'absent')).toEqual([]);
    expect(fieldAsScalar(fm, 'absent')).toBeNull();
  });
});
