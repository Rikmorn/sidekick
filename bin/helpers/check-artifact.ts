/**
 * Deterministic artifact gate (R2 #23/#24) — the structural and cross-reference
 * checks that previously ran as the sk-structural-checker and
 * sk-crossref-checker subagents. Orchestrators run this CLI before dispatching
 * the reasoning quorum; a fail feeds the same capped drafter-feedback loop.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractPinHash } from './check-drift.js';
import { fieldAsScalar, parseFrontmatter } from './graph-model.js';
import { hashRfcContent } from './hash-rfc.js';
import { computeWaves, parsePlanTasks, WavePlanError } from './wave-plan.js';

type Frontmatter = ReturnType<typeof parseFrontmatter>;

export const ARTIFACT_TYPES = ['rfc', 'plan', 'decision'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export function isArtifactType(v: string | undefined): v is ArtifactType {
  return v !== undefined && (ARTIFACT_TYPES as readonly string[]).includes(v);
}

export interface StructuralIssue {
  dimension: 'structural';
  field: string;
  issue: string;
}

export type CrossrefIssue =
  | {
      dimension: 'crossref';
      kind: 'dangling_goal' | 'dangling_decision';
      ref: string;
      detail: string;
    }
  | {
      dimension: 'crossref';
      kind: 'pins_rfc_drift';
      expected: string;
      actual: string;
    }
  | {
      dimension: 'crossref';
      kind: 'missing_source_rfc';
      path: string;
      detail: string;
    }
  | {
      dimension: 'crossref';
      kind: 'dep_cycle' | 'dangling_task_ref' | 'no_task_blocks';
      detail: string;
    };

export type CheckArtifactIssue = StructuralIssue | CrossrefIssue;

export interface CheckArtifactInput {
  repoRoot: string;
  artifactPath: string;
  artifactType: ArtifactType;
  /** Override for the RFC a plan is checked against; defaults to RFC.md beside the plan. */
  rfcPath?: string;
}

export type CheckArtifactResult =
  | { verdict: 'pass'; artifact_path: string; artifact_type: ArtifactType }
  | {
      verdict: 'fail';
      artifact_path: string;
      artifact_type: ArtifactType;
      issues: CheckArtifactIssue[];
    }
  | { error: 'missing_artifact' | 'missing_rfc'; detail: string };

const PLACEHOLDER = /^(TBD|TODO|\?\?\?|—)\s*$/i;
const PIN_PATTERN = /^[a-f0-9]{16,128}$/;
const CHECKLIST_ROW = /^- \[[ xX]\]\s+(T-\d{2,})\s+\S/;
const H2 = /^##\s+(.+?)\s*$/;

/** Required shape per artifact type — the schema the retired checker prompts carried. */
const SCHEMAS: Record<
  ArtifactType,
  { frontmatter: string[]; sections: string[] }
> = {
  rfc: {
    frontmatter: ['slug', 'created', 'status'],
    sections: [
      'Goals & non-goals',
      'Architecture',
      'Decisions',
      'Questions',
      'Risks',
    ],
  },
  plan: {
    frontmatter: ['slug', 'pins-rfc', 'created'],
    sections: ['Checklist', 'Tasks'],
  },
  decision: {
    frontmatter: ['status', 'date'],
    sections: ['Context', 'Decision', 'Drivers', 'Consequences'],
  },
};

interface Section {
  name: string;
  body: string[];
}

function splitSections(bodyLines: string[]): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const line of bodyLines) {
    const h = line.match(H2);
    if (h) {
      current = { name: h[1], body: [] };
      sections.push(current);
      continue;
    }
    if (current) current.body.push(line);
  }
  return sections;
}

function checkFrontmatter(
  fm: Frontmatter,
  type: ArtifactType,
): StructuralIssue[] {
  const issues: StructuralIssue[] = [];
  for (const key of SCHEMAS[type].frontmatter) {
    if (fieldAsScalar(fm, key) === null) {
      issues.push({
        dimension: 'structural',
        field: `frontmatter.${key}`,
        issue: 'missing',
      });
    }
  }
  const pin = fieldAsScalar(fm, 'pins-rfc');
  if (type === 'plan' && pin !== null && !PIN_PATTERN.test(pin)) {
    issues.push({
      dimension: 'structural',
      field: 'frontmatter.pins-rfc',
      issue: 'malformed (does not match hash pattern)',
    });
  }
  return issues;
}

