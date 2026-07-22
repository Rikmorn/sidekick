import { describe, expect, it } from 'bun:test';
import { type Crosswalk, emptyCrosswalk } from './graph-model.js';
import {
  parseBacklogFile,
  parseNorthStar,
  parseResearchReport,
  parseWorkFile,
} from './graph-parse-work.js';

const cw = (): Crosswalk => {
  const c = emptyCrosswalk();
  c.known.add('3.3');
  return c;
};

const key = (e: { src: string; rel: string; dst: string }): string =>
  `${e.src} ${e.rel} ${e.dst}`;

describe('parseWorkFile', () => {
  const OPS_3 = [
    '---',
    'id: ops-3',
    'epic: ops',
    'kind: item',
    'status: open',
    'deps: [ops-2]',
    'implements: [adr-0007]',
    '---',
    '',
    '# ops-3 — Queries, graph-diff, lint',
    '',
    'Body prose.',
  ].join('\n');

  it('emits the item entity from frontmatter and the H1 title', () => {
    const r = parseWorkFile(OPS_3, 'docs/work/ops/3-queries.md', cw());
    expect(r.entities).toEqual([
      {
        id: 'ops-3',
        kind: 'item',
        title: 'Queries, graph-diff, lint',
        status: 'open',
        path: 'docs/work/ops/3-queries.md',
        data: { epic: 'ops' },
      },
    ]);
  });

  it('turns frontmatter relation fields into edges', () => {
    const r = parseWorkFile(OPS_3, 'docs/work/ops/3-queries.md', cw());
    expect(r.edges.map(key).sort()).toEqual([
      'ops-3 deps ops-2',
      'ops-3 implements adr-0007',
    ]);
    expect(r.findings).toEqual([]);
  });

  it('normalizes a slash-namespaced research target', () => {
    const text = [
      '---',
      'id: ops',
      'kind: epic',
      'status: open',
      'grounds: [research/knowledge-layer]',
      'advances: [ns-project-visibility, ns-adaptive-harness]',
      '---',
      '',
      '# ops — the knowledge layer',
    ].join('\n');
    const r = parseWorkFile(text, 'docs/work/ops/epic.md', cw());
    expect(r.edges.map(key).sort()).toEqual([
      'ops advances ns-adaptive-harness',
      'ops advances ns-project-visibility',
      'ops grounds research:knowledge-layer',
    ]);
    expect(r.entities[0].kind).toBe('epic');
  });

  it('reads typed wiki-links from the body with accurate line numbers', () => {
    const text = [
      '---',
      'id: ops-9',
      'kind: item',
      'status: open',
      '---',
      '',
      '# ops-9 — Something',
      '',
      '- supersedes [[ops-1]]',
      '- applies-to [[agents/sk-fixer.md]]',
    ].join('\n');
    const r = parseWorkFile(text, 'docs/work/ops/9.md', cw());
    expect(r.edges.map(key).sort()).toEqual([
      'ops-9 applies-to glob:agents/sk-fixer.md',
      'ops-9 supersedes ops-1',
    ]);
    expect(r.edges.find((e) => e.rel === 'supersedes')?.origin).toBe(
      'docs/work/ops/9.md:9',
    );
  });

  it('reports a relation outside the closed vocabulary', () => {
    const text = [
      '---',
      'id: ops-9',
      'kind: item',
      'status: open',
      'consumes: [adr-0006]',
      '---',
      '',
      '# ops-9 — Something',
      '',
      '- blocks [[ops-1]]',
    ].join('\n');
    const r = parseWorkFile(text, 'docs/work/ops/9.md', cw());
    expect(r.edges).toEqual([]);
    expect(r.findings.map((f) => f.code)).toEqual([
      'unknown-relation',
      'unknown-relation',
    ]);
    expect(r.findings[0].message).toContain('consumes');
    expect(r.findings[1].message).toContain('blocks');
  });

  it('reports a work file with no frontmatter instead of guessing an ID', () => {
    const r = parseWorkFile('# Just prose', 'docs/work/ops/x.md', cw());
    expect(r.entities).toEqual([]);
    expect(r.findings[0].code).toBe('missing-frontmatter');
  });

  it('reports a missing status but still emits the entity', () => {
    const text = ['---', 'id: ops-9', 'kind: item', '---', '', '# ops-9'].join(
      '\n',
    );
    const r = parseWorkFile(text, 'docs/work/ops/9.md', cw());
    expect(r.entities.length).toBe(1);
    expect(r.entities[0].status).toBeNull();
    expect(r.findings[0].code).toBe('missing-frontmatter');
  });
});

