/**
 * ops-3 — `sidekick graph lint`: the checks that keep the corpus honest.
 *
 * Six checks with stable codes. Four are structural properties of the sources
 * (references, taxonomy conformance, required frontmatter, metric-registry
 * validity); two guard the derived surfaces (drift, size cap).
 *
 * Severity is the design point. A broken reference or a drifted generated file
 * is an error — something downstream is now lying. Ambiguity in legacy prose is
 * advisory: it is a known, triaged condition of documents written before the
 * vocabulary existed, and failing the gate on it forever would only teach
 * everyone to ignore the gate.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { collectGraph } from './graph-build.js';
import type { LintCode, LintFinding } from './graph-model.js';

export interface CliResult {
  stdout: string;
  exitCode: number;
}

/** STATE.md's cap. Overflow means unclosed entities, not a formatting problem. */
export const STATE_LINE_CAP = 120;

/** Findings that make something downstream wrong, rather than merely unclear. */
const ERROR_CODES = new Set<LintCode>([
  'unresolvable-ref',
  'undeclared-location',
  'missing-frontmatter',
  'generated-drift',
  'state-size-cap',
  'invalid-metric',
]);

export function isError(finding: LintFinding): boolean {
  return ERROR_CODES.has(finding.code);
}

// ---- taxonomy ---------------------------------------------------------------

/**
 * Folders `docs/README.md` declares. `work/`, `backlog/`, `references/` and
 * `reviews/` are record directories since #30 retired the graph's PM half —
 * their files are kept prose, not lifecycles, so none of them is dissolving.
 */
const DECLARED_DOC_DIRS = [
  'adr',
  'backlog',
  'references',
  'research',
  'reviews',
  'work',
];

export function checkTaxonomy(repoRoot: string): LintFinding[] {
  const docsDir = path.join(repoRoot, 'docs');
  if (!fs.existsSync(docsDir)) return [];
  const findings: LintFinding[] = [];
  for (const entry of fs
    .readdirSync(docsDir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'superpowers') continue; // the declared foreign enclave
    if (DECLARED_DOC_DIRS.includes(entry.name)) continue;
    findings.push({
      code: 'undeclared-location',
      message: `docs/${entry.name}/ is not a folder docs/README.md declares. Every top-level folder is meant to be a distinct retrieval axis — give it a declared meaning and lifecycle, or file its contents on an existing axis.`,
      origin: `docs/${entry.name}`,
    });
  }
  return findings;
}

// ---- generated-file drift ---------------------------------------------------

export interface GeneratedFile {
  /** Repo-relative path of the committed file. */
  path: string;
  /** Regenerated content to compare against. */
  regenerate: () => string;
  /**
   * Optional canonicalizer applied to both sides before comparing. The commit
   * stamp a generated file carries would otherwise guarantee drift on the very
   * next commit, and a check that always fires is a check nobody reads.
   */
  normalize?: (text: string) => string;
}

/**
 * A committed generated file must equal what regenerating produces — the same
 * discipline as the RFC content pins. The check is dormant while the file does
 * not exist yet, so it can ship with the queries and come alive with the
 * generators rather than blocking on them.
 */
export function checkGeneratedDrift(
  repoRoot: string,
  generated: GeneratedFile[],
): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const file of generated) {
    const abs = path.join(repoRoot, file.path);
    if (!fs.existsSync(abs)) continue;
    const committed = fs.readFileSync(abs, 'utf-8');
    const fresh = file.regenerate();
    const normalize = file.normalize ?? ((t: string) => t);
    if (normalize(committed) !== normalize(fresh)) {
      findings.push({
        code: 'generated-drift',
        message: `${file.path} differs from what regenerating produces. It is a derived file committed on purpose; regenerate it so readers and tools see the same graph.`,
        origin: file.path,
      });
    }
  }
  return findings;
}

/**
 * The size cap. The message is the whole point of the check: an oversized
 * STATE.md is a signal that entities are open which should have closed, and
 * trimming prose would hide exactly the thing worth seeing.
 */
