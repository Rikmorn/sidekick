/**
 * The worker brief: a Markdown file whose frontmatter is flat `key: value`
 * lines. The CLI parses it itself, since Valibot is its one runtime
 * dependency and no YAML parser ships. The body is for the worker, except its
 * `## Limits` section, which `dispatch` checks and the subagent start hook
 * hands to every subagent but `web-fetch`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import type { Runner } from './pm-data.js';
import { checkoutOf, physical } from './worker-repo.js';

const FENCE = '---';
const KEY_LINE = /^([a-z]+):(?: (.*))?$/;

/** Splits the frontmatter into its fields, or names what is malformed. */
export function parseFrontmatter(
  text: string,
): { fields: Record<string, string> } | { issues: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
  if (lines[0] !== FENCE) {
    return { issues: ['the brief must open with a --- line'] };
  }
  const end = lines.indexOf(FENCE, 1);
  if (end === -1) {
    return { issues: ["the brief's frontmatter has no closing --- line"] };
  }
  const fields: Record<string, string> = {};
  const issues: string[] = [];
  for (const [i, line] of lines.slice(1, end).entries()) {
    if (line === '') continue;
    const match = KEY_LINE.exec(line);
    const key = match?.[1];
    if (key === undefined) {
      issues.push(
        `line ${i + 2}: "${line}" is not "key: value" with a lower-case key`,
      );
    } else if (Object.hasOwn(fields, key)) {
      issues.push(`line ${i + 2}: the key "${key}" is repeated`);
    } else {
      fields[key] = (match?.[2] ?? '').trim();
    }
  }
  return issues.length > 0 ? { issues } : { fields };
}

const AbsolutePath = v.pipe(
  v.string(),
  v.check((s) => path.isAbsolute(s), 'must be an absolute path'),
);
const RelativePath = v.pipe(
  v.string(),
  v.minLength(1, 'must not be empty'),
  v.check((s) => !path.isAbsolute(s), 'must be relative to the repo top'),
  v.check(
    (s) => !s.split(/[\\/]/).includes('..'),
    'must not have a ".." segment',
  ),
);

const WORKER_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const WORKSTREAM = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * A worker's name, the one rule for the brief and the worker record. It names
 * the session and the record's file. Claude Code's own creation names the
 * worktree folder and the branch from it, so it cannot reach outside them.
 */
export const WorkerNameSchema = v.pipe(
  v.string(),
  v.regex(WORKER_NAME, `must match ${WORKER_NAME.source}`),
);

/**
 * A unit id, the one rule for the loop record and the attempt's folder. The
 * charset allows `.` and `..`, which name folders, so a caller that builds a
 * path from an id refuses those two as well.
 */
export const UnitIdSchema = v.pipe(
  v.string(),
  v.regex(/^[A-Za-z0-9._-]{1,64}$/, 'must be 1 to 64 of A-Z a-z 0-9 . _ -'),
);

const BASELINE = v.pipe(
  v.string(),
  v.regex(/^[0-9a-f]{7,40}$/, 'must be a commit of 7 to 40 hex characters'),
);

/** A plan brief: a plan's worker, which the brief's own fields name. */
export const PlanBriefSchema = v.strictObject({
  kind: v.literal('plan'),
  name: WorkerNameSchema,
  plan: AbsolutePath,
  spec: AbsolutePath,
  rulings: AbsolutePath,
  baseline: BASELINE,
  skill: v.picklist(['subagent-driven-development', 'executing-plans']),
  place: v.union(
    [
      v.literal('worktree'),
      v.literal('in-place'),
      v.pipe(v.string(), v.regex(/^branch \S+$/)),
    ],
    'must be "worktree", "in-place", or "branch <name>"',
  ),
  target: v.optional(
    v.pipe(
      v.string(),
      v.regex(/^\S+$/, 'must be a non-empty branch name with no whitespace'),
    ),
  ),
  workstream: v.optional(
    v.pipe(v.string(), v.regex(WORKSTREAM, `must match ${WORKSTREAM.source}`)),
  ),
  setup: v.optional(v.pipe(v.string(), v.minLength(1))),
  report: RelativePath,
  orchestrator: v.pipe(v.string(), v.minLength(1, 'must not be empty')),
});