describe('parseNorthStar', () => {
  const NS = [
    '---',
    'kind: north-star',
    '---',
    '',
    '# North star',
    '',
    '## ns-oversight-harness — External oversight',
    '',
    '**Sources:** `docs/research/README.md` §"North star"; `docs/EPIC.md` opening.',
    '',
    '### ns-independent-verification — Gates that are sealed',
    '',
    '**Sources:** `docs/research/ACTION-PLAN.md` §Tier 1b.',
    '',
    '## ns-project-visibility — State is retrievable',
    '',
    '**Sources:** `docs/research/missing.md` §nowhere.',
  ].join('\n');

  const exists = (p: string): boolean => p !== 'docs/research/missing.md';

  it('emits an objective entity per ns- heading', () => {
    const r = parseNorthStar(NS, 'docs/NORTH-STAR.md', exists);
    const objectives = r.entities.filter((e) => e.kind === 'objective');
    expect(objectives.map((e) => e.id)).toEqual([
      'ns-oversight-harness',
      'ns-independent-verification',
      'ns-project-visibility',
    ]);
    expect(objectives[0].title).toBe('External oversight');
  });

  it('makes heading nesting the objective tree', () => {
    const r = parseNorthStar(NS, 'docs/NORTH-STAR.md', exists);
    expect(r.edges.filter((e) => e.rel === 'advances').map(key)).toEqual([
      'ns-independent-verification advances ns-oversight-harness',
    ]);
  });

  it('grounds each objective in the documents it cites', () => {
    const r = parseNorthStar(NS, 'docs/NORTH-STAR.md', exists);
    expect(r.edges.filter((e) => e.rel === 'grounds').map(key)).toEqual([
      'ns-oversight-harness grounds doc:docs/research/README.md',
      'ns-oversight-harness grounds doc:docs/EPIC.md',
      'ns-independent-verification grounds doc:docs/research/ACTION-PLAN.md',
    ]);
  });

  it('reports a citation that names a file the repo does not have', () => {
    const r = parseNorthStar(NS, 'docs/NORTH-STAR.md', exists);
    expect(r.findings.map((f) => f.code)).toEqual(['unresolvable-ref']);
    expect(r.findings[0].message).toContain('missing.md');
  });
});

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

describe('parseBacklogFile', () => {
  it('reads an open item from its authored status line', () => {
    const text = [
      '# `--fix` scope gate is finding-file-only',
      '',
      '**Status:** Open (deliberate 3.2 narrowing, 2026-07-03).',
    ].join('\n');
    const r = parseBacklogFile(
      text,
      'docs/backlog/fixer-scope-widening.md',
      'fixer-scope-widening',
      cw(),
    );
    expect(r.entities[0].id).toBe('backlog:fixer-scope-widening');
    expect(r.entities[0].status).toBe('open');
  });

  it('reads a resolved item, tick or not', () => {
    const resolved = parseBacklogFile(
      '# Gate defaults\n\n**Status:** ✅ Resolved 2026-07-03 — implemented.',
      'docs/backlog/gate-command-defaults.md',
      'gate-command-defaults',
      cw(),
    );
    expect(resolved.entities[0].status).toBe('resolved');

    const decided = parseBacklogFile(
      '# Scoping\n\n**Status:** DECIDED (2026-06-10) — superseded by ADR-0002.',
      'docs/backlog/platform-primitives-scoping.md',
      'platform-primitives-scoping',
      cw(),
    );
    expect(decided.entities[0].status).toBe('resolved');
  });

  it('treats parked and backlogged notes as still open', () => {
    for (const word of ['Parked 2026-06-07.', 'Backlogged 2026-06-16.']) {
      const r = parseBacklogFile(
        `# Note\n\n**Status:** ${word}`,
        'docs/backlog/n.md',
        'n',
        cw(),
      );
      expect(r.entities[0].status).toBe('open');
    }
  });

  it('reads applies-to frontmatter when an item declares it', () => {
    const text = [
      '---',
      'applies-to: [agents/sk-fixer.md, skills/sk-review/SKILL.md]',
      '---',
      '',
      '# Fixer scope',
      '',
      '**Status:** Open.',
    ].join('\n');
    const r = parseBacklogFile(text, 'docs/backlog/f.md', 'f', cw());
    expect(r.edges.map(key).sort()).toEqual([
      'backlog:f applies-to glob:agents/sk-fixer.md',
      'backlog:f applies-to glob:skills/sk-review/SKILL.md',
    ]);
  });
});
