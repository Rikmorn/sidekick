/**
 * Closing a unit's attempt, as `sidekick loop discard` and `reap` do. It
 * stops the worker first, so nothing it does races `finish`'s checks, then
 * runs `finish`'s discard with the unit brief, then writes `failed` when
 * asked and `discarded`, which frees the loop's slot. When `finish` refuses,
 * as for work it will not lose, what it left stays, with the hand route; the
 * attempt closes anyway. While the worker may still run, or a live process
 * may still hold the worktree's lock, nothing is written, so the slot never
 * frees under a running worker. An unknown counts as may.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { BRIEF_FILE, UNIT_REPORT } from './loop-dispatch-attempt.js';
import { messageOf } from './loop-io.js';
import { appendRecord, type RecordLine } from './loop-record.js';
import { callAt, type JobCall, stopJob } from './loop-start-jobs.js';
import { mayRun, type UnitContext, workerRows } from './loop-unit-context.js';
import { type Attempt, attemptDir, unitIdIssues } from './loop-units.js';
import { workTreeRootOf } from './rules.js';
import type { WorkerEnv } from './worker.js';
import { finish } from './worker-finish.js';
import { discardCommandFor, type FinishOptions } from './worker-finish-args.js';
import { leftoverRoute } from './worker-finish-gone.js';
import type { Job } from './worker-jobs.js';
import { listWorktrees } from './worker-listing.js';
import { physical } from './worker-repo.js';
import { waitForExit } from './worker-teardown-stop.js';
import { nativeFolder } from './worker-worktree.js';
import { lockPid } from './worktree-lock.js';

/** What a discard did: whether `finish` removed the worker, and its lines; or why the attempt stays in flight. */
export type Discarded =
  | { removed: boolean; lines: string[] }
  | { issues: string[] };

// Stops each of the worker's rows whose process may run, and waits for a
// listed process to exit. Returns the lines that keep the attempt in flight.
function stopWorker(
  call: JobCall,
  rows: Job[],
  worker: string,
  exitWaitMs: number,
): string[] {
  const stillRuns = `worker ${worker} may still run, so the attempt stays in flight: run sidekick loop discard again once it has stopped`;
  for (const row of rows) {
    if (row.id === undefined || !mayRun(row)) continue;
    const stopped = stopJob(call, row.id);
    if (stopped.length > 0) return [...stopped, stillRuns];
    if (row.pid === undefined) continue;
    const exited = waitForExit(row.pid, call.lenv, {
      limitMs: exitWaitMs,
      refusal: (pid, seconds) =>
        `worker ${worker}'s process, pid ${pid}, still runs ${seconds} s after claude stop`,
    });
    if (exited.length > 0) return [...exited, stillRuns];
  }
  return [];
}

// True when anything sits at `file`, a link included, so `finish` judges it.
const holdsEntry = (file: string): boolean =>
  fs.lstatSync(file, { throwIfNoEntry: false }) !== undefined;

// `finish` runs from the loop's repo, with the plain git runner, since it
// hardens its own calls into the worktree.
const finishEnv = (call: JobCall): WorkerEnv => ({
  ...call.lenv,
  cwd: call.cwd,
  workTree: workTreeRootOf(call.cwd, call.lenv.runGit),
});

// `finish` resolves the repo from the folder it runs in, so the route names
// the loop's repo. It holds for every refusal: dirty work, a broken link, or
// a teardown cut short. Plain git in a worker's worktree runs what the worker
// planted, so the route reads it through sidekick's hardened git.
const handRoute = (worker: string, opts: FinishOptions, repo: string): string =>
  `finish did not clear worker ${worker}, so the attempt closes and what remains is yours. Inspect it with sidekick worktree list, not with plain git there, which runs what the worker planted, such as an embedded repo's filter. Settle what finish names, such as uncommitted work to copy out or remove. Then run ${discardCommandFor(opts)} in the loop's repo, ${repo}`;

// A live process the worktree's lock names: `finish`'s own stop or wait fell
// short, so the worker may still write there. A listing git cannot give
// leaves that unknown, which keeps the attempt open too. The lock is matched
// by physical path, as `lockReasonOf` matches it.
function lockIssue(
  call: JobCall,
  worktree: string,
  worker: string,
): string | undefined {
  const list = listWorktrees(call.lenv.runGit, call.cwd);
  if ('issue' in list) {
    const why = list.issue === '' ? 'git printed nothing' : list.issue;
    return `git worktree list failed in ${call.cwd}, so discard cannot tell whether a process still holds the worktree of ${worker}, and the attempt stays in flight: ${why}. Run sidekick loop discard again once git lists the worktrees`;
  }
  const wanted = physical(worktree);
  const entry = list.worktrees.find((w) => physical(w.path) === wanted);
  const pid = entry === undefined ? undefined : lockPid(entry.locked);
  if (pid === undefined || !call.lenv.isAlive(pid)) return undefined;
  return `the worktree of ${worker} is locked by pid ${pid}, which still runs, so the attempt stays in flight: run sidekick loop discard again once it exits`;
}

