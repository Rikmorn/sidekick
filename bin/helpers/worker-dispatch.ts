/**
 * `sidekick worker dispatch`: checks a brief, the launching checkout, and the
 * profile, then starts `sk-worker` as a background session in a worktree of
 * its own, with pushes blocked unless the operator allows them. A refusal
 * names every reason it finds, except that a brief that does not parse stops
 * the checks there. Once the worker starts, it checks the worktree the worker
 * runs in, and stops a worker on the wrong one. This module launches; the
 * checks before the launch live in `worker-dispatch-checks.ts`, and the
 * worktree check in `worker-dispatch-verify.ts`.
 */

import { mainReport } from './main-session.js';
import { LAUNCH_TIMEOUT_MS } from './profile.js';
import { bgArgs, type ClaudeResult } from './profile-launch.js';
import { shellArg } from './shell.js';
import type { WorkerEnv } from './worker.js';
import { readBrief } from './worker-brief.js';
import type { DispatchOptions } from './worker-dispatch-args.js';
import { BYPASS, checkDispatch, type Ready } from './worker-dispatch-checks.js';
import {
  verifyWorktree,
  type WorktreeVerdict,
} from './worker-dispatch-verify.js';
import { ensureWorktreesExcluded } from './worker-exclude.js';
import { jobIdFrom, writeRecord } from './worker-record.js';
import { failure, ranClean, withText } from './worker-teardown.js';

type Out = (line: string) => void;

const withoutTrailingNewline = (text: string): string =>
  text.replace(/\n$/, '');

function relay(result: ClaudeResult, out: Out, err: Out): void {
  if (result.stdout !== '') out(withoutTrailingNewline(result.stdout));
  if (result.stderr !== '') err(withoutTrailingNewline(result.stderr));
  if (result.timedOut) err('claude did not return in time.');
}

const mainLines = (ready: Ready, wenv: WorkerEnv): string[] =>
  ready.main === undefined ? [] : [mainReport(ready.main, wenv.env, wenv.home)];

const DETACHED_LANDING =
  "where the operator lands it (this checkout's HEAD is detached)";

// The launching checkout is named only when it is not the main checkout.
function landingLine(ready: Ready): string {
  const target = ready.brief.target ?? DETACHED_LANDING;
  const from =
    ready.launchTop === ready.mainTop
      ? ''
      : ` · launched from ${ready.launchTop}`;
  return `lands in: ${target}${from}`;
}

function summary(ready: Ready): string[] {
  const { brief, mode } = ready;
  const pushes = ready.allowPush
    ? "pushes ALLOWED on the operator's word"
    : 'pushes blocked';
  return [
    `worker ${brief.name} dispatched · permission mode ${mode} · ${pushes}`,
    ...(mode === BYPASS
      ? ['every tool call the worker makes is pre-approved']
      : []),
    landingLine(ready),
    `steer: rulings in ${brief.rulings}, then message "${brief.name}" to point at them`,
    `finish: sidekick worker finish ${shellArg(ready.briefPath)}`,
  ];
}

const refuse = (err: Out, issues: string[]): number => {
  for (const issue of issues) err(issue);
  return 1;
};

// Leaves the record that `sidekick desk` lists the worker from. A failure only
// warns, since the worker has started either way.
function keepRecord(ready: Ready, job: string | null, err: Out): void {
  const written = writeRecord(ready.commonDir, {
    version: 2,
    name: ready.brief.name,
    main: ready.main?.value ?? null,
    job,
    brief: ready.briefPath,
    dispatchedAt: new Date().toISOString(),
  });
  if ('issue' in written) err(written.issue);
}

type Mismatch = Extract<WorktreeVerdict, { kind: 'mismatch' }>;

// The last refusal line. Only a hook made the worktree for `creator`, and only
// the hook's own removal clears what it made.
function wayOut(ready: Ready, verdict: Mismatch, stopped: string): string {
  const discard = `sidekick worker finish ${shellArg(ready.briefPath)} --discard`;
  return verdict.cause === 'creator'
    ? `${stopped} Remove its worktree with the hook's own removal, then run: ${discard}`
    : `${stopped} Then run: ${discard}`;
}

