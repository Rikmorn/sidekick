/**
 * The second half of `sidekick loop start`: acting on one prepared loop. It
 * picks the steps for the reconcile's choice, runs the calls on the loop's old
 * job (`loop-start-jobs.ts`), and launches fresh around two `state.json`
 * writes. `runStart` holds the loop's lock around all of it.
 */

import { randomUUID } from 'node:crypto';
import type { LoopEnv } from './loop.js';
import { effectiveStates } from './loop-compile.js';
import { inheritedListing } from './loop-inherited.js';
import type { Action, LaunchReason } from './loop-reconcile.js';
import {
  callAt,
  launchLimit,
  removeJob,
  respawnJob,
  stopJob,
  waitStopped,
} from './loop-start-jobs.js';
import { type Prepared, sessionOf } from './loop-start-prepare.js';
import { type LoopState, removeState, writeState } from './loop-state.js';
import { type ClaudeResult, printedStreams } from './profile-launch.js';
import { configDir } from './sidekick-home.js';
import type { Job } from './worker-jobs.js';
import { jobIdFrom } from './worker-record.js';
import { withText } from './worker-teardown.js';

type Out = (line: string) => void;
type Ready = Extract<Prepared, { kind: 'ready' }>;
type Paused = Extract<Prepared, { kind: 'paused' }>;

/** A fresh launch that ran: the state it recorded, which the wait for the arm reads, and how the summary names it. */
export interface Launched {
  name: string;
  dir: string;
  state: LoopState;
  verb: 'launched' | 'relaunched';
  /** The job removed to make room, if any. */
  replaced: string | undefined;
  why: string;
}

/** What one loop came to. `refused` changed nothing; `failed` stopped at a `claude` call or a write. */
export type Outcome =
  | { kind: 'left'; job: string; armed: boolean }
  | { kind: 'paused' }
  | { kind: 'respawned'; job: string }
  | { kind: 'launched'; launched: Launched }
  | { kind: 'refused' }
  | { kind: 'failed' };

/** What acting on one loop reads. `out` and `err` are the run's own; every line printed starts with the loop's name, but the inherited listing's indented body. */
export interface ActContext {
  name: string;
  lenv: LoopEnv;
  /** The listing `start` took once, before preparing any loop. */
  rows: readonly Job[];
  record: boolean;
  out: Out;
  err: Out;
}

type How = Pick<Launched, 'verb' | 'replaced' | 'why'>;

const UNTRUSTED = /Workspace not trusted/;
const KEEPS_NULL =
  'state.json keeps job null, so the next start finds the session by its name';

const say = (ctx: ActContext, line: string): void =>
  ctx.out(`${ctx.name}: ${line}`);
const warn = (ctx: ActContext, line: string): void =>
  ctx.err(`${ctx.name}: ${line}`);

function refusing(ctx: ActContext, lines: readonly string[]): Outcome {
  for (const line of lines) warn(ctx, line);
  return { kind: 'refused' };
}

function failing(ctx: ActContext, lines: readonly string[]): Outcome {
  for (const line of lines) warn(ctx, line);
  return { kind: 'failed' };
}

const bug = (action: Action, why: string): string =>
  `start chose ${action.kind} ${why}, which is a bug in sidekick, so it changed nothing`;

/** Acts on the reconcile's choice for one prepared loop, and prints what went wrong or needs the operator. */
export function actOn(prepared: Prepared, ctx: ActContext): Outcome {
  switch (prepared.kind) {
    case 'refused':
      return refusing(ctx, prepared.lines);
    case 'paused':
      return actPaused(prepared, ctx);
    case 'ready':
      return actReady(prepared, ctx);
    default: {
      const unhandled: never = prepared;
      throw new Error(`unhandled preparation ${JSON.stringify(unhandled)}`);
    }
  }
}

// A paused loop is never launched or respawned; its stop keeps the row, and `state.json` records the pause.
function actPaused(p: Paused, ctx: ActContext): Outcome {
  const { action } = p;
  switch (action.kind) {
    case 'off':
      return endPaused(p, ctx);
    case 'pause':
      return pause(p, action.job, ctx);
    case 'refuse':
      return refusing(ctx, action.lines);
    case 'leave':
    case 'respawn':
    case 'relaunch':
    case 'launch':
      return refusing(ctx, [bug(action, 'for a paused loop')]);
    default: {
      const unhandled: never = action;
      throw new Error(`unhandled action ${JSON.stringify(unhandled)}`);
    }
  }
}

