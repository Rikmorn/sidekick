/**
 * Where a worker's work must have landed, and the verdict on its branch. It
 * picks the target from `--into`, the brief's `target`, or the `HEAD` of the
 * brief's checkout, walks history through `landedIn`, and words each
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

/** The checkouts a target resolves in, and the brief's own `target`. */
export interface TargetContext {
  /** The checkout finish runs in, where `--into` resolves. */
  launchTop: string;
  mainTop: string;
  /** The checkout holding the brief, whose `HEAD` is the fallback target. */
  briefTop: string | undefined;
  briefFolder: string;
  /** The brief's `target`, a branch's short name. */
  briefTarget: string | undefined;
}

// The target's name: the full ref name git gives it, `HEAD` when detached, else
// the rev as typed, since a sha or `main~1` has no symbolic name.
function targetName(runGit: Runner, top: string, rev: string): string {
  const result = runGit('git', ['rev-parse', '--symbolic-full-name', rev], top);
  const name = result.code === 0 ? result.stdout.trim() : '';
  return name === '' ? rev : name;
}

type Target = { name: string; sha: string; why: string };

// Where a target's rev resolves, why it is the target, and the refusal when
// the rev names no commit.
type Lookup = { rev: string; top: string; why: string; missing: string };

// The operator typed `--into` where finish runs, so it resolves there.
const intoLookup = (ctx: TargetContext, into: string, branch: string) => ({
  rev: into,
  top: ctx.launchTop,
  why: 'from --into',
  missing: `--into ${into} names no commit in the main checkout's repo, so finish cannot check that ${branch} landed there: name a branch, tag, or commit that exists`,
});

// The brief's target goes to git as a full ref, since a bare name starting
// with `-` would read as an option.
const briefLookup = (ctx: TargetContext, target: string, branch: string) => ({
  rev: `refs/heads/${target}`,
  top: ctx.mainTop,
  why: "the brief's target",
  missing: `the brief's target ${target} names no branch, so finish cannot check that ${branch} landed there: create the branch, fix the brief's target, or name the target with --into <rev>`,
});

function headLookup(
  ctx: TargetContext,
  branch: string,
): Lookup | { issue: string } {
  const { briefTop } = ctx;
  if (briefTop === undefined) {
    return {
      issue: `the brief's folder ${ctx.briefFolder} is in no git checkout, so finish has no HEAD to check that ${branch} landed in: name the target with --into <rev>`,
    };
  }
  return {
    rev: 'HEAD',
    top: briefTop,
    why: `the HEAD of ${briefTop}, since the brief names no target`,
    missing: `the HEAD of ${briefTop} names no commit, so finish cannot check that ${branch} landed there: name the target with --into <rev>`,
  };
}

// `--into`, else the brief's target, else the HEAD of the brief's checkout.
function lookupFor(
  ctx: TargetContext,
  into: string | undefined,
  branch: string,
): Lookup | { issue: string } {
  if (into !== undefined) return intoLookup(ctx, into, branch);
  if (ctx.briefTarget !== undefined) {
    return briefLookup(ctx, ctx.briefTarget, branch);
  }
  return headLookup(ctx, branch);
}

// The commit the work must have landed in. The worker's own branch is no
// target, since it holds its head.
function resolveTarget(
  runGit: Runner,
  ctx: TargetContext,
  into: string | undefined,
  branch: string,
): Target | { issue: string } {
  const lookup = lookupFor(ctx, into, branch);
  if ('issue' in lookup) return lookup;
  const sha = commitOf(runGit, lookup.top, lookup.rev);
  if (sha === undefined) return { issue: lookup.missing };
  const name = targetName(runGit, lookup.top, lookup.rev);
  if (name === `refs/heads/${branch}`) {
    return {
      issue: `the target ${name} is the worker's own branch, which holds its head whether or not the work landed, so it cannot show the work landed there: name the branch it should land in with --into <rev>`,
    };
  }
  return { name, sha, why: lookup.why };
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
  ctx: TargetContext,
  worker: { branch: string; head: string },
  opts: FinishOptions,
): { verdict: Verdict } | { issues: string[] } {
  const { branch, head } = worker;
  if (opts.mode.kind === 'discard') return { verdict: { kind: 'discard' } };
  const target = resolveTarget(runGit, ctx, opts.mode.into, branch);
  if ('issue' in target) return { issues: [target.issue] };
  const landing = landedIn(runGit, ctx.mainTop, { target: target.sha, head });
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
  ctx: TargetContext,
  branch: { name: string; head: string | undefined },
  opts: FinishOptions,
  id: string,
): { head: string; verdict: Verdict } | { issues: string[] } {
  const { name, head } = branch;
  if (head === undefined) {
    return { issues: [missingBranchIssue(name, opts, id)] };
  }
  const judged = verdictFor(runGit, ctx, { branch: name, head }, opts);
  return 'issues' in judged ? judged : { head, verdict: judged.verdict };
}
