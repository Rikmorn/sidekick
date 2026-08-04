import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverCases } from './eval-case.js';
import {
  type Computation,
  DEFAULT_METRIC,
  expectedVerdict,
  loadMetricsRegistry,
  type MetricDef,
  type MetricsRegistry,
  type SubjectClass,
} from './eval-metrics.js';
import type { EvalRecord } from './eval-run.js';
import { subjectEntityId } from './graph-parse-machine.js';

/**
 * 3.3 (ADR-0006) eval report — derive-then-check. Reads the append-only
 * records the runner produced and derives aggregate verdicts; it never
 * re-runs anything. pass@k ("can it — ≥1 run all-assertions-pass") and pass^k
 * ("is it reliable — every run passes") per case, suite rollups, and explicit
 * manual counts. Pure over records.jsonl.
 *
 * bench-1 (ADR-0008) adds the metric frame: per-subject per-metric values
 * computed from the same records plus the `evals/metrics.json` registry.
 * pass^k folds into the frame as consistency's run-stability computation
 * rather than living beside it.
 *
 * JSON output contract (the substrate bench-2's graph parser consumes; the
 * report always emits JSON — there is no flag):
 * `{ run_id, metrics, suites, totals }` where `metrics` is
 * `{ registry, per_subject, unknown_metric_tags } | null` (null + a top-level
 * `metrics_note` when no registry exists). `per_subject` keys are graph entity
 * ids (`agent:<name>` / `skill:<name>`); each value carries `class` and one
 * `MetricValueReport` per applicable metric: `{ computation, value, n,
 * threshold, meets_threshold, bias, reason? }` — `value: null` + `reason`
 * when nothing in the records feeds the metric (a coverage gap, not a zero).
 */

type RecordLike = Pick<
  EvalRecord,
  'suite' | 'case_id' | 'status' | 'invocation_error' | 'assertions'
>;

/** A single run passes iff it dispatched cleanly AND every assertion passed. */
function runPassed(r: RecordLike): boolean {
  if (r.status !== 'ok') return false;
  if (r.invocation_error !== null) return false;
  return r.assertions.every((a) => a.outcome === 'pass');
}

export interface CaseReport {
  case_id: string;
  manual: boolean;
  executed_runs: number;
  passed_runs: number;
  pass_at_k: boolean;
  pass_hat_k: boolean;
  /** Executed but never passed → a candidate finding (D9). */
  finding: boolean;
}

export interface SuiteReport {
  cases: number;
  pass_at_k: number;
  pass_hat_k: number;
  manual: number;
  findings: number;
  case_results: CaseReport[];
}

export interface Report {
  suites: Record<string, SuiteReport>;
  totals: {
    cases: number;
    pass_at_k: number;
    pass_hat_k: number;
    manual: number;
    findings: number;
  };
}

export function computeReport(records: RecordLike[]): Report {
  // suite → case_id → records
  const bySuite = new Map<string, Map<string, RecordLike[]>>();
  for (const r of records) {
    if (!bySuite.has(r.suite)) bySuite.set(r.suite, new Map());
    const byCase = bySuite.get(r.suite);
    if (byCase === undefined) continue;
    if (!byCase.has(r.case_id)) byCase.set(r.case_id, []);
    byCase.get(r.case_id)?.push(r);
  }

  const suites: Record<string, SuiteReport> = {};
  const totals = {
    cases: 0,
    pass_at_k: 0,
    pass_hat_k: 0,
    manual: 0,
    findings: 0,
  };

  for (const suite of [...bySuite.keys()].sort()) {
    const byCase = bySuite.get(suite);
    if (byCase === undefined) continue;
    const caseResults: CaseReport[] = [];
    const rollup = {
      cases: 0,
      pass_at_k: 0,
      pass_hat_k: 0,
      manual: 0,
      findings: 0,
    };

    for (const caseId of [...byCase.keys()].sort()) {
      const recs = byCase.get(caseId) ?? [];
      const manual = recs.some((r) => r.status === 'manual');
      const ok = recs.filter((r) => r.status === 'ok');
      const executed = ok.length;
      const passed = ok.filter(runPassed).length;
      const passAtK = passed >= 1;
      const passHatK = executed > 0 && passed === executed;
      const finding = !manual && executed > 0 && !passAtK;

      caseResults.push({
        case_id: caseId,
        manual,
        executed_runs: executed,
        passed_runs: passed,
        pass_at_k: passAtK,
        pass_hat_k: passHatK,
        finding,
      });

      rollup.cases++;
      if (manual) rollup.manual++;
      if (!manual && passAtK) rollup.pass_at_k++;
      if (!manual && passHatK) rollup.pass_hat_k++;
      if (finding) rollup.findings++;
    }

    suites[suite] = { ...rollup, case_results: caseResults };
    totals.cases += rollup.cases;
    totals.pass_at_k += rollup.pass_at_k;
    totals.pass_hat_k += rollup.pass_hat_k;
    totals.manual += rollup.manual;
    totals.findings += rollup.findings;
  }

  return { suites, totals };
}