// Runs `claude stop` from the launching checkout, where the job started.
// Returns the lines of a stop that failed. The stop shares one Bash call with
// the launch and the check's reads, so it keeps a read's short limit. A stop
// that runs out says so, and `finish --discard` stops the job again.
function stopStray(
  ready: Ready,
  job: string,
  wenv: WorkerEnv,
  timeoutMs = 10_000,
): string[] {
  const result = wenv.runClaude(['stop', job], {
    cwd: ready.launchTop,
    timeoutMs,
  });
  if (ranClean(result)) return [];
  const lead = `claude stop ${shellArg(job)} ${failure(result)}, so the worker may still run`;
  return withText(lead, result);
}

// The record written before the check stays, so the desk shows the stray and
// `finish --discard` finds it.
function refuseStray(
  ready: Ready,
  verdict: Mismatch,
  wenv: WorkerEnv,
  err: Out,
): number {
  const stop = `claude stop ${shellArg(verdict.job)}`;
  const stopFailed = stopStray(ready, verdict.job, wenv);
  const stopped =
    stopFailed.length === 0
      ? `dispatch stopped the worker with ${stop}.`
      : `Stop the worker with ${stop}.`;
  return refuse(err, [
    ...verdict.lines,
    ...stopFailed,
    wayOut(ready, verdict, stopped),
  ]);
}

// The record comes first, since every verdict keeps it and the Bash tool can
// end dispatch during the check. The worktree check runs before the summary,
// which prints only for a worktree that matched or one the check could not read.
function afterStart(
  ready: Ready,
  result: ClaudeResult,
  wenv: WorkerEnv,
  { out, err }: { out: Out; err: Out },
): number {
  const job = jobIdFrom(result.stdout, ready.brief.name);
  keepRecord(ready, job, err);
  const verdict = verifyWorktree({
    runGit: wenv.runGit,
    runClaude: wenv.runClaude,
    sleep: wenv.sleep,
    jobId: job,
    name: ready.brief.name,
    mainTop: ready.mainTop,
    launchTop: ready.launchTop,
    baseline: ready.brief.baseline,
  });
  if (verdict.kind === 'mismatch') {
    return refuseStray(ready, verdict, wenv, err);
  }
  for (const line of [...mainLines(ready, wenv), ...summary(ready)]) {
    out(line);
  }
  if (verdict.kind === 'unchecked') err(verdict.line);
  return result.code;
}

// Excludes the worktrees folder, starts the worker from the launching checkout, and relays
// claude; the summary prints only once claude reports a start and the worktree
// check does not refuse it.
function launch(ready: Ready, wenv: WorkerEnv, out: Out, err: Out): number {
  for (const note of ready.notes) err(note);
  const excluded = ensureWorktreesExcluded(
    wenv.runGit,
    ready.mainTop,
    ready.commonDir,
  );
  if ('issues' in excluded) return refuse(err, excluded.issues);
  if (excluded.line !== undefined) out(excluded.line);
  const args = bgArgs(ready.args, {
    pluginDir: ready.pluginDir,
    permissionMode: ready.mode,
    worktree: ready.brief.name,
    sessionName: ready.brief.name,
    prompt: `/sidekick:sk-worker ${ready.briefPath}`,
  });
  const result = wenv.runClaude(args, {
    cwd: ready.launchTop,
    timeoutMs: wenv.launchTimeoutMs ?? LAUNCH_TIMEOUT_MS,
  });
  relay(result, out, err);
  if (result.code !== 0) return result.code;
  return afterStart(ready, result, wenv, { out, err });
}

/**
 * Runs `dispatch`; returns 1 on a refusal, before the launch or after it when
 * the worker's worktree is not the one expected, else `claude`'s exit code.
 */
export function dispatch(
  opts: DispatchOptions,
  wenv: WorkerEnv,
  out: Out,
  err: Out,
): number {
  const read = readBrief(opts.brief);
  if ('issues' in read) return refuse(err, read.issues);
  const checked = checkDispatch(read.brief, read.path, opts, wenv);
  if ('issues' in checked) return refuse(err, checked.issues);
  return launch(checked, wenv, out, err);
}
