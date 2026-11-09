/**
 * The worker brief: a Markdown file whose frontmatter is flat `key: value`
 * lines. The CLI parses it itself, since Valibot is its one runtime
 * dependency and no YAML parser ships. The body is for the worker, except its
 * `## Limits` section, which `dispatch` checks and the subagent start hook
 * hands to every subagent.
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

export const BriefSchema = v.strictObject({
  name: WorkerNameSchema,
  plan: AbsolutePath,
  spec: AbsolutePath,
  rulings: AbsolutePath,
  baseline: v.pipe(
    v.string(),
    v.regex(/^[0-9a-f]{7,40}$/, 'must be a commit of 7 to 40 hex characters'),
  ),
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

export type Brief = v.InferOutput<typeof BriefSchema>;

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
  const result = v.safeParse(BriefSchema, parsed.fields);
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
export function briefFileIssues(brief: Brief, bounds: BriefBounds): string[] {
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
