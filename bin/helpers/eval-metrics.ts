import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EvalCase } from './eval-case.js';
import { type GoalVerdictInput, goalVerdict } from './goal-verdict.js';

/**
 * bench-1 (ADR-0008) metric registry — the metrics vocabulary as data the
 * kernel validates, not prose. `evals/metrics.json` declares the four v1
 * metrics (quality, consistency, adherence, grounding) and the chain-subject
 * class map; this module owns its schema, closed-vocabulary validation
 * (unknown classes/computations/fields are errors — D2's lint discipline), and
 * the label-derivation rule verifier-class quality computes against.
 * `eval report` consumes the registry via computeMetrics in eval-report.ts;
 * graph lint surfaces validation errors as `invalid-metric` findings.
 */

export const SUBJECT_CLASSES = [
  'verifier',
  'producer',
  'executor',
  'orchestrator',
] as const;
export type SubjectClass = (typeof SUBJECT_CLASSES)[number];

/**
 * Deterministic computation semantics `eval report` implements. A metric names
 * one (or one per subject class); the registry cannot reference a computation
 * the kernel does not implement.
 *
 * - `label-match-rate`: over ok runs of labelled cases, the fraction whose
 *   deliverable verdict equals the expected verdict (see expectedVerdict).
 * - `judge-pass-rate`: pass/(pass+fail) over judge assertions feeding the
 *   metric (assertion-level `metric` tags route; untagged feeds quality).
 * - `mechanical-pass-rate`: same over code+structured assertions.
 * - `run-stability`: fraction of cases stable across their k runs — verdict
 *   unanimity when deliverables carry a verdict (consistently-wrong counts as
 *   stable), else all-runs-pass (pass^k folded into the metric frame).
 * - `deliverable-shape-rate`: fraction of runs with a clean invocation and a
 *   parseable ONE-JSON deliverable.
 */
export const COMPUTATIONS = [
  'label-match-rate',
  'judge-pass-rate',
  'mechanical-pass-rate',
  'run-stability',
  'deliverable-shape-rate',
] as const;
export type Computation = (typeof COMPUTATIONS)[number];

export const ASSERTION_TYPES = ['code', 'structured', 'judge'] as const;

/** Untagged assertions feed this metric; tags route everything else. */
export const DEFAULT_METRIC = 'quality';

export interface MetricThresholds {
  default: number;
  per_subject?: Record<string, number>;
}

export interface MetricDef {
  name: string;
  applies_to: SubjectClass[];
  feeds_from: (typeof ASSERTION_TYPES)[number][];
  computation: Computation | Partial<Record<SubjectClass, Computation>>;
  bias: string;
  thresholds: MetricThresholds;
}

export interface MetricsRegistry {
  schemaVersion: 1;
  subjects: Record<string, { class: SubjectClass }>;
  metrics: MetricDef[];
}

export type RegistryParseResult =
  | { ok: true; registry: MetricsRegistry }
  | { ok: false; errors: string[] };

const SUBJECT_ID_RE = /^(agent|skill):[a-z][a-z0-9-]*$/;
const METRIC_NAME_RE = /^[a-z][a-z0-9-]*$/;
const REGISTRY_FIELDS = new Set(['schemaVersion', 'subjects', 'metrics']);
const METRIC_FIELDS = new Set([
  'name',
  'applies_to',
  'feeds_from',
  'computation',
  'bias',
  'thresholds',
]);
const THRESHOLD_FIELDS = new Set(['default', 'per_subject']);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function inUnitInterval(v: unknown): v is number {
  return typeof v === 'number' && v >= 0 && v <= 1;
}

