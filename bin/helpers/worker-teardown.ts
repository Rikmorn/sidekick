/**
 * The steps `sidekick worker finish` runs once its checks pass: stopping the
 * worker's job, waiting out its lock, keeping the branch in a backup ref,
 * restoring the files a cut-short removal deleted, removing the session,
 * forgetting the desk record, removing a worktree claude rm left behind, and
 * deleting a leftover branch at its verified head.
 * Each step returns the issues that stop the run, none on success. The stop
 * and the readings of claude's answers also serve `worker-finish-gone.ts`.
 * `worktree-remove.ts` reuses those readings, the backup ref, and the branch
 * deletion.
 */

import * as fs from 'node:fs';
import type { Runner } from './pm-data.js';
import { type ClaudeResult, printedStreams } from './profile-launch.js';
import { shellArg } from './shell.js';
import type { WorkerEnv } from './worker.js';
import type { ReportStep } from './worker-finish-report.js';
import {
  DELETED,
  lockReasonOf,
  statusEntriesIn,
  worktreeListed,
} from './worker-listing.js';
import { removeRecord } from './worker-record.js';
import { branchExists, commitOf, physical } from './worker-repo.js';
import { nativeBranch, nativeFolder } from './worker-worktree.js';
import { lockPid, lockStateOf, removeGitWorktree } from './worktree-lock.js';

export type Out = (line: string) => void;

// The states a job lists once its turn or its process has ended.
const ENDED_STATES = ['stopped', 'done'];

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
const claudeAt = (
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
  const pid = lockPidNow(ready, wenv);
  return pid === undefined ? [] : waitForExit(pid, wenv);
};

/** Whether claude rm ran clean and said removed; its exit code alone does not tell. */
export const saidRemoved = (result: ClaudeResult): boolean =>
  ranClean(result) && REMOVED.test(printedStreams(result).join('\n'));

// claude rm refuses a worktree a WorktreeCreate hook made.
const isHookMade = (ready: Ready): boolean =>
  physical(ready.worktree) !==
    physical(nativeFolder(ready.mainTop, ready.name)) ||
  ready.branch !== nativeBranch(ready.name);

// The re-run comes first: it restores what a cut-short claude rm deleted, and
// claude rm keeps a worktree with uncommitted changes. `args` is the claude rm
// that ran, which also completes the removal by hand: the discard line once it
// ran, else `rm <id>`.
function unknownAnswer(
  ready: Ready,
  args: string[],
  result: ClaudeResult,
): string[] {
  const what = ranClean(result)
    ? 'did not say removed, and finish does not know its answer'
    : failure(result);
  const command = `claude ${args.map(shellArg).join(' ')}`;
  const refused = withText(
    `${command} ${what}, so finish removed nothing more`,
    result,
  );
  if (isHookMade(ready)) {
    return [
      ...refused,
      `the worktree ${ready.worktree} on ${ready.branch} is not the one Claude Code makes for ${ready.name}, so a WorktreeCreate hook likely made it and claude rm will not remove it: remove it with that hook's own removal, then run ${ready.discardCommand}`,
    ];
  }
  return [
    ...refused,
    `run finish again with ${ready.rerun}, which restores any files claude rm deleted, then runs claude rm again; or complete the removal by hand with ${command}`,
  ];
}

// Runs claude rm's discard line only when it names the verified head; any
// other answer refuses, and nothing is lost. The offer counts whatever the
// exit code: claude rm exited 1 as it kept a job finish had just stopped
// (measured 2026-10-15, 2.1.300).
function discard(ready: Ready, wenv: WorkerEnv, kept: ClaudeResult): string[] {
  const text = printedStreams(kept).join('\n');
  const offer = DISCARD_LINE.exec(text);
  if (offer === null) return unknownAnswer(ready, ['rm', ready.id], kept);
  const [, sha, worktreeId] = offer;
  if (sha !== ready.head) {
    return withText(
      `claude rm offers to discard ${sha}, which is not ${ready.branch}'s verified head (${ready.head}), so finish did not run it`,
      kept,
    );
  }
  const args = ['rm', ready.id, '--discard-unpushed', `${sha}@${worktreeId}`];
  const result = claudeAt(ready, wenv, args, NO_LIMIT);
  return saidRemoved(result) ? [] : unknownAnswer(ready, args, result);
}

