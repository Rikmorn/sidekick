/**
 * `sidekick worker finish`: once a worker's branch has landed, saves its run
 * report in the checkout that holds the brief and removes its session, desk
 * record, worktree, and branch. It runs from any checkout of the repo, and
 * finds the worktree wherever its creator made it.
 * It refuses whenever a step would lose work. The steps run in order, and the
 * first that fails stops the rest. It prints the target and why, where the work
 * landed, what became of the report, any files it restored, then each removal:
 * the session, the worktree, and the branch. Its last line names the backup ref.
 * The arguments, the target, the worktree checks, and the report each live in
 * a `worker-finish-*` module of their own.
 */

import * as path from 'node:path';
import { configDirOf } from './main-session.js';
import { shellArg } from './shell.js';
import type { WorkerEnv } from './worker.js';
import { type Brief, readBrief } from './worker-brief.js';
import {
  discardCommandFor,
  type FinishOptions,
  rerunCommand,
} from './worker-finish-args.js';
import {
  reportChangedIssues,
  reportStep,
  saveReport,
} from './worker-finish-report.js';
import { branchVerdict } from './worker-finish-target.js';
import {
  dirtyIssues,
  type FoundWorktree,
  headMovedIssues,
  notFoundIssues,
  onBranchIssues,
  type Places,
  placesFor,
  statusBesideReport,
  unlinkedIssues,
  worktreeCheck,
} from './worker-finish-tree.js';
import { LISTING, listJobs } from './worker-jobs.js';
import { checkoutFacts, checkoutOf, commitOf } from './worker-repo.js';
import {
  forgetRecord,
  keepBackup,
  type Out,
  type Ready,
  type ReportStep,
  readyBackup,
  removeLeftovers,
  removeSession,
  restorePartial,
  type Step,
  stopJob,
  type Verdict,
  type WorkerJob,
  waitForLock,
} from './worker-teardown.js';
import { locateWorktree } from './worker-worktree.js';

/** The length `finish` shortens a sha to in the landing line. */
export const SHORT_SHA = 7;

// The listed job, with the places its session is known to have started.
type ListedWorker = WorkerJob & {
  cwd: string | undefined;
  sessionId: string | undefined;
};

