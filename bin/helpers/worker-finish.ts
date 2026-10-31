/**
 * `sidekick worker finish`: once a worker's branch has landed, saves its run
 * report in the main checkout and removes its session, desk record, worktree,
 * and branch.
 * It refuses whenever a step would lose work. The steps run in order, and the
 * first that fails stops the rest. It prints where the work landed, what became
 * of the report, then each removal: the session, the worktree, and the branch.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Runner } from './pm-data.js';
import { parseFlags } from './profile.js';
import type { WorkerEnv } from './worker.js';
import { type Brief, readBrief } from './worker-brief.js';
import { LISTING, listJobs } from './worker-jobs.js';
import { DEFAULT_CAP, landedIn } from './worker-landed.js';
import {
  checkedOut,
  commitOf,
  mainCheckout,
  statusPathsIn,
  WORKTREES_FOLDER,
} from './worker-repo.js';
import {
  forgetRecord,
  keepBackup,
  type Out,
  type Ready,
  type ReportStep,
  readIfPresent,
  readyBackup,
  removeLeftovers,
  removeSession,
  type Step,
  stopJob,
  type Verdict,
  type WorkerJob,
  waitForLock,
} from './worker-teardown.js';

/** Which landing `finish` checks for: a target, or none on the operator's word. */
export type FinishMode =
  | { kind: 'landed'; into: string | undefined }
  | { kind: 'discard' };

/** What `finish` was asked for, the brief's path absolute. */
export interface FinishOptions {
  brief: string;
  noReport: boolean;
  mode: FinishMode;
}

/** The length `finish` shortens a sha to in the landing line. */
export const SHORT_SHA = 7;

/**
 * Parses `finish`'s arguments, resolving the brief against `cwd`, the folder
 * the command was typed in. Undefined is a usage error.
 */
