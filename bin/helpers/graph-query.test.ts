import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Edge, Entity } from './graph-model.js';
import {
  buildCoverage,
  COVERAGE_EXCEPTIONS_PATH,
  estimateTokens,
  findGaps,
  readCoverageExceptions,
  runCoverage,
  runQuery,
} from './graph-query.js';
import { type GraphDb, openGraphDb, writeGraph } from './graph-store.js';

const entity = (
  id: string,
  kind: Entity['kind'],
  over: Partial<Entity> = {},
): Entity => ({
  id,
  kind,
  title: `${id} title`,
  status: null,
  path: null,
  ...over,
});

const edge = (src: string, rel: Edge['rel'], dst: string): Edge => ({
  src,
  rel,
  dst,
  tier: 'EXTRACTED',
  origin: 'docs/x.md:1',
});

function seed(
  entities: Entity[],
  edges: Edge[],
  docs: Array<{ id: string; title: string; body: string }> = [],
): GraphDb {
  const h = openGraphDb(':memory:');
  writeGraph(h, {
    entities,
    edges,
    runs: [],
    metricValues: [],
    docs,
    meta: {},
  });
  return h;
}

describe('estimateTokens', () => {
  it('approximates four characters per token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('runQuery', () => {
  const h = seed(
    [
      entity('adr-0006', 'adr', {
        title: 'Eval harness contracts',
        status: 'Accepted',
        path: 'docs/adr/0006-eval-harness-contracts.md',
      }),
      entity('adr-0007', 'adr', { title: 'Knowledge layer' }),
      entity('adr-0008', 'adr', { title: 'Measurement program' }),
      entity('research:knowledge-layer', 'research', { title: 'Report' }),
    ],
    [
      edge('adr-0006', 'implements', 'adr-0007'),
      edge('adr-0006', 'grounds', 'research:knowledge-layer'),
      edge('adr-0008', 'relates', 'adr-0006'),
    ],
    [
      {
        id: 'adr-0007',
        title: 'Knowledge layer',
        body: 'SQLite and FTS5 glue',
      },
    ],
  );

  it('renders an entity with its typed neighbours in both directions', () => {
    const res = runQuery(h, { term: 'adr-0006' });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('adr-0006 (adr) — Eval harness contracts');
    expect(res.stdout).toContain(
      'status: Accepted · docs/adr/0006-eval-harness-contracts.md',
    );
    expect(res.stdout).toContain('implements → adr-0007 — Knowledge layer');
    expect(res.stdout).toContain('adr-0008 relates →');
  });

  it('returns machine output under --json', () => {
    const parsed = JSON.parse(
      runQuery(h, { term: 'adr-0006', json: true }).stdout,
    );
    expect(parsed.entity.id).toBe('adr-0006');
    expect(parsed.neighbours.length).toBe(3);
    expect(parsed.omitted).toBe(0);
  });

  it('falls back to FTS term search when the argument is not an ID', () => {
    const res = runQuery(h, { term: 'FTS5' });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('adr-0007');
  });

  it('reports a miss rather than an empty success', () => {
    const res = runQuery(h, { term: 'no-such-thing' });
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toContain('no entity');
  });

  it('trims to a budget and says how much it dropped', () => {
    const res = runQuery(h, { term: 'adr-0006', budget: 30 });
    expect(estimateTokens(res.stdout)).toBeLessThanOrEqual(35);
    expect(res.stdout).toContain('omitted for budget');
    const parsed = JSON.parse(
      runQuery(h, { term: 'adr-0006', budget: 30, json: true }).stdout,
    );
    expect(parsed.omitted).toBeGreaterThan(0);
  });

  it('leaves output whole when the budget is ample', () => {
    const res = runQuery(h, { term: 'adr-0006', budget: 10_000 });
    expect(res.stdout).not.toContain('omitted for budget');
  });
});

describe('coverage', () => {
  const h = seed(
    [
      entity('agent:sk-coherence-checker', 'agent'),
      entity('agent:sk-fixer', 'agent'),
      entity('skill:sk-design', 'skill'),
      entity('suite:coherence-agent', 'suite'),
      entity('suite:design-quorums', 'suite'),
      entity('case:coherence-agent/a', 'case'),
      entity('case:coherence-agent/b', 'case'),
      entity('case:design-quorums/c', 'case'),
    ],
    [
      edge('suite:coherence-agent', 'measures', 'agent:sk-coherence-checker'),
      edge('case:coherence-agent/a', 'measures', 'agent:sk-coherence-checker'),
      edge('case:coherence-agent/b', 'measures', 'agent:sk-coherence-checker'),
      edge('case:design-quorums/c', 'measures', 'skill:sk-design'),
    ],
  );

  it('counts cases per subject per suite, not suite-level edges', () => {
    const report = buildCoverage(h, new Map());
    const checker = report.measured.find(
      (r) => r.id === 'agent:sk-coherence-checker',
    );
    expect(checker?.counts).toEqual({ 'coherence-agent': 2 });
    expect(checker?.total).toBe(2);
    expect(report.suites).toEqual(['coherence-agent', 'design-quorums']);
  });

  it('names the complement — the subjects nothing measures', () => {
    const report = buildCoverage(h, new Map());
    expect(report.unmeasured.map((u) => u.id)).toEqual(['agent:sk-fixer']);
    expect(report.unmeasured[0].reason).toBeNull();
  });

  it('attaches an authored reason when the ledger states one', () => {
    const report = buildCoverage(
      h,
      new Map([['agent:sk-fixer', 'mechanical; covered by the scope gate']]),
    );
    expect(report.unmeasured[0].reason).toBe(
      'mechanical; covered by the scope gate',
    );
  });

  it('says where to state a reason when none is given', () => {
    const res = runCoverage(h, '/nonexistent-repo', false);
    expect(res.stdout).toContain('no stated reason');
    expect(res.stdout).toContain(COVERAGE_EXCEPTIONS_PATH);
  });
});

describe('readCoverageExceptions', () => {
  let repo: string;
  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-cov-'));
  });
  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('reads subject/reason pairs, tolerating backticks and dash styles', () => {
    fs.mkdirSync(path.join(repo, 'evals'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, COVERAGE_EXCEPTIONS_PATH),
      [
        '# ledger',
        '',
        '- agent:sk-fixer — mechanical, covered elsewhere',
        '- `skill:sk-demo-interactive` - interactive; no headless lane',
        'not an entry',
      ].join('\n'),
    );
    const map = readCoverageExceptions(repo);
    expect(map.get('agent:sk-fixer')).toBe('mechanical, covered elsewhere');
    expect(map.get('skill:sk-demo-interactive')).toBe(
      'interactive; no headless lane',
    );
    expect(map.size).toBe(2);
  });

  it('treats an absent ledger as no stated reasons', () => {
    expect(readCoverageExceptions(repo).size).toBe(0);
  });
});

