/**
 * `sidekick worker finish`: once a worker's branch is integrated, saves its run
 * report in the main checkout and removes its session, worktree, and branch.
 * It refuses whenever a step would lose work. The steps run in order, each
 * printing what it did, and the first that fails stops the rest.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Runner, RunResult } from './pm-data.js';
import { parseFlags } from './profile.js';
import { type ClaudeResult, printedStreams } from './profile-launch.js';
import type { WorkerEnv } from './worker.js';
import { type Brief, readBrief } from './worker-brief.js';
import { LISTING, listJobs } from './worker-jobs.js';
import {
  branchExists,
  commitOf,
  mainCheckout,
  WORKTREES_FOLDER,
} from './worker-repo.js';

type Out = (line: string) => void;

/** What `finish` was asked for, the brief's path absolute. */
export interface FinishOptions {
  brief: string;
  noReport: boolean;
}

/**
 * Parses `finish`'s arguments, resolving the brief against `cwd`, the folder
 * the command was typed in. Undefined is a usage error.
 */
export function parseFinishArgs(
  rest: string[],
  cwd: string,
): FinishOptions | undefined {
  const parsed = parseFlags(rest, { 'no-report': { type: 'boolean' } });
  if (parsed === undefined || parsed.positionals.length !== 1) return undefined;
  return {
    brief: path.resolve(cwd, parsed.positionals[0]),
    noReport: parsed.values['no-report'] === true,
  };
}

// `claude stop` fails on a session that has already exited.
const ENDED_STATES = ['stopped', 'done'];

const REMOVED = /^removed\b/;

// claude rm's offer to discard the commits no remote holds: `<sha>@<worktree id>`.
const DISCARD_LINE = /--discard-unpushed ([0-9a-f]{40})@([0-9a-f]+)/;

