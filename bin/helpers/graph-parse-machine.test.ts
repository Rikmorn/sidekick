import { describe, expect, it } from 'bun:test';
import {
  parseAgentFile,
  parseCalibration,
  parseEvalCase,
  parseHelperFile,
  parseMetricsRegistrySource,
  parseRunRecords,
  parseSkillFile,
  subjectEntityId,
} from './graph-parse-machine.js';

const key = (e: { src: string; rel: string; dst: string }): string =>
  `${e.src} ${e.rel} ${e.dst}`;

describe('subjectEntityId', () => {
  it('names an agent subject directly', () => {
    expect(
      subjectEntityId({ kind: 'agent', name: 'sk-coherence-checker' }),
    ).toEqual({
      id: 'agent:sk-coherence-checker',
      kind: 'agent',
      name: 'sk-coherence-checker',
    });
  });

  it('identifies a skill subject by the slash-command it invokes', () => {
    expect(
      subjectEntityId({
        kind: 'skill',
        invocation: '/sk-design <slug seeded from rfc-cross-section>',
      }),
    ).toEqual({ id: 'skill:sk-design', kind: 'skill', name: 'sk-design' });
  });

  it('refuses to name a subject it cannot identify', () => {
    expect(
      subjectEntityId({ kind: 'skill', invocation: 'run the thing' }),
    ).toBeNull();
    expect(subjectEntityId({ kind: 'agent' })).toBeNull();
    expect(subjectEntityId(undefined)).toBeNull();
  });
});

describe('parseEvalCase', () => {
  const CASE = JSON.stringify({
    schemaVersion: 1,
    subject: { kind: 'agent', name: 'sk-coherence-checker' },
    fixture: 'evals/fixtures/coherence/rfc-clean',
    expect: 'verdict = pass on a coherent RFC',
  });

  it('emits suite and case entities plus measures edges from both', () => {
    const r = parseEvalCase(
      CASE,
      'evals/cases/coherence-agent/rfc-clean/case.json',
      'coherence-agent',
      'rfc-clean',
    );
    expect(r.entities.map((e) => e.id).sort()).toEqual([
      'case:coherence-agent/rfc-clean',
      'suite:coherence-agent',
    ]);
    expect(r.edges.map(key).sort()).toEqual([
      'case:coherence-agent/rfc-clean measures agent:sk-coherence-checker',
      'suite:coherence-agent measures agent:sk-coherence-checker',
    ]);
  });

  it('marks manual-lane cases so the coverage view can tell them apart', () => {
    const manual = JSON.stringify({
      subject: { kind: 'skill', invocation: '/sk-design <slug>' },
      manual: true,
      expect: 'RFC quorum dispatches in parallel',
    });
    const r = parseEvalCase(
      manual,
      'evals/cases/design-quorums/rfc-quorum/case.json',
      'design-quorums',
      'rfc-quorum',
    );
    expect(r.entities.find((e) => e.kind === 'case')?.status).toBe('manual');
    expect(r.edges.map((e) => e.dst)).toEqual([
      'skill:sk-design',
      'skill:sk-design',
    ]);
  });

  it('reports an unidentifiable subject rather than distorting coverage', () => {
    const r = parseEvalCase(
      JSON.stringify({ subject: { kind: 'skill', invocation: 'freeform' } }),
      'evals/cases/s/c/case.json',
      's',
      'c',
    );
    expect(r.edges).toEqual([]);
    expect(r.findings[0].code).toBe('unresolvable-ref');
  });

  it('reports malformed JSON instead of throwing', () => {
    const r = parseEvalCase('{not json', 'evals/cases/s/c/case.json', 's', 'c');
    expect(r.entities).toEqual([]);
    expect(r.findings[0].code).toBe('unresolvable-ref');
  });
});

describe('parseRunRecords', () => {
  const record = (over: Record<string, unknown> = {}): string =>
    JSON.stringify({
      run_id: '3-3-w4',
      case_id: 'decision-internal',
      suite: 'coherence-agent',
      subject: { kind: 'agent', name: 'sk-coherence-checker' },
      status: 'ok',
      model: 'claude-opus-4-8[1m]',
      cost_usd: 0.099696,
      num_turns: 2,
      started_at: '2026-07-07T07:54:51.582Z',
      duration_ms: 23533,
      assertions: [{ outcome: 'pass' }],
      ...over,
    });

  it('maps a record onto a run row', () => {
    const { runs } = parseRunRecords(record(), 'evals/results/x/records.jsonl');
    expect(runs.length).toBe(1);
    expect(runs[0]).toMatchObject({
      run_id: '3-3-w4',
      suite: 'coherence-agent',
      subject_kind: 'agent',
      subject_name: 'sk-coherence-checker',
      verdict: 'pass',
      num_turns: 2,
    });
  });

  it('derives the verdict from assertion outcomes, not the status field', () => {
    const mixed = parseRunRecords(
      record({ assertions: [{ outcome: 'pass' }, { outcome: 'fail' }] }),
      'r.jsonl',
    );
    expect(mixed.runs[0].verdict).toBe('fail');

    const errored = parseRunRecords(
      record({ status: 'error', assertions: [] }),
      'r.jsonl',
    );
    expect(errored.runs[0].verdict).toBe('error');

    const noAssertions = parseRunRecords(record({ assertions: [] }), 'r.jsonl');
    expect(noAssertions.runs[0].verdict).toBe('unknown');
  });

  it('skips and reports malformed or incomplete lines, keeping the good ones', () => {
    const jsonl = [record(), '{broken', JSON.stringify({ run_id: 'x' })].join(
      '\n',
    );
    const { runs, findings } = parseRunRecords(jsonl, 'r.jsonl');
    expect(runs.length).toBe(1);
    expect(findings.length).toBe(2);
    expect(findings[0].origin).toBe('r.jsonl:2');
  });
});

