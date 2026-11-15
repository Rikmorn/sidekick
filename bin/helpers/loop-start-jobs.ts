/**
 * The `claude` calls `sidekick loop start` makes on a loop's existing job:
 * stop, the wait for its process to exit, remove, and respawn. Each returns
 * the lines that stop the loop, none on success.
 */

import type { LoopEnv } from './loop.js';
import { LAUNCH_TIMEOUT_MS } from './profile.js';
import { isFolder } from './profile-role.js';
import { failure, ranClean, saidRemoved, withText } from './worker-teardown.js';
import { waitForExit } from './worker-teardown-stop.js';

/** Where a job call runs, and the environment it runs through. */
export interface JobCall {
  lenv: LoopEnv;
  cwd: string;
}

/**
 * A job call runs from the loop's repo, the main checkout the job launched
 * from, as `worker finish` runs its calls from the main checkout (`claudeAt`
 * in worker-teardown.ts). A paused loop's repo is never checked, so a repo
 * that is gone falls back to the folder `start` runs in.
 */
export const callAt = (repo: string, lenv: LoopEnv): JobCall => ({
  lenv,
  cwd: isFolder(repo) ? repo : lenv.cwd,
});

/** The bound on a call that starts a session, as `profile launch` and `worker dispatch` bound `--bg`. */
export const launchLimit = (lenv: LoopEnv): number =>
  lenv.launchTimeoutMs ?? LAUNCH_TIMEOUT_MS;

/** `claude stop`, with dispatch's short limit (`stopStray` in worker-dispatch.ts), since one start may stop several loops. */
export function stopJob(
  call: JobCall,
  job: string,
  timeoutMs = 10_000,
): string[] {
  const result = call.lenv.runClaude(['stop', job], {
    cwd: call.cwd,
    timeoutMs,
  });
  return ranClean(result)
    ? []
    : withText(
        `claude stop ${job} ${failure(result)}, so its session may still run`,
        result,
      );
}

/**
 * Waits, bounded, for a stopped job's process to exit. `claude rm` kept a job
 * that `worker finish` had just stopped (measured 2026-10-15, 2.1.300, noted
 * in worker-teardown-rm.ts), so `start` removes a job only once its pid is
 * gone. An unknown pid needs no wait.
 */
export function waitStopped(
  call: JobCall,
  job: string,
  pid: number | undefined,
): string[] {
  if (pid === undefined) return [];
  return waitForExit(pid, call.lenv, {
    refusal: (named, seconds) =>
      `job ${job}'s process, pid ${named}, still runs ${seconds} s after claude stop, so start removed nothing and launched nothing. Run start again once it exits.`,
  });
}

/**
 * `claude rm`, judged by its text, since its exit code does not say whether it
 * removed (`saidRemoved` in worker-teardown.ts). Any other answer refuses, and
 * `start` never runs the `--discard-unpushed` line it may offer. The limit is
 * long, so a slow delete finishes, and `start` still ends.
 */
export function removeJob(
  call: JobCall,
  job: string,
  timeoutMs = 180_000,
): string[] {
  const result = call.lenv.runClaude(['rm', job], {
    cwd: call.cwd,
    timeoutMs,
  });
  if (saidRemoved(result)) return [];
  const what = ranClean(result)
    ? 'did not say it removed the job'
    : failure(result);
  return [
    ...withText(`claude rm ${job} ${what}, so start launched nothing`, result),
    `start never discards a job's work. Read what claude rm printed, settle job ${job} by hand, then run start again.`,
  ];
}

/** `claude respawn`, which restarts a stopped job with its launch flags, bounded as a launch is. */
export function respawnJob(
  call: JobCall,
  job: string,
  timeoutMs = launchLimit(call.lenv),
): string[] {
  const result = call.lenv.runClaude(['respawn', job], {
    cwd: call.cwd,
    timeoutMs,
  });
  return ranClean(result)
    ? []
    : withText(
        `claude respawn ${job} ${failure(result)}, so the loop may not run`,
        result,
      );
}
