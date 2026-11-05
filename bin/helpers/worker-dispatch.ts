/**
 * `sidekick worker dispatch`: checks a brief, the launching checkout, and the
 * profile, then starts `sk-worker` as a background session in a worktree of
 * its own, with pushes blocked unless the operator allows them. A refusal
 * names every reason it finds, except that a brief that does not parse stops
 * the checks there. This module launches; the checks live in
 * `worker-dispatch-checks.ts`.
 */

import { mainReport } from './main-session.js';
import { LAUNCH_TIMEOUT_MS } from './profile.js';
import { bgArgs, type ClaudeResult } from './profile-launch.js';
import { shellArg } from './shell.js';
import type { WorkerEnv } from './worker.js';
import { readBrief } from './worker-brief.js';
import type { DispatchOptions } from './worker-dispatch-args.js';
import { BYPASS, checkDispatch, type Ready } from './worker-dispatch-checks.js';
import { ensureWorktreesExcluded } from './worker-exclude.js';
import { jobIdFrom, writeRecord } from './worker-record.js';

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
// warns: the worker has started, so claude's exit code stands.
function keepRecord(ready: Ready, result: ClaudeResult, err: Out): void {
  const written = writeRecord(ready.commonDir, {
    version: 2,
    name: ready.brief.name,
    main: ready.main?.value ?? null,
    job: jobIdFrom(result.stdout, ready.brief.name),
    brief: ready.briefPath,
    dispatchedAt: new Date().toISOString(),
  });
  if ('issue' in written) err(written.issue);
}

// Excludes the worktrees folder, starts the worker from the launching checkout, and relays
// claude; the summary prints only once claude reports a start.
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
  if (result.code === 0) {
    for (const line of [...mainLines(ready, wenv), ...summary(ready)]) {
      out(line);
    }
    keepRecord(ready, result, err);
  }
  return result.code;
}

/** Runs `dispatch`; returns 1 on a refusal, else `claude`'s exit code. */
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
