import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Edge, Entity } from './graph-model.js';
import {
  buildCoverage,
  COVERAGE_EXCEPTIONS_PATH,
  estimateTokens,
  findApplies,
  findGaps,
  globToRegExp,
  readCoverageExceptions,
  runApplies,
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
  writeGraph(h, { entities, edges, runs: [], docs, meta: {} });
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
      entity('ops-2', 'item', {
        title: 'Compiler core',
        status: 'active',
        path: 'docs/work/ops/2.md',
      }),
      entity('adr-0007', 'adr', { title: 'Knowledge layer' }),
      entity('ops-3', 'item', { title: 'Queries' }),
      entity('research:knowledge-layer', 'research', { title: 'Report' }),
    ],
    [
      edge('ops-2', 'implements', 'adr-0007'),
      edge('ops-2', 'grounds', 'research:knowledge-layer'),
      edge('ops-3', 'deps', 'ops-2'),
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
    const res = runQuery(h, { term: 'ops-2' });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('ops-2 (item) — Compiler core');
    expect(res.stdout).toContain('status: active · docs/work/ops/2.md');
    expect(res.stdout).toContain('implements → adr-0007 — Knowledge layer');
    expect(res.stdout).toContain('ops-3 deps →');
  });

  it('returns machine output under --json', () => {
    const parsed = JSON.parse(
      runQuery(h, { term: 'ops-2', json: true }).stdout,
    );
    expect(parsed.entity.id).toBe('ops-2');
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
    const res = runQuery(h, { term: 'ops-2', budget: 30 });
    expect(estimateTokens(res.stdout)).toBeLessThanOrEqual(35);
    expect(res.stdout).toContain('omitted for budget');
    const parsed = JSON.parse(
      runQuery(h, { term: 'ops-2', budget: 30, json: true }).stdout,
    );
    expect(parsed.omitted).toBeGreaterThan(0);
  });

  it('leaves output whole when the budget is ample', () => {
    const res = runQuery(h, { term: 'ops-2', budget: 10_000 });
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
        '- `skill:sk-regen-plan` - interactive; no headless lane',
        'not an entry',
      ].join('\n'),
    );
    const map = readCoverageExceptions(repo);
    expect(map.get('agent:sk-fixer')).toBe('mechanical, covered elsewhere');
    expect(map.get('skill:sk-regen-plan')).toBe(
      'interactive; no headless lane',
    );
    expect(map.size).toBe(2);
  });

  it('treats an absent ledger as no stated reasons', () => {
    expect(readCoverageExceptions(repo).size).toBe(0);
  });
});

describe('findGaps', () => {
  it('types each gap and gives it a why line', () => {
    const h = seed(
      [
        entity('ns-alone', 'objective'),
        entity('ns-reached', 'objective'),
        entity('ops', 'epic'),
        entity('adr-0003', 'adr'),
        entity('adr-0004', 'adr'),
        entity('plat-0.4', 'item'),
        entity('agent:sk-measured', 'agent'),
        entity('agent:sk-unmeasured', 'agent'),
        entity('suite:s', 'suite'),
        entity('case:s/c', 'case'),
      ],
      [
        edge('ops', 'advances', 'ns-reached'),
        edge('adr-0004', 'supersedes', 'adr-0003'),
        edge('plat-0.4', 'implements', 'adr-0003'),
        edge('case:s/c', 'measures', 'agent:sk-measured'),
      ],
    );
    const gaps = findGaps(h, '/nonexistent');
    const byType = (t: string): string[] =>
      gaps.filter((g) => g.type === t).map((g) => g.id);

    expect(byType('objective-unadvanced')).toEqual(['ns-alone']);
    expect(byType('cites-superseded')).toEqual(['plat-0.4']);
    expect(byType('subject-unmeasured')).toEqual(['agent:sk-unmeasured']);
    expect(gaps.every((g) => g.why.length > 20)).toBe(true);
  });

  it('flags an open backlog applies-to that matches no file', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-gap-'));
    fs.mkdirSync(path.join(repo, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'agents', 'sk-fixer.md'), 'x');

    const h = seed(
      [
        entity('backlog:live', 'backlog', { status: 'open' }),
        entity('backlog:stale', 'backlog', { status: 'open' }),
        entity('backlog:done', 'backlog', { status: 'resolved' }),
      ],
      [
        edge('backlog:live', 'applies-to', 'glob:agents/sk-fixer.md'),
        edge('backlog:stale', 'applies-to', 'glob:agents/sk-retired.md'),
        edge('backlog:done', 'applies-to', 'glob:agents/sk-gone.md'),
      ],
    );
    const dangling = findGaps(h, repo).filter(
      (g) => g.type === 'dangling-applies-to',
    );
    expect(dangling.map((g) => g.id)).toEqual(['backlog:stale']);
    fs.rmSync(repo, { recursive: true, force: true });
  });
});

describe('globToRegExp', () => {
  it('keeps * inside a segment and lets ** cross directories', () => {
    expect(globToRegExp('agents/*.md').test('agents/sk-fixer.md')).toBe(true);
    expect(globToRegExp('agents/*.md').test('agents/sub/sk-fixer.md')).toBe(
      false,
    );
    expect(globToRegExp('skills/**/SKILL.md').test('skills/a/SKILL.md')).toBe(
      true,
    );
    expect(globToRegExp('bin/cli.ts').test('bin/cli.ts')).toBe(true);
    expect(globToRegExp('bin/cli.ts').test('bin/other.ts')).toBe(false);
  });
});

describe('findApplies', () => {
  let repo: string;
  let h: GraphDb;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-app-'));
    h = seed(
      [
        entity('backlog:fixer-scope-widening', 'backlog', {
          status: 'open',
          title: 'fix scope gate',
        }),
        entity('backlog:closed-note', 'backlog', { status: 'resolved' }),
        entity('agent:sk-fixer', 'agent', { path: 'agents/sk-fixer.md' }),
      ],
      [
        edge(
          'backlog:fixer-scope-widening',
          'applies-to',
          'glob:agents/sk-fixer.md',
        ),
        edge('backlog:closed-note', 'applies-to', 'glob:agents/sk-fixer.md'),
      ],
    );
  });
  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
    h.close();
  });

  it('matches an exact path', () => {
    expect(findApplies(h, ['agents/sk-fixer.md']).map((x) => x.id)).toEqual([
      'backlog:fixer-scope-widening',
    ]);
  });

  it('matches a bare name the way an operator types it', () => {
    expect(findApplies(h, ['fixer']).map((x) => x.id)).toEqual([
      'backlog:fixer-scope-widening',
    ]);
  });

  it('excludes resolved items — the pool is the open set', () => {
    const hits = findApplies(h, ['agents/sk-fixer.md']);
    expect(hits.some((x) => x.id === 'backlog:closed-note')).toBe(false);
  });

  it('returns nothing for an unrelated argument, and says so', () => {
    expect(findApplies(h, ['docs/README.md'])).toEqual([]);
    const res = runApplies(h, ['docs/README.md'], false);
    expect(res.stdout).toContain('no open backlog item applies');
    expect(res.exitCode).toBe(0);
  });

  it('requires an argument', () => {
    expect(runApplies(h, [], false).exitCode).toBe(1);
  });
});