function actReady(p: Ready, ctx: ActContext): Outcome {
  for (const warning of p.warnings) warn(ctx, warning);
  const { action } = p;
  switch (action.kind) {
    case 'leave':
      return leave(action, ctx);
    case 'refuse':
      return refusing(ctx, action.lines);
    case 'respawn':
      printListing(p, ctx);
      return respawn(p, action, ctx);
    case 'relaunch':
      printListing(p, ctx);
      return relaunch(p, action.job, ctx);
    case 'launch':
      printListing(p, ctx);
      return launch(p, action, ctx);
    case 'off':
    case 'pause':
      return refusing(ctx, [bug(action, 'for a loop that is not paused')]);
    default: {
      const unhandled: never = action;
      throw new Error(`unhandled action ${JSON.stringify(unhandled)}`);
    }
  }
}

// A relaunch could race a fresh launch's arm, so an unarmed live loop is left, with the fix.
function leave(
  action: Extract<Action, { kind: 'leave' }>,
  ctx: ActContext,
): Outcome {
  const { job, armed } = action;
  if (!armed) {
    warn(
      ctx,
      `job ${job} runs, but start cannot show its cron jobs alive: no current armed.json shows them, or the machine booted since start launched or respawned it. So it may never tick. Stop it with claude stop ${job}, then run sidekick loop start ${ctx.name}, which launches it fresh.`,
    );
  }
  return { kind: 'left', job, armed };
}

// The listing blocks nothing (ruled 2026-11-14); it shows what a process inherits beyond its mandate before it starts.
function printListing(p: Ready, ctx: ActContext): void {
  const { lenv } = ctx;
  const listing = inheritedListing(p.manifest, p.profile, {
    runClaude: lenv.runClaude,
    configDir: configDir(lenv.env, lenv.cwd, lenv.home),
    home: lenv.home,
    managedFile: lenv.managedFile,
  });
  for (const warning of listing.warnings) warn(ctx, warning);
  say(ctx, 'inherited beyond the mandate:');
  for (const line of listing.lines) ctx.out(`  ${line}`);
}

function pause(p: Paused, job: string, ctx: ActContext): Outcome {
  const issues = stopJob(callAt(p.repo, ctx.lenv), job);
  if (issues.length > 0) return failing(ctx, issues);
  say(ctx, `stopped job ${job}`);
  return endPaused(p, ctx);
}

// A paused run that ends off records the pause once, so the reconcile reads the launch as changed once the pause is lifted. A pause ending off never fails the loop, so a failed write only warns.
function endPaused(p: Paused, ctx: ActContext): Outcome {
  const { state } = p;
  if (state === undefined || state.pausedAt !== undefined) {
    return { kind: 'paused' };
  }
  const issues = writeState(p.dir, {
    ...state,
    pausedAt: ctx.lenv.now().toISOString(),
  });
  for (const issue of issues) {
    warn(
      ctx,
      `${issue}; state.json records no pause, so once the pause is lifted start may respawn the old session instead of launching it fresh`,
    );
  }
  return { kind: 'paused' };
}

// A respawn keeps the launch, so only `startedAt` moves, which the boot test reads.
function respawn(
  p: Ready,
  action: Extract<Action, { kind: 'respawn' }>,
  ctx: ActContext,
): Outcome {
  const { state } = p;
  if (state === undefined) {
    return refusing(ctx, [bug(action, 'with no state.json')]);
  }
  const { job } = action;
  const unspawned = respawnJob(callAt(p.repo, ctx.lenv), job, p.name);
  if (unspawned.length > 0) return failing(ctx, unspawned);
  const issues = writeState(p.dir, {
    ...state,
    startedAt: ctx.lenv.now().toISOString(),
  });
  for (const issue of issues) {
    warn(ctx, `${issue}; startedAt keeps the time of the last start`);
  }
  return { kind: 'respawned', job };
}

function relaunch(p: Ready, job: string, ctx: ActContext): Outcome {
  const call = callAt(p.repo, ctx.lenv);
  const issues = firstIssues([
    () => stopJob(call, job),
    () => waitStopped(call, job, pidOf(job, ctx.rows)),
    () => removeJob(call, job),
  ]);
  if (issues.length > 0) return failing(ctx, issues);
  return launchFresh(p, ctx, {
    verb: 'relaunched',
    replaced: job,
    why: changeWhy(p),
  });
}

// `remove` never names a row with a pid (`chooseAction` in loop-reconcile.ts), so no stop or wait comes first.
function launch(
  p: Ready,
  action: Extract<Action, { kind: 'launch' }>,
  ctx: ActContext,
): Outcome {
  const { remove, reason } = action;
  if (remove !== undefined) {
    const issues = removeJob(callAt(p.repo, ctx.lenv), remove);
    if (issues.length > 0) return failing(ctx, issues);
  }
  return launchFresh(p, ctx, {
    verb: 'launched',
    replaced: remove,
    why: reasonText(p, reason),
  });
}

