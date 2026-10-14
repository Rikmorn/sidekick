/**
 * `sidekick worker dispatch|finish`: the verbs that start a plan's worker as a
 * background session and, once its work is integrated, clear it away. Usage
 * errors and refusals print to stderr and return 1, as the `profile` family
 * does.
 */

import type { Runner } from './pm-data.js';
import type { ProfileEnv } from './profile.js';
import { dispatch, parseDispatchArgs } from './worker-dispatch.js';

export const WORKER_USAGE_LINE =
  'sidekick worker dispatch <brief> --permission-mode <mode> [--profile <name>] [--plugin-dir <dir>] [--allow-push] | finish <brief> [--no-report]';

/** The profile family's environment, plus git and the seams a lock wait runs through. */
export interface WorkerEnv extends ProfileEnv {
  runGit: Runner;
  /** Blocks for `ms` milliseconds. */
  sleep: (ms: number) => void;
  /** Whether process `pid` still runs. */
  isAlive: (pid: number) => boolean;
}

type Out = (line: string) => void;
type Verb = (rest: string[], wenv: WorkerEnv, out: Out, err: Out) => number;

const usage = (err: Out): number => {
  err(`usage: ${WORKER_USAGE_LINE}`);
  return 1;
};

const dispatchVerb: Verb = (rest, wenv, out, err) => {
  const opts = parseDispatchArgs(rest, wenv.cwd);
  return opts === undefined ? usage(err) : dispatch(opts, wenv, out, err);
};

const VERBS: Record<string, Verb> = { dispatch: dispatchVerb };

/** Dispatch one `worker` verb; returns the process exit code. */
export function runWorkerCli(
  args: string[],
  wenv: WorkerEnv,
  out: Out,
  err: Out,
): number {
  const [name, ...rest] = args;
  if (name === undefined || !Object.hasOwn(VERBS, name)) return usage(err);
  return VERBS[name](rest, wenv, out, err);
}

/** Blocks the thread for `ms` milliseconds; the CLI's `sleep`. */
export function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Whether process `pid` exists; the CLI's `isAlive`. `ESRCH` means it is gone,
 * and `EPERM` means it runs as another user, so it is alive.
 */
export function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return !(e instanceof Error && 'code' in e && e.code === 'ESRCH');
  }
}
