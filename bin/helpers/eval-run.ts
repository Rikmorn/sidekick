import { execFileSync, execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  type Assertion,
  discoverCases,
  type EvalCase,
  extractDeliverable,
  type JudgeAssertion,
  resolveFixtureDir,
  type StructuredAssertion,
  type Subject,
} from './eval-case.js';

/**
 * 3.3 (ADR-0006) eval runner. Prepares a fresh workspace per run, dispatches
 * the subject through the `claude` binary under subscription auth (agent lane
 * via `--agent`, skill lane via a raw `/sk-…` invocation), evaluates typed
 * assertions, and appends one raw per-run record to `records.jsonl`. The
 * `claude` and shell dependencies are injected so the deterministic core is
 * unit-tested with NO live calls; the CLI wires the real `execFileSync` impls.
 */

export type ClaudeRunner = (
  argv: string[],
  cwd: string,
) => { stdout: string; exitCode: number };

export type ShellRunner = (
  cmd: string,
  cwd: string,
) => { exitCode: number; stdout: string; stderr: string };

export interface RunDeps {
  claude: ClaudeRunner;
  shell?: ShellRunner;
  now?: () => number;
  isoNow?: () => string;
}

export const DEFAULT_MAX_TURNS = 25;
const JUDGE_MAX_TURNS = 3;

// ---------------------------------------------------------------------------
// argv builders (pure)
// ---------------------------------------------------------------------------

export function buildAgentArgv(
  name: string,
  prompt: string,
  opts: { maxTurns: number; model?: string },
): string[] {
  return [
    '-p',
    '--agent',
    name,
    prompt,
    '--output-format',
    'json',
    '--max-turns',
    String(opts.maxTurns),
    ...(opts.model ? ['--model', opts.model] : []),
  ];
}

/** A raw `claude -p "<prompt>"` — used for skill invocations AND sealed judge calls. */
export function buildSkillArgv(
  invocation: string,
  opts: { maxTurns: number; model?: string },
): string[] {
  return [
    '-p',
    invocation,
    '--output-format',
    'json',
    '--max-turns',
    String(opts.maxTurns),
    ...(opts.model ? ['--model', opts.model] : []),
  ];
}

// ---------------------------------------------------------------------------
// envelope parsing (pure) — pinned to the shapes observed in the Wave 1 spike
// ---------------------------------------------------------------------------

export interface EnvelopeParsed {
  ok: boolean;
  result: string;
  model: string | null;
  cost_usd: number | null;
  num_turns: number | null;
  error: string | null;
}