// One part of a unit's `<plugin>:<skill>`. A unit id is `<skill part>-<issue>`
// and must fit 64 characters of `[A-Za-z0-9._-]`, so the part stays inside
// that charset and at most SKILL_PART_MAX characters.
const SKILL_PART_MAX = 48;
const SKILL_PART = new RegExp(`^[a-z0-9][a-z0-9-]{0,${SKILL_PART_MAX - 1}}$`);
const UNIT_SKILL_MESSAGE = `must be <plugin>:<skill>, each part of lower-case letters, digits, and hyphens, starting with a letter or digit, at most ${SKILL_PART_MAX} characters`;

/** A unit brief: a loop's worker, which runs one unit's skill. */
export const UnitBriefSchema = v.strictObject({
  kind: v.literal('unit'),
  name: WorkerNameSchema,
  unit: AbsolutePath,
  rulings: AbsolutePath,
  baseline: BASELINE,
  skill: v.pipe(
    v.string(),
    v.check((s) => {
      const parts = s.split(':');
      return parts.length === 2 && parts.every((p) => SKILL_PART.test(p));
    }, UNIT_SKILL_MESSAGE),
  ),
  place: v.literal('worktree', 'must be "worktree"'),
  report: RelativePath,
  orchestrator: v.pipe(v.string(), v.minLength(1, 'must not be empty')),
});

/** The worker brief, discriminated on `kind`; a brief without `kind` is a plan brief. */
export const BriefSchema = v.variant('kind', [
  PlanBriefSchema,
  UnitBriefSchema,
]);

export type PlanBrief = v.InferOutput<typeof PlanBriefSchema>;
export type UnitBrief = v.InferOutput<typeof UnitBriefSchema>;
export type Brief = PlanBrief | UnitBrief;

/** Reads and validates a brief. Every issue names the brief's path. */
export function readBrief(
  file: string,
): { brief: Brief; path: string } | { issues: string[] } {
  const abs = path.resolve(file);
  let text: string;
  try {
    text = fs.readFileSync(abs, 'utf-8');
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return { issues: [`${abs}: cannot read the brief: ${why}`] };
  }
  const parsed = parseFrontmatter(text);
  if ('issues' in parsed) {
    return { issues: parsed.issues.map((i) => `${abs}: ${i}`) };
  }
  // A brief written before units has no `kind`, and is a plan brief.
  const result = v.safeParse(BriefSchema, { kind: 'plan', ...parsed.fields });
  if (!result.success) {
    return {
      issues: result.issues.map((issue) => {
        const field = issue.path?.map((p) => String(p.key)).join('.');
        return field
          ? `${abs}: field "${field}" ${issue.message}`
          : `${abs}: ${issue.message}`;
      }),
    };
  }
  return { brief: result.output, path: abs };
}

/** What `briefFileIssues` reads: the brief's path, and the checkouts its paths may sit in. */
export interface BriefBounds {
  briefPath: string;
  launchTop: string;
  mainTop: string;
  runGit: Runner;
}

interface Allowed {
  label: string;
  top: string;
}

// A path sits in `allowed` when git's checkout for its folder is one of them.
// A folder that does not exist gets no check: its existence issue stands alone.
function checkoutIssue(
  runGit: Runner,
  field: string,
  file: string,
  allowed: Allowed[],
): string[] {
  const folder = path.dirname(file);
  if (!fs.existsSync(folder)) return [];
  const found = checkoutOf(runGit, folder);
  const held = 'top' in found ? physical(found.top) : undefined;
  if (held !== undefined && allowed.some((a) => physical(a.top) === held)) {
    return [];
  }
  const where = allowed.map((a) => `the ${a.label} ${a.top}`).join(' or ');
  const is =
    held === undefined ? 'in no git checkout' : `in the checkout ${held}`;
  return [`${field}: ${file} is ${is}; it must be in ${where}`];
}

