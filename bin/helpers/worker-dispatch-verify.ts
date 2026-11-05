/**
 * The worktree check `sidekick worker dispatch` runs once `claude --bg` has
 * started the worker: the worktree the job runs in must be the one Claude
 * Code's own creation makes. That is `<main checkout>/.claude/worktrees/<name>`,
 * on `worktree-<name>`, created at the brief's baseline. The job's `cwd` in the
 * agents listing finds the worktree, since a `WorktreeCreate` hook makes no
 * `worktree-<name>` branch to find it by. What the check cannot read, it
 * reports as not run, and never refuses on. A `cwd` still at a checkout is
 * such a case: a slow creator keeps it there until the worktree exists.
 */

import * as path from 'node:path';
import type { Runner } from './pm-data.js';
import type { ClaudeRunner } from './profile-launch.js';
import { LISTING, listJobs } from './worker-jobs.js';
import { listWorktrees, type WorktreeEntry } from './worker-listing.js';
import { commitOf, HEADS, physical } from './worker-repo.js';
import { nativeBranch, nativeFolder, shortBranch } from './worker-worktree.js';

/** What the worktree check found: the right worktree, a wrong one with its likely cause, or a check that did not run. */
export type WorktreeVerdict =
  | { kind: 'matches' }
  | {
      kind: 'mismatch';
      /** `creator`: a wrong path or branch; `base`: a wrong creation commit on the right ones. */
      cause: 'creator' | 'base';
      /** What was found against what was expected. */
      lines: string[];
      /** The job judged, which the caller stops. */
      job: string;
    }
  | { kind: 'unchecked'; line: string };

export interface VerifyInput {
  runGit: Runner;
  runClaude: ClaudeRunner;
  sleep: (ms: number) => void;
  /** The job id `claude --bg` printed, or null when it printed none. */
  jobId: string | null;
  name: string;
  mainTop: string;
  launchTop: string;
  /** The brief's baseline, which dispatch's checks resolved to the launching checkout's HEAD. */
  baseline: string;
  /** How many times to read the listing while the job's row, its `cwd`, or the worktree there is missing. */
  tries?: number;
  /** How many times to read while the job's `cwd` is still the launching or the main checkout. A slow `WorktreeCreate` hook or `.worktreeinclude` copy keeps it there; a hook that sleeps 8 s did. */
  creationTries?: number;
  /** The wait between reads. */
  intervalMs?: number;
  /** Each read's limit. A read that runs out ends the reads. */
  readTimeoutMs?: number;
}

interface Reads {
  tries: number;
  creationTries: number;
  intervalMs: number;
  readTimeoutMs: number;
}

// One read of the listing and of git's worktrees. `missing` and `checkout` are
// worth another read; `failed` is not, since a failing listing would only fail
// again. `checkout` names the checkout the job's cwd is, with its top.
type Landing =
  | { kind: 'found'; entry: WorktreeEntry }
  | { kind: 'checkout'; checkout: string }
  | { kind: 'missing'; saw: string }
  | { kind: 'failed'; saw: string };

// The checkout a physical cwd is, when it is the launching or the main checkout.
function checkoutAt(input: VerifyInput, cwd: string): string | undefined {
  if (cwd === physical(input.launchTop)) {
    return `the launching checkout ${input.launchTop}`;
  }
  if (cwd === physical(input.mainTop)) {
    return `the main checkout ${input.mainTop}`;
  }
  return undefined;
}

function landingOnce(
  input: VerifyInput,
  jobId: string,
  readTimeoutMs: number,
): Landing {
  const listed = listJobs(input.runClaude, input.launchTop, readTimeoutMs);
  if ('issues' in listed) {
    return { kind: 'failed', saw: listed.issues.join(' ') };
  }
  const row = listed.jobs.find((job) => job.id === jobId);
  if (row === undefined) {
    return { kind: 'missing', saw: `${LISTING} lists no job ${jobId}` };
  }
  if (row.cwd === undefined) {
    return { kind: 'missing', saw: `the job ${jobId} lists no cwd` };
  }
  // Read against the launching checkout, should a build print the cwd relative.
  const cwd = physical(path.resolve(input.launchTop, row.cwd));
  const checkout = checkoutAt(input, cwd);
  if (checkout !== undefined) return { kind: 'checkout', checkout };
  const listing = listWorktrees(input.runGit, input.launchTop);
  if ('issue' in listing) {
    return {
      kind: 'failed',
      saw: `git worktree list failed: ${listing.issue}`,
    };
  }
  const entry = listing.worktrees.find((w) => physical(w.path) === cwd);
  if (entry === undefined) {
    return {
      kind: 'missing',
      saw: `the job's cwd ${row.cwd} is no worktree git lists`,
    };
  }
  return { kind: 'found', entry };
}

type Settled = Exclude<Landing, { kind: 'checkout' }>;

