/**
 * The checks of a worker's worktree. They say where its worktree, branch, and
 * report sit, refuse when the finder found no worktree, and check whether it
 * is on its branch, still linked to git, and free of uncommitted work, and
 * whether it holds a partial removal that an earlier run left.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Runner } from './pm-data.js';
import { shellArg } from './shell.js';
import type { Brief } from './worker-brief.js';
import {
  discardCommandFor,
  type FinishMode,
  type FinishOptions,
} from './worker-finish-args.js';
import { routeFor } from './worker-finish-target.js';
import {
  checkedOut,
  commitOf,
  DELETED,
  type StatusEntry,
  statusEntriesIn,
  worktreeListed,
} from './worker-repo.js';
import { heldBackup, type Ready } from './worker-teardown.js';
import type { Found } from './worker-worktree.js';

// branchVerdict checks only the branch, so the worktree must have that branch
// checked out: the branch it started on, when its transcript names one.
export function onBranchIssues(
  runGit: Runner,
  worktree: string,
  branch: string,
  mode: FinishMode['kind'],
  discardCommand: string,
  id: string,
): string[] {
  const head = checkedOut(runGit, worktree);
  if (head === `refs/heads/${branch}`) return [];
  return [
    `the worktree ${worktree} has ${head} checked out, not ${branch}, ${offBranchReason(mode, branch)}: check out ${branch} there and run finish again; ${routeFor(mode, discardCommand, id)}`,
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

/** The checkouts finish reads, and where the worker's worktree, branch, and report sit. */
export type Places = Pick<
  Ready,
  'mainTop' | 'briefTop' | 'worktree' | 'branch' | 'report' | 'reportFrom'
> & {
  /** The checkout finish runs in. */
  launchTop: string;
  /** The brief's folder, which a refusal names when no checkout holds it. */
  briefFolder: string;
  /** `<briefTop>/<report>`; undefined when no checkout holds the brief. */
  reportTo: string | undefined;
};

/** The finder's answer when it found the worktree. */
export type FoundWorktree = Extract<Found, { kind: 'found' }>;

export function placesFor(
  tops: Pick<Places, 'mainTop' | 'launchTop' | 'briefTop' | 'briefFolder'>,
  found: FoundWorktree,
  brief: Brief,
): Places {
  // git status prints paths in this form.
  const report = path.posix.normalize(brief.report);
  const { briefTop } = tops;
  return {
    ...tops,
    worktree: found.path,
    branch: found.branch,
    report,
    reportFrom: path.join(found.path, report),
    reportTo: briefTop === undefined ? undefined : path.join(briefTop, report),
  };
}

type Tried = Extract<Found, { kind: 'not found' }>['tried'][number];

const TRIED_LABEL = {
  transcript: "the transcript's first cwd",
  listing: "the job listing's cwd",
  operator: 'the --worktree path',
  name: 'by name,',
} satisfies Record<Tried['via'], string>;

const triedLine = (tried: Tried): string =>
  [TRIED_LABEL[tried.via], tried.cwd, tried.why]
    .filter((part) => part !== undefined)
    .join(' ');

/** The refusal when the finder found no worktree: each place it tried, then the ways out. */
export function notFoundIssues(name: string, tried: Tried[]): string[] {
  return [
    `finish cannot find the worktree of ${name}, so it removed nothing. It tried:`,
    ...tried.map(triedLine),
    'name the worktree with --worktree <path>, or discard the worker with --discard',
  ];
}

// A cut-short removal can delete the worktree's .git file while git still
// lists it. git run in the folder then reads whatever repo encloses it, so
// this refusal stands alone.
export function unlinkedIssues(
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
    `the worktree ${worktree} holds no .git entry while git still lists it, so a removal went past git's link to it: claude rm ${shellArg(id)} completes the removal`,
  ];
}

type Status = { entries: StatusEntry[] } | { issue: string };

// The worktree's status entries, the report aside.
export function statusBesideReport(
  runGit: Runner,
  places: Pick<Places, 'mainTop' | 'worktree' | 'report'>,
): Status {
  const status = statusEntriesIn(runGit, places.mainTop, places.worktree);
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

// What to do with uncommitted work: landed mode integrates it, and discard mode
// keeps it in the backup ref.
function dirtyAdvice(mode: FinishMode['kind']): string {
  switch (mode) {
    case 'landed':
      return 'Commit and integrate it, or remove it, then run finish again';
    case 'discard':
      return 'Commit it so that the backup ref keeps it, or remove it, then run finish again';
    default: {
      const unhandled: never = mode;
      throw new Error(`unhandled mode: ${unhandled}`);
    }
  }
}

// Uncommitted work in the worktree, which removing it would destroy. The report
// is allowed, since saveReport saves it, and so are deleted files alone in a
// partial removal, since restorePartial writes them back.
export function dirtyIssues(
  worktree: string,
  status: Status,
  partial: boolean,
  mode: FinishMode['kind'],
): string[] {
  if ('issue' in status) return [status.issue];
  const { entries } = status;
  const allowed = entries.length === 0 || (partial && onlyDeleted(entries));
  if (allowed) return [];
  const paths = entries.map((entry) => entry.path).join(', ');
  return [
    `the worktree ${worktree} holds uncommitted work besides the report, which its removal would destroy: ${paths}. ${dirtyAdvice(mode)}`,
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
export function worktreeCheck(
  runGit: Runner,
  places: Places,
  worker: { name: string; id: string; head: string | undefined },
  opts: FinishOptions,
): { issues: string[]; partial: boolean } {
  const status = statusBesideReport(runGit, places);
  const partial = isPartial(runGit, places.mainTop, worker, status);
  const onBranch = onBranchIssues(
    runGit,
    places.worktree,
    places.branch,
    opts.mode.kind,
    discardCommandFor(opts),
    worker.id,
  );
  const dirty = dirtyIssues(places.worktree, status, partial, opts.mode.kind);
  return { issues: [...onBranch, ...dirty], partial };
}

// A commit made after branchVerdict's check was never checked, and the removal loses it.
export function headMovedIssues(runGit: Runner, ready: Ready): string[] {
  const now = commitOf(runGit, ready.mainTop, `refs/heads/${ready.branch}`);
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