export function parseEnvelope(stdout: string): EnvelopeParsed {
  let env: Record<string, unknown>;
  try {
    env = JSON.parse(stdout) as Record<string, unknown>;
  } catch (err) {
    return {
      ok: false,
      result: '',
      model: null,
      cost_usd: null,
      num_turns: null,
      error: `unparseable_envelope: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  // Model has no top-level field — it is the sole key of modelUsage (Wave 1).
  let model: string | null = null;
  if (
    env.modelUsage &&
    typeof env.modelUsage === 'object' &&
    !Array.isArray(env.modelUsage)
  ) {
    const keys = Object.keys(env.modelUsage as Record<string, unknown>);
    if (keys.length > 0) model = keys[0];
  }
  if (model === null && typeof env.model === 'string') model = env.model;

  const result = typeof env.result === 'string' ? env.result : '';
  const cost_usd =
    typeof env.total_cost_usd === 'number' ? env.total_cost_usd : null;
  const num_turns = typeof env.num_turns === 'number' ? env.num_turns : null;

  let error: string | null = null;
  if (env.is_error === true || env.subtype !== 'success') {
    error = `claude_error: subtype=${String(env.subtype)} api_status=${String(env.api_error_status)}`;
  }
  return { ok: error === null, result, model, cost_usd, num_turns, error };
}

// ---------------------------------------------------------------------------
// assertion evaluation (pure / injected)
// ---------------------------------------------------------------------------

export type AssertionOutcome = 'pass' | 'fail' | 'error';

export interface AssertionResult {
  outcome: AssertionOutcome;
  detail: string;
}

export function getByPath(obj: unknown, dotPath: string): unknown {
  let cur: unknown = obj;
  for (const key of dotPath.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

const deepEqual = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export function evaluateStructured(
  deliverable: unknown,
  a: StructuredAssertion,
): AssertionResult {
  const val = getByPath(deliverable, a.path);
  if (a.op === 'exists') {
    return {
      outcome: val !== undefined ? 'pass' : 'fail',
      detail: `exists ${a.path}: ${val !== undefined}`,
    };
  }
  if (a.op === 'equals') {
    return {
      outcome: deepEqual(val, a.value) ? 'pass' : 'fail',
      detail: `${a.path} = ${JSON.stringify(val)} (want ${JSON.stringify(a.value)})`,
    };
  }
  // matches
  if (val === undefined) {
    return { outcome: 'fail', detail: `${a.path} is undefined` };
  }
  const re = new RegExp(String(a.value));
  return {
    outcome: re.test(String(val)) ? 'pass' : 'fail',
    detail: `${a.path} ~ /${a.value}/ against ${JSON.stringify(val)}`,
  };
}

const substituteWorkspace = (s: string, workspace: string): string =>
  s.replaceAll('{{WORKSPACE}}', workspace);

export function evaluateCode(
  a: { cmd: string },
  workspace: string,
  shell: ShellRunner,
): AssertionResult {
  const cmd = substituteWorkspace(a.cmd, workspace);
  const { exitCode } = shell(cmd, workspace);
  return {
    outcome: exitCode === 0 ? 'pass' : 'fail',
    detail: `exit=${exitCode}`,
  };
}

/**
 * Sealed judge prompt (D4). The template is fixed and its ONLY inputs are the
 * rubric and the artifact content — there is no channel for the producer's
 * transcript, prompt, reasoning, or agent name. Sealing is process-structural.
 */
export function buildJudgePrompt(
  rubric: string,
  artifactContent: string,
): string {
  return `You are an impartial evaluator. Decide whether the ARTIFACT below satisfies the RUBRIC. Judge only what is present in the artifact.

Return exactly ONE JSON object inside a \`\`\`json fence:
{"verdict":"pass"|"fail"|"unknown","reasoning":"<one line>"}
Use "unknown" only when the artifact is insufficient to decide.

RUBRIC:
${rubric}

ARTIFACT:
${artifactContent}`;
}

export interface JudgeDeps {
  claude: ClaudeRunner;
  cwd: string;
  model?: string;
}

export interface JudgeResult extends AssertionResult {
  verdicts: string[];
}

export function evaluateJudge(
  artifactContent: string,
  a: Pick<JudgeAssertion, 'rubric' | 'n' | 'threshold'>,
  deps: JudgeDeps,
): JudgeResult {
  const verdicts: string[] = [];
  for (let i = 0; i < a.n; i++) {
    const prompt = buildJudgePrompt(a.rubric, artifactContent);
    const argv = buildSkillArgv(prompt, {
      maxTurns: JUDGE_MAX_TURNS,
      model: deps.model,
    });
    const { stdout } = deps.claude(argv, deps.cwd);
    const env = parseEnvelope(stdout);
    let verdict = 'unknown';
    if (env.ok) {
      const del = extractDeliverable(env.result);
      if (del.ok) {
        const v = (del.value as Record<string, unknown>)?.verdict;
        if (v === 'pass' || v === 'fail' || v === 'unknown') verdict = v;
      }
    }
    verdicts.push(verdict);
  }
  const pass = verdicts.filter((v) => v === 'pass').length;
  const fail = verdicts.filter((v) => v === 'fail').length;
  const unknown = verdicts.filter((v) => v === 'unknown').length;
  const denom = pass + fail;
  if (denom === 0) {
    return {
      outcome: 'error',
      detail: `all ${a.n} judge runs unknown`,
      verdicts,
    };
  }
  const rate = pass / denom;
  return {
    outcome: rate >= a.threshold ? 'pass' : 'fail',
    detail: `judge pass-rate ${pass}/${denom} (unknown ${unknown}) vs threshold ${a.threshold}`,
    verdicts,
  };
}

// ---------------------------------------------------------------------------
// workspace prep (real fs + git)
// ---------------------------------------------------------------------------

function prepareWorkspace(fixtureAbsDir: string | null, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  if (fixtureAbsDir !== null) {
    if (!fs.existsSync(fixtureAbsDir)) {
      throw new Error(`fixture dir not found: ${fixtureAbsDir}`);
    }
    fs.cpSync(fixtureAbsDir, dest, { recursive: true });
  }
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: dest, stdio: 'ignore' });
  git(['init', '-q']);
  git(['add', '-A']);
  // -c flags keep the commit self-contained regardless of the host git identity.
  execFileSync(
    'git',
    [
      '-c',
      'user.email=eval@sidekick.local',
      '-c',
      'user.name=sidekick-eval',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'eval-fixture',
    ],
    { cwd: dest, stdio: 'ignore' },
  );
}

