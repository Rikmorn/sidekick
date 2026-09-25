/**
 * `sidekick hook post-skill`: the context a PostToolUse hook on the Skill tool
 * adds when a skill sidekick extends has loaded. Every other input prints
 * nothing and returns 0, because a hook never blocks or fails the call it
 * watches (ADR-0010).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export const HOOK_USAGE_LINE =
  'sidekick hook post-skill   (reads the hook event on stdin)';

export interface HookEnv {
  stdin: string;
  pluginDir: string;
}

interface SkillHookInput {
  tool_input: { skill: string };
}

type Nudge = (pluginDir: string) => string | undefined;

const DESIGN_SKILL = path.join('skills', 'sk-design', 'SKILL.md');

// Frontmatter keeps the description a double-quoted scalar with no YAML-only
// escapes, so JSON.parse reads it exactly.
const DESCRIPTION_LINE = /^description:\s*(".*")\s*$/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

function isSkillHookInput(v: unknown): v is SkillHookInput {
  if (!isRecord(v)) return false;
  const input = v.tool_input;
  return isRecord(input) && typeof input.skill === 'string';
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

function postSkillContext(
  stdin: string,
  pluginDir: string,
): string | undefined {
  const event = parseJson(stdin);
  if (!isSkillHookInput(event)) return undefined;
  const nudge = NUDGES.get(event.tool_input.skill);
  return nudge === undefined ? undefined : nudge(pluginDir);
}

export function runHookCli(
  args: string[],
  env: HookEnv,
  out: (line: string) => void,
  err: (line: string) => void,
): number {
  const [verb] = args;
  if (verb !== 'post-skill') {
    err(`usage: ${HOOK_USAGE_LINE}`);
    return 1;
  }
  const context = postSkillContext(env.stdin, env.pluginDir);
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
