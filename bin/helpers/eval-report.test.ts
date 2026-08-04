import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { MetricsRegistry } from './eval-metrics.js';
import {
  computeMetrics,
  computeReport,
  type MetricRecordLike,
  runEvalReportCli,
} from './eval-report.js';

type Outcome = 'pass' | 'fail' | 'error';
const rec = (
  suite: string,
  caseId: string,
  runIndex: number,
  outcomes: Outcome[],
  opts: { status?: 'ok' | 'manual'; invocationError?: string | null } = {},
) => ({
  run_id: 'r',
  case_id: caseId,
  suite,
  subject: { kind: 'agent', name: 'a' },
  status: opts.status ?? 'ok',
  run_index: runIndex,
  started_at: 't',
  duration_ms: 1,
  model: 'm',
  cost_usd: 0.1,
  num_turns: 1,
  deliverable: {},
  assertions: outcomes.map((o, i) => ({
    index: i,
    type: 'structured',
    target: 'artifact',
    outcome: o,
    detail: '',
  })),
  invocation_error: opts.invocationError ?? null,
});

describe('computeReport', () => {
  it('pass@k true, pass^k false when some runs pass and some fail', () => {
    const report = computeReport([
      rec('s1', 'c1', 0, ['pass']),
      rec('s1', 'c1', 1, ['fail']),
    ]);
    const c1 = report.suites.s1.case_results.find((c) => c.case_id === 'c1');
    expect(c1?.executed_runs).toBe(2);
    expect(c1?.passed_runs).toBe(1);
    expect(c1?.pass_at_k).toBe(true);
    expect(c1?.pass_hat_k).toBe(false);
    expect(c1?.finding).toBe(false);
  });

  it('pass^k true when every run fully passes', () => {
    const report = computeReport([
      rec('s1', 'c1', 0, ['pass', 'pass']),
      rec('s1', 'c1', 1, ['pass', 'pass']),
    ]);
    const c1 = report.suites.s1.case_results[0];
    expect(c1.pass_hat_k).toBe(true);
    expect(c1.pass_at_k).toBe(true);
  });

  it('a run with an invocation error never counts as passed', () => {
    const report = computeReport([
      rec('s1', 'c1', 0, [], { invocationError: 'claude_error' }),
    ]);
    const c1 = report.suites.s1.case_results[0];
    expect(c1.passed_runs).toBe(0);
    expect(c1.pass_at_k).toBe(false);
    expect(c1.finding).toBe(true); // executed but never passed → finding
  });

  it('a run with an errored assertion does not pass', () => {
    const report = computeReport([rec('s1', 'c1', 0, ['pass', 'error'])]);
    expect(report.suites.s1.case_results[0].pass_at_k).toBe(false);
  });

  it('counts manual cases separately and excludes them from pass rollups', () => {
    const report = computeReport([
      rec('s1', 'm1', 0, [], { status: 'manual' }),
      rec('s1', 'c1', 0, ['pass']),
    ]);
    expect(report.suites.s1.manual).toBe(1);
    expect(report.suites.s1.cases).toBe(2);
    expect(report.suites.s1.pass_at_k).toBe(1); // only c1
    const m1 = report.suites.s1.case_results.find((c) => c.case_id === 'm1');
    expect(m1?.manual).toBe(true);
    expect(m1?.finding).toBe(false);
  });

  it('rolls up multiple suites and totals', () => {
    const report = computeReport([
      rec('s1', 'c1', 0, ['pass']),
      rec('s2', 'c2', 0, ['fail']),
    ]);
    expect(Object.keys(report.suites).sort()).toEqual(['s1', 's2']);
    expect(report.totals.cases).toBe(2);
    expect(report.totals.pass_at_k).toBe(1);
    expect(report.totals.findings).toBe(1); // c2 ran but failed
  });
});

describe('runEvalReportCli', () => {
  let repoRoot: string;
  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-evalreport-'));
  });
  afterEach(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  const writeRecords = (runId: string, records: unknown[]) => {
    const dir = path.join(repoRoot, 'evals', 'results', runId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'records.jsonl'),
      records.map((r) => JSON.stringify(r)).join('\n'),
    );
  };

  it('reads records.jsonl and reports rollups', () => {
    writeRecords('run1', [rec('s1', 'c1', 0, ['pass'])]);
    const { stdout, exitCode } = runEvalReportCli({
      repoRoot,
      runId: 'run1',
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.suites.s1.pass_at_k).toBe(1);
  });

  it('filters to a single suite when --suite is given', () => {
    writeRecords('run2', [
      rec('s1', 'c1', 0, ['pass']),
      rec('s2', 'c2', 0, ['pass']),
    ]);
    const { stdout } = runEvalReportCli({
      repoRoot,
      runId: 'run2',
      suite: 's1',
    });
    expect(Object.keys(JSON.parse(stdout).suites)).toEqual(['s1']);
  });

  it('errors when the records file is missing', () => {
    const { exitCode, stdout } = runEvalReportCli({
      repoRoot,
      runId: 'nope',
    });
    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout).error).toMatch(/records/);
  });
});