describe('parseMetricsRegistrySource', () => {
  it('a valid registry yields metric entities and no findings', () => {
    const r = parseMetricsRegistrySource(
      JSON.stringify({
        schemaVersion: 1,
        subjects: { 'agent:sk-fixer': { class: 'executor' } },
        metrics: [
          {
            name: 'adherence',
            applies_to: ['executor'],
            feeds_from: ['code'],
            computation: 'deliverable-shape-rate',
            bias: 'mechanical only',
            thresholds: { default: 0.9 },
          },
        ],
      }),
      'evals/metrics.json',
    );
    expect(r.findings).toEqual([]);
    expect(r.entities.map((e) => e.id)).toEqual(['metric:adherence']);
    expect(r.entities[0].kind).toBe('metric');
    expect(r.entities[0].data?.bias).toBe('mechanical only');
    expect(r.edges).toEqual([]);
  });

  it('an unknown subject class and a missing bias are error-tier invalid-metric findings', () => {
    const r = parseMetricsRegistrySource(
      JSON.stringify({
        schemaVersion: 1,
        subjects: { 'agent:sk-fixer': { class: 'wizard' } },
        metrics: [
          {
            name: 'adherence',
            applies_to: ['executor'],
            feeds_from: ['code'],
            computation: 'deliverable-shape-rate',
            thresholds: { default: 0.9 },
          },
        ],
      }),
      'evals/metrics.json',
    );
    expect(r.findings.length).toBe(2);
    for (const f of r.findings) {
      expect(f.code).toBe('invalid-metric');
      expect(f.origin).toBe('evals/metrics.json:1');
    }
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/bias/);
  });
});

describe('parseCalibration', () => {
  it('pins the certificate to the verifier it graduated', () => {
    const r = parseCalibration(
      JSON.stringify({
        verifier: 'sk-coherence-checker',
        created: '2026-07-07T08:28:40.351Z',
        stats: { cases: 20, fail_precision: 1 },
      }),
      '.sidekick/calibrations/sk-coherence-checker.json',
    );
    expect(r.entities[0].id).toBe('cert:sk-coherence-checker');
    expect(r.entities[0].status).toBe('graduated');
    expect(r.edges.map(key)).toEqual([
      'cert:sk-coherence-checker assesses agent:sk-coherence-checker',
    ]);
  });

  it('reports a certificate that names no verifier', () => {
    const r = parseCalibration('{}', '.sidekick/calibrations/x.json');
    expect(r.entities).toEqual([]);
    expect(r.findings[0].code).toBe('unresolvable-ref');
  });
});

describe('inventory', () => {
  it('reads an agent from its frontmatter', () => {
    const text = [
      '---',
      'name: sk-fixer',
      'description: Applies the minimal mechanical fix for a single fixable review finding. Write-capable producer.',
      'tools: Read, Edit, Write, Grep, Glob',
      '---',
      '',
      '# body',
    ].join('\n');
    const r = parseAgentFile(text, 'agents/sk-fixer.md');
    expect(r.entities[0].id).toBe('agent:sk-fixer');
    expect(r.entities[0].title).toBe(
      'Applies the minimal mechanical fix for a single fixable review finding.',
    );
    expect(r.entities[0].data).toEqual({
      tools: 'Read, Edit, Write, Grep, Glob',
    });
  });

  it('falls back to the filename when frontmatter omits the name', () => {
    const r = parseAgentFile('# no frontmatter', 'agents/sk-explorer.md');
    expect(r.entities[0].id).toBe('agent:sk-explorer');
  });

  it('reads a skill from its directory name', () => {
    const text = ['---', 'description: Runs the design dialogue.', '---'].join(
      '\n',
    );
    const r = parseSkillFile(text, 'skills/sk-design/SKILL.md');
    expect(r.entities[0].id).toBe('skill:sk-design');
    expect(r.entities[0].title).toBe('Runs the design dialogue.');
  });

  it('summarises a helper from its leading block comment', () => {
    const text = [
      '/**',
      ' * ops-2 — the store. Second sentence that should not appear.',
      ' */',
      "import * as fs from 'node:fs';",
    ].join('\n');
    const r = parseHelperFile(text, 'bin/helpers/graph-store.ts');
    expect(r.entities[0].id).toBe('helper:graph-store');
    expect(r.entities[0].title).toBe('ops-2 — the store.');
  });

  it('falls back to the stem when a helper has no block comment', () => {
    const r = parseHelperFile('export const x = 1;\n', 'bin/helpers/hooks.ts');
    expect(r.entities[0].title).toBe('hooks');
  });
});
