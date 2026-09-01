/**
 * Deterministic artifact gate (R2 #23/#24) — the structural and cross-reference
 * checks that previously ran as the sk-structural-checker and
 * sk-crossref-checker subagents. Orchestrators run this CLI before dispatching
 * the reasoning quorum; a fail feeds the same capped drafter-feedback loop.
 */

import * as fs from 'node:fs';
import { fieldAsScalar, parseFrontmatter } from './graph-model.js';
import { parsePlanTasks } from './wave-plan.js';

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
