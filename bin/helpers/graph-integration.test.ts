import { describe, expect, it } from 'bun:test';
import { readdirSync } from 'node:fs';
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
 *
 * Every inventory expectation is derived from the tree and asserted as equality
 * (#56). A floor written as a literal pins today's tree and breaks on the next
 * retirement, at the worst possible time.
 */

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const countFiles = (dir: string, match: (name: string) => boolean): number =>
  readdirSync(path.join(REPO_ROOT, dir)).filter(match).length;

const countDirs = (dir: string): number =>
  readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true }).filter((d) =>
    d.isDirectory(),
  ).length;

describe('graph build on the live tree', () => {
  const { snapshot, findings } = collectGraph(REPO_ROOT);
  const edges = new Set(
    snapshot.edges.map((e) => `${e.src} ${e.rel} ${e.dst}`),
  );

  it('links an eval suite to the agent it measures', () => {
    expect(
      edges.has('suite:coherence-agent measures agent:sk-coherence-checker'),
    ).toBe(true);
  });

  it('resolves every reference it extracted', () => {
    const unresolvable = findings.filter((f) => f.code === 'unresolvable-ref');
    expect(unresolvable.map((f) => `${f.origin}: ${f.message}`)).toEqual([]);
  });

  it('finds the live inventory the tree declares, kind by kind', () => {
    const kinds = (kind: string): number =>
      snapshot.entities.filter((e) => e.kind === kind).length;
    expect(kinds('suite')).toBe(countDirs('evals/cases'));
    expect(kinds('agent')).toBe(countFiles('agents', (f) => f.endsWith('.md')));
    expect(kinds('skill')).toBe(countDirs('skills'));
    expect(kinds('helper')).toBe(
      countFiles(
        'bin/helpers',
        (f) =>
          f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'),
      ),
    );
    expect(kinds('adr')).toBe(
      countFiles('docs/adr', (f) => /^\d{4}-.*\.md$/.test(f)),
    );
  });

  it('keeps the enclave and the seeded fixtures out of the graph', () => {
    for (const entity of snapshot.entities) {
      expect(entity.path?.startsWith('docs/superpowers/') ?? false).toBe(false);
      expect(entity.path?.startsWith('evals/fixtures/') ?? false).toBe(false);
    }
  });

  it('models no work-tracking kinds — work state lives on GitHub (#30)', () => {
    const kinds = new Set<string>(snapshot.entities.map((e) => e.kind));
    for (const retired of ['epic', 'item', 'objective', 'backlog']) {
      expect(kinds.has(retired)).toBe(false);
    }
  });
});
