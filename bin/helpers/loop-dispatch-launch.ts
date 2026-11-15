/**
 * The launch half of `sidekick loop dispatch`: the unit launch through
 * `dispatchUnit`, from the loop's worktree with the hardened git into it, and
 * what the loop's folder keeps after it. The attempt's folder stays only
 * while a `dispatched` line counts it: once `claude` reports a start, or once
 * the launch runs out of time, since its worker may then have started.
 */

import type { LoopEnv } from './loop.js';
import type { Call, Dispatch } from './loop-dispatch.js';
import { removeAttempt, type Written } from './loop-dispatch-attempt.js';
import type { LoopTree } from './loop-dispatch-tree.js';
import { appendRecord } from './loop-record.js';
import { untrustedLines } from './loop-start-act.js';
import { writeWorkerFile } from './loop-units.js';
import type { ClaudeResult } from './profile-launch.js';
import type { WorkerEnv } from './worker.js';
import { dispatchUnit, type Launched } from './worker-dispatch.js';

type Out = (line: string) => void;
type Io = { out: Out; err: Out };

// The exit of a refusal, and of a launch that refused without a code of its own.
const REFUSED = 1;

const refuse = (err: Out, issues: string[]): number => {
  for (const issue of issues) err(issue);
  return REFUSED;
};

const failedCode = (code: number): number => (code === 0 ? REFUSED : code);

const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

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

/** What the launch saw: whether a line counts the attempt, and `claude --bg`'s own result. */
interface Seen {
  recorded: boolean;
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

// The job into `worker.json`, then the `dispatched` line, which counts the
// attempt. Inside `onStart`, a throw stops the worker as a stray.
function recordStart(d: Dispatch, a: Attempt, job: string | null): void {
  const at = d.lenv.now().toISOString();
  const issues = writeWorkerFile(a.written.dir, {
    v: 1,
    worker: a.worker,
    job,
    issue: d.call.issue,
    dispatchedAt: at,
  });
  if (issues.length > 0) throw new Error(issues.join('; '));
  appendRecord(d.loop.dir, {
    v: 1,
    at,
    kind: 'dispatched',
    unit: d.call.unit,
    worker: a.worker,
    issue: d.call.issue,
    ...(d.loop.state.record ? { record: true as const } : {}),
  });
}

const againCommand = (call: Call): string =>
  `sidekick loop dispatch ${call.name} --issue ${call.issue} --skill ${call.skill}`;

const discardCommand = (call: Call): string =>
  `sidekick loop discard ${call.name} --unit ${call.unit} --reason <text>`;

// The unit launch. A throw before a line counts the attempt removes its
// folder before it passes on.
function launch(d: Dispatch, a: Attempt, seen: Seen, io: Io): Launched {
  try {
    return dispatchUnit(
      {
        briefPath: a.written.briefPath,
        profile: d.loop.manifest.profile,
        attemptDir: a.written.dir,
        hosts: d.loop.manifest.hosts,
        launchFolder: a.tree.folder,
        onStart: (job) => {
          recordStart(d, a, job);
          seen.recorded = true;
        },
      },
      watching(launchEnvOf(d.lenv, a.tree), seen),
      io.out,
      io.err,
    );
  } catch (e) {
    if (!seen.recorded) removeAttempt(a.written);
    throw e;
  }
}

// A launch that ran out of time may have started its worker, so the attempt
// counts until a discard or a reap closes it. A record that cannot be
// written leaves nothing, and says how to find the worker.
function countTimedOut(d: Dispatch, a: Attempt, code: number, io: Io): number {
  const lead = `claude --bg did not return in time, so dispatch cannot tell whether worker ${a.worker} started`;
  try {
    recordStart(d, a, null);
  } catch (e) {
    refuse(io.err, [
      `${lead}, and recording the attempt failed: ${messageOf(e)}`,
      ...removeAttempt(a.written),
      `The attempt does not count, and its folder is removed: if the worker started, find it with claude agents --json --all, then stop it with claude stop <id>.`,
    ]);
    return failedCode(code);
  }
  refuse(io.err, [
    `${lead}. The attempt now counts: its dispatched line is written and its folder kept, so the next dispatch waits. Once you have checked for the worker, give up on the attempt with ${discardCommand(d.call)}`,
  ]);
  return failedCode(code);
}

// A launch that never started leaves nothing, and says what to do about
// what claude printed.
function dropUnstarted(
  d: Dispatch,
  a: Attempt,
  result: ClaudeResult | undefined,
  { code, err }: { code: number; err: Out },
): number {
  const removed = removeAttempt(a.written);
  const fix =
    result === undefined
      ? []
      : untrustedLines(a.tree.folder, againCommand(d.call), result);
  refuse(err, [...removed, ...fix]);
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
  const seen: Seen = { recorded: false, launch: undefined };
  const launched = launch(d, a, seen, io);
  if (seen.recorded) return reportStarted(d, a, launched, io);
  if (seen.launch?.timedOut === true) {
    return countTimedOut(d, a, launched.code, io);
  }
  return dropUnstarted(d, a, seen.launch, {
    code: launched.code,
    err: io.err,
  });
}
