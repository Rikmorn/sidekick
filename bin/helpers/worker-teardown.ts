/**
 * The steps `sidekick worker finish` runs once its checks pass: stopping the
 * worker's job, waiting out its lock, keeping the branch in a backup ref,
 * restoring the files a cut-short removal deleted, removing the session,
 * forgetting the desk record, confirming the worktree is gone, and deleting a
 * leftover branch at its verified head.
 * Each step returns the issues that stop the run, none on success.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Runner } from './pm-data.js';
import { type ClaudeResult, printedStreams } from './profile-launch.js';
import type { WorkerEnv } from './worker.js';
import { removeRecord } from './worker-record.js';
import {
  branchExists,
  commitOf,
  DELETED,
  statusEntriesIn,
  worktreeListed,
} from './worker-repo.js';

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

/**
 * What saveReport does with the report. `saved earlier` is a partial
 * removal's copy in the main checkout, once the worktree's has gone.
 */
export type ReportStep = 'copy' | 'in place' | 'saved earlier' | 'none';

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

// What the landed check found. `target.name` is `git rev-parse
// --symbolic-full-name`'s answer (`HEAD` when detached), else the rev as typed.
export type Verdict =
  | { kind: 'landed'; target: { name: string; sha: string }; at: string }
  | { kind: 'discard' };

// Everything the steps need once the checks pass; `brief` is its absolute path.
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
  verdict: Verdict;
  brief: string;
  /** The command that repeats this run, with the flags it was given. */
  rerun: string;
  /** The command that discards the worker, with the run's `--no-report`. */
  discardCommand: string;
  /** A removal an earlier run cut short: deleted files alone, at a head a backup ref already holds. */
  partial: boolean;
}

export type Step = (ready: Ready, wenv: WorkerEnv, out: Out) => string[];

// spawnSync reads a timeout of 0 as no limit.
const NO_LIMIT = 0;

// Runs claude from the top; the default 30 s matches the agents listing's limit.
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

// The re-run comes first: it restores what a cut-short claude rm deleted, and
// claude rm keeps a worktree with uncommitted changes. `args` is the claude rm
// that ran, which also completes the removal by hand: the discard line once it
// ran, else `rm <id>`.
function unknownAnswer(
  rerun: string,
  args: string[],
  result: ClaudeResult,
): string[] {
  const what = ranClean(result)
    ? 'did not say removed, and finish does not know its answer'
    : failure(result);
  const command = `claude ${args.join(' ')}`;
  return [
    ...withText(`${command} ${what}, so finish removed nothing more`, result),
    `run finish again with ${rerun}, which restores any files claude rm deleted, then runs claude rm again; or complete the removal by hand with ${command}`,
  ];
}

// Runs claude rm's discard line only when it names the verified head; any
// other answer refuses, and nothing is lost. The offer counts whatever the
// exit code: claude rm exited 1 as it kept a job finish had just stopped
// (measured 2026-10-15, 2.1.300).
function discard(ready: Ready, wenv: WorkerEnv, kept: ClaudeResult): string[] {
  const text = printedStreams(kept).join('\n');
  const offer = DISCARD_LINE.exec(text);
  if (offer === null) return unknownAnswer(ready.rerun, ['rm', ready.id], kept);
  const [, sha, worktreeId] = offer;
  if (sha !== ready.head) {
    return withText(
      `claude rm offers to discard ${sha}, which is not ${ready.branch}'s verified head (${ready.head}), so finish did not run it`,
      kept,
    );
  }
  const args = ['rm', ready.id, '--discard-unpushed', `${sha}@${worktreeId}`];
  const result = claudeAt(ready, wenv, args, NO_LIMIT);
  return saidRemoved(result) ? [] : unknownAnswer(ready.rerun, args, result);
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

function worktreeGoneIssues(
  runGit: Runner,
  top: string,
  worktree: string,
): string[] {
  const list = worktreeListed(runGit, top, worktree);
  if ('issue' in list) {
    return [
      `git worktree list failed, so finish cannot confirm the worktree is gone: ${list.issue}`,
    ];
  }
  return list.listed
    ? [`claude rm said removed, but git still lists the worktree ${worktree}`]
    : [];
}

// update-ref -d with the verified head refuses a branch that moved.
function branchGoneIssues(
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

/** Confirms the worktree is gone, then deletes a leftover branch only at the verified head. */
export const removeLeftovers: Step = (ready, wenv, out) => {
  const worktree = worktreeGoneIssues(wenv.runGit, ready.top, ready.worktree);
  if (worktree.length > 0) return worktree;
  out(`worktree ${ready.worktree} removed`);
  const branch = branchGoneIssues(
    wenv.runGit,
    ready.top,
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

/** The backup ref that keeps `head` under `name`: one kind for landed work, one for discarded. */
export const backupRef = (
  kind: 'landed' | 'discarded',
  name: string,
  head: string,
): string => `refs/sidekick/${kind}/${name}/${head}`;

const BACKUP_KINDS = ['landed', 'discarded'] as const;

/** The first backup ref of either kind that holds `head`, else undefined. */
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

/** Writes the backup ref at the verified head; update-ref's empty old value refuses an existing ref. */
export const keepBackup: Step = (ready, wenv) => {
  const ref = readyBackup(ready);
  // A ref already holding the head counts as written, so a re-run passes.
  if (commitOf(wenv.runGit, ready.top, ref) === ready.head) return [];
  const result = wenv.runGit(
    'git',
    ['update-ref', ref, ready.head, ''],
    ready.top,
  );
  if (result.code === 0) return [];
  return [`cannot keep ${ref}: ${result.stderr.trim()}`];
};

/** In a partial removal, writes the deleted files back from the index, so claude rm meets a clean worktree. */
export const restorePartial: Step = (ready, wenv, out) => {
  if (!ready.partial) return [];
  const status = statusEntriesIn(wenv.runGit, ready.top, ready.worktree);
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
    ready.top,
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