// Reads until the worktree is found, a read fails, or the reads for what the
// last one saw run out. A cwd at a checkout gets the longer creation budget.
function landing(input: VerifyInput, jobId: string, reads: Reads): Settled {
  for (let tried = 1; ; tried += 1) {
    const now = landingOnce(input, jobId, reads.readTimeoutMs);
    if (now.kind === 'found' || now.kind === 'failed') return now;
    const limit = now.kind === 'checkout' ? reads.creationTries : reads.tries;
    if (tried >= limit) return { kind: 'missing', saw: lastSaw(now, tried) };
    input.sleep(reads.intervalMs);
  }
}

function lastSaw(
  now: Extract<Landing, { kind: 'missing' | 'checkout' }>,
  tried: number,
): string {
  const saw =
    now.kind === 'checkout'
      ? `the job still runs in ${now.checkout}, so a slow WorktreeCreate hook or .worktreeinclude copy may still be making its worktree`
      : now.saw;
  return `after ${tried} tries, ${saw}`;
}

// The commit a branch was created at: the oldest entry of its reflog, the last
// line git prints.
function creationCommit(
  runGit: Runner,
  top: string,
  ref: string | undefined,
): { sha: string } | { issue: string } {
  if (ref === undefined) {
    return { issue: 'the worktree has a detached HEAD, so no branch reflog' };
  }
  const result = runGit('git', ['reflog', 'show', '--format=%H', ref], top);
  if (result.code !== 0) {
    return { issue: `git reflog show ${ref} failed: ${result.stderr.trim()}` };
  }
  const oldest = result.stdout.trim().split('\n').at(-1) ?? '';
  if (oldest === '') {
    return {
      issue: `${ref} has no reflog to read its creation commit from`,
    };
  }
  return { sha: oldest };
}

const unchecked = (why: string): WorktreeVerdict => ({
  kind: 'unchecked',
  line: `the worktree check did not run: ${why}`,
});

const describeBranch = (ref: string | undefined): string =>
  ref === undefined ? 'a detached HEAD' : shortBranch(ref);

// What Claude Code's own creation makes; `sha` is undefined when the baseline
// names no commit, which dispatch's checks have already ruled out.
interface Expected {
  path: string;
  sha: string | undefined;
}

// A wrong path or branch. The creation commit is named too when git reads it
// and it is off the baseline.
function creatorMismatch(
  entry: WorktreeEntry,
  expected: Expected,
  created: { sha: string } | { issue: string },
  worker: { name: string; job: string },
): WorktreeVerdict {
  const found = `${entry.path} on ${describeBranch(entry.branch)}`;
  const wanted = `${expected.path} on ${nativeBranch(worker.name)}`;
  const offBase =
    'sha' in created &&
    expected.sha !== undefined &&
    created.sha !== expected.sha;
  return {
    kind: 'mismatch',
    cause: 'creator',
    lines: [
      `the worker's worktree is ${found}, not ${wanted}: a WorktreeCreate hook likely made it`,
      ...(offBase
        ? [
            `the worker's worktree was created at ${created.sha}, not the baseline ${expected.sha}`,
          ]
        : []),
    ],
    job: worker.job,
  };
}

function judge(
  input: VerifyInput,
  entry: WorktreeEntry,
  job: string,
): WorktreeVerdict {
  const { name } = input;
  const expected: Expected = {
    path: nativeFolder(input.mainTop, name),
    sha: commitOf(input.runGit, input.launchTop, input.baseline),
  };
  const created = creationCommit(input.runGit, input.launchTop, entry.branch);
  const rightPath = physical(entry.path) === physical(expected.path);
  const rightBranch = entry.branch === `${HEADS}${nativeBranch(name)}`;
  if (!rightPath || !rightBranch) {
    return creatorMismatch(entry, expected, created, { name, job });
  }
  if (expected.sha === undefined) {
    return unchecked(`the baseline ${input.baseline} names no commit`);
  }
  if ('issue' in created) return unchecked(created.issue);
  if (created.sha === expected.sha) return { kind: 'matches' };
  return {
    kind: 'mismatch',
    cause: 'base',
    lines: [
      `the worker's worktree was created at ${created.sha}, not the baseline ${expected.sha}: worktree.baseRef is likely not "head" for this launch`,
    ],
    job,
  };
}

/**
 * Judges the worktree the job `jobId` runs in. It reads the job's row from
 * the launching checkout, retrying while the row, its `cwd`, or a worktree git
 * lists at that `cwd` is missing. It also retries while the `cwd` is the
 * launching or the main checkout, for longer, since a slow creator keeps it
 * there. A `cwd` still there after those reads leaves the check unrun, and the
 * worker's own start check is the backstop.
 */
export function verifyWorktree(input: VerifyInput): WorktreeVerdict {
  const {
    jobId,
    tries = 5,
    creationTries = 30,
    intervalMs = 1000,
    readTimeoutMs = 10_000,
  } = input;
  if (jobId === null) {
    return unchecked(`claude's output named no job id for ${input.name}`);
  }
  const found = landing(input, jobId, {
    tries,
    creationTries,
    intervalMs,
    readTimeoutMs,
  });
  switch (found.kind) {
    case 'found':
      return judge(input, found.entry, jobId);
    case 'missing':
    case 'failed':
      return unchecked(found.saw);
    default: {
      const unhandled: never = found;
      throw new Error(`unhandled landing: ${JSON.stringify(unhandled)}`);
    }
  }
}
