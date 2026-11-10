/**
 * Stopping the worker's job, the first steps of `sidekick worker finish`:
 * `claude stop` and the wait for the worktree's lock to clear.
 * `worker-finish-gone.ts` also uses `runStop` and `waitForExit`.
 */

import type { WorkerEnv } from './worker.js';
import { lockReasonOf } from './worker-listing.js';
import {
  claudeAt,
  failure,
  type JobAt,
  type Ready,
  ranClean,
  type Step,
  withText,
} from './worker-teardown.js';
import { lockPid } from './worktree-lock.js';

// The states a job lists once its turn or its process has ended.
const ENDED_STATES = ['stopped', 'done'];

/** Runs `claude stop` on the job whatever it lists as; the issues when it fails. */
export const runStop = (
  job: Pick<Ready, 'id' | 'mainTop'>,
  wenv: WorkerEnv,
): string[] => {
  const args = ['stop', job.id];
  const result = claudeAt(job, wenv, args);
  if (ranClean(result)) return [];
  return withText(
    `claude ${args.join(' ')} ${failure(result)}, so finish stopped before claude rm`,
    result,
  );
};

// A worker whose turn has ended lists as done while its process idles and holds
// the worktree's lock. So only a job listed as ended whose lock names no live
// process skips the stop, which keeps a re-run working after the process exits.
export const stopJob = (job: JobAt, wenv: WorkerEnv): string[] => {
  const listedEnded =
    job.state !== undefined && ENDED_STATES.includes(job.state);
  if (listedEnded && !lockHeldLive(job, wenv)) return [];
  return runStop(job, wenv);
};

// An unreadable lock means no wait: claude rm then keeps the worktree, and
// finish refuses its answer.
// Read at each call, never kept in Ready, since the lock can change while finish runs.
function lockPidNow(
  at: Pick<JobAt, 'mainTop' | 'worktree'>,
  wenv: WorkerEnv,
): number | undefined {
  return lockPid(lockReasonOf(wenv.runGit, at.mainTop, at.worktree));
}

function lockHeldLive(job: JobAt, wenv: WorkerEnv): boolean {
  const pid = lockPidNow(job, wenv);
  return pid !== undefined && wenv.isAlive(pid);
}

/** Polls until `pid` exits; the caller's refusal once `limitMs` has passed. */
export function waitForExit(
  pid: number,
  wenv: WorkerEnv,
  {
    refusal,
    limitMs = 15_000,
    pollMs = 250,
  }: {
    refusal: (pid: number, seconds: number) => string;
    limitMs?: number;
    pollMs?: number;
  },
): string[] {
  for (let waited = 0; wenv.isAlive(pid); waited += pollMs) {
    if (waited >= limitMs) return [refusal(pid, limitMs / 1000)];
    wenv.sleep(pollMs);
  }
  return [];
}

// claude rm keeps a worktree whose lock names a process still running. Any lock
// naming a pid is waited on, a claude session's or not: a wait unlocks nothing.
export const waitForLock: Step = (ready, wenv) => {
  const pid = lockPidNow(ready, wenv);
  return pid === undefined
    ? []
    : waitForExit(pid, wenv, {
        refusal: (named, seconds) =>
          `the worktree's lock still names a running process, pid ${named}, after ${seconds} s: run finish again once it exits`,
      });
};
