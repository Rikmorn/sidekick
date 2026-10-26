// The role tracker: settles each session's one role once per load, from the
// flag settings' markers, `CLAUDE_JOB_DIR`, and a classic start that read
// `fork`. A hot reload loads the module afresh and fires `session.start` but
// no classic start, so the fork also lives in `$.state`, which a reload keeps.
// No hook returns context, approves, or denies. The other mods share the
// module, and a hook that fails in one mod skips the module's whole hook for
// that event. So the start hook keeps its own failures, which go to the debug
// log, and calls `next(e)` once whatever happened.

import type { EngineInterface, On } from 'claude-code';
import { reasonOf } from './failures';

/** A session's one role: a `main` keeps sidekick's views, a `worker` points back to its main, and `other` keeps them off. */
export type Role =
  | { kind: 'main' }
  | { kind: 'worker'; main: string | undefined }
  | { kind: 'other' };

type Marker = 'SIDEKICK_MAIN' | 'SIDEKICK_WORKER';

const FORKED = { plugin: 'sidekick', key: 'forked' } as const;

// What the role keeps for the module's load.
const tracker: { forked: boolean; role: Role | undefined } = {
  forked: false,
  role: undefined,
};

function logFailure($: EngineInterface, what: string, error: unknown): void {
  $.ui.log(`sidekick role: ${what} failed: ${reasonOf(error)}`, {
    to: 'debug',
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A marker counts only as a non-empty string.
function markerOf(flagEnv: unknown, key: Marker): string | undefined {
  if (!isRecord(flagEnv)) return undefined;
  const value = flagEnv[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Settles the role from the flag settings' `env`, `CLAUDE_JOB_DIR`, and whether the classic start read `fork`. */
export function roleOf({
  flagEnv,
  jobDir,
  forked,
}: {
  flagEnv: unknown;
  jobDir: string | undefined;
  forked: boolean;
}): Role {
  const main = markerOf(flagEnv, 'SIDEKICK_MAIN');
  const isWorker =
    main !== undefined || markerOf(flagEnv, 'SIDEKICK_WORKER') !== undefined;
  if (isWorker) return { kind: 'worker', main };
  return jobDir === undefined || forked ? { kind: 'main' } : { kind: 'other' };
}

function roleText(role: Role): string {
  switch (role.kind) {
    case 'main':
    case 'other':
      return role.kind;
    case 'worker':
      return role.main === undefined ? 'worker' : `worker of ${role.main}`;
    default: {
      const unhandled: never = role;
      throw new Error(`Unhandled role: ${JSON.stringify(unhandled)}`);
    }
  }
}

// Each read below that fails counts as its marker absent.
async function readFlagEnv($: EngineInterface): Promise<unknown> {
  try {
    return (await $.settings.read({ source: 'flag' })).env;
  } catch (error) {
    logFailure($, 'reading the flag settings', error);
    return undefined;
  }
}

async function readJobDir($: EngineInterface): Promise<string | undefined> {
  try {
    return await $.env.get('CLAUDE_JOB_DIR');
  } catch (error) {
    logFailure($, 'reading CLAUDE_JOB_DIR', error);
    return undefined;
  }
}

// The fork an earlier load kept in state; a failed read counts as no fork.
async function readForked($: EngineInterface): Promise<boolean> {
  try {
    return (await $.state.get(FORKED)).value === true;
  } catch (error) {
    logFailure($, 'reading the kept fork', error);
    return false;
  }
}

async function keepForked($: EngineInterface): Promise<void> {
  try {
    await $.state.set(FORKED, true);
  } catch (error) {
    logFailure($, 'keeping the fork', error);
  }
}

/** The session's role: the one this load settled, or else one settled now and kept. Never rejects; each failure goes to the debug log. */
export async function settleRole($: EngineInterface): Promise<Role> {
  if (tracker.role !== undefined) return tracker.role;
  const role = roleOf({
    flagEnv: await readFlagEnv($),
    jobDir: await readJobDir($),
    forked: tracker.forked || (await readForked($)),
  });
  tracker.role = role;
  return role;
}

/** The keys that take the operator from agent view back to `main`. */
export function wayBack(main: string): string {
  return `←, select ${main}, Enter`;
}

/** What `/<command>` answers in a worker, naming its main when it has one. */
export function workerAnswer(
  command: string,
  main: string | undefined,
): string {
  const off = `/${command} is off in this worker.`;
  return main === undefined
    ? off
    : `${off} Its main is ${main}: ←, select it, Enter.`;
}

/**
 * Hooks the role: records a fork at the classic start, in memory and in state, and settles the role at
 * each interactive start, naming it in the debug log. Registered first, its
 * start hook runs before the other mods' start hooks.
 */
export function registerRole(on: On): void {
  // The board's classic start hook takes no matcher; a matched one loads beside it.
  on('classic.SessionStart', { source: 'fork' }, async ($, e, next) => {
    tracker.forked = true;
    await keepForked($);
    return next(e);
  });

  // The engine refuses a second `session.start` hook without a matcher, and
  // the gauge has one. Every mod but the gauge shares this one.
  on('session.start', { isInteractive: true }, async ($, e, next) => {
    try {
      $.ui.log(`sidekick role: ${roleText(await settleRole($))}`, {
        to: 'debug',
      });
    } catch (error) {
      logFailure($, 'session.start', error);
    }
    return next(e);
  });
}