export function checkStateSize(
  repoRoot: string,
  statePath: string,
): LintFinding[] {
  const abs = path.join(repoRoot, statePath);
  if (!fs.existsSync(abs)) return [];
  const lines = fs.readFileSync(abs, 'utf-8').split('\n').length;
  if (lines <= STATE_LINE_CAP) return [];
  return [
    {
      code: 'state-size-cap',
      message: `${statePath} is ${lines} lines, over the ${STATE_LINE_CAP}-line cap. This is a signal about unclosed entities, not formatting — close or complete what is still open rather than trimming the file.`,
      origin: statePath,
    },
  ];
}

// ---- the lint run -----------------------------------------------------------

export interface LintOptions {
  repoRoot: string;
  json?: boolean;
  /** Generated surfaces to drift-check; empty until the generators exist. */
  generated?: GeneratedFile[];
  statePath?: string;
}

/**
 * Run every check. Source findings come from a fresh parse rather than the
 * stored graph, so lint reports the tree as it is now — a lint that could pass
 * against a stale database would be worse than no lint.
 */
export function collectLint(opts: LintOptions): LintFinding[] {
  return [
    ...collectSourceLint(opts.repoRoot),
    ...checkGeneratedDrift(opts.repoRoot, opts.generated ?? []),
    ...checkStateSize(opts.repoRoot, opts.statePath ?? 'docs/STATE.md'),
  ].sort(bySeverityThenCode);
}

/**
 * The checks that read only the sources — no derived surfaces.
 *
 * STATE.md reports lint health, and lint drift-checks STATE.md. Reporting the
 * *source* findings breaks that loop: regenerating STATE.md cannot depend on
 * whether STATE.md is currently stale.
 */
export function collectSourceLint(repoRoot: string): LintFinding[] {
  const { findings } = collectGraph(repoRoot);
  return [...findings, ...checkTaxonomy(repoRoot)].sort(bySeverityThenCode);
}

function bySeverityThenCode(a: LintFinding, b: LintFinding): number {
  const ea = isError(a) ? 0 : 1;
  const eb = isError(b) ? 0 : 1;
  if (ea !== eb) return ea - eb;
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  return (a.origin ?? '') < (b.origin ?? '') ? -1 : 1;
}

/** Error/advisory split, the shape STATE.md reports. */
export function lintSummary(findings: LintFinding[]): {
  errors: number;
  advisories: number;
} {
  return {
    errors: findings.filter(isError).length,
    advisories: findings.filter((f) => !isError(f)).length,
  };
}

export function runGraphLint(opts: LintOptions): CliResult {
  const findings = collectLint(opts);
  const errors = findings.filter(isError);
  const advisories = findings.filter((f) => !isError(f));

  if (opts.json === true) {
    return {
      stdout: JSON.stringify(
        {
          errors: errors.length,
          advisories: advisories.length,
          findings,
        },
        null,
        2,
      ),
      exitCode: errors.length > 0 ? 1 : 0,
    };
  }

  const lines: string[] = [];
  if (errors.length > 0) {
    lines.push(`${errors.length} error(s):`);
    for (const f of errors) {
      lines.push(`  [${f.code}] ${f.origin ?? '—'}`, `      ${f.message}`);
    }
    lines.push('');
  }
  if (advisories.length > 0) {
    lines.push(`${advisories.length} advisory finding(s):`);
    for (const f of advisories) {
      lines.push(`  [${f.code}] ${f.origin ?? '—'}`, `      ${f.message}`);
    }
    lines.push('');
  }
  lines.push(
    errors.length === 0
      ? `lint clean (${advisories.length} advisory finding(s) — ambiguity in the sources, not errors).`
      : `lint failed: ${errors.length} error(s), ${advisories.length} advisory.`,
  );
  return {
    stdout: lines.join('\n'),
    exitCode: errors.length > 0 ? 1 : 0,
  };
}
