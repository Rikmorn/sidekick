/**
 * Where a worker's worktree is. One finder serves `finish`, `finish
 * --worktree`, the desk, and dispatch's clash check: it matches the places a
 * session is known to have started (its transcript, its job listing, or a path
 * the operator names) against the worktrees git lists, and falls back to the
 * branch Claude Code names after the worker. The candidates and the rule for
 * whether a found branch is the worker's live here, so `finish` and the desk
 * read them the same way.
 */

import * as path from 'node:path';
import {
  firstPlace,
  type StartPlace,
  transcriptFinder,
} from './desk-transcripts.js';
import type { Runner } from './pm-data.js';
import {
  HEADS,
  listWorktrees,
  physical,
  type WorktreeEntry,
} from './worker-repo.js';

/** A place the worker's worktree may be, as a physical path. */
export type Candidate =
  | { via: 'transcript'; cwd: string; gitBranch: string | undefined }
  | { via: 'listing'; cwd: string }
  | { via: 'operator'; cwd: string };

/**
 * The checkout that launched the worker, which its worktree cannot be: its
 * top, and what it is to the operator, such as "the brief's checkout".
 */
export interface Launcher {
  top: string;
  role: string;
}

export interface FindInput {
  name: string;
  mainTop: string;
  /** Besides the main checkout, the one checkout no candidate may match; its top physical. */
  launcher: Launcher | undefined;
  worktrees: WorktreeEntry[];
  /** Physical paths, in order; an `operator` candidate is the only one when given. */
  candidates: Candidate[];
}

export type Found =
  | {
      kind: 'found';
      path: string;
      /** A short name. */
      branch: string;
      /** Where `branch` came from: the transcript's `gitBranch`, or what git lists at the path now. */
      branchFrom: 'transcript' | 'git';
      locked: string | undefined;
      /** git's reason, `''` when it gives none; undefined when not prunable. */
      prunable: string | undefined;
      via: Candidate['via'] | 'name';
    }
  | {
      kind: 'not found';
      tried: {
        via: Candidate['via'] | 'name';
        cwd?: string;
        why: string;
      }[];
    };

/** The finder's answer when it found the worktree. */
export type FoundWorktree = Extract<Found, { kind: 'found' }>;

type Tried = Extract<Found, { kind: 'not found' }>['tried'][number];

/** The branch Claude Code gives the worktree it makes for `--worktree <name>`. */
export const nativeBranch = (name: string): string => `worktree-${name}`;

/**
 * Whether anything shows the found worktree's branch is the worker's: the
 * operator named the worktree, the transcript names the branch, or it is the
 * branch Claude Code gives the worker. The branch git lists at a worktree
 * found any other way may be another branch checked out there since.
 */
export const isBranchProven = (found: FoundWorktree, name: string): boolean =>
  found.via === 'operator' ||
  found.branchFrom === 'transcript' ||
  found.branch === nativeBranch(name);

/** A branch's short name, from a full ref such as `refs/heads/w1`. */
export const shortBranch = (ref: string): string =>
  ref.startsWith(HEADS) ? ref.slice(HEADS.length) : ref;

// Whole path segments only, so `/r/w1` never contains `/r/w10`, and only a
// whole `..` segment leaves `parent`: a child folder may be named `..cache`.
function contains(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  if (rel === '') return true;
  const leaves = rel === '..' || rel.startsWith(`..${path.sep}`);
  return !leaves && !path.isAbsolute(rel);
}

// The nearest enclosing entry: the longest path wins, so a worktree nested
// under the main checkout beats the main checkout.
function enclosing(
  worktrees: WorktreeEntry[],
  cwd: string,
): WorktreeEntry | undefined {
  return worktrees
    .filter((w) => contains(w.path, cwd))
    .reduce<WorktreeEntry | undefined>(
      (best, w) =>
        best === undefined || w.path.length > best.path.length ? w : best,
      undefined,
    );
}

// Why this entry cannot be a worker's worktree, or undefined when it can.
function refusal(input: FindInput, match: WorktreeEntry): string | undefined {
  if (match.path === input.mainTop) return 'is in the main checkout';
  const { launcher } = input;
  if (launcher !== undefined && match.path === launcher.top) {
    return `is in ${launcher.role} ${match.path}`;
  }
  return undefined;
}

type Branch = Pick<FoundWorktree, 'branch' | 'branchFrom'>;

function foundOf(
  match: WorktreeEntry,
  { branch, branchFrom }: Branch,
  via: Candidate['via'] | 'name',
): Found {
  return {
    kind: 'found',
    path: match.path,
    branch,
    branchFrom,
    locked: match.locked,
    prunable: match.prunable,
    via,
  };
}

