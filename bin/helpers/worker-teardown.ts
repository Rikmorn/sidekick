/**
 * The steps `sidekick worker finish` runs once its checks pass: stopping the
 * worker's job, waiting out its lock, removing the session, forgetting the desk
 * record, and confirming the worktree and branch are gone.
 * Each step returns the issues that stop the run, none on success.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Runner } from './pm-data.js';
import { type ClaudeResult, printedStreams } from './profile-launch.js';
import type { WorkerEnv } from './worker.js';
import { removeRecord } from './worker-record.js';
import { branchExists } from './worker-repo.js';

export type Out = (line: string) => void;

// The states a job lists once its turn or its process has ended.
const ENDED_STATES = ['stopped', 'done'];

const REMOVED = /^removed\b/;

// claude rm's offer to discard the commits no remote holds: `<sha>@<worktree id>`.
const DISCARD_LINE = /--discard-unpushed ([0-9a-f]{40})@([0-9a-f]+)/;

// The lock reads `claude session <name> (pid <n> start <date>)`.
const LOCK_PID = /\(pid (\d+)\b/;

// The listed job the brief names.
export interface WorkerJob {
  id: string;
  state: string | undefined;
}

// What saveReport does with the report.
export type ReportStep = 'copy' | 'in place' | 'none';

const isMissing = (e: unknown): boolean =>
  e instanceof Error && 'code' in e && e.code === 'ENOENT';

// A file's bytes, undefined when it does not exist. Any other failure is an
// issue, so an unreadable report is never taken for a missing one.
export function readIfPresent(
  file: string,
): { data: Buffer | undefined } | { issue: string } {
  try {
    return { data: fs.readFileSync(file) };
  } catch (e) {
    if (isMissing(e)) return { data: undefined };
    const why = e instanceof Error ? e.message : String(e);
    return { issue: `cannot read ${file}: ${why}` };
  }
}

// Everything the steps need once the checks pass.
export interface Ready extends WorkerJob {
  name: string;
  top: string;
  commonDir: string;
  worktree: string;
  branch: string;
  head: string;
  report: string;
  reportFrom: string;
  reportTo: string;
  reportStep: ReportStep;
}

export type Step = (ready: Ready, wenv: WorkerEnv, out: Out) => string[];

// Runs claude from the top; 30 s matches the agents listing's limit.
const claudeAt = (
  ready: Ready,
  wenv: WorkerEnv,
  args: string[],
  timeoutMs = 30_000,
): ClaudeResult => wenv.runClaude(args, { cwd: ready.top, timeoutMs });

// A refusal line, followed by claude's own text when it printed any.
function withText(lead: string, result: ClaudeResult): string[] {
  const text = printedStreams(result);
  return text.length > 0 ? [`${lead}:`, ...text] : [lead];
}

const ranClean = (result: ClaudeResult): boolean =>
  result.code === 0 && !result.timedOut;

const failure = (result: ClaudeResult): string =>
  result.timedOut
    ? 'did not return in time'
    : `failed with exit code ${result.code}`;

// A worker whose turn has ended lists as done while its process idles and holds
// the worktree's lock. So only a job listed as ended whose lock names no live
// process skips the stop, which keeps a re-run working after the process exits.
export const stopJob: Step = (ready, wenv) => {
  const listedEnded =
    ready.state !== undefined && ENDED_STATES.includes(ready.state);
  if (listedEnded && !lockHeldLive(ready, wenv)) return [];
  const args = ['stop', ready.id];
  const result = claudeAt(ready, wenv, args);
  if (ranClean(result)) return [];
  return withText(
    `claude ${args.join(' ')} ${failure(result)}, so finish stopped before claude rm`,
    result,
  );
};

// The lock's pid, when it names one. kill(0, 0) signals the process group, so
// only a positive pid is waited on. An unreadable lock means no wait: claude rm
// then keeps the worktree, and finish refuses its answer.
function lockPid(commonDir: string, name: string): number | undefined {
  const lock = readIfPresent(path.join(commonDir, 'worktrees', name, 'locked'));
  if ('issue' in lock || lock.data === undefined) return undefined;
  const pid = Number(LOCK_PID.exec(lock.data.toString())?.[1]);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
}

function lockHeldLive(ready: Ready, wenv: WorkerEnv): boolean {
  const pid = lockPid(ready.commonDir, ready.name);
  return pid !== undefined && wenv.isAlive(pid);
}

function waitForExit(
  pid: number,
  wenv: WorkerEnv,
  limitMs = 15_000,
  pollMs = 250,
): string[] {
  for (let waited = 0; wenv.isAlive(pid); waited += pollMs) {
    if (waited >= limitMs) {
      return [
        `the worktree's lock still names a running process, pid ${pid}, after ${limitMs / 1000} s: run finish again once it exits`,
      ];
    }
    wenv.sleep(pollMs);
  }
  return [];
}

// claude rm keeps a worktree whose lock names a process still running.
export const waitForLock: Step = (ready, wenv) => {
  const pid = lockPid(ready.commonDir, ready.name);
  return pid === undefined ? [] : waitForExit(pid, wenv);
};

const saidRemoved = (result: ClaudeResult): boolean =>
  ranClean(result) && REMOVED.test(printedStreams(result).join('\n'));

function unknownAnswer(args: string[], result: ClaudeResult): string[] {
  const what = ranClean(result)
    ? 'did not say removed, and finish does not know its answer'
    : failure(result);
  return withText(
    `claude ${args.join(' ')} ${what}, so finish removed nothing more`,
    result,
  );
}

// Runs claude rm's discard line only when it names the verified head; any
// other answer refuses, and nothing is lost. The offer counts whatever the
// exit code: claude rm exited 1 as it kept a job finish had just stopped
// (measured 2026-10-15, 2.1.300). A run that timed out offers nothing.
function discard(ready: Ready, wenv: WorkerEnv, kept: ClaudeResult): string[] {
  const text = printedStreams(kept).join('\n');
  const offer = kept.timedOut ? null : DISCARD_LINE.exec(text);
  if (offer === null) return unknownAnswer(['rm', ready.id], kept);
  const [, sha, worktreeId] = offer;
  if (sha !== ready.head) {
    return withText(
      `claude rm offers to discard ${sha}, which is not ${ready.branch}'s verified head (${ready.head}), so finish did not run it`,
      kept,
    );
  }
  const args = ['rm', ready.id, '--discard-unpushed', `${sha}@${worktreeId}`];
  const result = claudeAt(ready, wenv, args);
  return saidRemoved(result) ? [] : unknownAnswer(args, result);
}

// claude rm's exit code does not say whether it removed or kept, so only its
// text tells.
export const removeSession: Step = (ready, wenv, out) => {
  const first = claudeAt(ready, wenv, ['rm', ready.id]);
  const issues = saidRemoved(first) ? [] : discard(ready, wenv, first);
  if (issues.length > 0) return issues;
  out(`session ${ready.id} removed`);
  return [];
};

function worktreeGoneIssues(
  runGit: Runner,
  top: string,
  worktree: string,
): string[] {
  const list = runGit('git', ['worktree', 'list', '--porcelain'], top);
  if (list.code !== 0) {
    return [
      `git worktree list failed, so finish cannot confirm the worktree is gone: ${list.stderr.trim()}`,
    ];
  }
  const listed = list.stdout.split('\n').includes(`worktree ${worktree}`);
  return listed
    ? [`claude rm said removed, but git still lists the worktree ${worktree}`]
    : [];
}

// git branch -d refuses a branch that is not merged.
function branchGoneIssues(
  runGit: Runner,
  top: string,
  branch: string,
): string[] {
  if (!branchExists(runGit, top, branch)) return [];
  const result = runGit('git', ['branch', '-d', branch], top);
  if (result.code === 0) return [];
  return [`git branch -d ${branch} failed: ${result.stderr.trim()}`];
}

export const removeLeftovers: Step = (ready, wenv, out) => {
  const worktree = worktreeGoneIssues(wenv.runGit, ready.top, ready.worktree);
  if (worktree.length > 0) return worktree;
  out(`worktree ${ready.worktree} removed`);
  const branch = branchGoneIssues(wenv.runGit, ready.top, ready.branch);
  if (branch.length > 0) return branch;
  out(`branch ${ready.branch} removed`);
  return [];
};

// `sidekick desk` lists workers from this record, so it goes with the session.
export const forgetRecord: Step = (ready) => {
  removeRecord(ready.commonDir, ready.name);
  return [];
};
