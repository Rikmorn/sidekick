/**
 * ops-2 — parsers for the machine artifacts: eval cases and run records, the
 * calibration certificates, and the agent/skill/helper inventory.
 *
 * These sources are already typed (JSON manifests, JSONL records, agent
 * frontmatter), so extraction is a mapping exercise rather than a parsing one.
 * The one judgement call is naming a skill subject: a case addresses a skill by
 * invocation string, and the leading slash-command is the only part of that
 * string that identifies an entity.
 */

import {
  normalizeDeliverableVerdict,
  parseMetricsRegistry,
} from './eval-metrics.js';
import {
  type Entity,
  emptyParse,
  fieldAsScalar,
  type LintFinding,
  type ParseResult,
  parseFrontmatter,
} from './graph-model.js';
import type { RunRow } from './graph-store.js';

function finding(
  code: LintFinding['code'],
  message: string,
  origin: string | null,
): LintFinding {
  return { code, message, origin };
}

// ---- eval cases -------------------------------------------------------------

interface CaseManifest {
  subject?: { kind?: string; name?: string; invocation?: string };
  expect?: string;
  manual?: boolean;
  fixture?: string;
}

/**
 * Resolve a case subject to an entity ID. An agent subject names itself; a
 * skill subject is identified by the slash-command that opens its invocation.
 * Anything else is reported — a fabricated subject would silently distort the
 * coverage matrix, which is the one view that must not lie.
 */
export function subjectEntityId(
  subject: CaseManifest['subject'],
): { id: string; kind: string; name: string } | null {
  if (!subject) return null;
  if (subject.kind === 'agent' && subject.name) {
    return { id: `agent:${subject.name}`, kind: 'agent', name: subject.name };
  }
  if (subject.kind === 'skill' && subject.invocation) {
    const m = /^\/([a-z][a-z0-9-]*)/.exec(subject.invocation.trim());
    if (m) return { id: `skill:${m[1]}`, kind: 'skill', name: m[1] };
  }
  return null;
}

/**
 * Parse one `evals/cases/<suite>/<case>/case.json` into its case entity, its
 * suite entity, and the `measures` edges from both to the subject under test.
 */
export function parseEvalCase(
  json: string,
  relPath: string,
  suite: string,
  caseId: string,
): ParseResult {
  const out = emptyParse();
  const origin = `${relPath}:1`;

  let manifest: CaseManifest;
  try {
    manifest = JSON.parse(json);
  } catch (err) {
    out.findings.push(
      finding(
        'unresolvable-ref',
        `${relPath}: case manifest is not valid JSON (${err instanceof Error ? err.message : String(err)}).`,
        origin,
      ),
    );
    return out;
  }

  const caseEntityId = `case:${suite}/${caseId}`;
  out.entities.push({
    id: `suite:${suite}`,
    kind: 'suite',
    title: suite,
    status: null,
    path: `evals/cases/${suite}`,
  });
  out.entities.push({
    id: caseEntityId,
    kind: 'case',
    title: manifest.expect
      ? manifest.expect.slice(0, 120)
      : `${suite}/${caseId}`,
    status: manifest.manual === true ? 'manual' : 'runner',
    path: relPath,
    data: { suite, case_id: caseId },
  });

  const subject = subjectEntityId(manifest.subject);
  if (subject === null) {
    out.findings.push(
      finding(
        'unresolvable-ref',
        `${relPath}: case subject does not name an agent or a slash-command skill; no measures edge created.`,
        origin,
      ),
    );
    return out;
  }

  for (const src of [`suite:${suite}`, caseEntityId]) {
    out.edges.push({
      src,
      rel: 'measures',
      dst: subject.id,
      tier: 'EXTRACTED',
      origin,
    });
  }
  return out;
}

// ---- run records ------------------------------------------------------------

interface RecordLine {
  run_id?: string;
  case_id?: string;
  suite?: string;
  subject?: { kind?: string; name?: string; invocation?: string };
  status?: string;
  model?: string;
  cost_usd?: number;
  num_turns?: number;
  started_at?: string;
  duration_ms?: number;
  deliverable?: unknown;
  assertions?: Array<{ outcome?: string }>;
}

/**
 * Fold one run record into a row. The verdict is derived from the assertion
 * outcomes rather than from any self-reported field: a record whose invocation
 * errored has no assertions to pass, and reading `status` alone would score it
 * as neither pass nor fail.
 */
export function parseRunRecords(
  jsonl: string,
  relPath: string,
): {
  runs: RunRow[];
  findings: LintFinding[];
} {
  const runs: RunRow[] = [];
  const findings: LintFinding[] = [];

  jsonl.split('\n').forEach((line, i) => {
    if (line.trim() === '') return;
    let rec: RecordLine;
    try {
      rec = JSON.parse(line);
    } catch {
      findings.push(
        finding(
          'unresolvable-ref',
          `${relPath}: line ${i + 1} is not valid JSON; run record skipped.`,
          `${relPath}:${i + 1}`,
        ),
      );
      return;
    }
    if (!rec.run_id || !rec.case_id || !rec.suite) {
      findings.push(
        finding(
          'unresolvable-ref',
          `${relPath}: line ${i + 1} is missing run_id/case_id/suite; run record skipped.`,
          `${relPath}:${i + 1}`,
        ),
      );
      return;
    }

    const subject = subjectEntityId(rec.subject);
    const assertions = rec.assertions ?? [];
    const verdict =
      rec.status !== 'ok'
        ? (rec.status ?? 'unknown')
        : assertions.length === 0
          ? 'unknown'
          : assertions.every((a) => a.outcome === 'pass')
            ? 'pass'
            : 'fail';

    runs.push({
      run_id: rec.run_id,
      case_id: rec.case_id,
      suite: rec.suite,
      subject_kind: subject?.kind ?? rec.subject?.kind ?? '',
      subject_name: subject?.name ?? '',
      model: rec.model ?? null,
      cost_usd: rec.cost_usd ?? null,
      num_turns: rec.num_turns ?? null,
      verdict,
      deliverable_status: normalizeDeliverableVerdict(rec.deliverable ?? null),
      started_at: rec.started_at ?? null,
      duration_ms: rec.duration_ms ?? null,
    });
  });

  return { runs, findings };
}