// ---------------------------------------------------------------------------
// bench-1 metric frame
// ---------------------------------------------------------------------------

const testRegistry = (): MetricsRegistry => ({
  schemaVersion: 1,
  subjects: {
    'agent:v': { class: 'verifier' },
    'agent:p': { class: 'producer' },
    'agent:e': { class: 'executor' },
    'skill:o': { class: 'orchestrator' },
  },
  metrics: [
    {
      name: 'quality',
      applies_to: ['verifier', 'producer', 'executor', 'orchestrator'],
      feeds_from: ['code', 'structured', 'judge'],
      computation: {
        verifier: 'label-match-rate',
        producer: 'judge-pass-rate',
        executor: 'mechanical-pass-rate',
        orchestrator: 'mechanical-pass-rate',
      },
      bias: 'b-quality',
      thresholds: { default: 0.8, per_subject: { 'agent:v': 0.95 } },
    },
    {
      name: 'consistency',
      applies_to: ['verifier', 'producer', 'executor', 'orchestrator'],
      feeds_from: ['code', 'structured', 'judge'],
      computation: 'run-stability',
      bias: 'b-consistency',
      thresholds: { default: 0.9 },
    },
    {
      name: 'adherence',
      applies_to: ['verifier', 'producer', 'executor', 'orchestrator'],
      feeds_from: ['code', 'structured'],
      computation: 'deliverable-shape-rate',
      bias: 'b-adherence',
      thresholds: { default: 0.9 },
    },
    {
      name: 'grounding',
      applies_to: ['verifier', 'producer', 'executor', 'orchestrator'],
      feeds_from: ['judge'],
      computation: 'judge-pass-rate',
      bias: 'b-grounding',
      thresholds: { default: 0.8 },
    },
  ],
});

interface MRecOpts {
  status?: 'ok' | 'manual';
  invocationError?: string | null;
  deliverable?: unknown;
  assertions?: Array<{
    type: 'code' | 'structured' | 'judge';
    outcome: 'pass' | 'fail' | 'error';
    metric?: string;
  }>;
}

const mrec = (
  subject:
    | { kind: 'agent'; name: string }
    | { kind: 'skill'; invocation: string },
  suite: string,
  caseId: string,
  runIndex: number,
  opts: MRecOpts = {},
): MetricRecordLike => ({
  suite,
  case_id: caseId,
  subject,
  status: opts.status ?? 'ok',
  run_index: runIndex,
  invocation_error: opts.invocationError ?? null,
  deliverable: 'deliverable' in opts ? opts.deliverable : { verdict: 'pass' },
  assertions: (opts.assertions ?? []).map((a, i) => ({
    index: i,
    type: a.type,
    target: 'artifact',
    outcome: a.outcome,
    detail: '',
    ...(a.metric !== undefined ? { metric: a.metric } : {}),
  })),
});

const v = { kind: 'agent', name: 'v' } as const;
const p = { kind: 'agent', name: 'p' } as const;

