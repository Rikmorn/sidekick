import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { discoverCases } from './eval-case.js';
import { dispatchSubject, getByPath, type RunDeps } from './eval-run.js';
import { hashRfcContent } from './hash-rfc.js';

/**
 * 3.3 (ADR-0006) calibration + graduation certificate. Runs a verifier agent
 * over a labelled corpus k times, compares its structured verdicts against the
 * operator-owned labels mechanically, and — only when precision-leaning
 * thresholds are met AND the corpus is large enough — writes a hash-pinned
 * certificate. The certificate pins the SHA-256 of the agent file as resolved
 * by the SAME lookup `resolveVerifiers` uses, so editing the prompt auto-revokes
 * binding (resolve-time re-check lives in verifiers.ts). A failed calibration is
 * a truthful outcome, not an error: no certificate, exit 0, stats to stdout.
 */

export type Verdict = 'pass' | 'fail';
export type Prediction = 'pass' | 'fail' | 'error';

export interface CasePredictions {
  caseId: string;
  expected: Verdict;
  predictions: Prediction[];
}

export interface CalibrationStats {
  cases: number;
  runs: number;
  accuracy: number;
  fail_precision: number;
  fail_recall: number;
  unanimity_rate: number;
  confusion: { tp: number; fp: number; fn: number; tn: number };
  errors: number;
}

/** fail is the positive class (a verifier's job is to catch the seeded defect). */
export function computeCalibrationStats(
  perCase: CasePredictions[],
): CalibrationStats {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let correct = 0;
  let runs = 0;
  let errors = 0;
  let unanimous = 0;

  for (const c of perCase) {
    if (
      c.predictions.length > 0 &&
      c.predictions.every((p) => p === c.predictions[0])
    ) {
      unanimous++;
    }
    for (const p of c.predictions) {
      runs++;
      if (p === 'error') errors++;
      if (p === c.expected) correct++;
      if (c.expected === 'fail' && p === 'fail') tp++;
      else if (c.expected === 'pass' && p === 'fail') fp++;
      else if (c.expected === 'fail' && p !== 'fail') fn++;
      else if (c.expected === 'pass' && p === 'pass') tn++;
      // (expected pass + prediction error) lowers accuracy only — no fail-class bucket
    }
  }

  const cases = perCase.length;
  return {
    cases,
    runs,
    accuracy: runs === 0 ? 0 : correct / runs,
    // Undefined precision/recall (no positive predictions / no actual positives)
    // resolve to 1: no false alarms / no misses. The complementary metric still
    // constrains the gate, so a degenerate verifier cannot pass on 1s alone.
    fail_precision: tp + fp === 0 ? 1 : tp / (tp + fp),
    fail_recall: tp + fn === 0 ? 1 : tp / (tp + fn),
    unanimity_rate: cases === 0 ? 0 : unanimous / cases,
    confusion: { tp, fp, fn, tn },
    errors,
  };
}

/**
 * corpus_hash = SHA-256 of the case.json contents concatenated in case-id order
 * (deterministic regardless of filesystem enumeration order).
 */
export function hashCorpus(
  entries: { caseId: string; content: string }[],
): string {
  const sorted = [...entries].sort((a, b) => a.caseId.localeCompare(b.caseId));
  return hashRfcContent(sorted.map((e) => e.content).join('\n'));
}

