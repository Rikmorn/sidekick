import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { collectGraph, runGraphBuildCli } from './graph-build.js';
import { allEdges, allEntities, getMeta, openGraphDb } from './graph-store.js';

/** A temp repo with just enough shape to exercise the routing. */
function mkRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-graph-'));
  execSync('git init -q -b master', { cwd: dir });
  execSync('git config user.email test@test.example', { cwd: dir });
  execSync('git config user.name Test', { cwd: dir });
  return dir;
}

function write(repo: string, rel: string, content: string): void {
  const full = path.join(repo, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

const EPIC = [
  '# EPIC',
  '',
  '### Phase 3 — Foundations',
  '',
  '| ID | Was | Item | Sources | Deps |',
  '|---|---|---|---|---|',
  '| **3.3** ✅ | E13 | **Eval keystone** — the harness. | ADR-0006 | 3.2 |',
  '| **3.2** ✅ | E7 | **Scope gate** — independent verification. | ADR-0005 | — |',
  '',
  '## Crosswalk — legacy `E#`',
  '',
  '| E# | New | E# | New |',
  '|---|---|---|---|',
  '| E7 | 3.2 | E13 | 3.3 |',
].join('\n');

function seedRepo(repo: string): void {
  write(repo, 'docs/EPIC.md', EPIC);
  write(
    repo,
    'docs/adr/0006-eval-harness.md',
    [
      '# ADR-0006 — Eval harness',
      '',
      '**Status:** Accepted (2026-07-07). Implements the eval keystone EPIC `3.3`.',
    ].join('\n'),
  );
  write(
    repo,
    'docs/work/ops/epic.md',
    [
      '---',
      'id: ops',
      'kind: epic',
      'status: open',
      'advances: [ns-project-visibility]',
      'grounds: [research/knowledge-layer]',
      '---',
      '',
      '# ops — the knowledge layer',
    ].join('\n'),
  );
  write(
    repo,
    'docs/work/ops/2-compiler.md',
    [
      '---',
      'id: ops-2',
      'epic: ops',
      'kind: item',
      'status: active',
      'deps: []',
      '---',
      '',
      '# ops-2 — Compiler core',
    ].join('\n'),
  );
  write(
    repo,
    'docs/NORTH-STAR.md',
    [
      '# North star',
      '',
      '## ns-project-visibility — State is retrievable',
      '',
      '**Sources:** `docs/EPIC.md` §Phase 3.',
    ].join('\n'),
  );
  write(
    repo,
    'docs/research/knowledge-layer/REPORT.md',
    '# Knowledge layer — report',
  );
  write(
    repo,
    'docs/backlog/fixer-scope-widening.md',
    '# Fixer scope\n\n**Status:** Open (2026-07-03).',
  );
  write(
    repo,
    'evals/cases/coherence-agent/rfc-clean/case.json',
    JSON.stringify({
      subject: { kind: 'agent', name: 'sk-coherence-checker' },
      expect: 'pass on a coherent RFC',
    }),
  );
  write(
    repo,
    'evals/results/r1/records.jsonl',
    JSON.stringify({
      run_id: 'r1',
      case_id: 'rfc-clean',
      suite: 'coherence-agent',
      subject: { kind: 'agent', name: 'sk-coherence-checker' },
      status: 'ok',
      assertions: [{ outcome: 'pass' }],
    }),
  );
  write(
    repo,
    '.sidekick/calibrations/sk-coherence-checker.json',
    JSON.stringify({ verifier: 'sk-coherence-checker' }),
  );
  write(
    repo,
    'agents/sk-coherence-checker.md',
    '---\nname: sk-coherence-checker\ndescription: Checks coherence.\n---\n',
  );
  write(repo, 'skills/sk-design/SKILL.md', '---\ndescription: Design.\n---\n');
  write(repo, 'bin/helpers/scope-check.ts', '/**\n * Scope gate.\n */\n');
}

describe('collectGraph', () => {
  let repo: string;
  beforeEach(() => {
    repo = mkRepo();
    seedRepo(repo);
  });
  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  const key = (e: { src: string; rel: string; dst: string }): string =>
    `${e.src} ${e.rel} ${e.dst}`;

  it('routes every source kind to its parser', () => {
    const { snapshot } = collectGraph(repo);
    const ids = new Set(snapshot.entities.map((e) => e.id));
    for (const id of [
      'plat-3.3',
      'adr-0006',
      'ops',
      'ops-2',
      'ns-project-visibility',
      'research:knowledge-layer',
      'backlog:fixer-scope-widening',
      'suite:coherence-agent',
      'case:coherence-agent/rfc-clean',
      'cert:sk-coherence-checker',
      'agent:sk-coherence-checker',
      'skill:sk-design',
      'helper:scope-check',
    ]) {
      expect(ids.has(id)).toBe(true);
    }
    expect(snapshot.runs.length).toBe(1);
  });

  it('links across sources that never mention each other directly', () => {
    const { snapshot } = collectGraph(repo);
    const edges = snapshot.edges.map(key);
    expect(edges).toContain('plat-3.3 implements adr-0006');
    expect(edges).toContain(
      'suite:coherence-agent measures agent:sk-coherence-checker',
    );
    expect(edges).toContain('ops advances ns-project-visibility');
    expect(edges).toContain('ops grounds research:knowledge-layer');
    expect(edges).toContain(
      'cert:sk-coherence-checker assesses agent:sk-coherence-checker',
    );
  });

  it('reports an edge whose destination no source declares', () => {
    write(
      repo,
      'docs/work/ops/3-queries.md',
      [
        '---',
        'id: ops-3',
        'kind: item',
        'status: open',
        'deps: [ops-99]',
        '---',
        '',
        '# ops-3 — Queries',
      ].join('\n'),
    );
    const { findings } = collectGraph(repo);
    const dangling = findings.find(
      (f) => f.code === 'unresolvable-ref' && f.message.includes('ops-99'),
    );
    expect(dangling).toBeDefined();
  });

  it('downgrades a dangling runset measures edge to advisory historical-ref', () => {
    write(
      repo,
      'evals/results/old-run/records.jsonl',
      `${JSON.stringify({
        run_id: 'old-run',
        case_id: 'c1',
        suite: 's1',
        subject: { kind: 'agent', name: 'sk-departed' },
        status: 'ok',
        started_at: '2026-01-01T00:00:00.000Z',
      })}\n`,
    );
    const { findings } = collectGraph(repo);
    expect(
      findings.find(
        (f) => f.code === 'historical-ref' && f.message.includes('sk-departed'),
      ),
    ).toBeDefined();
    expect(
      findings.find(
        (f) =>
          f.code === 'unresolvable-ref' && f.message.includes('sk-departed'),
      ),
    ).toBeUndefined();
  });

  it('never reads the declared foreign enclave or seeded fixtures', () => {
    write(
      repo,
      'docs/superpowers/plans/secret.md',
      '---\nid: enclave-1\nkind: item\nstatus: open\n---\n\n# Enclave',
    );
    write(repo, 'evals/fixtures/coherence/x/RFC.md', '# Fake RFC');
    const { snapshot } = collectGraph(repo);
    const paths = snapshot.entities.map((e) => e.path ?? '');
    expect(paths.some((p) => p.startsWith('docs/superpowers/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('evals/fixtures/'))).toBe(false);
    expect(snapshot.entities.some((e) => e.id === 'enclave-1')).toBe(false);
  });

  it('is deterministic — two collections of one tree agree exactly', () => {
    const a = collectGraph(repo).snapshot;
    const b = collectGraph(repo).snapshot;
    expect(JSON.stringify(b.entities)).toBe(JSON.stringify(a.entities));
    expect(JSON.stringify(b.edges)).toBe(JSON.stringify(a.edges));
  });

  it('stamps the commit it was built from', () => {
    execSync('git add -A && git commit -q -m seed', { cwd: repo });
    const head = execSync('git rev-parse HEAD', { cwd: repo })
      .toString()
      .trim();
    expect(collectGraph(repo).snapshot.meta.built_at_commit).toBe(head);
  });
});

describe('runGraphBuildCli', () => {
  let repo: string;
  beforeEach(() => {
    repo = mkRepo();
    seedRepo(repo);
  });
  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('writes the store and reports what landed', () => {
    const res = runGraphBuildCli({ repoRoot: repo });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('entities');
    expect(fs.existsSync(path.join(repo, '.kb/graph.db'))).toBe(true);

    const h = openGraphDb(path.join(repo, '.kb/graph.db'));
    expect(allEntities(h).length).toBeGreaterThan(10);
    expect(allEdges(h).length).toBeGreaterThan(4);
    expect(getMeta(h, 'built_at_commit')).not.toBeNull();
    h.close();
  });

  it('emits machine output under --json', () => {
    const res = runGraphBuildCli({ repoRoot: repo, json: true });
    const parsed = JSON.parse(res.stdout);
    expect(parsed.entities).toBeGreaterThan(10);
    expect(Array.isArray(parsed.lint)).toBe(true);
    expect(parsed.by_kind.item).toBeGreaterThan(0);
  });

  it('refuses a rebuild that would drop most of the graph', () => {
    runGraphBuildCli({ repoRoot: repo });
    fs.rmSync(path.join(repo, 'docs'), { recursive: true, force: true });
    fs.rmSync(path.join(repo, 'evals'), { recursive: true, force: true });
    fs.rmSync(path.join(repo, 'agents'), { recursive: true, force: true });

    const guarded = runGraphBuildCli({ repoRoot: repo });
    expect(guarded.exitCode).toBe(1);
    expect(JSON.parse(guarded.stdout).error).toBe('anti_shrink_guard');

    const forced = runGraphBuildCli({ repoRoot: repo, force: true });
    expect(forced.exitCode).toBe(0);
  });
});