describe('computeMetrics', () => {
  it('verifier quality is label-match-rate over labelled cases', () => {
    const labels = new Map<string, 'pass' | 'fail'>([
      ['s/c1', 'fail'],
      ['s/c2', 'pass'],
    ]);
    const section = computeMetrics(
      [
        mrec(v, 's', 'c1', 0, { deliverable: { verdict: 'fail' } }),
        mrec(v, 's', 'c1', 1, { deliverable: { verdict: 'fail' } }),
        mrec(v, 's', 'c2', 0, { deliverable: { verdict: 'fail' } }),
      ],
      testRegistry(),
      labels,
    );
    const q = section.per_subject['agent:v'].metrics.quality;
    expect(q.computation).toBe('label-match-rate');
    expect(q.value).toBeCloseTo(2 / 3);
    expect(q.n).toBe(3);
    expect(q.bias).toBe('b-quality');
  });

  it('verifier quality is null with a reason when no cases are labelled', () => {
    const section = computeMetrics(
      [mrec(v, 's', 'c1', 0)],
      testRegistry(),
      new Map(),
    );
    const q = section.per_subject['agent:v'].metrics.quality;
    expect(q.value).toBe(null);
    expect(q.meets_threshold).toBe(null);
    expect(q.reason).toMatch(/label/);
  });

  it('producer quality is judge-pass-rate; errored judge runs leave the denominator', () => {
    const section = computeMetrics(
      [
        mrec(p, 's', 'c1', 0, {
          assertions: [
            { type: 'judge', outcome: 'pass' },
            { type: 'structured', outcome: 'fail' },
          ],
        }),
        mrec(p, 's', 'c1', 1, {
          assertions: [
            { type: 'judge', outcome: 'fail' },
            { type: 'judge', outcome: 'error' },
          ],
        }),
      ],
      testRegistry(),
      new Map(),
    );
    const q = section.per_subject['agent:p'].metrics.quality;
    expect(q.computation).toBe('judge-pass-rate');
    expect(q.value).toBeCloseTo(0.5);
    expect(q.n).toBe(2);
  });

  it('executor quality is mechanical-pass-rate over code+structured assertions; judges do not feed it', () => {
    const section = computeMetrics(
      [
        mrec({ kind: 'agent', name: 'e' }, 's', 'c1', 0, {
          assertions: [
            { type: 'code', outcome: 'pass' },
            { type: 'structured', outcome: 'fail' },
            { type: 'judge', outcome: 'fail' },
          ],
        }),
      ],
      testRegistry(),
      new Map(),
    );
    const q = section.per_subject['agent:e'].metrics.quality;
    expect(q.computation).toBe('mechanical-pass-rate');
    expect(q.value).toBeCloseTo(0.5);
    expect(q.n).toBe(2);
  });

  it('grounding is fed only by grounding-tagged judge assertions', () => {
    const untaggedOnly = computeMetrics(
      [
        mrec(p, 's', 'c1', 0, {
          assertions: [{ type: 'judge', outcome: 'pass' }],
        }),
      ],
      testRegistry(),
      new Map(),
    );
    expect(untaggedOnly.per_subject['agent:p'].metrics.grounding.value).toBe(
      null,
    );

    const tagged = computeMetrics(
      [
        mrec(p, 's', 'c1', 0, {
          assertions: [
            { type: 'judge', outcome: 'pass', metric: 'grounding' },
            { type: 'judge', outcome: 'fail', metric: 'grounding' },
          ],
        }),
      ],
      testRegistry(),
      new Map(),
    );
    const g = tagged.per_subject['agent:p'].metrics.grounding;
    expect(g.value).toBeCloseTo(0.5);
    expect(g.n).toBe(2);
  });

  it('an assertion tagged with an unknown metric feeds nothing and is surfaced', () => {
    const section = computeMetrics(
      [
        mrec(p, 's', 'c1', 0, {
          assertions: [{ type: 'judge', outcome: 'pass', metric: 'vibes' }],
        }),
      ],
      testRegistry(),
      new Map(),
    );
    expect(section.per_subject['agent:p'].metrics.quality.value).toBe(null);
    expect(section.unknown_metric_tags).toEqual([
      { suite: 's', case_id: 'c1', assertion_index: 0, metric: 'vibes' },
    ]);
  });

  it('consistency is verdict unanimity when deliverables carry verdicts — consistently wrong is stable', () => {
    const stable = computeMetrics(
      [
        mrec(v, 's', 'c1', 0, { deliverable: { verdict: 'fail' } }),
        mrec(v, 's', 'c1', 1, { deliverable: { verdict: 'fail' } }),
      ],
      testRegistry(),
      new Map(),
    );
    expect(stable.per_subject['agent:v'].metrics.consistency.value).toBe(1);

    const unstable = computeMetrics(
      [
        mrec(v, 's', 'c1', 0, { deliverable: { verdict: 'fail' } }),
        mrec(v, 's', 'c1', 1, { deliverable: { verdict: 'pass' } }),
      ],
      testRegistry(),
      new Map(),
    );
    expect(unstable.per_subject['agent:v'].metrics.consistency.value).toBe(0);
  });

  it('consistency falls back to pass^k when deliverables have no verdict', () => {
    const section = computeMetrics(
      [
        mrec(p, 's', 'c1', 0, {
          deliverable: { mode: 'draft' },
          assertions: [{ type: 'structured', outcome: 'pass' }],
        }),
        mrec(p, 's', 'c1', 1, {
          deliverable: { mode: 'draft' },
          assertions: [{ type: 'structured', outcome: 'fail' }],
        }),
        mrec(p, 's', 'c2', 0, {
          deliverable: { mode: 'draft' },
          assertions: [{ type: 'structured', outcome: 'pass' }],
        }),
      ],
      testRegistry(),
      new Map(),
    );
    const c = section.per_subject['agent:p'].metrics.consistency;
    expect(c.value).toBeCloseTo(0.5);
    expect(c.n).toBe(2);
  });

  it('adherence counts clean invocations with parseable deliverables', () => {
    const section = computeMetrics(
      [
        mrec(v, 's', 'c1', 0),
        mrec(v, 's', 'c1', 1, { deliverable: null }),
        mrec(v, 's', 'c2', 0, {
          invocationError: 'claude_error',
          deliverable: null,
        }),
      ],
      testRegistry(),
      new Map(),
    );
    const a = section.per_subject['agent:v'].metrics.adherence;
    expect(a.value).toBeCloseTo(1 / 3);
    expect(a.n).toBe(3);
  });

  it('an unclassified subject gets null for per-class metrics but real values elsewhere', () => {
    const section = computeMetrics(
      [mrec({ kind: 'agent', name: 'stranger' }, 's', 'c1', 0)],
      testRegistry(),
      new Map(),
    );
    const s = section.per_subject['agent:stranger'];
    expect(s.class).toBe(null);
    expect(s.metrics.quality.value).toBe(null);
    expect(s.metrics.quality.reason).toMatch(/classified/);
    expect(s.metrics.adherence.value).toBe(1);
  });

  it('resolves per-subject threshold overrides into meets_threshold', () => {
    const labels = new Map<string, 'pass' | 'fail'>([['s/c1', 'pass']]);
    const section = computeMetrics(
      [
        mrec(v, 's', 'c1', 0, { deliverable: { verdict: 'pass' } }),
        mrec(v, 's', 'c1', 1, { deliverable: { verdict: 'fail' } }),
      ],
      testRegistry(),
      labels,
    );
    const q = section.per_subject['agent:v'].metrics.quality;
    expect(q.threshold).toBe(0.95); // per_subject override
    expect(q.value).toBeCloseTo(0.5);
    expect(q.meets_threshold).toBe(false);
  });

  it('excludes manual records entirely', () => {
    const section = computeMetrics(
      [mrec(v, 's', 'c1', 0, { status: 'manual', deliverable: null })],
      testRegistry(),
      new Map(),
    );
    expect(section.per_subject['agent:v']).toBeUndefined();
  });

  it('skips metrics whose applies_to excludes the subject class', () => {
    const registry = testRegistry();
    registry.metrics[3].applies_to = ['producer'];
    const section = computeMetrics(
      [mrec(v, 's', 'c1', 0)],
      registry,
      new Map(),
    );
    expect(section.per_subject['agent:v'].metrics.grounding).toBeUndefined();
  });
});

