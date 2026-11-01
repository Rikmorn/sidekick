/**
 * The checks of a worker's worktree. They say where its worktree, branch, and
 * report sit, refuse when the finder found no worktree, or none at the
 * operator's `--worktree`, or found one on a branch nothing shows is the
 * worker's. They check whether it is on its branch, still linked to git, and
 * free of uncommitted work, and whether it holds a partial removal that an
 * earlier run left.
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
import {
  type BriefAt,
  routeFor,
  type TargetContext,
} from './worker-finish-target.js';
import {
  checkedOut,
  commitOf,
  DELETED,
  type StatusEntry,
  statusEntriesIn,
  type WorktreeEntry,
  worktreeListed,
} from './worker-repo.js';
import { heldBackup, type Ready } from './worker-teardown.js';
import { type Found, nativeBranch, shortBranch } from './worker-worktree.js';

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

/** Where the brief sits, and where its report is copied from and to. */
export interface BriefPlaces extends BriefAt {
  /** The report's path from a checkout's top, in the form git status prints. */
  report: string;
  /** `<worktree>/<report>` */
  reportFrom: string;
  /** `<top>/<report>`; undefined when no checkout holds the brief. */
  reportTo: string | undefined;
}

/** The checkouts finish reads, and where the worker's worktree, branch, and brief sit. */
export interface Places extends TargetContext {
  /** The worker's worktree, as git lists it. */
  worktree: string;
  /** The worker's branch, a short name. */
  branch: string;
  /** Undefined under `--name`, which reads no brief. */
  brief: BriefPlaces | undefined;
}

/** The brief as read, with its folder and the checkout that holds it. */
export interface BriefRead {
  brief: Brief;
  folder: string;
  top: string | undefined;
}

/** The finder's answer when it found the worktree. */
export type FoundWorktree = Extract<Found, { kind: 'found' }>;

function briefPlaces(read: BriefRead, worktree: string): BriefPlaces {
  // git status prints paths in this form.
  const report = path.posix.normalize(read.brief.report);
  const { folder, top } = read;
  return {
    folder,
    top,
    target: read.brief.target,
    report,
    reportFrom: path.join(worktree, report),
    reportTo: top === undefined ? undefined : path.join(top, report),
  };
}

export function placesFor(
  tops: Pick<Places, 'mainTop' | 'launchTop'>,
  found: FoundWorktree,
  read: BriefRead | undefined,
): Places {
  return {
    ...tops,
    worktree: found.path,
    branch: found.branch,
    brief: read === undefined ? undefined : briefPlaces(read, found.path),
  };
}

/** One place the finder tried, and why it rejected it. */
export type Tried = Extract<Found, { kind: 'not found' }>['tried'][number];

const TRIED_LABEL = {
  transcript: "the transcript's first cwd",
  listing: "the job listing's cwd",
  operator: 'the --worktree path',
  name: 'by name,',
} satisfies Record<Tried['via'], string>;

export const triedLine = (tried: Tried): string =>
  [TRIED_LABEL[tried.via], tried.cwd, tried.why]
    .filter((part) => part !== undefined)
    .join(' ');

/** The refusal in landed mode when no reader found the worktree: each place it tried, then the ways out. */
export function notFoundIssues(name: string, tried: Tried[]): string[] {
  return [
    `finish cannot find the worktree of ${name}, so it removed nothing. It tried:`,
    ...tried.map(triedLine),
    'name the worktree with --worktree <path>, or discard the worker with --discard',
  ];
}

/**
 * finish acts on a branch only with evidence it is the worker's: the
 * transcript's `gitBranch`, Claude Code's own name, or the operator's
 * `--worktree`. The branch git lists at a worktree found any other way
 * refuses, with `confirm`, the command that names the worktree.
 */
export function unprovenIssues(
  found: FoundWorktree,
  name: string,
  confirm: string,
): string[] {
  const native = nativeBranch(name);
  const shown =
    found.via === 'operator' ||
    found.branchFrom === 'transcript' ||
    found.branch === native;
  if (shown) return [];
  const how =
    found.via === 'listing'
      ? "the job listing's cwd"
      : "the transcript's first cwd, which names no branch";
  return [
    `finish found the worktree ${found.path} through ${how}, but it is on ${found.branch}, not ${native}, so nothing shows the branch is the worker's: if it is, confirm with ${confirm}`,
  ];
}

const listedLine = (entry: WorktreeEntry): string =>
  `${entry.path}: ${entry.branch === undefined ? 'detached' : shortBranch(entry.branch)}`;

/**
 * The refusal in either mode when `--worktree` names no worktree finish can
 * clear: why, then each linked worktree git lists, with its branch.
 */
export function operatorIssues(
  name: string,
  tried: Tried[],
  linked: WorktreeEntry[],
): string[] {
  const listed =
    linked.length === 0
      ? ['git lists no linked worktree']
      : ['git lists these linked worktrees:', ...linked.map(listedLine)];
  return [
    `finish cannot find the worktree of ${name}, so it removed nothing. It tried:`,
    ...tried.map(triedLine),
    ...listed,
    "name the worker's worktree with --worktree <path>, or run finish without --worktree",
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

// The worktree's status entries, the report aside. Under --name the report is
// unknown, so every entry counts.
export function statusBesideReport(
  runGit: Runner,
  places: { mainTop: string; worktree: string; report: string | undefined },
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
  const status = statusBesideReport(runGit, {
    mainTop: places.mainTop,
    worktree: places.worktree,
    report: places.brief?.report,
  });
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
