/**
 * The limits a dispatched worker's subagents receive: the brief's `## Limits`
 * section and `sk-worker`'s `## Limits this skill adds`, composed into one text.
 */

import * as path from 'node:path';

/** The heading of the brief's limits section, matched as a whole line. */
export const BRIEF_LIMITS_HEADING = '## Limits';

/** The heading of the section `sk-worker` adds to the brief's limits. */
export const WORKER_LIMITS_HEADING = '## Limits this skill adds';

/** `readSection`'s signature; passed in because `hook.ts` imports this module. */
export type ReadSection = (file: string, heading: string) => string | undefined;

// The skill file whose section joins the brief's, under the plugin's folder.
const WORKER_SKILL = path.join('skills', 'sk-worker', 'SKILL.md');

const NARROW_NOT_WIDEN = 'Your own prompt may narrow them, never widen them.';

const LEAD = `sidekick: you are a subagent of a dispatched worker. These limits bind every session in its run, yours included. They are the run's outer bounds: your own prompt may narrow them, never widen them. Where an instruction you were given would cross them, such as a template's \`git worktree add /tmp/…\`, the limits win.`;

/** The brief's `## Limits` section; undefined when missing, or when nothing sits under the heading. */
export function readBriefLimits(
  briefPath: string,
  readSection: ReadSection,
): string | undefined {
  const section = readSection(briefPath, BRIEF_LIMITS_HEADING);
  return section === undefined || section === BRIEF_LIMITS_HEADING
    ? undefined
    : section;
}

function pointer(brief: string, skill: string): string {
  return [
    "sidekick: you are a subagent of a dispatched worker, and the run's limits are too long to show here.",
    `Before you act, read the \`${BRIEF_LIMITS_HEADING}\` section of ${brief} and the \`${WORKER_LIMITS_HEADING}\` section of ${skill}.`,
    `They bind every session in the run, yours included. ${NARROW_NOT_WIDEN}`,
  ].join('\n');
}

/** The context a worker's subagent receives; undefined outside a worker or when the brief has no limits. */
export function subagentLimitsContext({
  env,
  pluginDir,
  readSection,
  budget = 9000,
}: {
  env: Readonly<Record<string, string | undefined>>;
  pluginDir: string;
  readSection: ReadSection;
  budget?: number;
}): string | undefined {
  try {
    const brief = env.SIDEKICK_WORKER;
    if (brief === undefined || brief === '') return undefined;
    const limits = readBriefLimits(brief, readSection);
    if (limits === undefined) return undefined;
    const skill = path.join(pluginDir, WORKER_SKILL);
    const own = readSection(skill, WORKER_LIMITS_HEADING);
    const text = [LEAD, limits, ...(own === undefined ? [] : [own])].join(
      '\n\n',
    );
    return text.length <= budget ? text : pointer(path.resolve(brief), skill);
  } catch {
    return undefined;
  }
}
