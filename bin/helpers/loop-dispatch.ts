/**
 * `sidekick loop dispatch <name> --issue <n> --skill <plugin>:<skill>`: starts
 * one unit of a loop's work in a worker inside the fence, within caps the
 * loop's model cannot stretch. It checks the environment and the loop, then,
 * under the loop's units lock, reaps an overrun attempt and checks the
 * record, the skill, the issue, and the loop's worktree.
 * Then it fast-forwards that worktree, picks the worker's name, writes the
 * attempt's folder, and launches (`loop-dispatch-launch.ts`). A refusal
 * names every reason it finds. Until a `dispatched` line counts the attempt,
 * the loop's folder ends as it began, but for what the reap writes when it
 * closes an overrun attempt: its `failed` and `discarded` lines, and the
 * worker's report saved to that attempt's folder.
 */

import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as v from 'valibot';
import type { LoopEnv } from './loop.js';
import { writeAttempt } from './loop-dispatch-attempt.js';
import {
  type DispatchLoop,
  envIssues,
  launchProfileIssues,
  ledgerIssues,
  loadLoop,
  skillIssues,
} from './loop-dispatch-checks.js';
import { launchAttempt, launchEnvOf } from './loop-dispatch-launch.js';
import {
  checkLoopTree,
  type LoopTree,
  syncLoopTree,
} from './loop-dispatch-tree.js';
import { type Io, type Out, REFUSED, refuse } from './loop-io.js';
import { fetchUnitIssue, type UnitIssue } from './loop-issue.js';
import { reapDue } from './loop-reap.js';
import { sessionOf } from './loop-start-prepare.js';
import { takeUnitsLock } from './loop-unit-context.js';
import { attemptDir, deriveUnitId, unitIdIssues } from './loop-units.js';
import type { Runner } from './pm-data.js';
import { parseFlags } from './profile.js';
import { isProfileName, PROFILE_NAME_RULE } from './profile-manifest.js';
import { UnitBriefSchema, WorkerNameSchema } from './worker-brief.js';
import { unitLaunchEnv } from './worker-dispatch.js';
import { workerNameIssues } from './worker-dispatch-checks.js';
import { listJobs } from './worker-jobs.js';
import { nativeFolder } from './worker-worktree.js';

export { UNIT_REPORT } from './loop-dispatch-attempt.js';

export const DISPATCH_USAGE_LINE =
  'sidekick loop dispatch <name> --issue <n> --skill <plugin>:<skill>';

/** What a caller may vary about one dispatch. */
export interface UnitDispatchOptions {
  /** Six hex characters for a worker's name; random by default. */
  draw?: () => string;
  /** How many names to draw before refusing. */
  draws?: number;
  /** The limit on each git and gh call but the sync's three. */
  gitTimeoutMs?: number;
  /** The limit on asking origin for its default branch, on the fetch of origin, and on the fast-forward of the loop's worktree. */
  syncTimeoutMs?: number;
}

// A worker's name is at most 40 characters: this many of the loop's name, a
// hyphen, and the six hex characters HEX_BYTES gives.
const NAME_PREFIX_MAX = 33;
const HEX_BYTES = 3;
const ISSUE_NUMBER = /^[1-9][0-9]*$/;

const usage = (err: Out): number => {
  err(`usage: ${DISPATCH_USAGE_LINE}`);
  return REFUSED;
};

/** One dispatch's arguments, checked. */
export interface Call {
  name: string;
  issue: number;
  skill: string;
  unit: string;
}

const issueIssues = (text: string): string[] =>
  ISSUE_NUMBER.test(text) && Number.isSafeInteger(Number(text))
    ? []
    : [
        `--issue ${text}: must be an issue number, a whole number of at least 1`,
      ];

const skillShapeIssues = (skill: string): string[] => {
  const parsed = v.safeParse(UnitBriefSchema.entries.skill, skill);
  return parsed.success
    ? []
    : parsed.issues.map((i) => `--skill ${skill}: ${i.message}`);
};

// The arguments, or every reason they refuse; undefined is a usage error.
function parseCall(rest: string[]): Call | { issues: string[] } | undefined {
  const parsed = parseFlags(rest, {
    issue: { type: 'string' },
    skill: { type: 'string' },
  });
  if (parsed === undefined || parsed.positionals.length !== 1) return undefined;
  const { issue, skill } = parsed.values;
  if (typeof issue !== 'string' || typeof skill !== 'string') return undefined;
  const [name] = parsed.positionals;
  const issues = [
    ...(isProfileName(name)
      ? []
      : [`"${name}" is not a loop name: use ${PROFILE_NAME_RULE}`]),
    ...issueIssues(issue),
    ...skillShapeIssues(skill),
  ];
  if (issues.length > 0) return { issues };
  const unit = deriveUnitId(skill, Number(issue));
  const unitIssues = unitIdIssues(unit).map(
    (i) => `--skill and --issue give the unit id ${unit}, and ${i}`,
  );
  if (unitIssues.length > 0) return { issues: unitIssues };
  return { name, issue: Number(issue), skill, unit };
}

/** One dispatch past its first checks: the call, the loop, and what it runs with. */
export interface Dispatch {
  call: Call;
  loop: DispatchLoop;
  lenv: LoopEnv;
  /** `lenv.runGit`, with each call held to a time limit. */
  runGit: Runner;
  opts: Required<UnitDispatchOptions>;
}

// Each call gets `timeoutMs` unless it sets its own.
const timed =
  (run: Runner, timeoutMs: number): Runner =>
  (cmd, args, cwd, o) =>
    run(cmd, args, cwd, { ...o, timeoutMs: o?.timeoutMs ?? timeoutMs });