// ---------------------------------------------------------------------------
// bench-1 metric frame (ADR-0008 D2/D3)
// ---------------------------------------------------------------------------

/** The record fields the metric computations read (a superset of RecordLike). */
export interface MetricRecordLike extends RecordLike {
  subject: { kind?: string; name?: string; invocation?: string };
  run_index: number;
  deliverable: unknown;
}

export interface MetricValueReport {
  computation: Computation | null;
  value: number | null;
  n: number;
  threshold: number;
  meets_threshold: boolean | null;
  bias: string;
  reason?: string;
}

export interface SubjectMetricsReport {
  class: SubjectClass | null;
  metrics: Record<string, MetricValueReport>;
}

export interface UnknownMetricTag {
  suite: string;
  case_id: string;
  assertion_index: number;
  metric: string;
}

export interface MetricsSection {
  per_subject: Record<string, SubjectMetricsReport>;
  unknown_metric_tags: UnknownMetricTag[];
}

type RecordedAssertionLike = MetricRecordLike['assertions'][number] & {
  metric?: string;
};

/** An assertion feeds metric M when tagged M; untagged feeds the default. */
function feedsMetric(a: RecordedAssertionLike, metricName: string): boolean {
  if (a.metric !== undefined) return a.metric === metricName;
  return metricName === DEFAULT_METRIC;
}

const deliverableVerdict = (r: MetricRecordLike): string | null => {
  const v =
    r.deliverable !== null && typeof r.deliverable === 'object'
      ? (r.deliverable as Record<string, unknown>).verdict
      : undefined;
  return typeof v === 'string' ? v : null;
};

const nullValue = (
  computation: Computation | null,
  threshold: number,
  bias: string,
  reason: string,
): MetricValueReport => ({
  computation,
  value: null,
  n: 0,
  threshold,
  meets_threshold: null,
  bias,
  reason,
});

const rate = (
  computation: Computation,
  numerator: number,
  n: number,
  threshold: number,
  bias: string,
  emptyReason: string,
): MetricValueReport =>
  n === 0
    ? nullValue(computation, threshold, bias, emptyReason)
    : {
        computation,
        value: numerator / n,
        n,
        threshold,
        meets_threshold: numerator / n >= threshold,
        bias,
      };

function assertionPassRate(
  records: MetricRecordLike[],
  metricName: string,
  types: Array<RecordedAssertionLike['type']>,
  computation: Computation,
  threshold: number,
  bias: string,
): MetricValueReport {
  let pass = 0;
  let counted = 0;
  for (const r of records) {
    for (const a of r.assertions as RecordedAssertionLike[]) {
      if (!types.includes(a.type)) continue;
      if (!feedsMetric(a, metricName)) continue;
      if (a.outcome === 'error') continue;
      counted++;
      if (a.outcome === 'pass') pass++;
    }
  }
  return rate(
    computation,
    pass,
    counted,
    threshold,
    bias,
    `no ${types.join('/')} assertions feed this metric in these records`,
  );
}

function computeSubjectMetric(
  metric: MetricDef,
  computation: Computation,
  records: MetricRecordLike[],
  labels: Map<string, 'pass' | 'fail'>,
  threshold: number,
): MetricValueReport {
  if (computation === 'label-match-rate') {
    let match = 0;
    let counted = 0;
    for (const r of records) {
      const expected = labels.get(`${r.suite}/${r.case_id}`);
      if (expected === undefined) continue;
      counted++;
      if (deliverableVerdict(r) === expected) match++;
    }
    return rate(
      computation,
      match,
      counted,
      threshold,
      metric.bias,
      'no labelled cases (label or verdict-equals assertion) feed this metric',
    );
  }
  if (computation === 'judge-pass-rate') {
    return assertionPassRate(
      records,
      metric.name,
      ['judge'],
      computation,
      threshold,
      metric.bias,
    );
  }
  if (computation === 'mechanical-pass-rate') {
    return assertionPassRate(
      records,
      metric.name,
      ['code', 'structured'],
      computation,
      threshold,
      metric.bias,
    );
  }
  if (computation === 'run-stability') {
    const byCase = new Map<string, MetricRecordLike[]>();
    for (const r of records) {
      const key = `${r.suite}/${r.case_id}`;
      if (!byCase.has(key)) byCase.set(key, []);
      byCase.get(key)?.push(r);
    }
    let stable = 0;
    for (const runs of byCase.values()) {
      const verdicts = runs.map(deliverableVerdict);
      if (verdicts.every((v) => v !== null)) {
        if (new Set(verdicts).size === 1) stable++;
      } else if (runs.every(runPassed)) {
        stable++;
      }
    }
    return rate(
      computation,
      stable,
      byCase.size,
      threshold,
      metric.bias,
      'no executed runs feed this metric',
    );
  }
  // deliverable-shape-rate
  const clean = records.filter(
    (r) => r.invocation_error === null && r.deliverable !== null,
  ).length;
  return rate(
    computation,
    clean,
    records.length,
    threshold,
    metric.bias,
    'no executed runs feed this metric',
  );
}

