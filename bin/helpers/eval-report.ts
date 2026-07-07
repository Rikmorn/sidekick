import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EvalRecord } from './eval-run.js';

/**
 * 3.3 (ADR-0006) eval report — derive-then-check. Reads the append-only
 * records the runner produced and derives aggregate verdicts; it never
 * re-runs anything. pass@k ("can it — ≥1 run all-assertions-pass") and pass^k
 * ("is it reliable — every run passes") per case, suite rollups, and explicit
 * manual counts. Pure over records.jsonl.
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
  const records: RecordLike[] = [];
  for (const line of fs.readFileSync(recordsFile, 'utf-8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      records.push(JSON.parse(line) as RecordLike);
    } catch {
      // skip a corrupt line rather than abort the whole report
    }
  }
  const filtered =
    opts.suite === undefined
      ? records
      : records.filter((r) => r.suite === opts.suite);
  const report = computeReport(filtered);
  return {
    stdout: JSON.stringify({ run_id: opts.runId, ...report }, null, 2),
    exitCode: 0,
  };
}