function checkSections(
  sections: Section[],
  type: ArtifactType,
): StructuralIssue[] {
  const issues: StructuralIssue[] = [];
  const required = SCHEMAS[type].sections;
  const positions = required.map((name) =>
    sections.findIndex((s) => s.name === name),
  );

  required.forEach((name, i) => {
    if (positions[i] === -1) {
      issues.push({
        dimension: 'structural',
        field: `section.## ${name}`,
        issue: 'missing',
      });
    }
  });

  // Relative order of the required sections; extra sections are permitted.
  const present = positions.filter((p) => p !== -1);
  const inOrder = present.every((p, i) => i === 0 || p > present[i - 1]);
  if (!inOrder) {
    issues.push({
      dimension: 'structural',
      field: 'sections',
      issue: `required sections out of order (expected: ${required.join(', ')})`,
    });
  }

  if (type === 'rfc' || type === 'decision') {
    for (const name of required) {
      const section = sections.find((s) => s.name === name);
      if (!section) continue;
      const nonWs = section.body.filter((l) => l.trim() !== '');
      if (nonWs.length === 0) {
        issues.push({
          dimension: 'structural',
          field: `section.## ${name}`,
          issue: 'empty body',
        });
      } else if (nonWs.every((l) => PLACEHOLDER.test(l.trim()))) {
        issues.push({
          dimension: 'structural',
          field: `section.## ${name}`,
          issue: 'empty body (placeholder)',
        });
      }
    }
  }
  return issues;
}

function checkPlanChecklist(
  sections: Section[],
  content: string,
): StructuralIssue[] {
  const issues: StructuralIssue[] = [];
  const checklist = sections.find((s) => s.name === 'Checklist');
  const checklistIds = (checklist?.body ?? [])
    .map((l) => l.match(CHECKLIST_ROW)?.[1])
    .filter((id): id is string => id !== undefined);
  if (checklist && checklistIds.length === 0) {
    issues.push({
      dimension: 'structural',
      field: 'section.## Checklist',
      issue: 'no `- [ ] T-NN <description>` checklist rows',
    });
  }
  const taskIds = new Set(parsePlanTasks(content).map((t) => t.id));
  for (const id of checklistIds) {
    if (!taskIds.has(id)) {
      issues.push({
        dimension: 'structural',
        field: 'section.## Tasks',
        issue: `no task block for ${id}`,
      });
    }
  }
  return issues;
}

const GOAL_REF = /\bg\d+\b/g;
const DECISION_REF = /\bD-\d{2,}\b/g;
const MD_LINK_RFC = /\]\(([^)\s]*RFC\.md)\)/;
const TASKS_HEADING = /^##\s+Tasks\s*$/m;

function extractRefs(text: string, pattern: RegExp): Set<string> {
  return new Set(text.match(pattern) ?? []);
}

function sectionBody(sections: Section[], name: string): string {
  return (sections.find((s) => s.name === name)?.body ?? []).join('\n');
}