describe('per-metric coverage + metric gaps (bench-2)', () => {
  const mv = (
    run_id: string,
    subject: string,
    metric: string,
    value: number | null,
    started_at: string,
  ) => ({
    run_id,
    subject,
    metric,
    computation: value === null ? null : 'label-match-rate',
    value,
    n: value === null ? 0 : 10,
    threshold: 0.8,
    meets: value === null ? null : value >= 0.8 ? 1 : 0,
    reason: value === null ? 'nothing feeds this metric' : null,
    started_at,
  });

  const seedWithMetrics = () => {
    const h = openGraphDb(':memory:');
    writeGraph(h, {
      entities: [entity('agent:v', 'agent'), entity('suite:s', 'suite')],
      edges: [
        {
          src: 'case:s/c1',
          rel: 'measures',
          dst: 'agent:v',
          tier: 'EXTRACTED',
          origin: 'x:1',
        },
      ],
      runs: [],
      metricValues: [
        mv('w1', 'agent:v', 'quality', 0.7, '2026-08-01T00:00:00Z'),
        mv('w2', 'agent:v', 'quality', 0.9, '2026-08-02T00:00:00Z'),
        mv('w1', 'agent:v', 'grounding', null, '2026-08-01T00:00:00Z'),
        mv('w2', 'agent:v', 'grounding', null, '2026-08-02T00:00:00Z'),
      ],
      docs: [],
      meta: {},
    });
    return h;
  };

  it('coverage per_metric reports the latest run set per subject x metric', () => {
    const h = seedWithMetrics();
    const report = buildCoverage(h, new Map());
    const cells = report.per_metric['agent:v'];
    const quality = cells.find((c) => c.metric === 'quality');
    expect(quality?.run_id).toBe('w2');
    expect(quality?.value).toBe(0.9);
    expect(quality?.meets_threshold).toBe(true);
    const grounding = cells.find((c) => c.metric === 'grounding');
    expect(grounding?.value).toBe(null);
    expect(grounding?.reason).toBe('nothing feeds this metric');
    h.close();
  });

  it('gaps distinguishes a never-computed metric from unmeasured-entirely', () => {
    const h = seedWithMetrics();
    const gaps = findGaps(h);
    const metricGaps = gaps.filter((g) => g.type === 'metric-unmeasured');
    expect(metricGaps.length).toBe(1);
    expect(metricGaps[0].id).toBe('agent:v');
    expect(metricGaps[0].why).toContain('grounding');
    expect(
      gaps.some((g) => g.type === 'subject-unmeasured' && g.id === 'agent:v'),
    ).toBe(false);
    h.close();
  });
});

describe('findGaps', () => {
  it('types each gap and gives it a why line', () => {
    const h = seed(
      [
        entity('adr-0003', 'adr'),
        entity('adr-0004', 'adr'),
        entity('adr-0005', 'adr'),
        entity('agent:sk-measured', 'agent'),
        entity('agent:sk-unmeasured', 'agent'),
        entity('suite:s', 'suite'),
        entity('case:s/c', 'case'),
      ],
      [
        edge('adr-0004', 'supersedes', 'adr-0003'),
        edge('adr-0005', 'implements', 'adr-0003'),
        edge('case:s/c', 'measures', 'agent:sk-measured'),
      ],
    );
    const gaps = findGaps(h);
    const byType = (t: string): string[] =>
      gaps.filter((g) => g.type === t).map((g) => g.id);

    expect(byType('cites-superseded')).toEqual(['adr-0005']);
    expect(byType('subject-unmeasured')).toEqual(['agent:sk-unmeasured']);
    expect(gaps.every((g) => g.why.length > 20)).toBe(true);
  });
});