describe('runEvalReportCli metric frame', () => {
  let repoRoot: string;
  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-evalmetrics-'));
  });
  afterEach(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  const writeRecords = (runId: string, records: unknown[]) => {
    const dir = path.join(repoRoot, 'evals', 'results', runId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'records.jsonl'),
      records.map((r) => JSON.stringify(r)).join('\n'),
    );
  };

  const writeRegistry = (content: unknown) => {
    fs.mkdirSync(path.join(repoRoot, 'evals'), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, 'evals', 'metrics.json'),
      JSON.stringify(content),
    );
  };

  it('emits the metric frame and derives labels from the case tree', () => {
    writeRegistry({
      schemaVersion: 1,
      subjects: { 'agent:v': { class: 'verifier' } },
      metrics: testRegistry().metrics,
    });
    const caseDir = path.join(repoRoot, 'evals', 'cases', 's1', 'c1');
    fs.mkdirSync(caseDir, { recursive: true });
    fs.writeFileSync(
      path.join(caseDir, 'case.json'),
      JSON.stringify({
        schemaVersion: 1,
        subject: { kind: 'agent', name: 'v' },
        prompt: 'p',
        assertions: [
          { type: 'structured', path: 'verdict', op: 'equals', value: 'fail' },
        ],
      }),
    );
    writeRecords('run1', [
      {
        ...mrec(v, 's1', 'c1', 0, { deliverable: { verdict: 'fail' } }),
        run_id: 'run1',
      },
    ]);
    const { stdout, exitCode } = runEvalReportCli({ repoRoot, runId: 'run1' });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.metrics.registry).toBe('evals/metrics.json');
    expect(parsed.metrics.per_subject['agent:v'].metrics.quality.value).toBe(1);
  });

  it('reports metrics as null with a note when no registry exists', () => {
    writeRecords('run1', [{ ...mrec(v, 's1', 'c1', 0), run_id: 'run1' }]);
    const { stdout, exitCode } = runEvalReportCli({ repoRoot, runId: 'run1' });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.metrics).toBe(null);
    expect(parsed.metrics_note).toMatch(/registry/);
  });

  it('fails loudly when the registry is invalid', () => {
    writeRegistry({ schemaVersion: 1, subjects: {}, metrics: [] });
    writeRecords('run1', [{ ...mrec(v, 's1', 'c1', 0), run_id: 'run1' }]);
    const { stdout, exitCode } = runEvalReportCli({ repoRoot, runId: 'run1' });
    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout).error).toMatch(/registry/);
  });
});