function checkPlanCrossref(
  planContent: string,
  rfcContent: string,
): CrossrefIssue[] {
  const issues: CrossrefIssue[] = [];
  const rfcSections = splitSections(
    parseFrontmatter(rfcContent).body.split('\n'),
  );
  const definedGoals = extractRefs(
    sectionBody(rfcSections, 'Goals & non-goals'),
    GOAL_REF,
  );
  const definedDecisions = extractRefs(
    sectionBody(rfcSections, 'Decisions'),
    DECISION_REF,
  );

  const planBody = parseFrontmatter(planContent).body;
  for (const ref of extractRefs(planBody, GOAL_REF)) {
    if (!definedGoals.has(ref)) {
      issues.push({
        dimension: 'crossref',
        kind: 'dangling_goal',
        ref,
        detail: 'Not defined in RFC.md ## Goals & non-goals',
      });
    }
  }
  for (const ref of extractRefs(planBody, DECISION_REF)) {
    if (!definedDecisions.has(ref)) {
      issues.push({
        dimension: 'crossref',
        kind: 'dangling_decision',
        ref,
        detail: 'Not defined in RFC.md ## Decisions',
      });
    }
  }

  // Pin drift. A missing/malformed pin is already a structural issue, so the
  // extractor returning null skips the comparison rather than double-reporting.
  const pin = extractPinHash(planContent);
  if (pin !== null) {
    const actual = hashRfcContent(rfcContent);
    if (pin !== actual) {
      issues.push({
        dimension: 'crossref',
        kind: 'pins_rfc_drift',
        expected: pin,
        actual,
      });
    }
  }

  // Dep graph — wave-plan's parser and topology are the single source of truth.
  const tasks = parsePlanTasks(planContent);
  if (TASKS_HEADING.test(planContent) && tasks.length === 0) {
    issues.push({
      dimension: 'crossref',
      kind: 'no_task_blocks',
      detail: 'PLAN.md has no ### T-NN task blocks under ## Tasks',
    });
  } else if (tasks.length > 0) {
    try {
      computeWaves(tasks);
    } catch (err) {
      if (!(err instanceof WavePlanError)) throw err;
      issues.push({
        dimension: 'crossref',
        kind: err.kind === 'dep_cycle' ? 'dep_cycle' : 'dangling_task_ref',
        detail: err.message,
      });
    }
  }
  return issues;
}

function checkDecisionCrossref(
  content: string,
  fm: Frontmatter,
  artifactPath: string,
  repoRoot: string,
): CrossrefIssue[] {
  const ref =
    fieldAsScalar(fm, 'source-rfc') ?? content.match(MD_LINK_RFC)?.[1] ?? null;
  if (ref === null) return [];
  const candidates = path.isAbsolute(ref)
    ? [ref]
    : [
        path.resolve(path.dirname(artifactPath), ref),
        path.resolve(repoRoot, ref),
      ];
  if (candidates.some((p) => fs.existsSync(p))) return [];
  return [
    {
      dimension: 'crossref',
      kind: 'missing_source_rfc',
      path: ref,
      detail: 'Referenced RFC does not exist',
    },
  ];
}

export function runCheckArtifact(
  input: CheckArtifactInput,
): CheckArtifactResult {
  const { artifactPath, artifactType } = input;
  if (!fs.existsSync(artifactPath)) {
    return { error: 'missing_artifact', detail: `no file at ${artifactPath}` };
  }
  const content = fs.readFileSync(artifactPath, 'utf-8');
  const fm = parseFrontmatter(content);
  const sections = splitSections(fm.body.split('\n'));

  const issues: CheckArtifactIssue[] = [
    ...checkFrontmatter(fm, artifactType),
    ...checkSections(sections, artifactType),
  ];
  if (artifactType === 'plan') {
    issues.push(...checkPlanChecklist(sections, content));
  }

  if (artifactType === 'plan') {
    const rfcPath =
      input.rfcPath ?? path.join(path.dirname(artifactPath), 'RFC.md');
    if (!fs.existsSync(rfcPath)) {
      return { error: 'missing_rfc', detail: `RFC not found at ${rfcPath}` };
    }
    issues.push(
      ...checkPlanCrossref(content, fs.readFileSync(rfcPath, 'utf-8')),
    );
  } else if (artifactType === 'decision') {
    issues.push(
      ...checkDecisionCrossref(content, fm, artifactPath, input.repoRoot),
    );
  }

  return issues.length === 0
    ? {
        verdict: 'pass',
        artifact_path: artifactPath,
        artifact_type: artifactType,
      }
    : {
        verdict: 'fail',
        artifact_path: artifactPath,
        artifact_type: artifactType,
        issues,
      };
}

export function runCheckArtifactCli(input: CheckArtifactInput): string {
  return JSON.stringify(runCheckArtifact(input), null, 2);
}