// The one listed session by the brief's name, which must be a background job.
function findJob(
  wenv: WorkerEnv,
  top: string,
  name: string,
): ListedWorker | { issues: string[] } {
  const listed = listJobs(wenv.runClaude, top);
  if ('issues' in listed) return listed;
  const matches = listed.jobs.filter((job) => job.name === name);
  if (matches.length === 0) {
    return {
      issues: [
        `no session in ${LISTING} is named "${name}". If finish already removed it, clear any worktree or branch it left by hand; otherwise check the name in the brief`,
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
  const [{ id, state, cwd, sessionId }] = matches;
  if (id === undefined) {
    return {
      issues: [
        `the session named "${name}" is an interactive session, not a worker job: finish clears only a worker that sidekick worker dispatch started`,
      ],
    };
  }
  return { id, state, cwd, sessionId };
}

// The checkout holding the brief, undefined when its folder is in none.
function briefTopOf(wenv: WorkerEnv, folder: string): string | undefined {
  const found = checkoutOf(wenv.runGit, folder);
  return 'top' in found ? found.top : undefined;
}

// The worker's worktree, from its transcript, its listing's cwd, or Claude
// Code's own branch name.
function worktreeOf(
  wenv: WorkerEnv,
  name: string,
  tops: { mainTop: string; briefTop: string | undefined },
  job: ListedWorker,
): FoundWorktree | { issues: string[] } {
  const found = locateWorktree({
    runGit: wenv.runGit,
    configDir: configDirOf(wenv.env, wenv.home),
    name,
    ...tops,
    sessionId: job.sessionId,
    listingCwd: job.cwd,
    operatorPath: undefined,
  });
  if ('issue' in found) {
    return {
      issues: [
        `git worktree list failed, so finish cannot find the worktree of ${name}: ${found.issue}`,
      ],
    };
  }
  if (found.kind === 'not found') {
    return { issues: notFoundIssues(name, found.tried) };
  }
  return found;
}

// The checkouts, the listed job, and where its worktree, branch, and report sit.
function locate(
  brief: Brief,
  opts: FinishOptions,
  wenv: WorkerEnv,
):
  | { places: Places; job: ListedWorker; commonDir: string }
  | { issues: string[] } {
  const facts = checkoutFacts(wenv.runGit, wenv.cwd);
  if ('issues' in facts) return facts;
  const { mainTop, launchTop, commonDir } = facts;
  const job = findJob(wenv, mainTop, brief.name);
  if ('issues' in job) return job;
  const briefFolder = path.dirname(opts.brief);
  const briefTop = briefTopOf(wenv, briefFolder);
  const found = worktreeOf(wenv, brief.name, { mainTop, briefTop }, job);
  if ('issues' in found) return found;
  const tops = { mainTop, launchTop, briefTop, briefFolder };
  return { places: placesFor(tops, found, brief), job, commonDir };
}

// Every refusal the checks found, in the order they ran.
function allIssues(
  landed: { head: string; verdict: Verdict } | { issues: string[] },
  worktreeIssues: string[],
  step: ReportStep | { issues: string[] },
): string[] {
  return [
    ...('issues' in landed ? landed.issues : []),
    ...worktreeIssues,
    ...('issues' in step ? step.issues : []),
  ];
}

// Every check of the worktree needs the job's id, so those run once it is found.
function checkFinish(
  brief: Brief,
  opts: FinishOptions,
  wenv: WorkerEnv,
): Ready | { issues: string[] } {
  const located = locate(brief, opts, wenv);
  if ('issues' in located) return located;
  const { places, job } = located;
  const { mainTop, worktree } = places;
  const unlinked = unlinkedIssues(wenv.runGit, mainTop, worktree, job.id);
  if (unlinked.length > 0) return { issues: unlinked };
  // The partial check reads the head even when the landed check refuses, since
  // a refusal runs no step and so restores nothing.
  const head = commitOf(wenv.runGit, mainTop, `refs/heads/${places.branch}`);
  const branch = { name: places.branch, head };
  const ctx = { ...places, briefTarget: brief.target };
  const landed = branchVerdict(wenv.runGit, ctx, branch, opts, job.id);
  const worker = { name: brief.name, id: job.id, head };
  const tree = worktreeCheck(wenv.runGit, places, worker, opts);
  const step = reportStep(places, opts.noReport, tree.partial);
  if ('issues' in landed || tree.issues.length > 0 || 'issues' in step) {
    return { issues: allIssues(landed, tree.issues, step) };
  }
  return {
    id: job.id,
    state: job.state,
    name: brief.name,
    mainTop,
    briefTop: places.briefTop,
    commonDir: located.commonDir,
    worktree,
    branch: places.branch,
    head: landed.head,
    report: places.report,
    reportFrom: places.reportFrom,
    reportStep: step,
    verdict: landed.verdict,
    brief: opts.brief,
    rerun: rerunCommand(opts),
    discardCommand: discardCommandFor(opts),
    partial: tree.partial,
  };
}

// The job may have run on through checkFinish, and a discard destroys what it
// left, so the worktree is checked again once its process is gone.
const recheckWorktree: Step = (ready, wenv) => {
  const issues = [
    ...onBranchIssues(
      wenv.runGit,
      ready.worktree,
      ready.branch,
      ready.verdict.kind,
      ready.discardCommand,
      ready.id,
    ),
    ...headMovedIssues(wenv.runGit, ready),
    ...dirtyIssues(
      ready.worktree,
      statusBesideReport(wenv.runGit, ready),
      ready.partial,
      ready.verdict.kind,
    ),
    ...reportChangedIssues(ready),
  ];
  if (issues.length === 0) return [];
  return [
    'the worktree changed after finish checked it, so finish removed nothing:',
    ...issues,
  ];
};

// The target and why, then the landing line, so the operator sees what the
// check found before any removal. Discard mode has no target.
const sayVerdict: Step = (ready, _wenv, out) => {
  const { verdict } = ready;
  switch (verdict.kind) {
    case 'landed':
      out(`target: ${verdict.target.name} (${verdict.target.why})`);
      out(
        `${ready.branch} landed in ${verdict.target.name} at ${verdict.at.slice(0, SHORT_SHA)}`,
      );
      return [];
    case 'discard':
      out(`${ready.branch} is discarded on your word`);
      return [];
    default: {
      const unhandled: never = verdict;
      throw new Error(`unhandled verdict: ${JSON.stringify(unhandled)}`);
    }
  }
};

// The last line: where the branch's commits stay once the branch is deleted.
const sayBackup: Step = (ready, _wenv, out) => {
  const ref = readyBackup(ready);
  out(
    `${ready.branch} is kept as ${ref}: restore it with git branch ${shellArg(ready.branch)} ${shellArg(ref)}`,
  );
  return [];
};

// In order: nothing is removed until the report is saved, the job has stopped,
// the worktree has passed its checks again, the branch is kept in a backup ref,
// and a partial removal's deleted files are back.
const STEPS: Step[] = [
  sayVerdict,
  saveReport,
  stopJob,
  waitForLock,
  recheckWorktree,
  keepBackup,
  restorePartial,
  removeSession,
  forgetRecord,
  removeLeftovers,
  sayBackup,
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
