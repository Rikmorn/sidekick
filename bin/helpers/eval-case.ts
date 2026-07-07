import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 3.3 (ADR-0006) eval case convention. A case is a directory
 * `evals/cases/<suite>/<case-id>/case.json` (+ optional per-case files). The
 * manifest is substrate-independent: it names a subject (an installed agent or
 * a skill invocation), a fixture (a repo-relative dir copied into a fresh
 * workspace per run), and a list of typed assertions. This module owns manifest
 * parsing/validation, suite discovery, fixture path resolution, and the
 * ONE-JSON deliverable extraction that the runner and calibrator both use.
 */

export type SubjectKind = 'agent' | 'skill';

export interface AgentSubject {
  kind: 'agent';
  name: string;
}
export interface SkillSubject {
  kind: 'skill';
  invocation: string;
}
export type Subject = AgentSubject | SkillSubject;

export const ASSERTION_TARGETS = [
  'artifact',
  'workspace',
  'transcript',
] as const;
export type AssertionTarget = (typeof ASSERTION_TARGETS)[number];

export const STRUCTURED_OPS = ['equals', 'matches', 'exists'] as const;
export type StructuredOp = (typeof STRUCTURED_OPS)[number];

export interface CodeAssertion {
  type: 'code';
  target: AssertionTarget;
  cmd: string;
}
export interface StructuredAssertion {
  type: 'structured';
  target: AssertionTarget;
  path: string;
  op: StructuredOp;
  value?: unknown;
}
export interface JudgeAssertion {
  type: 'judge';
  target: AssertionTarget;
  rubric: string;
  n: number;
  threshold: number;
  /** Optional workspace-relative file whose content is judged (else the deliverable). */
  file?: string;
  /** Optional dot-path into the deliverable whose value is judged (else the whole deliverable). */
  path?: string;
}
export type Assertion = CodeAssertion | StructuredAssertion | JudgeAssertion;

export interface CaseLabel {
  expected_verdict: 'pass' | 'fail';
}

export interface EvalCase {
  schemaVersion: 1;
  caseId: string;
  suite: string;
  subject: Subject;
  fixture?: string;
  prompt?: string;
  manual: boolean;
  k: number;
  label?: CaseLabel;
  assertions: Assertion[];
  /** Free-text expectation for manual cases (documentation, never evaluated). */
  expect?: string;
}

export type CaseParseResult =
  | { ok: true; value: EvalCase }
  | { ok: false; error: string };

function parseAssertion(
  raw: unknown,
  i: number,
): Assertion | { error: string } {
  const label = `assertions[${i}]`;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: `${label}: must be an object` };
  }
  const a = raw as Record<string, unknown>;
  const target = a.target === undefined ? 'artifact' : a.target;
  if (!ASSERTION_TARGETS.includes(target as AssertionTarget)) {
    return {
      error: `${label}: "target" must be one of ${ASSERTION_TARGETS.join(' | ')}`,
    };
  }
  const t = target as AssertionTarget;

  if (a.type === 'code') {
    if (typeof a.cmd !== 'string' || a.cmd.length === 0) {
      return { error: `${label}: code assertion needs a non-empty "cmd"` };
    }
    return { type: 'code', target: t, cmd: a.cmd };
  }
  if (a.type === 'structured') {
    if (typeof a.path !== 'string' || a.path.length === 0) {
      return { error: `${label}: structured assertion needs a "path"` };
    }
    if (!STRUCTURED_OPS.includes(a.op as StructuredOp)) {
      return {
        error: `${label}: "op" must be one of ${STRUCTURED_OPS.join(' | ')}`,
      };
    }
    if (a.op !== 'exists' && a.value === undefined) {
      return { error: `${label}: op "${a.op}" needs a "value"` };
    }
    return {
      type: 'structured',
      target: t,
      path: a.path,
      op: a.op as StructuredOp,
      ...(a.op === 'exists' ? {} : { value: a.value }),
    };
  }
  if (a.type === 'judge') {
    if (typeof a.rubric !== 'string' || a.rubric.length === 0) {
      return { error: `${label}: judge assertion needs a "rubric"` };
    }
    const n = a.n === undefined ? 3 : a.n;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
      return { error: `${label}: judge "n" must be a positive integer` };
    }
    const threshold = a.threshold === undefined ? 0.66 : a.threshold;
    if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
      return { error: `${label}: judge "threshold" must be within [0, 1]` };
    }
    if (a.file !== undefined && typeof a.file !== 'string') {
      return { error: `${label}: judge "file" must be a string when present` };
    }
    if (a.path !== undefined && typeof a.path !== 'string') {
      return { error: `${label}: judge "path" must be a string when present` };
    }
    return {
      type: 'judge',
      target: t,
      rubric: a.rubric,
      n,
      threshold,
      ...(a.file !== undefined ? { file: a.file } : {}),
      ...(a.path !== undefined ? { path: a.path } : {}),
    };
  }
  return { error: `${label}: "type" must be code | structured | judge` };
}