// claude rm's exit code does not say whether it removed or kept, so only its
// text tells. It runs with no limit, since any limit can cut its delete short.
export const removeSession: Step = (ready, wenv, out) => {
  const first = claudeAt(ready, wenv, ['rm', ready.id], NO_LIMIT);
  const issues = saidRemoved(first) ? [] : discard(ready, wenv, first);
  if (issues.length > 0) return issues;
  out(`session ${ready.id} removed`);
  return [];
};

// git worktree remove refuses an untracked file, and the report's copy in the
// worktree is untracked. When the saved copy holds the same bytes right now,
// deleting that one file loses nothing; any other case stays for git to refuse.
// A re-run finds the report `in place`, saved by the run before it.
function clearSavedReport(ready: Ready): void {
  const step = ready.reportStep;
  if (step.kind === 'none' || step.kind === 'no brief') return;
  if (step.from === step.to) return;
  try {
    const saved = fs.readFileSync(step.to);
    if (fs.readFileSync(step.from).equals(saved)) fs.unlinkSync(step.from);
  } catch {
    // A missing or unreadable copy stays, and git refuses on it.
  }
}

// The record is forgotten by now, so a re-run of finish finds nothing. The
// path resolves where the worker's name may not, as under --worktree.
const forgottenWayOut = (worktree: string): string =>
  `finish has forgotten the worker, so once you clear what stopped the removal, run sidekick worktree remove ${shellArg(worktree)}`;

// A worktree claude rm reported removed but git still lists is removed here when
// no live session holds it. Every refusal ends with the way out by its path.
function worktreeGoneIssues(ready: Ready, wenv: WorkerEnv): string[] {
  const { runGit, isAlive } = wenv;
  const { mainTop: top, worktree } = ready;
  const list = worktreeListed(runGit, top, worktree);
  if ('issue' in list) {
    return [
      `git worktree list failed, so finish cannot confirm the worktree is gone: ${list.issue}`,
      forgottenWayOut(worktree),
    ];
  }
  if (!list.listed) return [];
  const lock = lockStateOf(lockReasonOf(runGit, top, worktree), isAlive);
  if (lock.kind === 'dead' || lock.kind === 'none') clearSavedReport(ready);
  const issues = removeGitWorktree(runGit, top, worktree, lock);
  if (issues.length === 0) return [];
  return [
    `claude rm said removed, but git still lists the worktree ${worktree}`,
    ...issues,
    forgottenWayOut(worktree),
  ];
}

/**
 * Deletes `branch` only at the verified `head`, since update-ref -d refuses a
 * branch that moved, then its config section. A missing branch is fine.
 */
export function branchGoneIssues(
  runGit: Runner,
  top: string,
  branch: string,
  head: string,
): string[] {
  if (!branchExists(runGit, top, branch)) return [];
  const ref = `refs/heads/${branch}`;
  const result = runGit('git', ['update-ref', '-d', ref, head], top);
  if (result.code !== 0) {
    return [`git update-ref -d ${ref} failed: ${result.stderr.trim()}`];
  }
  return dropBranchConfig(runGit, top, branch);
}

// update-ref -d, unlike git branch -d, leaves the [branch "<name>"] section behind.
function dropBranchConfig(
  runGit: Runner,
  top: string,
  branch: string,
): string[] {
  const section = `branch.${branch}`;
  // --local: --remove-section writes only the local file.
  const has = runGit(
    'git',
    ['config', '--local', '--get-regexp', `^branch\\.${branch}\\.`],
    top,
  );
  if (has.code !== 0) return [];
  const result = runGit('git', ['config', '--remove-section', section], top);
  if (result.code === 0) return [];
  return [
    `git config --remove-section ${section} failed: ${result.stderr.trim()}`,
  ];
}