/**
 * The metric frame: per-subject per-metric values derived from records + the
 * registry. `labels` maps `<suite>/<case_id>` to the expected verdict
 * (expectedVerdict over the current case tree). Pure — the CLI wires the
 * registry load and label discovery.
 */
export function computeMetrics(
  records: MetricRecordLike[],
  registry: MetricsRegistry,
  labels: Map<string, 'pass' | 'fail'>,
): MetricsSection {
  const known = new Set(registry.metrics.map((m) => m.name));
  const unknownTags: UnknownMetricTag[] = [];
  const bySubject = new Map<string, MetricRecordLike[]>();

  for (const r of records) {
    if (r.status === 'manual') continue;
    const subject = subjectEntityId(r.subject);
    if (subject === null) continue; // graph lint already reports these
    if (!bySubject.has(subject.id)) bySubject.set(subject.id, []);
    bySubject.get(subject.id)?.push(r);
    for (const a of r.assertions as RecordedAssertionLike[]) {
      if (a.metric !== undefined && !known.has(a.metric)) {
        unknownTags.push({
          suite: r.suite,
          case_id: r.case_id,
          assertion_index: (a as { index: number }).index,
          metric: a.metric,
        });
      }
    }
  }

  const perSubject: Record<string, SubjectMetricsReport> = {};
  for (const [subjectId, subjectRecords] of [...bySubject.entries()].sort()) {
    const cls = registry.subjects[subjectId]?.class ?? null;
    const metrics: Record<string, MetricValueReport> = {};
    for (const metric of registry.metrics) {
      if (cls !== null && !metric.applies_to.includes(cls)) continue;
      const threshold =
        metric.thresholds.per_subject?.[subjectId] ?? metric.thresholds.default;
      if (typeof metric.computation === 'string') {
        metrics[metric.name] = computeSubjectMetric(
          metric,
          metric.computation,
          subjectRecords,
          labels,
          threshold,
        );
        continue;
      }
      const resolved = cls === null ? undefined : metric.computation[cls];
      metrics[metric.name] =
        resolved === undefined
          ? nullValue(
              null,
              threshold,
              metric.bias,
              'subject not classified in the registry, so its per-class computation cannot be resolved',
            )
          : computeSubjectMetric(
              metric,
              resolved,
              subjectRecords,
              labels,
              threshold,
            );
    }
    perSubject[subjectId] = { class: cls, metrics };
  }

  return { per_subject: perSubject, unknown_metric_tags: unknownTags };
}

/**
 * Expected verdicts for every case of the suites named in the records, read
 * from the current case tree. Best-effort by design: records are append-only
 * history, so a case renamed or retired since the run simply contributes no
 * label.
 */
export function buildLabelIndex(
  repoRoot: string,
  suites: Iterable<string>,
): Map<string, 'pass' | 'fail'> {
  const labels = new Map<string, 'pass' | 'fail'>();
  for (const suite of suites) {
    const { cases } = discoverCases(repoRoot, suite);
    for (const c of cases) {
      const expected = expectedVerdict(c);
      if (expected !== null) labels.set(`${c.suite}/${c.caseId}`, expected);
    }
  }
  return labels;
}

export interface EvalReportCliOptions {
  repoRoot: string;
  runId: string;
  suite?: string;
  resultsDir?: string;
}

export function runEvalReportCli(opts: EvalReportCliOptions): {
  stdout: string;
  exitCode: number;
} {
  const recordsFile = path.join(
    opts.resultsDir ?? path.join(opts.repoRoot, 'evals', 'results', opts.runId),
    'records.jsonl',
  );
  if (!fs.existsSync(recordsFile)) {
    return {
      stdout: JSON.stringify({
        error: `records file not found at ${recordsFile}`,
      }),
      exitCode: 1,
    };
  }
  const records: MetricRecordLike[] = [];
  for (const line of fs.readFileSync(recordsFile, 'utf-8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      records.push(JSON.parse(line) as MetricRecordLike);
    } catch {
      // skip a corrupt line rather than abort the whole report
    }
  }
  const filtered =
    opts.suite === undefined
      ? records
      : records.filter((r) => r.suite === opts.suite);
  const report = computeReport(filtered);

  const registry = loadMetricsRegistry(opts.repoRoot);
  if (registry.status === 'invalid') {
    return {
      stdout: JSON.stringify(
        {
          error: `metrics registry at ${registry.path} is invalid`,
          errors: registry.errors,
        },
        null,
        2,
      ),
      exitCode: 1,
    };
  }
  const metrics =
    registry.status === 'absent'
      ? null
      : {
          registry: registry.path,
          ...computeMetrics(
            filtered,
            registry.registry,
            buildLabelIndex(
              opts.repoRoot,
              new Set(filtered.map((r) => r.suite)),
            ),
          ),
        };

  return {
    stdout: JSON.stringify(
      {
        run_id: opts.runId,
        metrics,
        ...(metrics === null
          ? { metrics_note: `no metrics registry at evals/metrics.json` }
          : {}),
        ...report,
      },
      null,
      2,
    ),
    exitCode: 0,
  };
}
