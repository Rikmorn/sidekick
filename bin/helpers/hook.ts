/**
 * `sidekick hook post-skill` and `sidekick hook post-read`: the context
 * sidekick's PostToolUse hooks add when a skill it extends loads, or when a
 * superpowers review package is read. Every other input prints nothing and
 * returns 0, because a hook never blocks or fails the call it watches
 * (ADR-0010, ADR-0011).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export const HOOK_USAGE_LINE =
  'sidekick hook post-skill|post-read   (reads the hook event on stdin)';

export interface HookEnv {
  /** Reads the hook event; called only once the verb is known. */
  readStdin: () => string;
  pluginDir: string;
}

interface SkillHookInput {
  tool_input: { skill: string };
}

interface ReadHookInput {
  tool_name: 'Read';
  tool_input: { file_path: string };
  tool_response?: unknown;
}

/** The text the Read returned; empty when the event does not carry it. */
function readContent(event: ReadHookInput): string {
  const response = event.tool_response;
  if (!isRecord(response) || !isRecord(response.file)) return '';
  return typeof response.file.content === 'string' ? response.file.content : '';
}

type Nudge = (pluginDir: string) => string | undefined;
type ContextFor = (stdin: string, pluginDir: string) => string | undefined;

const DESIGN_SKILL = path.join('skills', 'sk-design', 'SKILL.md');
const EXECUTE_SKILL = path.join('skills', 'sk-execute', 'SKILL.md');
const PLAN_SECTIONS = [
  '## A plan carries intent',
  '## Before the plan goes out',
];
const CLEAN_CODE_RULE = path.join('rules', 'sk-clean-code.md');
const COMMENTS_HEADING = '## Comments';

// Frontmatter keeps the description a double-quoted scalar with no YAML-only
// escapes, so JSON.parse reads it exactly.
const DESCRIPTION_LINE = /^description:\s*(".*")\s*$/;

// superpowers' review-package script names this file; a rename silences the hook.
const REVIEW_PACKAGE =
  /(^|\/)\.superpowers\/sdd\/[^/]+\/review-[0-9a-f]+\.\.[0-9a-f]+\.diff$/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

function isSkillHookInput(v: unknown): v is SkillHookInput {
  if (!isRecord(v)) return false;
  const input = v.tool_input;
  return isRecord(input) && typeof input.skill === 'string';
}

function isReadHookInput(v: unknown): v is ReadHookInput {
  if (!isRecord(v) || v.tool_name !== 'Read') return false;
  const input = v.tool_input;
  return isRecord(input) && typeof input.file_path === 'string';
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function readText(file: string): string | undefined {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return undefined;
  }
}

/** The `description` in a skill file's frontmatter; undefined when absent. */
export function readSkillDescription(skillFile: string): string | undefined {
  const text = readText(skillFile);
  if (text === undefined) return undefined;
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') return undefined;
  const close = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (close < 0) return undefined;
  const match = lines
    .slice(1, close)
    .map((line) => DESCRIPTION_LINE.exec(line))
    .find((m) => m !== null);
  if (!match) return undefined;
  const value = parseJson(match[1]);
  return typeof value === 'string' ? value : undefined;
}

/** A Markdown file's `## ` section, heading included, up to the next `## `; undefined when absent. */
export function readSection(file: string, heading: string): string | undefined {
  const text = readText(file);
  if (text === undefined) return undefined;
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trimEnd() === heading);
  if (start < 0) return undefined;
  const rest = lines.slice(start + 1);
  let fenced = false;
  const next = rest.findIndex((line) => {
    if (line.trimStart().startsWith('```')) fenced = !fenced;
    return !fenced && line.startsWith('## ');
  });
  const body = next < 0 ? rest : rest.slice(0, next);
  return [lines[start], ...body].join('\n').trim();
}

/** The `paths:` globs in a rule's frontmatter; undefined when the rule has none. */
export function readRulePaths(file: string): string[] | undefined {
  const text = readText(file);
  if (text === undefined) return undefined;
  const lines = text.split(/\r?\n/);
  if (lines[0].trim() !== '---') return undefined;
  const close = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (close < 0) return undefined;
  const front = lines.slice(1, close);
  const key = front.findIndex((line) => line.trimEnd() === 'paths:');
  if (key < 0) return undefined;
  const globs: string[] = [];
  for (const line of front.slice(key + 1)) {
    const item = /^\s+-\s+["']?(.*?)["']?\s*$/.exec(line);
    if (item === null) break;
    globs.push(item[1]);
  }
  return globs.length === 0 ? undefined : globs;
}

const EXT_GLOB = /^\*\*\/\*(\.[A-Za-z0-9]+)$/;
const STAT_LINE = /^\s*(\S.*?)\s+\|\s+(?:\d+|Bin)\b/;
const DIFF_HEADER = /^diff --git a\/(.+) b\//;

/** Changed paths a review package's text shows: its stat lines and diff headers. */
function visiblePaths(content: string): string[] {
  const found: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = STAT_LINE.exec(line) ?? DIFF_HEADER.exec(line);
    if (match !== null) found.push(match[1]);
  }
  return found;
}