// ---------------------------------------------------------------------------
// records
// ---------------------------------------------------------------------------

export interface RecordedAssertion {
  index: number;
  type: Assertion['type'];
  target: string;
  outcome: AssertionOutcome;
  detail: string;
  /** The metric this assertion feeds, copied from the case (bench-1). */
  metric?: string;
}

export interface EvalRecord {
  run_id: string;
  case_id: string;
  suite: string;
  subject: Subject;
  status: 'ok' | 'manual';
  run_index: number;
  started_at: string;
  duration_ms: number | null;
  model: string | null;
  cost_usd: number | null;
  num_turns: number | null;
  deliverable: unknown;
  assertions: RecordedAssertion[];
  invocation_error: string | null;
}

function judgeArtifactContent(
  a: JudgeAssertion,
  deliverable: unknown,
  workspace: string,
): { content: string } | { missing: string } {
  if (a.file !== undefined) {
    const p = path.join(workspace, substituteWorkspace(a.file, workspace));
    if (!fs.existsSync(p))
      return { missing: `artifact file missing: ${a.file}` };
    return { content: fs.readFileSync(p, 'utf-8') };
  }
  if (a.path !== undefined) {
    return { content: JSON.stringify(getByPath(deliverable, a.path)) };
  }
  return { content: deliverable === null ? '' : JSON.stringify(deliverable) };
}

function evaluateAssertions(
  evalCase: EvalCase,
  deliverable: DeliverableState,
  workspace: string,
  deps: Required<Pick<RunDeps, 'shell'>> & { claude: ClaudeRunner },
  model: string | undefined,
): RecordedAssertion[] {
  return evalCase.assertions.map((a, index) => {
    const base = {
      index,
      type: a.type,
      target: a.target,
      ...(a.metric !== undefined ? { metric: a.metric } : {}),
    };
    if (a.type === 'code') {
      const r = evaluateCode(a, workspace, deps.shell);
      return { ...base, ...r };
    }
    if (a.type === 'structured') {
      if (!deliverable.ok) {
        return {
          ...base,
          outcome: 'error' as const,
          detail: `no deliverable: ${deliverable.error}`,
        };
      }
      return { ...base, ...evaluateStructured(deliverable.value, a) };
    }
    // judge
    const src = judgeArtifactContent(
      a,
      deliverable.ok ? deliverable.value : null,
      workspace,
    );
    if ('missing' in src) {
      return { ...base, outcome: 'fail' as const, detail: src.missing };
    }
    const r = evaluateJudge(src.content, a, {
      claude: deps.claude,
      cwd: workspace,
      model,
    });
    return { ...base, outcome: r.outcome, detail: r.detail };
  });
}

export type DeliverableState =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// dispatch (shared by the runner and the calibrator)
// ---------------------------------------------------------------------------

export interface DispatchResult {
  deliverable: DeliverableState;
  invocationError: string | null;
  model: string | null;
  cost_usd: number | null;
  num_turns: number | null;
}

/**
 * Prepare the (caller-owned) workspace, dispatch the subject through the
 * injected `claude` runner, and return the parsed deliverable + envelope
 * facts. The caller owns the workspace lifecycle so it can evaluate
 * workspace-scoped assertions before cleanup. Shared by runCase and calibrate.
 */
export function dispatchSubject(
  subject: Subject,
  prompt: string,
  workspace: string,
  opts: {
    fixtureDir: string | null;
    model?: string;
    maxTurns: number;
    deps: RunDeps;
  },
): DispatchResult {
  prepareWorkspace(opts.fixtureDir, workspace);
  const resolvedPrompt =
    subject.kind === 'agent'
      ? substituteWorkspace(prompt, workspace)
      : substituteWorkspace(subject.invocation, workspace);
  const argv =
    subject.kind === 'agent'
      ? buildAgentArgv(subject.name, resolvedPrompt, {
          maxTurns: opts.maxTurns,
          model: opts.model,
        })
      : buildSkillArgv(resolvedPrompt, {
          maxTurns: opts.maxTurns,
          model: opts.model,
        });
  const { stdout, exitCode } = opts.deps.claude(argv, workspace);
  const env = parseEnvelope(stdout);
  const invocationError =
    env.error ?? (exitCode !== 0 ? `nonzero_exit_${exitCode}` : null);
  const del = extractDeliverable(env.result);
  return {
    deliverable: del.ok
      ? { ok: true, value: del.value }
      : { ok: false, error: del.error },
    invocationError,
    model: env.model,
    cost_usd: env.cost_usd,
    num_turns: env.num_turns,
  };
}