// The lock reads `claude session <name> (pid <n> start <date>)`.
const LOCK_PID = /\(pid (\d+)\b/;

// The listed job the brief names.
interface WorkerJob {
  id: string;
  state: string | undefined;
}

// The one listed session by the brief's name, which must be a background job.
function findJob(
  wenv: WorkerEnv,
  top: string,
  name: string,
): WorkerJob | { issues: string[] } {
  const listed = listJobs(wenv.runClaude, top);
  if ('issues' in listed) return listed;
  const matches = listed.jobs.filter((job) => job.name === name);
  if (matches.length === 0) {
    return {
      issues: [
        `no session in ${LISTING} is named "${name}": check the name in the brief; finish clears only a worker that claude still lists`,
      ],
    };
  }
  if (matches.length > 1) {
    const which = matches.map((job) => job.id ?? 'an interactive session');
    return {
      issues: [
        `${matches.length} sessions in ${LISTING} are named "${name}" (${which.join(', ')}), so finish cannot tell which is the worker: clear the worker by hand with claude rm <id>`,
      ],
    };
  }
  const [{ id, state }] = matches;
  if (id === undefined) {
    return {
      issues: [
        `the session named "${name}" is an interactive session, not a worker job: finish clears only a worker that sidekick worker dispatch started`,
      ],
    };
  }
  return { id, state };
}

// The head of the worker's branch, once the main checkout's HEAD holds it.
function integratedHead(
  runGit: Runner,
  top: string,
  branch: string,
  id: string,
): { head: string } | { issues: string[] } {
  const discard = `discarding it is your call, with claude rm ${id}`;
  const head = commitOf(runGit, top, `refs/heads/${branch}`);
  if (head === undefined) {
    return {
      issues: [
        `the branch ${branch} does not exist, so finish cannot check that the work is integrated: ${discard}`,
      ],
    };
  }
  const merge = ['merge-base', '--is-ancestor', head, 'HEAD'];
  if (runGit('git', merge, top).code === 0) return { head };
  return {
    issues: [
      `${branch} is not integrated: its head ${head} is not in the main checkout's HEAD. Integrate it and run finish again; ${discard}`,
    ],
  };
}

// What `git symbolic-ref -q HEAD` says is checked out; it exits 1 on a detached HEAD.
function checkedOut(result: RunResult): string {
  if (result.code === 0) return result.stdout.trim();
  if (result.code === 1) return 'a detached HEAD';
  return `an unreadable HEAD (${result.stderr.trim()})`;
}

// integratedHead checks only the branch, so the worktree must have that branch
// checked out. That also proves the folder is the worktree, not a folder of an
// enclosing repo.
function onBranchIssues(
  runGit: Runner,
  worktree: string,
  branch: string,
  id: string,
): string[] {
  const head = checkedOut(
    runGit('git', ['symbolic-ref', '-q', 'HEAD'], worktree),
  );
  if (head === `refs/heads/${branch}`) return [];
  return [
    `the worktree ${worktree} has ${head} checked out, not ${branch}, so finish cannot check that its commits are integrated: check out ${branch} there and run finish again; discarding it is your call, with claude rm ${id}`,
  ];
}

// A rename or copy entry carries its source path in the next field.
const RENAMED = /^(?:[RC].|.[RC]) /;
const STATUS_PREFIX = 'XY '.length;

// Every path `git status --porcelain -z` names, sources of renames included.
function statusPaths(stdout: string): string[] {
  const fields = stdout.split('\0').filter((field) => field !== '');
  const paths: string[] = [];
  let i = 0;
  while (i < fields.length) {
    const entry = fields[i];
    const source = RENAMED.test(entry) ? fields.at(i + 1) : undefined;
    paths.push(entry.slice(STATUS_PREFIX));
    if (source !== undefined) paths.push(source);
    i += source === undefined ? 1 : 2;
  }
  return paths;
}

// Uncommitted work in the worktree, which removing it would destroy; the
// report alone is allowed, since saveReport saves it.
function dirtyIssues(
  runGit: Runner,
  top: string,
  worktree: string,
  report: string,
): string[] {
  // -uall names each untracked file, where the default names only its folder.
  const status = runGit(
    'git',
    ['-C', worktree, 'status', '--porcelain', '-z', '--untracked-files=all'],
    top,
  );
  if (status.code !== 0) {
    return [
      `git status failed in the worktree ${worktree}: ${status.stderr.trim()}`,
    ];
  }
  const others = statusPaths(status.stdout).filter((file) => file !== report);
  if (others.length === 0) return [];
  return [
    `the worktree ${worktree} holds uncommitted work besides the report, which its removal would destroy: ${others.join(', ')}. Commit and integrate it, or remove it, then run finish again`,
  ];
}

// What saveReport does with the report.
type ReportStep = 'copy' | 'in place' | 'none';

const isMissing = (e: unknown): boolean =>
  e instanceof Error && 'code' in e && e.code === 'ENOENT';

// A file's bytes, undefined when it does not exist. Any other failure is an
// issue, so an unreadable report is never taken for a missing one.
function readIfPresent(
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

// An identical report already in place is not a refusal, so a re-run after a
// failed step goes through.
function reportStep(
  from: string,
  to: string,
  noReport: boolean,
): ReportStep | { issues: string[] } {
  const worker = readIfPresent(from);
  if ('issue' in worker) return { issues: [worker.issue] };
  if (worker.data === undefined) {
    if (noReport) return 'none';
    return {
      issues: [
        `the worktree has no run report at ${from}: ask the worker for it, or pass --no-report to finish without one`,
      ],
    };
  }
  const saved = readIfPresent(to);
  if ('issue' in saved) return { issues: [saved.issue] };
  if (saved.data === undefined) return 'copy';
  if (saved.data.equals(worker.data)) return 'in place';
  return {
    issues: [
      `${to} already exists and differs from the worker's report at ${from}: move one aside, then run finish again`,
    ],
  };
}

// Everything the steps need once the checks pass.
interface Ready extends WorkerJob {
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

// Every check of the worktree needs the job's id, so those run once it is found.
function checkFinish(
  brief: Brief,
  opts: FinishOptions,
  wenv: WorkerEnv,
): Ready | { issues: string[] } {
  const checkout = mainCheckout(wenv.runGit, wenv.cwd);
  if ('issues' in checkout) return checkout;
  const { top, commonDir } = checkout;
  const job = findJob(wenv, top, brief.name);
  if ('issues' in job) return job;
  const worktree = path.join(top, WORKTREES_FOLDER, brief.name);
  const branch = `worktree-${brief.name}`;
  // git status prints paths in this form.
  const report = path.posix.normalize(brief.report);
  const reportFrom = path.join(worktree, report);
  const reportTo = path.join(top, report);
  const integrated = integratedHead(wenv.runGit, top, branch, job.id);
  const worktreeIssues = [
    ...onBranchIssues(wenv.runGit, worktree, branch, job.id),
    ...dirtyIssues(wenv.runGit, top, worktree, report),
  ];
  const step = reportStep(reportFrom, reportTo, opts.noReport);
  if (
    'issues' in integrated ||
    worktreeIssues.length > 0 ||
    typeof step !== 'string'
  ) {
    return {
      issues: [
        ...('issues' in integrated ? integrated.issues : []),
        ...worktreeIssues,
        ...(typeof step === 'string' ? [] : step.issues),
      ],
    };
  }
  return {
    ...job,
    name: brief.name,
    top,
    commonDir,
    worktree,
    branch,
    head: integrated.head,
    report,
    reportFrom,
    reportTo,
    reportStep: step,
  };
}

type Step = (ready: Ready, wenv: WorkerEnv, out: Out) => string[];

// COPYFILE_EXCL keeps a report that appeared after the check.
function copyReport(ready: Ready, out: Out): string[] {
  try {
    fs.mkdirSync(path.dirname(ready.reportTo), { recursive: true });
    fs.copyFileSync(
      ready.reportFrom,
      ready.reportTo,
      fs.constants.COPYFILE_EXCL,
    );
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return [`cannot save the report to ${ready.reportTo}: ${why}`];
  }
  out(`report saved to ${ready.reportTo}`);
  return [];
}

const saveReport: Step = (ready, _wenv, out) => {
  switch (ready.reportStep) {
    case 'copy':
      return copyReport(ready, out);
    case 'in place':
      out(`report already at ${ready.reportTo}`);
      return [];
    case 'none':
      out('no report to save: the worktree holds none');
      return [];
    default: {
      const unhandled: never = ready.reportStep;
      throw new Error(`unhandled report step: ${unhandled}`);
    }
  }
};

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

const stopJob: Step = (ready, wenv) => {
  if (ready.state !== undefined && ENDED_STATES.includes(ready.state)) {
    return [];
  }
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
const waitForLock: Step = (ready, wenv) => {
  const pid = lockPid(ready.commonDir, ready.name);
  return pid === undefined ? [] : waitForExit(pid, wenv);
};

// The worker's report now: still absent under --no-report, else still the copy.
function reportChangedIssues(ready: Ready): string[] {
  const now = readIfPresent(ready.reportFrom);
  if ('issue' in now) return [now.issue];
  if (ready.reportStep === 'none') {
    if (now.data === undefined) return [];
    return [`a run report appeared at ${ready.reportFrom}`];
  }
  const saved = readIfPresent(ready.reportTo);
  if ('issue' in saved) return [saved.issue];
  const same =
    now.data !== undefined &&
    saved.data !== undefined &&
    now.data.equals(saved.data);
  if (same) return [];
  return [
    `the worker's report at ${ready.reportFrom} no longer matches the copy at ${ready.reportTo}`,
  ];
}

// The job may have run on through checkFinish, and a discard destroys what it
// left, so the worktree is checked again once its process is gone.
const recheckWorktree: Step = (ready, wenv) => {
  const issues = [
    ...onBranchIssues(wenv.runGit, ready.worktree, ready.branch, ready.id),
    ...dirtyIssues(wenv.runGit, ready.top, ready.worktree, ready.report),
    ...reportChangedIssues(ready),
  ];
  if (issues.length === 0) return [];
  return [
    'the worktree changed after finish checked it, so finish removed nothing:',
    ...issues,
  ];
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
// other answer refuses, and nothing is lost.
function discard(ready: Ready, wenv: WorkerEnv, kept: ClaudeResult): string[] {
  const text = printedStreams(kept).join('\n');
  const offer = ranClean(kept) ? DISCARD_LINE.exec(text) : null;
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

// claude rm exits 0 whether it removes or keeps, so only its text tells.
const removeSession: Step = (ready, wenv, out) => {
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

const removeLeftovers: Step = (ready, wenv, out) => {
  const worktree = worktreeGoneIssues(wenv.runGit, ready.top, ready.worktree);
  if (worktree.length > 0) return worktree;
  out(`worktree ${ready.worktree} removed`);
  const branch = branchGoneIssues(wenv.runGit, ready.top, ready.branch);
  if (branch.length > 0) return branch;
  out(`branch ${ready.branch} removed`);
  return [];
};

// In order: nothing is removed until the report is saved, the job has stopped,
// and the worktree has passed its checks again.
const STEPS: Step[] = [
  saveReport,
  stopJob,
  waitForLock,
  recheckWorktree,
  removeSession,
  removeLeftovers,
];

// The refusal, or the failure of the first step that fails.
function finishIssues(
  opts: FinishOptions,
  wenv: WorkerEnv,
  out: Out,
): string[] {
  const read = readBrief(opts.brief);
  if ('issues' in read) return read.issues;
  const ready = checkFinish(read.brief, opts, wenv);
  if ('issues' in ready) return ready.issues;
  for (const step of STEPS) {
    const issues = step(ready, wenv, out);
    if (issues.length > 0) return issues;
  }
  return [];
}

/** Runs `finish`; returns 0 once every step succeeded, else 1. */
export function finish(
  opts: FinishOptions,
  wenv: WorkerEnv,
  out: Out,
  err: Out,
): number {
  const issues = finishIssues(opts, wenv, out);
  for (const issue of issues) err(issue);
  return issues.length === 0 ? 0 : 1;
}
