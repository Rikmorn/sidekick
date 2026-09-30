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
}

type Nudge = (pluginDir: string) => string | undefined;
type ContextFor = (stdin: string, pluginDir: string) => string | undefined;

const DESIGN_SKILL = path.join('skills', 'sk-design', 'SKILL.md');
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
  const next = rest.findIndex((line) => line.startsWith('## '));
  const body = next < 0 ? rest : rest.slice(0, next);
  return [lines[start], ...body].join('\n').trim();
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

const NUDGES = new Map<string, Nudge>([
  ['superpowers:brainstorming', brainstormNudge],
]);

function reviewerLines(pluginDir: string): string | undefined {
  const comments = readSection(
    path.join(pluginDir, CLEAN_CODE_RULE),
    COMMENTS_HEADING,
  );
  if (comments === undefined) return undefined;
  return [
    "sidekick: this file is a superpowers review package, so two sidekick rules hold for this review alongside superpowers' reviewer instructions.",
    "Reproduce what the implementer claims. For each check the implementer reports as passing, other than the test suite, re-run it where it runs read-only in this checkout: a prose check, a search, or a count. Credit only the results you reproduce. This departs from superpowers' rule that a reviewer runs checks only on a specific doubt; the test suite stays exempt, as superpowers rules.",
    'Hold the comments this diff adds to the house rule. Reading a diff does not load `sk-clean-code.md`, so its Comments section follows. Report each added comment that breaks it as a finding.',
    comments,
  ].join('\n\n');
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
  return reviewerLines(pluginDir);
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