/**
 * Checks the brief's paths against the tree. The brief and the rulings' folder
 * sit in the launching checkout; the plan and the spec sit in it or in the main
 * checkout. Each is judged by the checkout git says holds it, never by prefix.
 */
export function briefFileIssues(
  brief: PlanBrief,
  bounds: BriefBounds,
): string[] {
  const { briefPath, launchTop, mainTop, runGit } = bounds;
  const issues: string[] = [];
  if (!fs.existsSync(brief.plan)) {
    issues.push(`plan: ${brief.plan} does not exist`);
  }
  if (!fs.existsSync(brief.spec)) {
    issues.push(`spec: ${brief.spec} does not exist`);
  }
  const rulingsDir = path.dirname(brief.rulings);
  if (!fs.existsSync(rulingsDir)) {
    issues.push(`rulings: the folder ${rulingsDir} does not exist`);
  }
  const launching: Allowed = { label: 'launching checkout', top: launchTop };
  const either: Allowed[] =
    physical(launchTop) === physical(mainTop)
      ? [launching]
      : [launching, { label: 'main checkout', top: mainTop }];
  const named: [string, string, Allowed[]][] = [
    ['brief', briefPath, [launching]],
    ['plan', brief.plan, either],
    ['spec', brief.spec, either],
    ['rulings', brief.rulings, [launching]],
  ];
  for (const [field, file, allowed] of named) {
    issues.push(...checkoutIssue(runGit, field, file, allowed));
  }
  return issues;
}

const UNITS_FOLDER = 'units';

// The folder a file really sits in: its own last segment is resolved too, so a
// symlinked file reads as the folder its target is in. A file not yet made
// resolves through its nearest existing folder.
const realFolderOf = (file: string): string => path.dirname(physical(file));

/**
 * Checks a unit brief's files by real path. The brief, the unit file, and the
 * rulings sit in one folder, `units/<unit>/<worker>/` under a loop's folder.
 * The unit file must exist, and so must the rulings' folder.
 */
export function unitBriefFileIssues(
  brief: UnitBrief,
  briefPath: string,
): string[] {
  const issues: string[] = [];
  if (!fs.existsSync(brief.unit)) {
    issues.push(`unit: ${brief.unit} does not exist`);
  }
  const rulingsDir = path.dirname(brief.rulings);
  if (!fs.existsSync(rulingsDir)) {
    issues.push(`rulings: the folder ${rulingsDir} does not exist`);
  }
  const home = realFolderOf(briefPath);
  const others: [string, string][] = [
    ['unit', brief.unit],
    ['rulings', brief.rulings],
  ];
  for (const [field, file] of others) {
    const folder = realFolderOf(file);
    if (folder !== home) {
      issues.push(
        `${field}: ${file} is not in the folder ${home} that holds the brief; the brief, the unit file, and the rulings share one folder`,
      );
    }
  }
  const unitId = path.basename(path.dirname(home));
  const shape =
    path.basename(home) === brief.name &&
    path.basename(path.dirname(path.dirname(home))) === UNITS_FOLDER &&
    unitId !== '.' &&
    unitId !== '..' &&
    v.is(UnitIdSchema, unitId);
  if (!shape) {
    issues.push(
      `brief: ${home} must be <loop folder>/${UNITS_FOLDER}/<unit>/${brief.name}, with a unit id of 1 to 64 of A-Z a-z 0-9 . _ -`,
    );
  }
  return issues;
}

/** The branch a plan brief names to land in; a unit brief names none. */
export const briefTargetOf = (brief: Brief): string | undefined =>
  brief.kind === 'plan' ? brief.target : undefined;

/** The workstream a plan brief names; a unit brief names none. */
export const briefWorkstreamOf = (brief: Brief): string | undefined =>
  brief.kind === 'plan' ? brief.workstream : undefined;