// ---------------------------------------------------------------------------
// per-case execution
// ---------------------------------------------------------------------------

export interface RunCaseOptions {
  repoRoot: string;
  runId: string;
  model?: string;
  maxTurns: number;
  k?: number;
  keepWorkspace?: boolean;
  tmpRoot: string;
  deps: RunDeps;
  /** `${case_id}#${run_index}` pairs already recorded (resume). */
  skip: Set<string>;
}

export function runCase(
  evalCase: EvalCase,
  opts: RunCaseOptions,
): { records: EvalRecord[]; skipped: number } {
  const isoNow = opts.deps.isoNow ?? (() => new Date().toISOString());
  const now = opts.deps.now ?? (() => Date.now());
  const shell = opts.deps.shell ?? realShellRunner();

  if (evalCase.manual) {
    const key = `${evalCase.caseId}#0`;
    if (opts.skip.has(key)) return { records: [], skipped: 1 };
    return {
      records: [
        {
          run_id: opts.runId,
          case_id: evalCase.caseId,
          suite: evalCase.suite,
          subject: evalCase.subject,
          status: 'manual',
          run_index: 0,
          started_at: isoNow(),
          duration_ms: null,
          model: null,
          cost_usd: null,
          num_turns: null,
          deliverable: null,
          assertions: [],
          invocation_error: null,
        },
      ],
      skipped: 0,
    };
  }

  const effectiveK = opts.k ?? evalCase.k;
  const fixtureDir = resolveFixtureDir(opts.repoRoot, evalCase.fixture);
  const records: EvalRecord[] = [];
  let skipped = 0;

  for (let runIndex = 0; runIndex < effectiveK; runIndex++) {
    if (opts.skip.has(`${evalCase.caseId}#${runIndex}`)) {
      skipped++;
      continue;
    }
    const workspace = fs.mkdtempSync(
      path.join(opts.tmpRoot, `${evalCase.caseId}-${runIndex}-`),
    );
    const startedAt = isoNow();
    const t0 = now();
    let invocationError: string | null = null;
    let deliverable: DeliverableState = { ok: false, error: 'not_run' };
    let model: string | null = null;
    let cost: number | null = null;
    let turns: number | null = null;
    let assertions: RecordedAssertion[] = [];

    try {
      const dispatched = dispatchSubject(
        evalCase.subject,
        evalCase.prompt ?? '',
        workspace,
        {
          fixtureDir,
          model: opts.model,
          maxTurns: opts.maxTurns,
          deps: opts.deps,
        },
      );
      model = dispatched.model;
      cost = dispatched.cost_usd;
      turns = dispatched.num_turns;
      invocationError = dispatched.invocationError;
      deliverable = dispatched.deliverable;

      if (invocationError !== null) {
        assertions = evalCase.assertions.map((a, index) => ({
          index,
          type: a.type,
          target: a.target,
          ...(a.metric !== undefined ? { metric: a.metric } : {}),
          outcome: 'error' as const,
          detail: `skipped: ${invocationError}`,
        }));
      } else {
        assertions = evaluateAssertions(
          evalCase,
          deliverable,
          workspace,
          { claude: opts.deps.claude, shell },
          opts.model,
        );
      }
    } catch (err) {
      invocationError = `runner_error: ${err instanceof Error ? err.message : String(err)}`;
      assertions = evalCase.assertions.map((a, index) => ({
        index,
        type: a.type,
        target: a.target,
        ...(a.metric !== undefined ? { metric: a.metric } : {}),
        outcome: 'error' as const,
        detail: invocationError ?? '',
      }));
    } finally {
      if (!opts.keepWorkspace) {
        fs.rmSync(workspace, { recursive: true, force: true });
      }
    }

    records.push({
      run_id: opts.runId,
      case_id: evalCase.caseId,
      suite: evalCase.suite,
      subject: evalCase.subject,
      status: 'ok',
      run_index: runIndex,
      started_at: startedAt,
      duration_ms: now() - t0,
      model,
      cost_usd: cost,
      num_turns: turns,
      deliverable: deliverable.ok ? deliverable.value : null,
      assertions,
      invocation_error: invocationError,
    });
  }

  return { records, skipped };
}

// ---------------------------------------------------------------------------
// suite orchestration + CLI
// ---------------------------------------------------------------------------