/**
 * Whether the package shows a file the rule covers. A rule without `paths:`
 * covers everything, and a glob shape this does not read fails open.
 */
function ruleCoversPackage(rulePaths: string[] | undefined, content: string) {
  if (rulePaths === undefined) return true;
  const exts: string[] = [];
  for (const glob of rulePaths) {
    const match = EXT_GLOB.exec(glob);
    if (match === null) return true;
    exts.push(match[1]);
  }
  return visiblePaths(content).some((p) => exts.some((ext) => p.endsWith(ext)));
}

function brainstormNudge(pluginDir: string): string | undefined {
  const description = readSkillDescription(path.join(pluginDir, DESIGN_SKILL));
  if (description === undefined) return undefined;
  return [
    'sidekick: before this brainstorm proposes approaches, check whether the change needs a design pass.',
    `sidekick:sk-design: ${description}`,
    'If it applies, run it now, or at the approaches step, which it then does itself.',
    'If a design note for this change already exists, start from it.',
  ].join(' ');
}

const PLAN_LEAD =
  'sidekick: `sk-execute` governs how this plan is written, and it overrides two rules of this skill. A plan carries intent, and code in it is a sketch, so the complete-code rule and the placeholder scan give way where they conflict. Write the plan to these two sections of `sk-execute`:';

function writingPlansNudge(pluginDir: string): string | undefined {
  const file = path.join(pluginDir, EXECUTE_SKILL);
  const sections = PLAN_SECTIONS.map((heading) => readSection(file, heading));
  const found = sections.flatMap((s) => (s === undefined ? [] : [s]));
  if (found.length < PLAN_SECTIONS.length) return undefined;
  return [PLAN_LEAD, ...found].join('\n\n');
}

const NUDGES = new Map<string, Nudge>([
  ['superpowers:brainstorming', brainstormNudge],
  ['superpowers:writing-plans', writingPlansNudge],
]);

const READ_LEAD_LINE =
  "sidekick: this file is a superpowers review package, so sidekick's reviewer rules hold for this review alongside superpowers' reviewer instructions.";

const REPRODUCE_PARAGRAPH =
  "Reproduce what the implementer claims. For each check the implementer reports as passing, other than the test suite, re-run it where it runs read-only in this checkout: a prose check, a search, or a count. Credit only the results you reproduce. This departs from superpowers' rule that a reviewer runs checks only on a specific doubt; the test suite stays exempt, as superpowers rules.";

// Phrased as named risks, so it works inside the task reviewer's rule against crawling the codebase.
const CLAIMS_PARAGRAPH =
  "Check what the diff says about the rest of the system. Where superpowers limits you to risks you can name outside the diff, two kinds count here. A sentence the diff adds that states a fact is one: a count, a path, a list someone will decide on, how a part behaves. Find the fact's source and confirm it there. A fact the diff changes is a cross-cutting change, and its other copies are its call sites. Search for them with `git grep`, read the block each one sits in, and report each copy left stale. A true statement the diff deletes is a finding unless the change made it false. Report a claim you cannot trace to a source as a finding.";

function reviewerLines(pluginDir: string, packageText: string): string {
  const lines = [READ_LEAD_LINE, REPRODUCE_PARAGRAPH, CLAIMS_PARAGRAPH];
  const rule = path.join(pluginDir, CLEAN_CODE_RULE);
  const comments = readSection(rule, COMMENTS_HEADING);
  if (
    comments !== undefined &&
    ruleCoversPackage(readRulePaths(rule), packageText)
  ) {
    lines.push(
      "Hold the comments this diff adds to the house rule. Reading a diff does not load `sk-clean-code.md`, so its Comments section follows. Report each added comment that breaks it as a finding. Where this repo's own rules set a different comment convention, theirs win.",
      comments,
    );
  }
  return lines.join('\n\n');
}

function postSkillContext(
  stdin: string,
  pluginDir: string,
): string | undefined {
  const event = parseJson(stdin);
  if (!isSkillHookInput(event)) return undefined;
  const nudge = NUDGES.get(event.tool_input.skill);
  return nudge === undefined ? undefined : nudge(pluginDir);
}

function postReadContext(stdin: string, pluginDir: string): string | undefined {
  const event = parseJson(stdin);
  if (!isReadHookInput(event)) return undefined;
  if (!REVIEW_PACKAGE.test(event.tool_input.file_path)) return undefined;
  return reviewerLines(pluginDir, readContent(event));
}

const VERBS = new Map<string, ContextFor>([
  ['post-skill', postSkillContext],
  ['post-read', postReadContext],
]);

export function runHookCli(
  args: string[],
  env: HookEnv,
  out: (line: string) => void,
  err: (line: string) => void,
): number {
  const [verb] = args;
  const contextFor = verb === undefined ? undefined : VERBS.get(verb);
  if (contextFor === undefined) {
    err(`usage: ${HOOK_USAGE_LINE}`);
    return 1;
  }
  const context = contextFor(env.readStdin(), env.pluginDir);
  if (context === undefined) return 0;
  out(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: context,
      },
    }),
  );
  return 0;
}