/** Collect every validation error; a registry with one typo usually has two. */
export function parseMetricsRegistry(json: string): RegistryParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    return {
      ok: false,
      errors: [
        `registry is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
  if (!isRecord(raw)) {
    return { ok: false, errors: ['registry root must be an object'] };
  }

  const errors: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!REGISTRY_FIELDS.has(key)) {
      errors.push(`unknown top-level field "${key}"`);
    }
  }
  if (raw.schemaVersion !== 1) {
    errors.push('"schemaVersion" must be 1');
  }

  // Subjects.
  const subjects: Record<string, { class: SubjectClass }> = {};
  if (!isRecord(raw.subjects)) {
    errors.push('"subjects" must be an object mapping subject ids to classes');
  } else {
    for (const [id, val] of Object.entries(raw.subjects)) {
      if (!SUBJECT_ID_RE.test(id)) {
        errors.push(
          `subjects["${id}"]: id must match agent:<name> or skill:<name>`,
        );
        continue;
      }
      if (!isRecord(val)) {
        errors.push(`subjects["${id}"]: must be an object`);
        continue;
      }
      for (const key of Object.keys(val)) {
        if (key !== 'class') {
          errors.push(`subjects["${id}"]: unknown field "${key}"`);
        }
      }
      if (!SUBJECT_CLASSES.includes(val.class as SubjectClass)) {
        errors.push(
          `subjects["${id}"]: class "${String(val.class)}" is not one of ${SUBJECT_CLASSES.join(' | ')}`,
        );
        continue;
      }
      subjects[id] = { class: val.class as SubjectClass };
    }
  }

  // Metrics.
  const metrics: MetricDef[] = [];
  const seenNames = new Set<string>();
  if (!Array.isArray(raw.metrics) || raw.metrics.length === 0) {
    errors.push('"metrics" must be a non-empty array');
  } else {
    raw.metrics.forEach((entry, i) => {
      const label = `metrics[${i}]`;
      if (!isRecord(entry)) {
        errors.push(`${label}: must be an object`);
        return;
      }
      for (const key of Object.keys(entry)) {
        if (!METRIC_FIELDS.has(key)) {
          errors.push(`${label}: unknown field "${key}"`);
        }
      }

      const name = entry.name;
      if (typeof name !== 'string' || !METRIC_NAME_RE.test(name)) {
        errors.push(`${label}: "name" must be a kebab-case string`);
      } else if (seenNames.has(name)) {
        errors.push(`${label}: duplicate metric name "${name}"`);
      } else {
        seenNames.add(name);
      }

      const appliesTo: SubjectClass[] = [];
      if (!Array.isArray(entry.applies_to) || entry.applies_to.length === 0) {
        errors.push(`${label}: "applies_to" must be a non-empty array`);
      } else {
        for (const c of entry.applies_to) {
          if (!SUBJECT_CLASSES.includes(c as SubjectClass)) {
            errors.push(
              `${label}: applies_to "${String(c)}" is not one of ${SUBJECT_CLASSES.join(' | ')}`,
            );
          } else {
            appliesTo.push(c as SubjectClass);
          }
        }
      }

      const feedsFrom: MetricDef['feeds_from'] = [];
      if (!Array.isArray(entry.feeds_from) || entry.feeds_from.length === 0) {
        errors.push(`${label}: "feeds_from" must be a non-empty array`);
      } else {
        for (const t of entry.feeds_from) {
          if (
            !ASSERTION_TYPES.includes(t as (typeof ASSERTION_TYPES)[number])
          ) {
            errors.push(
              `${label}: feeds_from "${String(t)}" is not one of ${ASSERTION_TYPES.join(' | ')}`,
            );
          } else {
            feedsFrom.push(t as (typeof ASSERTION_TYPES)[number]);
          }
        }
      }

      let computation: MetricDef['computation'] | null = null;
      if (typeof entry.computation === 'string') {
        if (!COMPUTATIONS.includes(entry.computation as Computation)) {
          errors.push(
            `${label}: computation "${entry.computation}" is not one of ${COMPUTATIONS.join(' | ')}`,
          );
        } else {
          computation = entry.computation as Computation;
        }
      } else if (isRecord(entry.computation)) {
        const map: Partial<Record<SubjectClass, Computation>> = {};
        for (const [cls, comp] of Object.entries(entry.computation)) {
          if (!SUBJECT_CLASSES.includes(cls as SubjectClass)) {
            errors.push(
              `${label}: computation keyed by unknown class "${cls}"`,
            );
            continue;
          }
          if (!COMPUTATIONS.includes(comp as Computation)) {
            errors.push(
              `${label}: computation "${String(comp)}" is not one of ${COMPUTATIONS.join(' | ')}`,
            );
            continue;
          }
          map[cls as SubjectClass] = comp as Computation;
        }
        for (const cls of appliesTo) {
          if (map[cls] === undefined) {
            errors.push(
              `${label}: per-class computation covers no "${cls}" entry, but applies_to includes it`,
            );
          }
        }
        computation = map;
      } else {
        errors.push(
          `${label}: "computation" must be a computation name or a per-class map`,
        );
      }

      if (typeof entry.bias !== 'string' || entry.bias.trim() === '') {
        errors.push(
          `${label}: "bias" is required and must be a non-empty string — acknowledgment is schema, not footnote`,
        );
      }

      let thresholds: MetricThresholds | null = null;
      if (!isRecord(entry.thresholds)) {
        errors.push(`${label}: "thresholds" must be an object`);
      } else {
        for (const key of Object.keys(entry.thresholds)) {
          if (!THRESHOLD_FIELDS.has(key)) {
            errors.push(`${label}: thresholds unknown field "${key}"`);
          }
        }
        if (!inUnitInterval(entry.thresholds.default)) {
          errors.push(`${label}: thresholds.default must be a number in [0,1]`);
        } else {
          thresholds = { default: entry.thresholds.default };
          if (entry.thresholds.per_subject !== undefined) {
            if (!isRecord(entry.thresholds.per_subject)) {
              errors.push(`${label}: thresholds.per_subject must be an object`);
            } else {
              const perSubject: Record<string, number> = {};
              for (const [id, v] of Object.entries(
                entry.thresholds.per_subject,
              )) {
                if (isRecord(raw.subjects) && raw.subjects[id] === undefined) {
                  errors.push(
                    `${label}: thresholds.per_subject names "${id}", which is not in subjects`,
                  );
                  continue;
                }
                if (!inUnitInterval(v)) {
                  errors.push(
                    `${label}: thresholds.per_subject["${id}"] must be a number in [0,1]`,
                  );
                  continue;
                }
                perSubject[id] = v;
              }
              thresholds.per_subject = perSubject;
            }
          }
        }
      }

      if (
        typeof name === 'string' &&
        computation !== null &&
        thresholds !== null &&
        typeof entry.bias === 'string' &&
        entry.bias.trim() !== ''
      ) {
        metrics.push({
          name,
          applies_to: appliesTo,
          feeds_from: feedsFrom,
          computation,
          bias: entry.bias,
          thresholds,
        });
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, registry: { schemaVersion: 1, subjects, metrics } };
}

export const REGISTRY_RELPATH = path.join('evals', 'metrics.json');

export type RegistryLoadResult =
  | { status: 'ok'; registry: MetricsRegistry; path: string }
  | { status: 'invalid'; errors: string[]; path: string }
  | { status: 'absent'; path: string };

export function loadMetricsRegistry(repoRoot: string): RegistryLoadResult {
  const abs = path.join(repoRoot, REGISTRY_RELPATH);
  if (!fs.existsSync(abs)) return { status: 'absent', path: REGISTRY_RELPATH };
  const res = parseMetricsRegistry(fs.readFileSync(abs, 'utf-8'));
  if (!res.ok) {
    return { status: 'invalid', errors: res.errors, path: REGISTRY_RELPATH };
  }
  return { status: 'ok', registry: res.registry, path: REGISTRY_RELPATH };
}

/**
 * The classifier verdict a deliverable encodes, normalized across the
 * verifier-class deliverable shapes: an explicit `verdict` string wins; a
 * dimensional reviewer's `status` maps passed→pass / findings→fail; a
 * goal-verifier deliverable (has `goals[]`) resolves through the shared
 * goal-verdict rule (never restated) — passed→pass, gaps_found→fail,
 * inconclusive stays 'inconclusive' (a stable string that matches no label).
 * Lives here so eval-report and the graph parsers share ONE implementation.
 */
export function normalizeDeliverableVerdict(
  deliverable: unknown,
): string | null {
  if (deliverable === null || typeof deliverable !== 'object') return null;
  const d = deliverable as Record<string, unknown>;
  if (typeof d.verdict === 'string') return d.verdict;
  if (d.status === 'passed') return 'pass';
  if (d.status === 'findings') return 'fail';
  if (Array.isArray(d.goals)) {
    try {
      const overall = goalVerdict(d as unknown as GoalVerdictInput).overall;
      if (overall === 'passed') return 'pass';
      if (overall === 'gaps_found') return 'fail';
      return 'inconclusive';
    } catch {
      return null; // malformed goals — not classifiable
    }
  }
  return null;
}

/**
 * The expected verdict a labelled case encodes. An explicit `label` wins; a
 * `verdict equals pass|fail` structured assertion is the same information in
 * assertion form (the pre-registry corpora encode labels exactly this way), so
 * label-match-rate reads it as the label rather than leaving those cases
 * unmeasured.
 */
export function expectedVerdict(evalCase: EvalCase): 'pass' | 'fail' | null {
  if (evalCase.label !== undefined) return evalCase.label.expected_verdict;
  for (const a of evalCase.assertions) {
    if (
      a.type === 'structured' &&
      a.path === 'verdict' &&
      a.op === 'equals' &&
      (a.value === 'pass' || a.value === 'fail')
    ) {
      return a.value;
    }
  }
  return null;
}
