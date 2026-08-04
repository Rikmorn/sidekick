import { describe, expect, it } from 'bun:test';
import type { Edge, Entity } from './graph-model.js';
import {
  allEdges,
  allEntities,
  allRuns,
  countEntities,
  edgesFor,
  entitiesOfKind,
  type GraphSnapshot,
  getEntity,
  getMeta,
  openGraphDb,
  SCHEMA_VERSION,
  searchDocs,
  writeGraph,
} from './graph-store.js';

const entity = (
  id: string,
  kind: Entity['kind'],
  extra: Partial<Entity> = {},
): Entity => ({
  id,
  kind,
  title: `${id} title`,
  status: null,
  path: null,
  ...extra,
});

const edge = (src: string, rel: Edge['rel'], dst: string): Edge => ({
  src,
  rel,
  dst,
  tier: 'EXTRACTED',
  origin: 'docs/x.md:1',
});

const snapshot = (over: Partial<GraphSnapshot> = {}): GraphSnapshot => ({
  entities: [],
  edges: [],
  runs: [],
  metricValues: [],
  docs: [],
  meta: {},
  ...over,
});

describe('graph store', () => {
  it('applies the schema and stamps schema_version on write', () => {
    const h = openGraphDb(':memory:');
    writeGraph(h, snapshot({ meta: { built_at_commit: 'abc123' } }));
    expect(getMeta(h, 'schema_version')).toBe(String(SCHEMA_VERSION));
    expect(getMeta(h, 'built_at_commit')).toBe('abc123');
    h.close();
  });

  it('round-trips entities including JSON data', () => {
    const h = openGraphDb(':memory:');
    writeGraph(
      h,
      snapshot({
        entities: [
          entity('ops-2', 'item', {
            status: 'open',
            path: 'docs/work/ops/2-compiler-core.md',
            data: { epic: 'ops' },
          }),
          entity('adr-0007', 'adr', { status: 'Accepted' }),
        ],
      }),
    );
    const found = getEntity(h, 'ops-2');
    expect(found?.kind).toBe('item');
    expect(found?.status).toBe('open');
    expect(found?.data).toEqual({ epic: 'ops' });
    expect(getEntity(h, 'nope')).toBeNull();
    expect(entitiesOfKind(h, 'adr').map((e) => e.id)).toEqual(['adr-0007']);
    expect(countEntities(h)).toBe(2);
    h.close();
  });

  it('is a full rebuild — a second write replaces, never accumulates', () => {
    const h = openGraphDb(':memory:');
    writeGraph(
      h,
      snapshot({ entities: [entity('a', 'item'), entity('b', 'item')] }),
    );
    writeGraph(h, snapshot({ entities: [entity('a', 'item')] }));
    expect(allEntities(h).map((e) => e.id)).toEqual(['a']);
    h.close();
  });

  it('stores edges deterministically and dedupes the primary key', () => {
    const h = openGraphDb(':memory:');
    writeGraph(
      h,
      snapshot({
        edges: [
          edge('ops-2', 'implements', 'adr-0007'),
          edge('ops', 'advances', 'ns-project-visibility'),
          edge('ops-2', 'implements', 'adr-0007'),
        ],
      }),
    );
    const stored = allEdges(h);
    expect(stored.length).toBe(2);
    expect(stored.map((e) => `${e.src} ${e.rel} ${e.dst}`)).toEqual([
      'ops advances ns-project-visibility',
      'ops-2 implements adr-0007',
    ]);
    expect(stored[0].tier).toBe('EXTRACTED');
    h.close();
  });

  it('returns typed neighbours in both directions', () => {
    const h = openGraphDb(':memory:');
    writeGraph(
      h,
      snapshot({
        edges: [
          edge('ops-2', 'implements', 'adr-0007'),
          edge('ops-3', 'deps', 'ops-2'),
        ],
      }),
    );
    const n = edgesFor(h, 'ops-2');
    expect(n.out.map((e) => e.dst)).toEqual(['adr-0007']);
    expect(n.in.map((e) => e.src)).toEqual(['ops-3']);
    h.close();
  });

  it('stores run records for the bench views', () => {
    const h = openGraphDb(':memory:');
    writeGraph(
      h,
      snapshot({
        runs: [
          {
            run_id: '3-3-w4',
            case_id: 'decision-internal',
            suite: 'coherence-agent',
            subject_kind: 'agent',
            subject_name: 'sk-coherence-checker',
            model: 'claude-opus-4-8[1m]',
            cost_usd: 0.0997,
            num_turns: 2,
            verdict: 'fail',
            started_at: '2026-07-07T07:54:51.582Z',
            duration_ms: 23533,
          },
        ],
      }),
    );
    const runs = allRuns(h);
    expect(runs.length).toBe(1);
    expect(runs[0].suite).toBe('coherence-agent');
    expect(runs[0].cost_usd).toBeCloseTo(0.0997);
    h.close();
  });

  it('finds documents by FTS term', () => {
    const h = openGraphDb(':memory:');
    writeGraph(
      h,
      snapshot({
        docs: [
          {
            id: 'adr-0007',
            title: 'Knowledge layer',
            body: 'typed text and SQLite glue',
          },
          {
            id: 'adr-0006',
            title: 'Eval harness',
            body: 'calibration certificates',
          },
        ],
      }),
    );
    expect(searchDocs(h, 'calibration').map((r) => r.id)).toEqual(['adr-0006']);
    expect(searchDocs(h, 'SQLite').map((r) => r.id)).toEqual(['adr-0007']);
    expect(searchDocs(h, 'nothing-here')).toEqual([]);
    h.close();
  });

  it('treats a search term containing FTS syntax as a literal phrase', () => {
    const h = openGraphDb(':memory:');
    writeGraph(
      h,
      snapshot({
        docs: [{ id: 'a', title: 'T', body: 'the quick brown fox' }],
      }),
    );
    // Would be a MATCH syntax error if interpolated raw.
    expect(() => searchDocs(h, 'quick "OR" NEAR(')).not.toThrow();
    h.close();
  });
});
