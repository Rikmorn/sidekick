/**
 * The worker brief: a Markdown file whose frontmatter is flat `key: value`
 * lines. The CLI parses it itself, since Valibot is its one runtime
 * dependency and no YAML parser ships. The body is for the worker; nothing
 * here reads it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';

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

export const BriefSchema = v.strictObject({
  name: v.pipe(
    v.string(),
    v.regex(
      /^[a-z0-9][a-z0-9-]{0,39}$/,
      'must match ^[a-z0-9][a-z0-9-]{0,39}$',
    ),
  ),
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

// Resolves symlinks through the nearest existing ancestor, so a path not yet made still compares physically.
function physical(p: string): string {
  const abs = path.resolve(p);
  const rest: string[] = [];
  let dir = abs;
  for (;;) {
    try {
      return path.join(fs.realpathSync(dir), ...rest);
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) return abs;
      rest.unshift(path.basename(dir));
      dir = parent;
    }
  }
}

// A top-level entry may be named `..docs`, so only a whole `..` segment leaves top.
const isInside = (top: string, p: string): boolean => {
  const rel = path.relative(top, p);
  const leaves = rel === '..' || rel.startsWith(`..${path.sep}`);
  return rel !== '' && !leaves && !path.isAbsolute(rel);
};

/** Checks the brief's paths against the tree. `top` is the main checkout's top. */
export function briefFileIssues(brief: Brief, top: string): string[] {
  const issues: string[] = [];
  const realTop = physical(top);
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
  const named: [string, string][] = [
    ['plan', brief.plan],
    ['spec', brief.spec],
    ['rulings', brief.rulings],
  ];
  for (const [field, file] of named) {
    if (!isInside(realTop, physical(file))) {
      issues.push(`${field}: ${file} is outside ${top}`);
    }
  }
  return issues;
}