/**
 * Runs `dispatch`; returns 0 once the worker started in its worktree, else 1,
 * or `claude`'s own exit code when the launch failed.
 */
export function loopDispatch(
  rest: string[],
  lenv: LoopEnv,
  out: Out,
  err: Out,
  {
    draw = () => randomBytes(HEX_BYTES).toString('hex'),
    draws = 5,
    gitTimeoutMs = 10_000,
    syncTimeoutMs = 60_000,
  }: UnitDispatchOptions = {},
): number {
  const call = parseCall(rest);
  if (call === undefined) return usage(err);
  if ('issues' in call) return refuse(err, call.issues);
  const env = envIssues(lenv.env, call.name, 'dispatch');
  if (env.length > 0) return refuse(err, env);
  const runGit = timed(lenv.runGit, gitTimeoutMs);
  const loop = loadLoop(call.name, { ...lenv, runGit });
  if ('issues' in loop) return refuse(err, loop.issues);
  const lock = takeUnitsLock(loop.dir, lenv);
  if (lock.kind === 'busy') return refuse(err, [lock.issue]);
  const opts = { draw, draws, gitTimeoutMs, syncTimeoutMs };
  try {
    return underLock({ call, loop, lenv, runGit, opts }, { out, err });
  } finally {
    lock.release();
  }
}

// Everything the lock covers: the reap, the record, the checks after it,
// the worktree's move, the name, the attempt's folder, and the launch.
function underLock(d: Dispatch, io: Io): number {
  const { dir: loopDir, manifest } = d.loop;
  const reaped = reapDue({
    name: d.call.name,
    loopDir,
    manifest,
    lenv: d.lenv,
  });
  if ('issues' in reaped) return refuse(io.err, reaped.issues);
  for (const line of reaped.lines) io.out(line);
  const counted = ledgerIssues(d.loop, d.call, d.lenv.now());
  if (counted.length > 0) return refuse(io.err, counted);
  const ready = prepare(d);
  if ('issues' in ready) return refuse(io.err, ready.issues);
  const placed = place(d, ready.tree);
  if ('issues' in placed) return refuse(io.err, placed.issues);
  const named = drawName(d);
  if ('issues' in named) return refuse(io.err, named.issues);
  const { worker } = named;
  const written = writeAttempt({
    loopDir: d.loop.dir,
    loop: d.call.name,
    unit: d.call.unit,
    worker,
    issue: ready.issue,
    skill: d.call.skill,
    baseline: placed.baseline,
    orchestrator: sessionOf(d.call.name),
    worktree: nativeFolder(d.loop.manifest.repo, worker),
    hosts: d.loop.manifest.hosts,
    gates: d.loop.manifest.gates,
    dispatchedAt: d.lenv.now(),
  });
  if ('issues' in written) return refuse(io.err, written.issues);
  return launchAttempt(d, { worker, tree: ready.tree, written }, io);
}

// The checks that write nothing: the skill, the issue, and the loop's
// worktree, each reason named.
function prepare(
  d: Dispatch,
): { issue: UnitIssue; tree: LoopTree } | { issues: string[] } {
  const { repo } = d.loop.manifest;
  const skill = skillIssues(d.loop.profile, d.call.skill);
  const fetched = fetchUnitIssue(d.runGit, repo, d.call.issue);
  const tree = checkLoopTree(repo, d.call.name, d.runGit);
  const issues = [
    ...skill,
    ...('issues' in fetched ? fetched.issues : []),
    ...('issues' in tree ? tree.issues : []),
  ];
  if (issues.length > 0 || 'issues' in fetched || 'issues' in tree) {
    return { issues };
  }
  return { issue: fetched.issue, tree };
}

// The loop's worktree moved to origin's tip, then the profile its launch loads there.
function place(
  d: Dispatch,
  tree: LoopTree,
): { baseline: string } | { issues: string[] } {
  const synced = syncLoopTree(tree, d.loop.manifest.repo, d.opts.syncTimeoutMs);
  if ('issues' in synced) return synced;
  const shadowed = launchProfileIssues(
    unitLaunchEnv(launchEnvOf(d.lenv, tree), tree.folder),
    d.loop.profile,
  );
  return shadowed.length > 0 ? { issues: shadowed } : synced;
}

// What refuses `worker`: the name rule, dispatch's own name checks, and an
// attempt's folder of that name.
function nameIssues(
  d: Dispatch,
  listed: ReturnType<typeof listJobs>,
  worker: string,
): string[] {
  if (!v.is(WorkerNameSchema, worker)) {
    return [`name: ${worker} is not a worker name`];
  }
  const dir = attemptDir(d.loop.dir, d.call.unit, worker);
  return [
    ...workerNameIssues(d.runGit, d.loop.manifest.repo, listed, worker),
    ...(fs.existsSync(dir) ? [`name: ${dir} already exists`] : []),
  ];
}

/**
 * Up to `NAME_PREFIX_MAX` characters of the loop's name, a hyphen, and six
 * hex characters, drawn again while the name checks refuse it.
 */
function drawName(d: Dispatch): { worker: string } | { issues: string[] } {
  const listed = listJobs(d.lenv.runClaude, d.loop.manifest.repo);
  if ('issues' in listed) return listed;
  const prefix = d.call.name.slice(0, NAME_PREFIX_MAX).replace(/-+$/, '');
  let last: string[] = [];
  for (let drawn = 0; drawn < d.opts.draws; drawn++) {
    const worker = `${prefix}-${d.opts.draw()}`;
    last = nameIssues(d, listed, worker);
    if (last.length === 0) return { worker };
  }
  return {
    issues: [
      ...last,
      `dispatch drew ${d.opts.draws} worker names and its name checks refused each; the reasons above are the last one's`,
    ],
  };
}