/** The same lookup order `resolveVerifiers` uses: repo `.claude/agents/` then `~/.claude/agents/`. */
export function resolveAgentFile(
  name: string,
  repoRoot: string,
  claudeHome: string,
): string | null {
  const candidates = [
    path.join(repoRoot, '.claude', 'agents', `${name}.md`),
    path.join(claudeHome, 'agents', `${name}.md`),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export interface CalibrationCertificate {
  schemaVersion: 1;
  verifier: string;
  agent_file_hash: string;
  corpus_hash: string;
  stats: CalibrationStats;
  thresholds: {
    min_cases: number;
    fail_precision: number;
    fail_recall: number;
    unanimity: number;
  };
  model: string | null;
  k: number;
  created: string;
}

export interface RunCalibrateOptions {
  repoRoot: string;
  claudeHome: string;
  verifier: string;
  suite: string;
  k?: number;
  verdictPath?: string;
  minCases?: number;
  failPrecision?: number;
  failRecall?: number;
  unanimity?: number;
  model?: string;
  maxTurns?: number;
  deps: RunDeps & { now?: () => string };
  tmpRoot?: string;
  calibrationsDir?: string;
}

export interface CalibrateResult {
  exitCode: number;
  stdout: string;
  certificateWritten: boolean;
  belowMinCases?: boolean;
  error?: string;
  stats?: CalibrationStats;
}

export function runCalibrate(opts: RunCalibrateOptions): CalibrateResult {
  const k = opts.k ?? 3;
  const verdictPath = opts.verdictPath ?? 'verdict';
  const minCases = opts.minCases ?? 20;
  const failPrecision = opts.failPrecision ?? 0.9;
  const failRecall = opts.failRecall ?? 0.8;
  const unanimity = opts.unanimity ?? 0.8;
  const maxTurns = opts.maxTurns ?? 25;
  const now = opts.deps.now ?? (() => new Date().toISOString());

  const agentFile = resolveAgentFile(
    opts.verifier,
    opts.repoRoot,
    opts.claudeHome,
  );
  if (agentFile === null) {
    const payload = {
      error: `verifier agent file not found for "${opts.verifier}" (looked in .claude/agents/ at repo and user level)`,
    };
    return {
      exitCode: 1,
      stdout: JSON.stringify(payload),
      certificateWritten: false,
      error: payload.error,
    };
  }

  const { cases, errors } = discoverCases(opts.repoRoot, opts.suite);
  const labelled = cases.filter((c) => c.label !== undefined);
  const unlabelled = cases.length - labelled.length;

  if (labelled.length === 0) {
    const payload = {
      error: `no labelled cases in suite "${opts.suite}"`,
      discovery_errors: errors,
    };
    return {
      exitCode: 1,
      stdout: JSON.stringify(payload),
      certificateWritten: false,
      error: payload.error,
    };
  }

  const tmpRoot =
    opts.tmpRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'sk-calibrate-'));

  const perCase: CasePredictions[] = [];
  const corpusEntries: { caseId: string; content: string }[] = [];
  let observedModel: string | null = null;

  for (const c of labelled) {
    const caseJson = path.join(
      opts.repoRoot,
      'evals',
      'cases',
      opts.suite,
      c.caseId,
      'case.json',
    );
    corpusEntries.push({
      caseId: c.caseId,
      content: fs.readFileSync(caseJson, 'utf-8'),
    });

    const fixtureDir =
      c.fixture === undefined
        ? null
        : path.isAbsolute(c.fixture)
          ? c.fixture
          : path.join(opts.repoRoot, c.fixture);

    const predictions: Prediction[] = [];
    for (let i = 0; i < k; i++) {
      const workspace = fs.mkdtempSync(path.join(tmpRoot, `${c.caseId}-${i}-`));
      try {
        const d = dispatchSubject(
          { kind: 'agent', name: opts.verifier },
          c.prompt ?? '',
          workspace,
          { fixtureDir, model: opts.model, maxTurns, deps: opts.deps },
        );
        if (observedModel === null) observedModel = d.model;
        if (d.invocationError !== null || !d.deliverable.ok) {
          predictions.push('error');
        } else {
          const v = getByPath(d.deliverable.value, verdictPath);
          predictions.push(v === 'pass' || v === 'fail' ? v : 'error');
        }
      } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
      }
    }
    perCase.push({
      caseId: c.caseId,
      expected: c.label?.expected_verdict as Verdict,
      predictions,
    });
  }

  const stats = computeCalibrationStats(perCase);
  const thresholds = {
    min_cases: minCases,
    fail_precision: failPrecision,
    fail_recall: failRecall,
    unanimity,
  };

  const belowMinCases = stats.cases < minCases;
  const met =
    !belowMinCases &&
    stats.fail_precision >= failPrecision &&
    stats.fail_recall >= failRecall &&
    stats.unanimity_rate >= unanimity;

  let certificateWritten = false;
  let certPath: string | null = null;
  if (met) {
    const cert: CalibrationCertificate = {
      schemaVersion: 1,
      verifier: opts.verifier,
      agent_file_hash: hashRfcContent(fs.readFileSync(agentFile, 'utf-8')),
      corpus_hash: hashCorpus(corpusEntries),
      stats,
      thresholds,
      model: opts.model ?? observedModel,
      k,
      created: now(),
    };
    const dir =
      opts.calibrationsDir ??
      path.join(opts.repoRoot, '.sidekick', 'calibrations');
    fs.mkdirSync(dir, { recursive: true });
    certPath = path.join(dir, `${opts.verifier}.json`);
    fs.writeFileSync(certPath, `${JSON.stringify(cert, null, 2)}\n`);
    certificateWritten = true;
  }

  const payload = {
    verifier: opts.verifier,
    suite: opts.suite,
    k,
    thresholds,
    thresholds_met: met,
    certificate_written: certificateWritten,
    certificate_path: certPath,
    below_min_cases: belowMinCases,
    unlabelled_skipped: unlabelled,
    discovery_errors: errors,
    stats,
    per_case: perCase,
  };
  return {
    exitCode: 0,
    stdout: JSON.stringify(payload, null, 2),
    certificateWritten,
    belowMinCases,
    stats,
  };
}