// The pid the listing gave the job, which a stop waits on before claude rm.
const pidOf = (job: string, rows: readonly Job[]): number | undefined =>
  rows.find((row) => row.id === job)?.pid;

// Runs each step in turn, stopping at the first that returns issues.
function firstIssues(steps: readonly (() => string[])[]): string[] {
  for (const step of steps) {
    const issues = step();
    if (issues.length > 0) return issues;
  }
  return [];
}

// Why a live or stopped row counts as changed, as `originOf` and `isUnchangedLaunch` in loop-reconcile.ts judge it; a recorded pause comes first.
function changeWhy(p: Ready): string {
  if (p.state === undefined) return 'no state.json records it';
  if (p.state.pausedAt !== undefined) return 'unpaused';
  return p.state.hash === p.hash
    ? 'state.json names another job'
    : 'definition changed';
}

function reasonText(p: Ready, reason: LaunchReason): string {
  switch (reason) {
    case 'new':
      return 'new';
    case 'changed':
      return changeWhy(p);
    case 'jobs-gone':
      return 'cron jobs gone';
    case 'rebooted':
      return 'machine rebooted since it started';
    default: {
      const unhandled: never = reason;
      throw new Error(`unhandled reason ${JSON.stringify(unhandled)}`);
    }
  }
}

function freshState(p: Ready, ctx: ActContext): LoopState {
  const at = ctx.lenv.now().toISOString();
  return {
    v: 1,
    launch: randomUUID(),
    job: null,
    session: sessionOf(p.name),
    launchedAt: at,
    startedAt: at,
    hash: p.hash,
    record: ctx.record,
    states: effectiveStates(p.manifest, ctx.record),
    schedule: p.manifest.schedule,
    tick: p.manifest.tick,
  };
}

/**
 * The fix line for a launch Claude Code refused in `folder` because it does
 * not trust it as a workspace, else none. `again` is the command to run once
 * the folder is trusted. Claude Code refuses an untrusted folder before the
 * session starts (docs/research/loop/2026-11-12-loop-probes.md §U19), so
 * sidekick judges trust only by that refusal, and never writes ~/.claude.json.
 */
export const untrustedLines = (
  folder: string,
  again: string,
  result: ClaudeResult,
): string[] =>
  UNTRUSTED.test(printedStreams(result).join('\n'))
    ? [
        `Claude Code does not trust ${folder} as a workspace. Run claude in ${folder} once and accept the trust prompt, then run ${again} again.`,
      ]
    : [];

const trustLines = (p: Ready, result: ClaudeResult): string[] =>
  untrustedLines(p.repo, `sidekick loop start ${p.name}`, result);

// `state.json` lands before the launch, since the launch prompt's arm reads it at once. A launch that exits non-zero is taken as never run, so its file goes; any job the file before it named was removed or gone from the listing. One that timed out may have started, so its file stays.
function launchFresh(p: Ready, ctx: ActContext, how: How): Outcome {
  const state = freshState(p, ctx);
  const unwritten = writeState(p.dir, state);
  if (unwritten.length > 0) {
    return failing(ctx, [
      ...unwritten,
      "start launched nothing, since the launch's arm reads state.json",
    ]);
  }
  const result = ctx.lenv.runClaude(p.args, {
    cwd: p.repo,
    timeoutMs: launchLimit(ctx.lenv),
  });
  if (result.timedOut) {
    return failing(ctx, [
      ...withText(
        'claude --bg did not return in time, so start cannot tell whether the loop started',
        result,
      ),
      `${KEEPS_NULL} if it started.`,
    ]);
  }
  if (result.code !== 0) {
    return failing(ctx, [
      ...withText(
        `claude --bg failed with exit code ${result.code}, so the loop did not start`,
        result,
      ),
      ...trustLines(p, result),
      ...removeState(p.dir),
    ]);
  }
  const recorded = recordJob(p, state, result, ctx);
  return {
    kind: 'launched',
    launched: { name: p.name, dir: p.dir, state: recorded, ...how },
  };
}

// With no job id, the next start finds the row by name while `job` is null (`originOf` in loop-reconcile.ts).
function recordJob(
  p: Ready,
  state: LoopState,
  result: ClaudeResult,
  ctx: ActContext,
): LoopState {
  const job = jobIdFrom(result.stdout, state.session);
  if (job === null) {
    warn(
      ctx,
      `claude --bg printed no backgrounded line for ${state.session}, so state.json keeps job null; the next start finds the session by its name.`,
    );
    return state;
  }
  const recorded = { ...state, job };
  const issues = writeState(p.dir, recorded);
  for (const issue of issues) warn(ctx, issue);
  if (issues.length > 0) warn(ctx, `${KEEPS_NULL}.`);
  return recorded;
}