// ---- metrics registry -------------------------------------------------------

/**
 * Validate `evals/metrics.json` (bench-1) and emit its metric entities
 * (bench-2). The registry's closed-vocabulary discipline surfaces here as
 * error-tier `invalid-metric` findings — a registry the kernel cannot validate
 * would silently corrupt every metric the report computes.
 */
export function parseMetricsRegistrySource(
  json: string,
  relPath: string,
): ParseResult {
  const out = emptyParse();
  const res = parseMetricsRegistry(json);
  if (!res.ok) {
    for (const error of res.errors) {
      out.findings.push(
        finding('invalid-metric', `${relPath}: ${error}`, `${relPath}:1`),
      );
    }
    return out;
  }
  for (const m of res.registry.metrics) {
    out.entities.push({
      id: `metric:${m.name}`,
      kind: 'metric',
      title: `${m.name} — ${typeof m.computation === 'string' ? m.computation : 'per-class'}, threshold ${m.thresholds.default}`,
      status: null,
      path: relPath,
      data: {
        applies_to: m.applies_to,
        feeds_from: m.feeds_from,
        computation: m.computation,
        bias: m.bias,
        thresholds: m.thresholds,
      },
    });
  }
  return out;
}

// ---- calibration certificates -----------------------------------------------

/**
 * A certificate is the record that a judgement verifier earned binding force.
 * It `assesses` the verifier it pins, so "what stands behind this gate" is a
 * one-hop query rather than a directory listing.
 */
export function parseCalibration(json: string, relPath: string): ParseResult {
  const out = emptyParse();
  const origin = `${relPath}:1`;
  let cert: {
    verifier?: string;
    stats?: Record<string, unknown>;
    created?: string;
  };
  try {
    cert = JSON.parse(json);
  } catch (err) {
    out.findings.push(
      finding(
        'unresolvable-ref',
        `${relPath}: calibration certificate is not valid JSON (${err instanceof Error ? err.message : String(err)}).`,
        origin,
      ),
    );
    return out;
  }
  if (!cert.verifier) {
    out.findings.push(
      finding(
        'unresolvable-ref',
        `${relPath}: certificate names no verifier; no entity created.`,
        origin,
      ),
    );
    return out;
  }

  const id = `cert:${cert.verifier}`;
  out.entities.push({
    id,
    kind: 'cert',
    title: `calibration certificate for ${cert.verifier}`,
    status: 'graduated',
    path: relPath,
    data: {
      verifier: cert.verifier,
      created: cert.created ?? null,
      stats: cert.stats ?? null,
    },
  });
  out.edges.push({
    src: id,
    rel: 'assesses',
    dst: `agent:${cert.verifier}`,
    tier: 'EXTRACTED',
    origin,
  });
  return out;
}

// ---- inventory --------------------------------------------------------------

/** An agent prompt: `agents/sk-fixer.md` with name/description frontmatter. */
export function parseAgentFile(text: string, relPath: string): ParseResult {
  const out = emptyParse();
  const fm = parseFrontmatter(text);
  const stem = (relPath.split('/').pop() ?? relPath).replace(/\.md$/, '');
  const name = fieldAsScalar(fm, 'name') ?? stem;
  out.entities.push({
    id: `agent:${name}`,
    kind: 'agent',
    title: firstSentence(fieldAsScalar(fm, 'description') ?? name),
    status: null,
    path: relPath,
    data: { tools: fieldAsScalar(fm, 'tools') ?? null },
  });
  return out;
}

/** A skill orchestrator: `skills/sk-design/SKILL.md`. */
export function parseSkillFile(text: string, relPath: string): ParseResult {
  const out = emptyParse();
  const fm = parseFrontmatter(text);
  const dir = relPath.split('/').slice(-2)[0] ?? relPath;
  const name = fieldAsScalar(fm, 'name') ?? dir;
  out.entities.push({
    id: `skill:${name}`,
    kind: 'skill',
    title: firstSentence(fieldAsScalar(fm, 'description') ?? name),
    status: null,
    path: relPath,
  });
  return out;
}

/**
 * A CLI helper: `bin/helpers/scope-check.ts`. Its purpose line is the first
 * sentence of the leading block comment, which is the repo's own convention for
 * saying what a helper is for.
 */
export function parseHelperFile(text: string, relPath: string): ParseResult {
  const out = emptyParse();
  const stem = (relPath.split('/').pop() ?? relPath).replace(/\.ts$/, '');
  out.entities.push({
    id: `helper:${stem}`,
    kind: 'helper',
    title: leadingCommentSummary(text) ?? stem,
    status: null,
    path: relPath,
  });
  return out;
}

function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const stop = /\.\s|\.$/.exec(flat);
  return (stop ? flat.slice(0, stop.index + 1) : flat).slice(0, 200);
}

function leadingCommentSummary(text: string): string | null {
  const block = /^\s*\/\*\*([\s\S]*?)\*\//.exec(text);
  if (!block) return null;
  const body = block[1]
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .filter((l) => l !== '')
    .join(' ');
  return body === '' ? null : firstSentence(body);
}

export type { Entity };