// `finish`'s discard with the unit brief, its lines kept in the order printed.
// A refusal closes the attempt, unless a live process still holds the
// worktree's lock.
function runFinish(
  ctx: UnitContext,
  call: JobCall,
  dir: string,
  worker: string,
): Discarded {
  const worktree = nativeFolder(ctx.manifest.repo, worker);
  const opts: FinishOptions = {
    subject: { kind: 'brief', brief: path.join(dir, BRIEF_FILE) },
    noReport: !holdsEntry(path.join(worktree, UNIT_REPORT)),
    mode: { kind: 'discard' },
    worktree: undefined,
  };
  const lines: string[] = [];
  const keep = (line: string): void => {
    lines.push(line);
  };
  const code = finish(opts, finishEnv(call), keep, keep);
  if (code === 0) return { removed: true, lines };
  const held = lockIssue(call, worktree, worker);
  if (held !== undefined) return { issues: [...lines, held] };
  return {
    removed: false,
    lines: [...lines, handRoute(worker, opts, ctx.manifest.repo)],
  };
}

// Stops the worker, then clears it with `finish`; a worker with no row left
// has nothing to stop and no session for `finish` to find.
function settleWorker(
  ctx: UnitContext,
  attempt: Attempt,
  exitWaitMs: number,
): Discarded {
  const { worker } = attempt;
  if (worker === '') {
    return {
      removed: false,
      lines: [
        'the attempt names no worker, so discard stopped nothing and ran no finish',
      ],
    };
  }
  const dir = attemptDir(ctx.loopDir, attempt.unit, worker);
  const call = callAt(ctx.manifest.repo, ctx.lenv);
  const found = workerRows(call, dir, worker);
  if ('issues' in found) {
    return {
      issues: [
        ...found.issues,
        `discard cannot tell whether worker ${worker} still runs, so the attempt stays in flight`,
      ],
    };
  }
  const stopped = stopWorker(call, found.rows, worker, exitWaitMs);
  if (stopped.length > 0) return { issues: stopped };
  if (found.rows.length === 0) {
    return {
      removed: false,
      lines: [
        `worker ${worker} has no session left, so discard stopped nothing and ran no finish: ${leftoverRoute(worker)}`,
      ],
    };
  }
  return runFinish(ctx, call, dir, worker);
}

// `failed` when asked, then `discarded`, each naming the unit, the worker, and the reason.
function closingLines(
  attempt: Attempt,
  reason: string,
  failed: boolean,
  at: string,
): RecordLine[] {
  const named = attempt.worker === '' ? {} : { worker: attempt.worker };
  const base = { v: 1 as const, at, unit: attempt.unit, reason, ...named };
  const discarded: RecordLine = { ...base, kind: 'discarded' };
  return failed ? [{ ...base, kind: 'failed' }, discarded] : [discarded];
}

function writeClosing(ctx: UnitContext, lines: RecordLine[]): string[] {
  try {
    for (const line of lines) appendRecord(ctx.loopDir, line);
    return [];
  } catch (e) {
    return [
      `cannot write the record in ${ctx.loopDir}: ${messageOf(e)}. sidekick loop show ${ctx.name} shows whether the attempt closed; if it did not, run sidekick loop discard again`,
    ];
  }
}

/**
 * Closes `attempt`: stops its worker, runs `finish`'s discard with the unit
 * brief, without a report when the worktree holds none, then writes `failed`
 * when `failed` and `discarded`. A `finish` refusal leaves what `finish`
 * left and prints the hand route, and the attempt still closes. A worker
 * that may still run, a live process holding the worktree's lock, a session
 * or worktree listing that cannot say, or a unit id that names a folder
 * writes nothing.
 * `exitWaitMs` bounds the wait for a stopped process to exit.
 */
export function discardAttempt(
  ctx: UnitContext,
  attempt: Attempt,
  reason: string,
  failed: boolean,
  exitWaitMs = 15_000,
): Discarded {
  // The record's schema lets `.` and `..` through, and the unit names a folder.
  const unitIssues = unitIdIssues(attempt.unit);
  if (unitIssues.length > 0) {
    return {
      issues: [
        ...unitIssues,
        `discard touches no path for unit "${attempt.unit}" and writes nothing: the dispatched line that names it needs the operator's hand, in ${ctx.loopDir}/records`,
      ],
    };
  }
  const settled = settleWorker(ctx, attempt, exitWaitMs);
  if ('issues' in settled) return settled;
  const at = ctx.lenv.now().toISOString();
  const written = writeClosing(ctx, closingLines(attempt, reason, failed, at));
  if (written.length > 0) return { issues: [...settled.lines, ...written] };
  const who = attempt.worker === '' ? '(unnamed)' : attempt.worker;
  const outcome = failed ? 'failed, then discarded' : 'discarded';
  return {
    removed: settled.removed,
    lines: [
      ...settled.lines,
      `unit ${attempt.unit} · worker ${who} · ${outcome}`,
    ],
  };
}