export interface RunEvalSuiteOptions {
  repoRoot: string;
  suiteOrCasePath: string;
  runId: string;
  k?: number;
  model?: string;
  maxTurns?: number;
  resumeRunId?: string;
  keepWorkspace?: boolean;
  validateOnly?: boolean;
  deps: RunDeps;
  /** Override the results dir (default `<repoRoot>/evals/results/<runId>`). */
  resultsDir?: string;
  /** Override the tmp workspace root (default os.tmpdir()). */
  tmpRoot?: string;
}

export interface RunEvalSuiteResult {
  stdout: string;
  exitCode: number;
  summary: Record<string, unknown>;
}

function readRecordedKeys(recordsFile: string): Set<string> {
  const skip = new Set<string>();
  if (!fs.existsSync(recordsFile)) return skip;
  for (const line of fs.readFileSync(recordsFile, 'utf-8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      const r = JSON.parse(line) as { case_id: string; run_index: number };
      skip.add(`${r.case_id}#${r.run_index}`);
    } catch {
      // a corrupt line does not block resume; it just won't be skipped
    }
  }
  return skip;
}

export function runEvalSuite(opts: RunEvalSuiteOptions): RunEvalSuiteResult {
  const { cases, errors } = discoverCases(opts.repoRoot, opts.suiteOrCasePath);

  if (opts.validateOnly) {
    const summary = {
      run_id: opts.runId,
      mode: 'validate-only',
      valid_cases: cases.length,
      discovery_errors: errors,
    };
    return {
      stdout: JSON.stringify(summary, null, 2),
      exitCode: errors.length > 0 ? 1 : 0,
      summary,
    };
  }

  const resultsDir =
    opts.resultsDir ?? path.join(opts.repoRoot, 'evals', 'results', opts.runId);
  fs.mkdirSync(resultsDir, { recursive: true });
  const recordsFile = path.join(resultsDir, 'records.jsonl');
  const skip = opts.resumeRunId
    ? readRecordedKeys(recordsFile)
    : new Set<string>();

  const tmpRoot =
    opts.tmpRoot ??
    fs.mkdtempSync(path.join(os.tmpdir(), `sk-eval-${opts.runId}-`));

  let written = 0;
  let skippedTotal = 0;
  let manualCount = 0;
  for (const evalCase of cases) {
    const { records, skipped } = runCase(evalCase, {
      repoRoot: opts.repoRoot,
      runId: opts.runId,
      model: opts.model,
      maxTurns: opts.maxTurns ?? DEFAULT_MAX_TURNS,
      k: opts.k,
      keepWorkspace: opts.keepWorkspace,
      tmpRoot,
      deps: opts.deps,
      skip,
    });
    skippedTotal += skipped;
    for (const rec of records) {
      if (rec.status === 'manual') manualCount++;
      fs.appendFileSync(recordsFile, `${JSON.stringify(rec)}\n`);
      written++;
    }
  }

  const summary = {
    run_id: opts.runId,
    results_file: recordsFile,
    cases: cases.length,
    records_written: written,
    skipped: skippedTotal,
    manual: manualCount,
    discovery_errors: errors,
  };
  return {
    stdout: JSON.stringify(summary, null, 2),
    exitCode: cases.length === 0 && errors.length > 0 ? 1 : 0,
    summary,
  };
}

// ---------------------------------------------------------------------------
// real dependency impls (used by the CLI, never by unit tests)
// ---------------------------------------------------------------------------

export function realClaudeRunner(claudeBin: string): ClaudeRunner {
  return (argv, cwd) => {
    try {
      const stdout = execFileSync(claudeBin, argv, {
        cwd,
        encoding: 'utf-8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { stdout, exitCode: 0 };
    } catch (err) {
      const e = err as { stdout?: Buffer | string; status?: number };
      return {
        stdout: e.stdout ? e.stdout.toString() : '',
        exitCode: typeof e.status === 'number' ? e.status : 1,
      };
    }
  };
}

export function realShellRunner(): ShellRunner {
  return (cmd, cwd) => {
    try {
      const stdout = execSync(cmd, {
        cwd,
        encoding: 'utf-8',
        maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { exitCode: 0, stdout, stderr: '' };
    } catch (err) {
      const e = err as {
        stdout?: Buffer | string;
        stderr?: Buffer | string;
        status?: number;
      };
      return {
        exitCode: typeof e.status === 'number' ? e.status : 1,
        stdout: e.stdout ? e.stdout.toString() : '',
        stderr: e.stderr ? e.stderr.toString() : '',
      };
    }
  };
}