export function parseFinishArgs(
  rest: string[],
  cwd: string,
): FinishOptions | undefined {
  const parsed = parseFlags(rest, {
    'no-report': { type: 'boolean' },
    into: { type: 'string' },
    discard: { type: 'boolean' },
  });
  if (parsed === undefined || parsed.positionals.length !== 1) return undefined;
  const { into, discard } = parsed.values;
  if (discard === true && into !== undefined) return undefined;
  return {
    brief: path.resolve(cwd, parsed.positionals[0]),
    noReport: parsed.values['no-report'] === true,
    mode:
      discard === true
        ? { kind: 'discard' }
        : { kind: 'landed', into: typeof into === 'string' ? into : undefined },
  };
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

// The target's name: the full ref name git gives it, `HEAD` when detached, else
// the rev as typed, since a sha or `main~1` has no symbolic name.
function targetName(runGit: Runner, top: string, rev: string): string {
  const result = runGit('git', ['rev-parse', '--symbolic-full-name', rev], top);
  const name = result.code === 0 ? result.stdout.trim() : '';
  return name === '' ? rev : name;
}

type Target = { name: string; sha: string };

// The commit the work must have landed in: `--into`'s rev, else the main
// checkout's HEAD. The worker's own branch is no target, since it holds its head.
function resolveTarget(
  runGit: Runner,
  top: string,
  into: string | undefined,
  branch: string,
): Target | { issue: string } {
  const rev = into ?? 'HEAD';
  const sha = commitOf(runGit, top, rev);
  if (sha === undefined) {
    return {
      issue: `--into ${rev} names no commit in the main checkout's repo, so finish cannot check that ${branch} landed there: name a branch, tag, or commit that exists`,
    };
  }
  const name = targetName(runGit, top, rev);
  if (name === `refs/heads/${branch}`) {
    return {
      issue: `the target ${name} is the worker's own branch, which holds its head whether or not the work landed, so it cannot show the work landed there: name the branch it should land in with --into <rev>`,
    };
  }
  return { name, sha };
}

// How far the walk got, for the not-landed refusal.
function walkedText(walked: number, capped: boolean): string {
  const commits = `${walked} ${walked === 1 ? 'commit' : 'commits'}`;
  return capped
    ? `the history walk tried ${commits} and stopped at its cap of ${DEFAULT_CAP}`
    : `the history walk tried ${commits} and found no match`;
}

// The head of the worker's branch and where its content landed.
function landedHead(
  runGit: Runner,
  top: string,
  branch: string,
  opts: FinishOptions,
): { head: string; verdict: Verdict } | { issues: string[] } {
  const discard = `discarding it is your call, with sidekick worker finish ${opts.brief} --discard`;
  const head = commitOf(runGit, top, `refs/heads/${branch}`);
  if (head === undefined) {
    return {
      issues: [
        `the branch ${branch} does not exist, so finish cannot check that the work has landed: ${discard}`,
      ],
    };
  }
  if (opts.mode.kind === 'discard') {
    return { issues: ['finish --discard is not built yet'] };
  }
  const target = resolveTarget(runGit, top, opts.mode.into, branch);
  if ('issue' in target) return { issues: [target.issue] };
  const landing = landedIn(runGit, top, { target: target.sha, head });
  switch (landing.kind) {
    case 'landed':
      return {
        head,
        verdict: { kind: 'landed', target, at: landing.at },
      };
    case 'error':
      return {
        issues: [
          `finish cannot check that ${branch} landed in ${target.name}: ${landing.issue}`,
        ],
      };
    case 'not landed':
      return {
        issues: [
          `${branch} has not landed in ${target.name} (${target.sha}): its head ${head} is not there, and ${walkedText(landing.walked, landing.capped)}. Land it and run finish again; name the target with --into <rev>; ${discard}`,
        ],
      };
    default: {
      const unhandled: never = landing;
      throw new Error(`unhandled landing: ${JSON.stringify(unhandled)}`);
    }
  }
}

// landedHead checks only the branch, so the worktree must have that branch
// checked out. That also proves the folder is the worktree, not a folder of an
// enclosing repo.
function onBranchIssues(
  runGit: Runner,
  worktree: string,
  branch: string,
  brief: string,
): string[] {
  const head = checkedOut(runGit, worktree);
  if (head === `refs/heads/${branch}`) return [];
  return [
    `the worktree ${worktree} has ${head} checked out, not ${branch}, so finish cannot check that its commits have landed: check out ${branch} there and run finish again; discarding it is your call, with sidekick worker finish ${brief} --discard`,
  ];
}

// Uncommitted work in the worktree, which removing it would destroy; the
// report alone is allowed, since saveReport saves it.
function dirtyIssues(
  runGit: Runner,
  top: string,
  worktree: string,
  report: string,
): string[] {
  const status = statusPathsIn(runGit, top, worktree);
  if ('issue' in status) {
    return [`git status failed in the worktree ${worktree}: ${status.issue}`];
  }
  const others = status.paths.filter((file) => file !== report);
  if (others.length === 0) return [];
  return [
    `the worktree ${worktree} holds uncommitted work besides the report, which its removal would destroy: ${others.join(', ')}. Commit and integrate it, or remove it, then run finish again`,
  ];
}

// An identical report already in place is not a refusal, so this check lets a
// re-run through after a failed step.
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
  const landed = landedHead(wenv.runGit, top, branch, opts);
  const worktreeIssues = [
    ...onBranchIssues(wenv.runGit, worktree, branch, opts.brief),
    ...dirtyIssues(wenv.runGit, top, worktree, report),
  ];
  const step = reportStep(reportFrom, reportTo, opts.noReport);
  if (
    'issues' in landed ||
    worktreeIssues.length > 0 ||
    typeof step !== 'string'
  ) {
    return {
      issues: [
        ...('issues' in landed ? landed.issues : []),
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
    head: landed.head,
    verdict: landed.verdict,
    brief: opts.brief,
    report,
    reportFrom,
    reportTo,
    reportStep: step,
  };
}

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

// A commit made after landedHead's check was never checked, and the removal loses it.
function headMovedIssues(runGit: Runner, ready: Ready): string[] {
  const now = commitOf(runGit, ready.top, `refs/heads/${ready.branch}`);
  if (now === ready.head) return [];
  if (now === undefined) {
    return [
      `the branch ${ready.branch} is gone, so finish cannot confirm its head is still ${ready.head}, the head it verified`,
    ];
  }
  return [
    `${ready.branch} moved to ${now} after finish verified its head ${ready.head}, so finish has not checked the new commits: run finish again`,
  ];
}

// The job may have run on through checkFinish, and a discard destroys what it
// left, so the worktree is checked again once its process is gone.
const recheckWorktree: Step = (ready, wenv) => {
  const issues = [
    ...onBranchIssues(wenv.runGit, ready.worktree, ready.branch, ready.brief),
    ...headMovedIssues(wenv.runGit, ready),
    ...dirtyIssues(wenv.runGit, ready.top, ready.worktree, ready.report),
    ...reportChangedIssues(ready),
  ];
  if (issues.length === 0) return [];
  return [
    'the worktree changed after finish checked it, so finish removed nothing:',
    ...issues,
  ];
};

// The landing line, so the operator sees what the check found before any removal.
const sayVerdict: Step = (ready, _wenv, out) => {
  const { verdict } = ready;
  switch (verdict.kind) {
    case 'landed':
      out(
        `${ready.branch} landed in ${verdict.target.name} at ${verdict.at.slice(0, SHORT_SHA)}`,
      );
      return [];
    case 'discard':
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
    `${ready.branch} is kept as ${ref}: restore it with git branch ${ready.branch} ${ref}`,
  );
  return [];
};

// In order: nothing is removed until the report is saved, the job has stopped,
// the worktree has passed its checks again, and the branch is kept in a backup ref.
const STEPS: Step[] = [
  sayVerdict,
  saveReport,
  stopJob,
  waitForLock,
  recheckWorktree,
  keepBackup,
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