/** Removes a worktree claude rm left behind when no live session or other lock holds it, then deletes a leftover branch only at the verified head. */
export const removeLeftovers: Step = (ready, wenv, out) => {
  const worktree = worktreeGoneIssues(ready, wenv);
  if (worktree.length > 0) return worktree;
  out(`worktree ${ready.worktree} removed`);
  const branch = branchGoneIssues(
    wenv.runGit,
    ready.mainTop,
    ready.branch,
    ready.head,
  );
  if (branch.length > 0) return branch;
  out(`branch ${ready.branch} removed`);
  return [];
};

// `sidekick desk` lists workers from this record, so it goes with the session.
export const forgetRecord: Step = (ready) => {
  removeRecord(ready.commonDir, ready.name);
  return [];
};

const BACKUP_KINDS = ['landed', 'pushed', 'discarded'] as const;

/** Where the kept commits lived: landed, on a remote-tracking ref, or discarded on the operator's word. */
export type BackupKind = (typeof BACKUP_KINDS)[number];

/** The backup ref that keeps `head` under `name`, its kind saying where the commits lived. */
export const backupRef = (
  kind: BackupKind,
  name: string,
  head: string,
): string => `refs/sidekick/${kind}/${name}/${head}`;

/** The first backup ref of any kind that holds `head`, else undefined. */
export function heldBackup(
  runGit: Runner,
  top: string,
  name: string,
  head: string,
): string | undefined {
  return BACKUP_KINDS.map((kind) => backupRef(kind, name, head)).find(
    (ref) => commitOf(runGit, top, ref) === head,
  );
}

/** The backup ref `ready` writes, its kind taken from the verdict. */
export function readyBackup(ready: Ready): string {
  const { verdict } = ready;
  switch (verdict.kind) {
    case 'landed':
      return backupRef('landed', ready.name, ready.head);
    case 'discard':
      return backupRef('discarded', ready.name, ready.head);
    default: {
      const unhandled: never = verdict;
      throw new Error(`unhandled verdict: ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * Writes `ref` at `head`, create-only: update-ref's empty old value refuses an
 * existing ref. A ref already holding `head` counts as written, so a re-run
 * passes. Returns the issues, else [].
 */
export function writeBackup(
  runGit: Runner,
  top: string,
  ref: string,
  head: string,
): string[] {
  if (commitOf(runGit, top, ref) === head) return [];
  const result = runGit('git', ['update-ref', ref, head, ''], top);
  if (result.code === 0) return [];
  return [`cannot keep ${ref}: ${result.stderr.trim()}`];
}

/** Writes the backup ref at the verified head. */
export const keepBackup: Step = (ready, wenv) =>
  writeBackup(wenv.runGit, ready.mainTop, readyBackup(ready), ready.head);

/** In a partial removal, writes the deleted files back from the index, so claude rm meets a clean worktree. */
export const restorePartial: Step = (ready, wenv, out) => {
  if (!ready.partial) return [];
  const status = statusEntriesIn(wenv.runGit, ready.mainTop, ready.worktree);
  if ('issue' in status) {
    return [
      `git status failed in the worktree ${ready.worktree}: ${status.issue}`,
    ];
  }
  const deleted = status.entries
    .filter((entry) => entry.code === DELETED)
    .map((entry) => entry.path);
  if (deleted.length === 0) return [];
  // checkout-index refuses to overwrite a file that exists.
  const result = wenv.runGit(
    'git',
    ['-C', ready.worktree, 'checkout-index', '--', ...deleted],
    ready.mainTop,
  );
  if (result.code !== 0) {
    return [
      `git checkout-index failed in the worktree ${ready.worktree}, so finish removed nothing: ${result.stderr.trim()}`,
    ];
  }
  const files = `${deleted.length} deleted ${deleted.length === 1 ? 'file' : 'files'}`;
  out(
    `restored ${files} in ${ready.worktree} from its index, so claude rm finds it clean`,
  );
  return [];
};
