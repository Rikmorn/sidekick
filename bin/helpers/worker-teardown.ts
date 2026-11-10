/**
 * What the steps of `sidekick worker finish` share: the types they pass
 * around and the readers of claude's answers. The steps live in
 * `worker-teardown-stop.ts`, `worker-teardown-rm.ts`,
 * `worker-teardown-leftovers.ts`, `worker-backup.ts`, and
 * `worker-teardown-restore.ts`. Each step returns the issues that stop the
 * run, none on success. The readers also serve `worker-finish-gone.ts`,
 * `worker-dispatch.ts`, and `worktree-remove.ts`.
 */

import { type ClaudeResult, printedStreams } from './profile-launch.js';
import type { WorkerEnv } from './worker.js';
import type { ReportStep } from './worker-finish-report.js';

export type Out = (line: string) => void;

const REMOVED = /^removed\b/;

/** claude rm's offer to discard the commits no remote holds: `<sha>@<worktree id>`. */
export const DISCARD_LINE = /--discard-unpushed ([0-9a-f]{40})@([0-9a-f]+)/;

// The listed job by the worker's name.
export interface WorkerJob {
  id: string;
  state: string | undefined;
}

// What the landed check found. `target.name` is `git rev-parse
// --symbolic-full-name`'s answer (`HEAD` when detached), else the rev as typed;
// `target.why` says where finish took it from.
export type Verdict =
  | {
      kind: 'landed';
      target: { name: string; sha: string; why: string };
      at: string;
    }
  | { kind: 'discard' };

// Everything the steps need once the checks pass.
export interface Ready extends WorkerJob {
  name: string;
  mainTop: string;
  commonDir: string;
  /** The worker's worktree, as git lists it. */
  worktree: string;
  /** The worker's branch, a short name. */
  branch: string;
  head: string;
  /** The report's path from the worktree's top; undefined under `--name`, which reads no brief. */
  report: string | undefined;
  reportStep: ReportStep;
  verdict: Verdict;
  /** The command that repeats this run, with the flags it was given. */
  rerun: string;
  /** The command that discards the worker, with the run's `--no-report`, `--name`, and `--worktree`. */
  discardCommand: string;
  /** A removal an earlier run cut short: deleted files alone, at a head a backup ref already holds. */
  partial: boolean;
}

export type Step = (ready: Ready, wenv: WorkerEnv, out: Out) => string[];

/** spawnSync reads a timeout of 0 as no limit. */
export const NO_LIMIT = 0;

// Runs claude from the main checkout's top; the default 30 s matches the agents listing's limit.
export const claudeAt = (
  at: Pick<Ready, 'mainTop'>,
  wenv: WorkerEnv,
  args: string[],
  timeoutMs = 30_000,
): ClaudeResult => wenv.runClaude(args, { cwd: at.mainTop, timeoutMs });

/** A refusal line, followed by claude's own text when it printed any. */
export function withText(lead: string, result: ClaudeResult): string[] {
  const text = printedStreams(result);
  return text.length > 0 ? [`${lead}:`, ...text] : [lead];
}

/** Whether claude exited 0 in time. */
export const ranClean = (result: ClaudeResult): boolean =>
  result.code === 0 && !result.timedOut;

/** How a claude call that did not run clean ended. */
export const failure = (result: ClaudeResult): string =>
  result.timedOut
    ? 'did not return in time'
    : `failed with exit code ${result.code}`;

/** The job to stop, and its worktree, whose lock is read. */
export type JobAt = Pick<Ready, 'id' | 'state' | 'mainTop' | 'worktree'>;

/** Whether claude rm ran clean and said removed; its exit code alone does not tell. */
export const saidRemoved = (result: ClaudeResult): boolean =>
  ranClean(result) && REMOVED.test(printedStreams(result).join('\n'));
