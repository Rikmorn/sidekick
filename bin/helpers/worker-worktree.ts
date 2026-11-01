/**
 * Where a worker's worktree is. One finder serves `finish`, `finish
 * --worktree`, the desk, and dispatch's clash check: it matches the places a
 * session is known to have started (its transcript, its job listing, or a path
 * the operator names) against the worktrees git lists, and falls back to the
 * branch Claude Code names after the worker.
 */

import * as path from 'node:path';
import { firstPlace, transcriptFinder } from './desk-transcripts.js';
import type { Runner } from './pm-data.js';
import { listWorktrees, physical, type WorktreeEntry } from './worker-repo.js';

/** A place the worker's worktree may be, as a physical path. */
export type Candidate =
  | { via: 'transcript'; cwd: string; gitBranch: string | undefined }
  | { via: 'listing'; cwd: string }
  | { via: 'operator'; cwd: string };

export interface FindInput {
  name: string;
  mainTop: string;
  /** The checkout holding the brief, when readable. */
  briefTop: string | undefined;
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

type Tried = Extract<Found, { kind: 'not found' }>['tried'][number];

/** The branch Claude Code gives the worktree it makes for `--worktree <name>`. */
export const nativeBranch = (name: string): string => `worktree-${name}`;

const HEADS = 'refs/heads/';

const shortBranch = (ref: string): string =>
  ref.startsWith(HEADS) ? ref.slice(HEADS.length) : ref;

// Whole path segments only, so `/r/w1` never contains `/r/w10`.
function contains(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
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
  if (match.path === input.mainTop) return 'is the main checkout';
  if (match.path === input.briefTop) {
    return `is the brief's checkout ${match.path}`;
  }
  return undefined;
}

function foundOf(
  match: WorktreeEntry,
  branch: string,
  via: Candidate['via'] | 'name',
): Found {
  return {
    kind: 'found',
    path: match.path,
    branch,
    locked: match.locked,
    prunable: match.prunable,
    via,
  };
}

// The worker's branch for a candidate that matched `match`, or undefined when
// the worker has none to land.
function branchFor(candidate: Candidate, match: WorktreeEntry) {
  if (candidate.via === 'transcript' && candidate.gitBranch !== undefined) {
    return candidate.gitBranch;
  }
  return match.branch === undefined ? undefined : shortBranch(match.branch);
}

function tryCandidate(input: FindInput, candidate: Candidate): Found | Tried {
  const { via, cwd } = candidate;
  const match = enclosing(input.worktrees, cwd);
  if (match === undefined) {
    return { via, cwd, why: 'is in no worktree git lists' };
  }
  const why = refusal(input, match);
  if (why !== undefined) return { via, cwd, why };
  const branch = branchFor(candidate, match);
  if (branch === undefined) {
    return {
      via,
      cwd,
      why: 'is detached, and the transcript names no branch',
    };
  }
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
  return foundOf(match, nativeBranch(input.name), 'name');
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

// The places the session is known to have started, in order.
function candidatesFor(opts: {
  configDir: string;
  sessionId: string | undefined;
  listingCwd: string | undefined;
  operatorPath: string | undefined;
}): Candidate[] {
  if (opts.operatorPath !== undefined) {
    return [{ via: 'operator', cwd: physical(opts.operatorPath) }];
  }
  const transcript =
    opts.sessionId === undefined
      ? undefined
      : transcriptFinder(opts.configDir).find(opts.sessionId);
  const place =
    transcript === undefined ? undefined : firstPlace(transcript.file);
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
    opts.listingCwd === undefined
      ? []
      : [{ via: 'listing', cwd: physical(opts.listingCwd) }];
  return [...fromTranscript, ...fromListing];
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
  briefTop: string | undefined;
  sessionId: string | undefined;
  listingCwd: string | undefined;
  operatorPath: string | undefined;
}): Found | { issue: string } {
  const mainTop = physical(opts.mainTop);
  const listed = listWorktrees(opts.runGit, mainTop);
  if ('issue' in listed) return listed;
  return findWorktree({
    name: opts.name,
    mainTop,
    briefTop: opts.briefTop === undefined ? undefined : physical(opts.briefTop),
    worktrees: listed.worktrees,
    candidates: candidatesFor(opts),
  });
}