// The worker's branch for a candidate that matched `match`, and where it came
// from; undefined when the worker has none to land.
function branchFor(
  candidate: Candidate,
  match: WorktreeEntry,
): Branch | undefined {
  if (candidate.via === 'transcript' && candidate.gitBranch !== undefined) {
    return { branch: candidate.gitBranch, branchFrom: 'transcript' };
  }
  if (match.branch === undefined) return undefined;
  return { branch: shortBranch(match.branch), branchFrom: 'git' };
}

// The operator's path is the only candidate, so no transcript was read for it.
const detachedWhy = (via: Candidate['via']): string =>
  via === 'operator'
    ? 'is detached'
    : 'is detached, and the transcript names no branch';

function tryCandidate(input: FindInput, candidate: Candidate): Found | Tried {
  const { via, cwd } = candidate;
  const match = enclosing(input.worktrees, cwd);
  if (match === undefined) {
    return { via, cwd, why: 'is in no worktree git lists' };
  }
  const why = refusal(input, match);
  if (why !== undefined) return { via, cwd, why };
  const branch = branchFor(candidate, match);
  if (branch === undefined) return { via, cwd, why: detachedWhy(via) };
  return foundOf(match, branch, via);
}

function byName(input: FindInput): Found | Tried {
  const ref = `${HEADS}${nativeBranch(input.name)}`;
  const match = input.worktrees.find(
    (w) => w.branch === ref && refusal(input, w) === undefined,
  );
  if (match === undefined) {
    return {
      via: 'name',
      why: `no worktree has ${nativeBranch(input.name)} checked out`,
    };
  }
  const branch = nativeBranch(input.name);
  return foundOf(match, { branch, branchFrom: 'git' }, 'name');
}

const isFound = (r: Found | Tried): r is Found => 'kind' in r;

/**
 * The worker's worktree: the first candidate that lands in a linked worktree
 * with a branch to land, else the worktree on `worktree-<name>`. An operator
 * candidate is the only one, and the name fallback does not apply to it. Paths
 * compare as given, so the caller passes physical ones.
 */
export function findWorktree(input: FindInput): Found {
  const tried: Tried[] = [];
  for (const candidate of input.candidates) {
    const result = tryCandidate(input, candidate);
    if (isFound(result)) return result;
    tried.push(result);
  }
  if (input.candidates.some((c) => c.via === 'operator')) {
    return { kind: 'not found', tried };
  }
  const result = byName(input);
  if (isFound(result)) return result;
  return { kind: 'not found', tried: [...tried, result] };
}

/**
 * The places a session is known to have started, as `findWorktree` takes
 * them: physical paths, in order. The operator's path is the only one when
 * given; else the transcript's first place, then the job listing's cwd.
 */
export function candidatesFrom(known: {
  place: StartPlace | undefined;
  listingCwd: string | undefined;
  operatorPath: string | undefined;
}): Candidate[] {
  const { place, listingCwd, operatorPath } = known;
  if (operatorPath !== undefined) {
    return [{ via: 'operator', cwd: physical(operatorPath) }];
  }
  const fromTranscript: Candidate[] =
    place === undefined
      ? []
      : [
          {
            via: 'transcript',
            cwd: physical(place.cwd),
            gitBranch: place.gitBranch,
          },
        ];
  const fromListing: Candidate[] =
    listingCwd === undefined
      ? []
      : [{ via: 'listing', cwd: physical(listingCwd) }];
  return [...fromTranscript, ...fromListing];
}

// The candidates, with the session's start place read from its transcript. The
// operator's path stands alone, so no transcript is read for it.
function candidatesFor(opts: {
  configDir: string;
  sessionId: string | undefined;
  listingCwd: string | undefined;
  operatorPath: string | undefined;
}): Candidate[] {
  const { sessionId, listingCwd, operatorPath } = opts;
  const transcript =
    operatorPath !== undefined || sessionId === undefined
      ? undefined
      : transcriptFinder(opts.configDir).find(sessionId);
  const place =
    transcript === undefined ? undefined : firstPlace(transcript.file);
  return candidatesFrom({ place, listingCwd, operatorPath });
}

/**
 * `findWorktree` over what git lists at `mainTop`, the session's transcript,
 * its job listing's cwd, and the operator's path. The issue is git's message
 * when the listing fails.
 */
export function locateWorktree(opts: {
  runGit: Runner;
  configDir: string;
  name: string;
  mainTop: string;
  launcher: Launcher | undefined;
  sessionId: string | undefined;
  listingCwd: string | undefined;
  operatorPath: string | undefined;
}): Found | { issue: string } {
  const mainTop = physical(opts.mainTop);
  const listed = listWorktrees(opts.runGit, mainTop);
  if ('issue' in listed) return listed;
  const { launcher } = opts;
  return findWorktree({
    name: opts.name,
    mainTop,
    launcher:
      launcher === undefined
        ? undefined
        : { ...launcher, top: physical(launcher.top) },
    worktrees: listed.worktrees,
    candidates: candidatesFor(opts),
  });
}
