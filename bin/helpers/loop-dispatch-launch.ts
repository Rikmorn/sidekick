/**
 * The launch half of `sidekick loop dispatch`: the unit launch through
 * `dispatchUnit`, from the loop's worktree with the hardened git into it, and
 * what the loop's folder keeps after it. Once the launch's checks pass, the
 * `dispatched` line counts the attempt before `claude --bg` runs, so a
 * dispatch ended during the launch leaves an attempt that `reap` and
 * `discard` close. The job fills in once `claude` reports a start. A launch
 * `claude` refuses closes its attempt with `discarded`, and the attempt
 * still counts. An attempt no line counts leaves no folder.
 */

import type { LoopEnv } from './loop.js';
import type { Call, Dispatch } from './loop-dispatch.js';
import { removeAttempt, type Written } from './loop-dispatch-attempt.js';
import type { LoopTree } from './loop-dispatch-tree.js';
import { type Io, messageOf, type Out, REFUSED, refuse } from './loop-io.js';
import { appendRecord } from './loop-record.js';
import { untrustedLines } from './loop-start-act.js';
import { writeWorkerFile } from './loop-units.js';
import type { ClaudeResult } from './profile-launch.js';
import type { WorkerEnv } from './worker.js';
import { dispatchUnit, type Launched } from './worker-dispatch.js';

// A launch that refused without a code of its own exits as a refusal.
const failedCode = (code: number): number => (code === 0 ? REFUSED : code);

// The reason a refused launch's `discarded` line gives.
const REFUSED_REASON = 'the launch was refused';

/** The worker's name, the loop's worktree it launches from, and what dispatch wrote for it. */
export interface Attempt {
  worker: string;
  tree: LoopTree;
  written: Written;
}

/**
 * The environment a unit launch runs with: the loop's own, with every git
 * call into the loop's worktree hardened. Calls elsewhere pass through.
 */
export const launchEnvOf = (lenv: LoopEnv, tree: LoopTree): WorkerEnv => ({
  ...lenv,
  runGit: tree.runGit,
});

/**
 * What the launch saw: when a line counted the attempt, whether `claude`
 * reported a start, and `claude --bg`'s own result.
 */
interface Seen {
  recordedAt: string | undefined;
  started: boolean;
  launch: ClaudeResult | undefined;
}

// `wenv`, keeping `claude --bg`'s result in `seen` for the lines after the launch.
const watching = (wenv: WorkerEnv, seen: Seen): WorkerEnv => ({
  ...wenv,
  runClaude: (args, opts) => {
    const result = wenv.runClaude(args, opts);
    if (args.includes('--bg')) seen.launch = result;
    return result;
  },
});

// `worker.json` with `job`, dated `at`, the time its `dispatched` line names.
function writeJob(
  d: Dispatch,
  a: Attempt,
  job: string | null,
  at: string,
): void {
  const issues = writeWorkerFile(a.written.dir, {
    v: 1,
    worker: a.worker,
    job,
    issue: d.call.issue,
    dispatchedAt: at,
  });
  if (issues.length > 0) throw new Error(issues.join('; '));
}

// `worker.json` with no job yet, then the `dispatched` line, which counts the
// attempt. Returns the time both name.
function recordAttempt(d: Dispatch, a: Attempt): string {
  const at = d.lenv.now().toISOString();
  writeJob(d, a, null, at);
  appendRecord(d.loop.dir, {
    v: 1,
    at,
    kind: 'dispatched',
    unit: d.call.unit,
    worker: a.worker,
    issue: d.call.issue,
    ...(d.loop.state.record ? { record: true as const } : {}),
  });
  return at;
}

// Counts the attempt right before `claude --bg` runs; a failure launches nothing.
const countAttempt = (d: Dispatch, a: Attempt, seen: Seen) => (): string[] => {
  try {
    seen.recordedAt = recordAttempt(d, a);
    return [];
  } catch (e) {
    return [
      `recording the attempt failed, so dispatch launched nothing: ${messageOf(e)}`,
    ];
  }
};

// The job `claude` reported, into `worker.json`. Inside `onStart`, a throw
// stops the worker as a stray.
const fillJob =
  (d: Dispatch, a: Attempt, seen: Seen) =>
  (job: string | null): void => {
    seen.started = true;
    const at = seen.recordedAt;
    if (job === null || at === undefined) return;
    writeJob(d, a, job, at);
  };

