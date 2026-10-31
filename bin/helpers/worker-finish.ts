/**
 * `sidekick worker finish`: once a worker's branch has landed, saves its run
 * report in the main checkout and removes its session, desk record, worktree,
 * and branch.
 * It refuses whenever a step would lose work. The steps run in order, and the
 * first that fails stops the rest. It prints where the work landed, what became
 * of the report, any files it restored, then each removal: the session, the
 * worktree, and the branch. Its last line names the backup ref.
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
  DELETED,
  mainCheckout,
  type StatusEntry,
  statusEntriesIn,
  WORKTREES_FOLDER,
  worktreeListed,
} from './worker-repo.js';
import {
  forgetRecord,
  heldBackup,
  keepBackup,
  type Out,
  type Ready,
  type ReportStep,
  readIfPresent,
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

// A refusal's way out. Discard mode never offers --discard, the command already running.
const discardRoute = (brief: string): string =>
  `discarding it is your call, with sidekick worker finish ${brief} --discard`;
const handRoute = (id: string): string =>
  `to clear it by hand, claude rm ${id}`;

// The way out for a mode: landed mode offers the discard, discard mode the hand route.
function routeFor(mode: FinishMode['kind'], brief: string, id: string): string {
  switch (mode) {
    case 'landed':
      return discardRoute(brief);
    case 'discard':
      return handRoute(id);
    default: {
      const unhandled: never = mode;
      throw new Error(`unhandled mode: ${unhandled}`);
    }
  }
}

function missingBranchIssue(
  branch: string,
  opts: FinishOptions,
  id: string,
): string {
  switch (opts.mode.kind) {
    case 'landed':
      return `the branch ${branch} does not exist, so finish cannot check that the work has landed: discarding it is your call, with claude rm ${id}`;
    case 'discard':
      return `the branch ${branch} does not exist, so finish has nothing to keep as a backup: clear the worker by hand with claude rm ${id}`;
    default: {
      const unhandled: never = opts.mode;
      throw new Error(`unhandled mode: ${JSON.stringify(unhandled)}`);
    }
  }
}

// The verdict for a branch head: the operator's word, or where the head landed.
function verdictFor(
  runGit: Runner,
  top: string,
  branch: string,
  head: string,
  opts: FinishOptions,
): { verdict: Verdict } | { issues: string[] } {
  if (opts.mode.kind === 'discard') return { verdict: { kind: 'discard' } };
  const target = resolveTarget(runGit, top, opts.mode.into, branch);
  if ('issue' in target) return { issues: [target.issue] };
  const landing = landedIn(runGit, top, { target: target.sha, head });
  switch (landing.kind) {
    case 'landed':
      return { verdict: { kind: 'landed', target, at: landing.at } };
    case 'error':
      return {
        issues: [
          `finish cannot check that ${branch} landed in ${target.name}: ${landing.issue}`,
        ],
      };
    case 'not landed':
      return {
        issues: [
          `${branch} has not landed in ${target.name} (${target.sha}): its head ${head} is not there, and ${walkedText(landing.walked, landing.capped)}. Land it and run finish again; name the target with --into <rev>; ${discardRoute(opts.brief)}`,
        ],
      };
    default: {
      const unhandled: never = landing;
      throw new Error(`unhandled landing: ${JSON.stringify(unhandled)}`);
    }
  }
}

// The verdict on the worker's branch, whose `head` is undefined when the
// branch does not exist.
function branchVerdict(
  runGit: Runner,
  top: string,
  branch: { name: string; head: string | undefined },
  opts: FinishOptions,
  id: string,
): { head: string; verdict: Verdict } | { issues: string[] } {
  const { name, head } = branch;
  if (head === undefined) {
    return { issues: [missingBranchIssue(name, opts, id)] };
  }
  const judged = verdictFor(runGit, top, name, head, opts);
  return 'issues' in judged ? judged : { head, verdict: judged.verdict };
}

// branchVerdict checks only the branch, so the worktree must have that branch
// checked out. That also proves the folder is the worktree, not a folder of an
// enclosing repo.
function onBranchIssues(
  runGit: Runner,
  worktree: string,
  branch: string,
  mode: FinishMode['kind'],
  brief: string,
  id: string,
): string[] {
  const head = checkedOut(runGit, worktree);
  if (head === `refs/heads/${branch}`) return [];
  return [
    `the worktree ${worktree} has ${head} checked out, not ${branch}, ${offBranchReason(mode, branch)}: check out ${branch} there and run finish again; ${routeFor(mode, brief, id)}`,
  ];
}

// Why a worktree off its branch matters: landed mode cannot check, discard mode may lose commits.
function offBranchReason(mode: FinishMode['kind'], branch: string): string {
  switch (mode) {
    case 'landed':
      return 'so finish cannot check that its commits have landed';
    case 'discard':
      return `and its commits may not all be on ${branch}, which finish keeps as the backup`;
    default: {
      const unhandled: never = mode;
      throw new Error(`unhandled mode: ${unhandled}`);
    }
  }
}

// Where the worker's worktree, branch, and report sit.
type Places = Pick<
  Ready,
  'top' | 'worktree' | 'branch' | 'report' | 'reportFrom' | 'reportTo'
>;

function placesFor(top: string, brief: Brief): Places {
  const worktree = path.join(top, WORKTREES_FOLDER, brief.name);
  // git status prints paths in this form.
  const report = path.posix.normalize(brief.report);
  return {
    top,
    worktree,
    branch: `worktree-${brief.name}`,
    report,
    reportFrom: path.join(worktree, report),
    reportTo: path.join(top, report),
  };
}

// A cut-short removal can delete the worktree's .git file while git still
// lists it. git run in the folder then reads the enclosing main checkout, so
// this refusal stands alone.
function unlinkedIssues(
  runGit: Runner,
  top: string,
  worktree: string,
  id: string,
): string[] {
  const linkless =
    fs.existsSync(worktree) && !fs.existsSync(path.join(worktree, '.git'));
  if (!linkless) return [];
  const list = worktreeListed(runGit, top, worktree);
  if ('issue' in list) {
    return [
      `git worktree list failed, so finish cannot tell whether git still lists the worktree ${worktree}: ${list.issue}`,
    ];
  }
  if (!list.listed) return [];
  return [
    `the worktree ${worktree} holds no .git entry while git still lists it, so a removal went past git's link to it: claude rm ${id} completes the removal`,
  ];
}

type Status = { entries: StatusEntry[] } | { issue: string };

// The worktree's status entries, the report aside.
function statusBesideReport(runGit: Runner, places: Places): Status {
  const status = statusEntriesIn(runGit, places.top, places.worktree);
  if ('issue' in status) {
    return {
      issue: `git status failed in the worktree ${places.worktree}: ${status.issue}`,
    };
  }
  const entries = status.entries.filter(
    (entry) => entry.path !== places.report,
  );
  return { entries };
}

const onlyDeleted = (entries: StatusEntry[]): boolean =>
  entries.length > 0 && entries.every((entry) => entry.code === DELETED);

// Uncommitted work in the worktree, which removing it would destroy. The report
// is allowed, since saveReport saves it, and so are deleted files alone in a
// partial removal, since restorePartial writes them back.
function dirtyIssues(
  worktree: string,
  status: Status,
  partial: boolean,
): string[] {
  if ('issue' in status) return [status.issue];
  const { entries } = status;
  const allowed = entries.length === 0 || (partial && onlyDeleted(entries));
  if (allowed) return [];
  const paths = entries.map((entry) => entry.path).join(', ');
  return [
    `the worktree ${worktree} holds uncommitted work besides the report, which its removal would destroy: ${paths}. Commit and integrate it, or remove it, then run finish again`,
  ];
}

// A partial removal is deleted files alone at a head a backup ref already
// holds, which an earlier run wrote right before its claude rm.
function isPartial(
  runGit: Runner,
  top: string,
  worker: { name: string; head: string | undefined },
  status: Status,
): boolean {
  const { name, head } = worker;
  if (head === undefined || 'issue' in status) return false;
  if (!onlyDeleted(status.entries)) return false;
  return heldBackup(runGit, top, name, head) !== undefined;
}

// The worktree's checks, and whether it holds a partial removal. `head` is the
// branch's, undefined when the branch does not exist.
function worktreeCheck(
  runGit: Runner,
  places: Places,
  worker: { name: string; id: string; head: string | undefined },
  opts: FinishOptions,
): { issues: string[]; partial: boolean } {
  const status = statusBesideReport(runGit, places);
  const partial = isPartial(runGit, places.top, worker, status);
  const onBranch = onBranchIssues(
    runGit,
    places.worktree,
    places.branch,
    opts.mode.kind,
    opts.brief,
    worker.id,
  );
  const dirty = dirtyIssues(places.worktree, status, partial);
  return { issues: [...onBranch, ...dirty], partial };
}

// An identical report already in place is not a refusal, so this check lets a
// re-run through after a failed step.
function reportStep(
  places: Places,
  noReport: boolean,
  partial: boolean,
): ReportStep | { issues: string[] } {
  const { reportFrom: from, reportTo: to } = places;
  const worker = readIfPresent(from);
  if ('issue' in worker) return { issues: [worker.issue] };
  if (worker.data === undefined) {
    return missingReportStep(places, noReport, partial);
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

// The worktree holds no report. In a partial removal, a copy in the main
// checkout counts as saved earlier, with or without --no-report.
function missingReportStep(
  places: Places,
  noReport: boolean,
  partial: boolean,
): ReportStep | { issues: string[] } {
  if (partial) {
    const saved = readIfPresent(places.reportTo);
    if ('issue' in saved) return { issues: [saved.issue] };
    if (saved.data !== undefined) return 'saved earlier';
  }
  if (noReport) return 'none';
  return {
    issues: [
      `the worktree has no run report at ${places.reportFrom}: ask the worker for it, or pass --no-report to finish without one`,
    ],
  };
}

// The flags that repeat a mode: `--into` with its rev as typed, or `--discard`.
function modeFlags(mode: FinishMode): string[] {
  switch (mode.kind) {
    case 'landed':
      return mode.into === undefined ? [] : ['--into', mode.into];
    case 'discard':
      return ['--discard'];
    default: {
      const unhandled: never = mode;
      throw new Error(`unhandled mode: ${JSON.stringify(unhandled)}`);
    }
  }
}

// The command that repeats this run, its flags in the usage's order.
function rerunCommand(opts: FinishOptions): string {
  const report = opts.noReport ? ['--no-report'] : [];
  return [
    'sidekick worker finish',
    opts.brief,
    ...report,
    ...modeFlags(opts.mode),
  ].join(' ');
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
    ...(typeof step === 'string' ? [] : step.issues),
  ];
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
  const places = placesFor(top, brief);
  const unlinked = unlinkedIssues(wenv.runGit, top, places.worktree, job.id);
  if (unlinked.length > 0) return { issues: unlinked };
  // The partial check reads the head even when the landed check refuses, since
  // a refusal runs no step and so restores nothing.
  const head = commitOf(wenv.runGit, top, `refs/heads/${places.branch}`);
  const branch = { name: places.branch, head };
  const landed = branchVerdict(wenv.runGit, top, branch, opts, job.id);
  const worker = { name: brief.name, id: job.id, head };
  const tree = worktreeCheck(wenv.runGit, places, worker, opts);
  const step = reportStep(places, opts.noReport, tree.partial);
  if (
    'issues' in landed ||
    tree.issues.length > 0 ||
    typeof step !== 'string'
  ) {
    return { issues: allIssues(landed, tree.issues, step) };
  }
  return {
    ...job,
    ...places,
    name: brief.name,
    commonDir,
    head: landed.head,
    verdict: landed.verdict,
    brief: opts.brief,
    rerun: rerunCommand(opts),
    reportStep: step,
    partial: tree.partial,
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
    case 'saved earlier':
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

// The worker's report now: still absent where the worktree held none, else
// still the copy in the main checkout.
function reportChangedIssues(ready: Ready): string[] {
  const now = readIfPresent(ready.reportFrom);
  if ('issue' in now) return [now.issue];
  switch (ready.reportStep) {
    case 'none':
    case 'saved earlier':
      if (now.data === undefined) return [];
      return [`a run report appeared at ${ready.reportFrom}`];
    case 'copy':
    case 'in place':
      return copyChangedIssues(ready, now.data);
    default: {
      const unhandled: never = ready.reportStep;
      throw new Error(`unhandled report step: ${unhandled}`);
    }
  }
}

function copyChangedIssues(ready: Ready, now: Buffer | undefined): string[] {
  const saved = readIfPresent(ready.reportTo);
  if ('issue' in saved) return [saved.issue];
  const same =
    now !== undefined && saved.data !== undefined && now.equals(saved.data);
  if (same) return [];
  return [
    `the worker's report at ${ready.reportFrom} no longer matches the copy at ${ready.reportTo}`,
  ];
}

// A commit made after branchVerdict's check was never checked, and the removal loses it.
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
    ...onBranchIssues(
      wenv.runGit,
      ready.worktree,
      ready.branch,
      ready.verdict.kind,
      ready.brief,
      ready.id,
    ),
    ...headMovedIssues(wenv.runGit, ready),
    ...dirtyIssues(
      ready.worktree,
      statusBesideReport(wenv.runGit, ready),
      ready.partial,
    ),
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
    `${ready.branch} is kept as ${ref}: restore it with git branch ${ready.branch} ${ref}`,
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
