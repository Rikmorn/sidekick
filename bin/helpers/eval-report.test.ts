import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { computeReport, runEvalReportCli } from './eval-report.js';

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