const againCommand = (call: Call): string =>
  `sidekick loop dispatch ${call.name} --issue ${call.issue} --skill ${call.skill}`;

const discardCommand = (call: Call): string =>
  `sidekick loop discard ${call.name} --unit ${call.unit} --reason <text>`;

// The unit launch. A throw before a line counts the attempt removes its
// folder before it passes on; after, the folder stays with the line.
function launch(d: Dispatch, a: Attempt, seen: Seen, io: Io): Launched {
  try {
    return dispatchUnit(
      {
        briefPath: a.written.briefPath,
        profile: d.loop.manifest.profile,
        attemptDir: a.written.dir,
        hosts: d.loop.manifest.hosts,
        launchFolder: a.tree.folder,
        beforeLaunch: countAttempt(d, a, seen),
        onStart: fillJob(d, a, seen),
      },
      watching(launchEnvOf(d.lenv, a.tree), seen),
      io.out,
      io.err,
    );
  } catch (e) {
    if (seen.recordedAt === undefined) removeAttempt(a.written);
    throw e;
  }
}

// A launch that ran out of time may have started its worker, and its line
// already counts it until a discard or a reap closes it.
function reportTimedOut(d: Dispatch, a: Attempt, code: number, io: Io): number {
  refuse(io.err, [
    `claude --bg did not return in time, so dispatch cannot tell whether worker ${a.worker} started. The attempt now counts: its dispatched line is written and its folder kept, so the next dispatch waits. Once you have checked for the worker, give up on the attempt with ${discardCommand(d.call)}`,
  ]);
  return failedCode(code);
}

// A launch `claude` refused started nothing, so `discarded` closes its
// attempt at once, which frees the slot; the attempt still counts against the
// caps. A line that cannot be written leaves the attempt in flight.
function closeRefused(
  d: Dispatch,
  a: Attempt,
  result: ClaudeResult | undefined,
  { code, err }: { code: number; err: Out },
): number {
  const fix =
    result === undefined
      ? []
      : untrustedLines(a.tree.folder, againCommand(d.call), result);
  try {
    appendRecord(d.loop.dir, {
      v: 1,
      at: d.lenv.now().toISOString(),
      kind: 'discarded',
      unit: d.call.unit,
      worker: a.worker,
      reason: REFUSED_REASON,
    });
  } catch (e) {
    refuse(err, [
      `${REFUSED_REASON}, but writing its discarded line failed: ${messageOf(e)}`,
      `the attempt stays in flight: give up on it with ${discardCommand(d.call)}`,
      ...fix,
    ]);
    return failedCode(code);
  }
  refuse(err, [
    `${REFUSED_REASON}, so dispatch closed the attempt of worker ${a.worker}, which still counts as one of unit ${d.call.unit}'s attempts`,
    ...fix,
  ]);
  return failedCode(code);
}

// An attempt no line counts launched nothing, so its folder goes.
function dropUncounted(
  a: Attempt,
  { code, err }: { code: number; err: Out },
): number {
  refuse(err, removeAttempt(a.written));
  return failedCode(code);
}

function reportStarted(
  d: Dispatch,
  a: Attempt,
  launched: Launched,
  io: Io,
): number {
  if (launched.code !== 0) {
    return refuse(io.err, [
      `the attempt stays in flight, since its dispatched line is written: give up on it with ${discardCommand(d.call)}`,
    ]);
  }
  const { unit, name } = d.call;
  const job = launched.job ?? '(none printed)';
  io.out(`unit ${unit} · worker ${a.worker} · job ${job}`);
  io.out(
    `next: once the worker messages, read its report with sidekick loop report ${name} --unit ${unit}`,
  );
  io.out(`to give up on it: ${discardCommand(d.call)}`);
  return 0;
}

/**
 * Launches the attempt's worker and settles what the loop's folder keeps.
 * Returns 0 once the worker started in its worktree, else 1, or `claude`'s
 * own exit code when the launch failed.
 */
export function launchAttempt(d: Dispatch, a: Attempt, io: Io): number {
  const seen: Seen = {
    recordedAt: undefined,
    started: false,
    launch: undefined,
  };
  const launched = launch(d, a, seen, io);
  const ended = { code: launched.code, err: io.err };
  if (seen.recordedAt === undefined) return dropUncounted(a, ended);
  if (seen.started) return reportStarted(d, a, launched, io);
  if (seen.launch?.timedOut === true) {
    return reportTimedOut(d, a, launched.code, io);
  }
  return closeRefused(d, a, seen.launch, ended);
}