export function parseCase(
  raw: string,
  ctx: { caseId: string; suite: string },
): CaseParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      error: `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'case.json root must be an object' };
  }
  const o = parsed as Record<string, unknown>;
  if (o.schemaVersion !== 1) {
    return { ok: false, error: 'case.json "schemaVersion" must be 1' };
  }

  // Subject.
  if (typeof o.subject !== 'object' || o.subject === null) {
    return { ok: false, error: 'missing "subject"' };
  }
  const s = o.subject as Record<string, unknown>;
  let subject: Subject;
  if (s.kind === 'agent') {
    if (typeof s.name !== 'string' || s.name.length === 0) {
      return { ok: false, error: 'agent subject needs a non-empty "name"' };
    }
    subject = { kind: 'agent', name: s.name };
  } else if (s.kind === 'skill') {
    if (typeof s.invocation !== 'string' || s.invocation.length === 0) {
      return {
        ok: false,
        error: 'skill subject needs a non-empty "invocation"',
      };
    }
    subject = { kind: 'skill', invocation: s.invocation };
  } else {
    return { ok: false, error: 'subject "kind" must be "agent" or "skill"' };
  }

  // fixture / prompt.
  if (o.fixture !== undefined && typeof o.fixture !== 'string') {
    return { ok: false, error: '"fixture" must be a string when present' };
  }
  if (o.prompt !== undefined && typeof o.prompt !== 'string') {
    return { ok: false, error: '"prompt" must be a string when present' };
  }
  if (
    subject.kind === 'agent' &&
    (typeof o.prompt !== 'string' || o.prompt.length === 0)
  ) {
    return { ok: false, error: 'agent cases need a non-empty "prompt"' };
  }

  // manual / k.
  const manual = o.manual === undefined ? false : o.manual;
  if (typeof manual !== 'boolean') {
    return { ok: false, error: '"manual" must be a boolean' };
  }
  const k = o.k === undefined ? 1 : o.k;
  if (typeof k !== 'number' || !Number.isInteger(k) || k < 1) {
    return { ok: false, error: '"k" must be a positive integer' };
  }

  // label.
  let label: CaseLabel | undefined;
  if (o.label !== undefined) {
    const l = o.label as Record<string, unknown>;
    if (
      l === null ||
      (l.expected_verdict !== 'pass' && l.expected_verdict !== 'fail')
    ) {
      return {
        ok: false,
        error: '"label.expected_verdict" must be "pass" or "fail"',
      };
    }
    label = { expected_verdict: l.expected_verdict };
  }

  // expect (free-text doc for manual cases).
  if (o.expect !== undefined && typeof o.expect !== 'string') {
    return { ok: false, error: '"expect" must be a string when present' };
  }

  // assertions.
  const assertions: Assertion[] = [];
  if (o.assertions !== undefined) {
    if (!Array.isArray(o.assertions)) {
      return { ok: false, error: '"assertions" must be an array' };
    }
    for (let i = 0; i < o.assertions.length; i++) {
      const res = parseAssertion(o.assertions[i], i);
      if ('error' in res) return { ok: false, error: res.error };
      assertions.push(res);
    }
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      caseId: ctx.caseId,
      suite: ctx.suite,
      subject,
      ...(o.fixture !== undefined ? { fixture: o.fixture as string } : {}),
      ...(o.prompt !== undefined ? { prompt: o.prompt as string } : {}),
      manual,
      k,
      ...(label !== undefined ? { label } : {}),
      assertions,
      ...(o.expect !== undefined ? { expect: o.expect as string } : {}),
    },
  };
}

export interface DiscoverResult {
  cases: EvalCase[];
  errors: string[];
}

/**
 * Resolve a suite name or a direct case.json path to the list of cases.
 * A path ending in `case.json` loads that single case; anything else is
 * treated as a suite name under `<repoRoot>/evals/cases/<suite>/`.
 */
export function discoverCases(
  repoRoot: string,
  suiteOrCasePath: string,
): DiscoverResult {
  const cases: EvalCase[] = [];
  const errors: string[] = [];

  if (suiteOrCasePath.endsWith('case.json')) {
    const caseJson = path.isAbsolute(suiteOrCasePath)
      ? suiteOrCasePath
      : path.join(repoRoot, suiteOrCasePath);
    if (!fs.existsSync(caseJson)) {
      return { cases, errors: [`case.json not found at ${caseJson}`] };
    }
    const caseDir = path.dirname(caseJson);
    const caseId = path.basename(caseDir);
    const suite = path.basename(path.dirname(caseDir));
    const res = parseCase(fs.readFileSync(caseJson, 'utf-8'), {
      caseId,
      suite,
    });
    if (res.ok) cases.push(res.value);
    else errors.push(`${suite}/${caseId}: ${res.error}`);
    return { cases, errors };
  }

  const suite = suiteOrCasePath;
  const suiteDir = path.join(repoRoot, 'evals', 'cases', suite);
  if (!fs.existsSync(suiteDir)) {
    return { cases, errors: [`suite "${suite}" not found at ${suiteDir}`] };
  }
  const ids = fs
    .readdirSync(suiteDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const caseId of ids) {
    const caseJson = path.join(suiteDir, caseId, 'case.json');
    if (!fs.existsSync(caseJson)) continue;
    const res = parseCase(fs.readFileSync(caseJson, 'utf-8'), {
      caseId,
      suite,
    });
    if (res.ok) cases.push(res.value);
    else errors.push(`${suite}/${caseId}: ${res.error}`);
  }
  return { cases, errors };
}

/** Resolve a repo-relative fixture dir to an absolute path (null if none). */
export function resolveFixtureDir(
  repoRoot: string,
  fixture: string | undefined,
): string | null {
  if (fixture === undefined) return null;
  return path.isAbsolute(fixture) ? fixture : path.join(repoRoot, fixture);
}

export type DeliverableResult =
  | { ok: true; value: unknown }
  | { ok: false; error: 'no_json_fence' | 'unparseable_json'; detail?: string };

/**
 * Extract the ONE-JSON deliverable from a subject's result text: the content of
 * the LAST ```json fence, parsed. Specialists reason in prose around a final
 * fenced JSON object (Rule 7); the last fence is the deliverable.
 */
export function extractDeliverable(resultText: string): DeliverableResult {
  const fenceRe = /```json\b\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let last: string | null = null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard global-regex scan
  while ((m = fenceRe.exec(resultText)) !== null) {
    last = m[1];
  }
  if (last === null) return { ok: false, error: 'no_json_fence' };
  try {
    return { ok: true, value: JSON.parse(last.trim()) };
  } catch (err) {
    return {
      ok: false,
      error: 'unparseable_json',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
