/**
 * `sidekick worker finish`: once a worker's branch has landed, saves its run
 * report in the checkout that holds the brief and removes its session, desk
 * record, worktree, and branch. It runs from any checkout of the repo, and
 * finds the worktree wherever its creator made it, or at the operator's
 * `--worktree`. `--name` stands in for a brief that is gone. It acts on a
 * branch only with evidence the branch is the worker's.
 * It refuses whenever a step would lose work. In landed mode it prints the
 * target and why once the target resolves, before it walks the history, so a
 * refusal from the landed check or a later check follows it. The steps run in order, and the first that fails stops the
 * rest. They print where the work landed, what became of the report, any files
 * it restored, then each removal: the session, the worktree, and the branch.
 * Its last line names the backup ref.
 * In discard mode with no worktree found, it removes the session and the record
 * alone, through `worker-finish-gone.ts`.
 * The arguments, the target, the worktree checks, and the report each live in
 * a `worker-finish-*` module of their own.
 */

import { configDirOf } from './main-session.js';
import { shellArg } from './shell.js';
import type { WorkerEnv } from './worker.js';
import { checkoutFacts } from './worker-facts.js';
import {
  discardCommandFor,
  type FinishOptions,
  type FinishSubject,
  rerunCommand,
} from './worker-finish-args.js';
import { clearGone, type Gone, whenNotFound } from './worker-finish-gone.js';
import {
  type ReportStep,
  reportChangedIssues,
  reportStep,
  saveReport,
} from './worker-finish-report.js';
import {
  launcherOf,
  readSubject,
  type Subject,
} from './worker-finish-subject.js';
import { judgeFor, landedVerdict, targetLine } from './worker-finish-target.js';
import {
  dirtyIssues,
  headMovedIssues,
  onBranchIssues,
  type Places,
  placesFor,
  statusBesideReport,
  unlinkedIssues,
  unprovenIssues,
  worktreeCheck,
} from './worker-finish-tree.js';
import { LISTING, listJobs } from './worker-jobs.js';
import { commitOf } from './worker-repo.js';
import {
  forgetRecord,
  keepBackup,
  type Out,
  type Ready,
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
import {
  type Found,
  type Launcher,
  locateWorktree,
} from './worker-worktree.js';

/** The length `finish` shortens a sha to in the landing line. */
export const SHORT_SHA = 7;

// The listed job, with the places its session is known to have started.
type ListedWorker = WorkerJob & {
  cwd: string | undefined;
  sessionId: string | undefined;
};

// Where the worker's name came from, which a refusal says to check.
const NAME_FROM = {
  brief: 'the name in the brief',
  name: 'the name given to --name',
} satisfies Record<FinishSubject['kind'], string>;

// The one listed session by the worker's name, which must be a background job.
function findJob(
  wenv: WorkerEnv,
  top: string,
  subject: Subject,
): ListedWorker | { issues: string[] } {
  const { name } = subject;
  const listed = listJobs(wenv.runClaude, top);
  if ('issues' in listed) return listed;
  const matches = listed.jobs.filter((job) => job.name === name);
  if (matches.length === 0) {
    return {
      issues: [
        `no session in ${LISTING} is named "${name}". If finish already removed it, clear any worktree or branch it left by hand; otherwise check ${NAME_FROM[subject.from]}`,
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

// The worker's worktree, from the operator's --worktree alone when given,
// else its transcript, its listing's cwd, or Claude Code's own branch name.
// None may be the main checkout or the checkout that launched the worker.
function worktreeOf(
  wenv: WorkerEnv,
  where: { name: string; mainTop: string; launcher: Launcher | undefined },
  job: ListedWorker,
  operatorPath: string | undefined,
): Found | { issues: string[] } {
  const { name } = where;
  const found = locateWorktree({
    runGit: wenv.runGit,
    configDir: configDirOf(wenv.env, wenv.home),
    ...where,
    sessionId: job.sessionId,
    listingCwd: job.cwd,
    operatorPath,
  });
  if (!('issue' in found)) return found;
  return {
    issues: [
      `git worktree list failed, so finish cannot find the worktree of ${name}: ${found.issue}`,
    ],
  };
}

// Where the worker's worktree, branch, and report sit; or in discard mode with
// no worktree found, what is left to clear.
type Located =
  | { kind: 'found'; places: Places; job: ListedWorker; commonDir: string }
  | { kind: 'gone'; gone: Gone };

// The checkouts, the listed job, and what the finder says of its worktree.
function locate(
  subject: Subject,
  opts: FinishOptions,
  wenv: WorkerEnv,
): Located | { issues: string[] } {
  const facts = checkoutFacts(wenv.runGit, wenv.cwd);
  if ('issues' in facts) return facts;
  const { mainTop, launchTop, commonDir } = facts;
  const job = findJob(wenv, mainTop, subject);
  if ('issues' in job) return job;
  const launcher = launcherOf(subject, facts, wenv.runGit);
  const where = { name: subject.name, mainTop, launcher };
  const found = worktreeOf(wenv, where, job, opts.worktree);
  if ('issues' in found) return found;
  if (found.kind === 'not found') {
    const { id } = job;
    const linked = facts.worktrees.slice(1);
    const at = { id, name: subject.name, mainTop, commonDir, linked };
    const gone = whenNotFound(found.tried, at, opts);
    return 'issues' in gone ? gone : { kind: 'gone', gone };
  }
  const confirm = rerunCommand({ ...opts, worktree: found.path });
  const unproven = unprovenIssues(found, subject.name, confirm);
  if (unproven.length > 0) return { issues: unproven };
  const places = placesFor({ mainTop, launchTop }, found, subject.read);
  return { kind: 'found', places, job, commonDir };
}

type Landed = { head: string; verdict: Verdict } | { issues: string[] };

// The verdict on the worker's branch. In landed mode the target line prints
// once the target resolves, before the history walk, so the verdict's refusal
// follows the target finish judged.
function landedCheck(
  wenv: WorkerEnv,
  places: Places,
  branch: { name: string; head: string | undefined },
  opts: FinishOptions,
  { id, out }: { id: string; out: Out },
): Landed {
  const judge = judgeFor(wenv.runGit, places, branch, opts, id);
  if ('issues' in judge) return judge;
  const { head } = judge;
  switch (judge.kind) {
    case 'discard':
      return { head, verdict: { kind: 'discard' } };
    case 'landed': {
      out(targetLine(judge.target));
      const judged = landedVerdict(
        wenv.runGit,
        places,
        { branch: branch.name, head, target: judge.target },
        opts,
      );
      return 'issues' in judged ? judged : { head, verdict: judged.verdict };
    }
    default: {
      const unhandled: never = judge;
      throw new Error(`unhandled judge: ${JSON.stringify(unhandled)}`);
    }
  }
}

// Every refusal the checks found, in the order they ran.
function allIssues(
  landed: Landed,
  worktreeIssues: string[],
  step: ReportStep | { issues: string[] },
): string[] {
  return [
    ...('issues' in landed ? landed.issues : []),
    ...worktreeIssues,
    ...('issues' in step ? step.issues : []),
  ];
}

// Every check of the worktree needs the job's id, so those run once it is
// found. It prints the target line, through landedCheck.
function checkFinish(
  name: string,
  located: Extract<Located, { kind: 'found' }>,
  opts: FinishOptions,
  { wenv, out }: { wenv: WorkerEnv; out: Out },
): Ready | { issues: string[] } {
  const { places, job } = located;
  const { mainTop, worktree } = places;
  const unlinked = unlinkedIssues(wenv.runGit, mainTop, worktree, job.id);
  if (unlinked.length > 0) return { issues: unlinked };
  // The partial check reads the head even when the landed check refuses, since
  // a refusal runs no step and so restores nothing.
  const head = commitOf(wenv.runGit, mainTop, `refs/heads/${places.branch}`);
  const branch = { name: places.branch, head };
  const landed = landedCheck(wenv, places, branch, opts, { id: job.id, out });
  const worker = { name, id: job.id, head };
  const tree = worktreeCheck(wenv.runGit, places, worker, opts);
  const step = reportStep(places.brief, opts.noReport, tree.partial);
  if ('issues' in landed || tree.issues.length > 0 || 'issues' in step) {
    return { issues: allIssues(landed, tree.issues, step) };
  }
  return {
    id: job.id,
    state: job.state,
    name,
    mainTop,
    commonDir: located.commonDir,
    worktree,
    branch: places.branch,
    head: landed.head,
    report: places.brief?.report,
    reportStep: step,
    verdict: landed.verdict,
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

// The landing line, under the target line landedCheck printed, so the operator
// sees what the check found before any removal. Discard mode has no target.
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
  const subject = readSubject(opts.subject, wenv.runGit);
  if ('issues' in subject) return subject.issues;
  const located = locate(subject, opts, wenv);
  if ('issues' in located) return located.issues;
  if (located.kind === 'gone') return clearGone(located.gone, wenv, out);
  const ready = checkFinish(subject.name, located, opts, { wenv, out });
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
