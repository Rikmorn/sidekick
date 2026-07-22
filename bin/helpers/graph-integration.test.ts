import { describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectGraph } from './graph-build.js';

/**
 * ops-2's integration gate: build the graph from this repo as it actually is.
 *
 * Unit tests prove each parser against a fixture snippet; only this run proves
 * the parsers agree with the live corpus — the tree is the parse target, and a
 * source whose structure defeats conservative parsing is meant to surface here
 * as a finding rather than be worked around in code.
 */

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

describe('graph build on the live tree', () => {
  const { snapshot, findings } = collectGraph(REPO_ROOT);
  const edges = new Set(
    snapshot.edges.map((e) => `${e.src} ${e.rel} ${e.dst}`),
  );
  const ids = new Set(snapshot.entities.map((e) => e.id));

  it('links an EPIC item to the ADR that decided it, across two monoliths', () => {
    // The edge exists in neither source alone: EPIC.md's row does not cite
    // ADR-0006, and ADR-0006's status line spells the relation the other way
    // round. Canonicalization is what makes it one edge.
    expect(edges.has('plat-3.3 implements adr-0006')).toBe(true);
  });

  it('links an eval suite to the agent it measures', () => {
    expect(
      edges.has('suite:coherence-agent measures agent:sk-coherence-checker'),
    ).toBe(true);
  });

  it('links the ops epic to the objective it advances', () => {
    expect(edges.has('ops advances ns-project-visibility')).toBe(true);
  });

  it('resolves every reference it extracted', () => {
    const unresolvable = findings.filter((f) => f.code === 'unresolvable-ref');
    expect(unresolvable.map((f) => `${f.origin}: ${f.message}`)).toEqual([]);
  });

  it('finds the live inventory: 7 suites, the agent roster, the helper set', () => {
    const kinds = (kind: string): string[] =>
      snapshot.entities.filter((e) => e.kind === kind).map((e) => e.id);
    expect(kinds('suite').length).toBe(7);
    expect(kinds('agent').length).toBeGreaterThanOrEqual(23);
    expect(kinds('skill').length).toBeGreaterThanOrEqual(7);
    expect(kinds('helper').length).toBeGreaterThanOrEqual(17);
    expect(kinds('adr').length).toBeGreaterThanOrEqual(7);
    expect(kinds('objective').length).toBeGreaterThanOrEqual(7);
  });

  it('carries the ops work items in the new shape', () => {
    for (const id of ['ops', 'ops-1', 'ops-2', 'ops-3', 'ops-4']) {
      expect(ids.has(id)).toBe(true);
    }
    expect(edges.has('ops-3 deps ops-2')).toBe(true);
    expect(edges.has('ops-2 implements adr-0007')).toBe(true);
  });

  it('reproduces the editorial pointer ADR-0005 carries by hand', () => {
    // ADR-0005's body says "Relates `3.2` / `3.4` / `3.6` / `3.7`" and its
    // pointer says those now read 3.2 / 3.3 / 3.7 / 3.9. The date-guarded
    // crosswalk derives exactly that, so the pointer stops being load-bearing.
    for (const dst of ['plat-3.2', 'plat-3.3', 'plat-3.7', 'plat-3.9']) {
      expect(edges.has(`adr-0005 relates ${dst}`)).toBe(true);
    }
    expect(edges.has('adr-0005 relates plat-3.4')).toBe(false);
    expect(edges.has('adr-0005 relates plat-3.6')).toBe(false);
  });

  it('keeps the enclave and the seeded fixtures out of the graph', () => {
    for (const entity of snapshot.entities) {
      expect(entity.path?.startsWith('docs/superpowers/') ?? false).toBe(false);
      expect(entity.path?.startsWith('evals/fixtures/') ?? false).toBe(false);
    }
  });
});
