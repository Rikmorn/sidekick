/**
 * The main session's identity: what a launch records as `SIDEKICK_MAIN`, and
 * whether Claude Code keeps the name the listing shows.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as v from 'valibot';
import type { Job } from './worker-jobs.js';

/** Claude Code's config folder; an empty CLAUDE_CONFIG_DIR means unset. */
export const configDirOf = (
  env: NodeJS.ProcessEnv,
  home: string = os.homedir(),
): string => env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');

// The length of the id prefix the listing shows for an unnamed session.
const ID_LENGTH = 8;

/** The variables that mark a session as a worker or name its main. */
export const MAIN_MARKERS = ['SIDEKICK_MAIN', 'SIDEKICK_WORKER'] as const;

export interface ResolvedMain {
  value: string;
  from: 'inherited' | 'listing' | 'id';
  /** Set when `from` is not `inherited`. */
  sessionId?: string;
}

/** The main to record for a launch from `env`, or undefined outside any session. */
export function resolveMain(
  env: NodeJS.ProcessEnv,
  jobs: Job[] | undefined,
): ResolvedMain | undefined {
  const inherited = env.SIDEKICK_MAIN;
  if (inherited !== undefined && inherited !== '') {
    return { value: inherited, from: 'inherited' };
  }
  const sessionId = env.CLAUDE_CODE_SESSION_ID;
  if (sessionId === undefined || sessionId === '') return undefined;
  const name = jobs?.find((job) => job.sessionId === sessionId)?.name;
  return name !== undefined && name !== ''
    ? { value: name, from: 'listing', sessionId }
    : { value: sessionId.slice(0, ID_LENGTH), from: 'id', sessionId };
}

// The sessions files are undocumented: only the two fields read are checked.
const SessionFileSchema = v.object({
  sessionId: v.string(),
  nameSource: v.optional(v.string()),
});

// Name sources Claude Code sets on its own; any other source is the operator's.
const AUTO_SOURCES = ['derived', 'auto'];

/**
 * Whether the name of `sessionId` holds, from `<configDir>/sessions/*.json`:
 * false for an automatic name, true for any other, null when no readable file
 * names the session. An unreadable or malformed file is skipped.
 */
export function nameHeld(configDir: string, sessionId: string): boolean | null {
  const dir = path.join(configDir, 'sessions');
  let entries: string[];
  try {
    entries = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return null;
  }
  for (const entry of entries.sort()) {
    try {
      const file = v.safeParse(
        SessionFileSchema,
        JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf-8')),
      );
      if (file.success && file.output.sessionId === sessionId) {
        return !AUTO_SOURCES.includes(file.output.nameSource ?? '');
      }
    } catch {
      // One bad file must not hide a good match in another.
    }
  }
  return null;
}

/** A copy of `env` without the worker and main markers. */
export function withoutMarkers(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const copy = { ...env };
  for (const marker of MAIN_MARKERS) delete copy[marker];
  return copy;
}

/** The `main:` line for a launch: reads the sessions file only for a session sidekick resolved. */
export function mainReport(
  main: ResolvedMain,
  env: NodeJS.ProcessEnv,
  home: string,
): string {
  const held =
    main.sessionId === undefined
      ? null
      : nameHeld(configDirOf(env, home), main.sessionId);
  return mainLine(main, held);
}

/** The CLI's `main: <value>` line; the suffix warns when sidekick, not the operator, holds the name. */
export function mainLine(main: ResolvedMain, held: boolean | null): string {
  const base = `main: ${main.value}`;
  return main.from !== 'inherited' && held === false
    ? `${base} · sidekick holds this name when this turn ends; ← before then loses it`
    : base;
}
