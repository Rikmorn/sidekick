/**
 * Where a worker's work must have landed, and the verdict on its branch. It
 * resolves the target, walks history through `landedIn`, and words each
 * refusal's way out for the mode `finish` runs in.
 */

import type { Runner } from './pm-data.js';
import { shellArg } from './shell.js';
import {
  discardCommandFor,
  type FinishMode,
  type FinishOptions,
} from './worker-finish-args.js';
import { DEFAULT_CAP, landedIn } from './worker-landed.js';
import { commitOf } from './worker-repo.js';
import type { Verdict } from './worker-teardown.js';

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
const discardRoute = (discardCommand: string): string =>
  `discarding it is your call, with ${discardCommand}`;
const handRoute = (id: string): string =>
  `to clear it by hand, claude rm ${shellArg(id)}`;

// The way out for a mode: landed mode offers the discard, discard mode the hand route.
export function routeFor(
  mode: FinishMode['kind'],
  discardCommand: string,
  id: string,
): string {
  switch (mode) {
    case 'landed':
      return discardRoute(discardCommand);
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
      return `the branch ${branch} does not exist, so finish cannot check that the work has landed: discarding it is your call, with claude rm ${shellArg(id)}`;
    case 'discard':
      return `the branch ${branch} does not exist, so finish has nothing to keep as a backup: clear the worker by hand with claude rm ${shellArg(id)}`;
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
          `${branch} has not landed in ${target.name} (${target.sha}): its head ${head} is not there, and ${walkedText(landing.walked, landing.capped)}. Land it and run finish again; name the target with --into <rev>; ${discardRoute(discardCommandFor(opts))}`,
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
export function branchVerdict(
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
