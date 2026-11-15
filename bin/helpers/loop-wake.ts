/**
 * `sidekick loop wake <name> --unit <id>`: wakes the worker of the unit's
 * attempt in flight, once a ruling waits for it. A worker whose process may
 * run is left alone. A stopped one is respawned by its own job, from the
 * loop's worktree, where dispatch launched it, within `start`'s respawn
 * limit. It never names another job: a worker with no row, or with rows it
 * cannot tell apart, refuses and names `discard`. It reaps first, and
 * refuses when the reap cannot run, so a wake never extends an attempt the
 * reap judged overdue.
 */

import type { LoopEnv } from './loop.js';
import { envIssues } from './loop-dispatch-checks.js';
import { reapFirst } from './loop-reap.js';
import { callAt, respawnWith } from './loop-start-jobs.js';
import { sessionOf } from './loop-start-prepare.js';
import {
  attemptInFlight,
  loopNameIssues,
  mayRun,
  type UnitContext,
  unitContextOf,
  workerRows,
} from './loop-unit-context.js';
import { attemptDir, unitIdIssues } from './loop-units.js';
import { parseFlags } from './profile.js';
import type { Job } from './worker-jobs.js';
import { nativeFolder } from './worker-worktree.js';

export const WAKE_USAGE_LINE = 'sidekick loop wake <name> --unit <id>';

type Out = (line: string) => void;
type Io = { out: Out; err: Out };

const REFUSED = 1;

const refuse = (err: Out, issues: string[]): number => {
  for (const issue of issues) err(issue);
  return REFUSED;
};

interface WakeCall {
  name: string;
  unit: string;
}

function parseWake(rest: string[]): WakeCall | undefined {
  const parsed = parseFlags(rest, { unit: { type: 'string' } });
  if (parsed === undefined || parsed.positionals.length !== 1) return undefined;
  const { unit } = parsed.values;
  if (typeof unit !== 'string') return undefined;
  return { name: parsed.positionals[0], unit };
}

const discardCommand = (call: WakeCall): string =>
  `sidekick loop discard ${call.name} --unit ${call.unit} --reason <text>`;

/** What wake does with the worker's rows: leave a running worker, respawn one job, or refuse. */
type Choice =
  | { kind: 'runs'; line: string }
  | { kind: 'respawn'; job: string }
  | { kind: 'refused'; issue: string };

const runsLine = (row: Job, worker: string): string =>
  row.pid === undefined
    ? `worker ${worker} may run: the listing gives its pid in a form wake cannot read, so wake leaves it alone`
    : `worker ${worker} runs (pid ${row.pid}), so wake leaves it alone`;

// A row whose process may run wins. Otherwise exactly one job must be left,
// since a row with no id is an interactive session that respawn cannot take.
function chooseRow(rows: Job[], worker: string, discard: string): Choice {
  const running = rows.find(mayRun);
  if (running !== undefined) {
    return { kind: 'runs', line: runsLine(running, worker) };
  }
  const jobs = rows.flatMap((row) => (row.id === undefined ? [] : [row.id]));
  const [job] = jobs;
  if (jobs.length === 1 && job !== undefined) return { kind: 'respawn', job };
  return {
    kind: 'refused',
    issue: `${unwakeable(rows.length, jobs.length, worker)}: give up on the attempt with ${discard}`,
  };
}

// Why no one job is left to respawn: no row at all, rows with no job id, or
// several jobs of the worker's name.
function unwakeable(rows: number, jobs: number, worker: string): string {
  if (rows === 0) {
    return `the listing holds no session for worker ${worker}, so wake has nothing to respawn`;
  }
  if (jobs === 0) {
    return `the listing holds worker ${worker} only as a session with no job id, which respawn cannot take, so wake has nothing to respawn`;
  }
  return `the listing holds ${jobs} sessions named ${worker}, so wake cannot tell which to respawn`;
}

// `claude respawn` for the worker's own job, from the loop's worktree.
function respawnWorker(
  ctx: UnitContext,
  call: WakeCall,
  worker: string,
  job: string,
  io: Io,
): number {
  const loopTree = nativeFolder(ctx.manifest.repo, sessionOf(call.name));
  const failed = respawnWith(callAt(loopTree, ctx.lenv), job, {
    what: `worker ${worker}`,
    wayOut: () =>
      `To give up on the attempt instead, run ${discardCommand(call)}, which stops the worker and closes the attempt.`,
  });
  if (failed.length > 0) return refuse(io.err, failed);
  io.out(`worker ${worker} was stopped, so wake respawned its job ${job}`);
  return 0;
}

// Under the units lock, once the reap has run: the worker's rows, then what to do with them.
function wakeInFlight(ctx: UnitContext, call: WakeCall, io: Io): number {
  const open = attemptInFlight(ctx, call.unit, {
    verb: 'wake',
    lacks: 'has no worker to wake',
  });
  if ('issues' in open) return refuse(io.err, open.issues);
  const { worker } = open;
  if (worker === '') {
    return refuse(io.err, [
      `the attempt in flight for unit ${call.unit} names no worker, so wake has no session to respawn`,
    ]);
  }
  const dir = attemptDir(ctx.loopDir, call.unit, worker);
  const found = workerRows(callAt(ctx.manifest.repo, ctx.lenv), dir, worker);
  if ('issues' in found) {
    return refuse(io.err, [
      ...found.issues,
      `wake cannot tell whether worker ${worker} still runs, so it respawns nothing`,
    ]);
  }
  const choice = chooseRow(found.rows, worker, discardCommand(call));
  switch (choice.kind) {
    case 'runs':
      io.out(choice.line);
      return 0;
    case 'respawn':
      return respawnWorker(ctx, call, worker, choice.job, io);
    case 'refused':
      return refuse(io.err, [choice.issue]);
    default: {
      const unhandled: never = choice;
      throw new Error(`unhandled wake choice: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Runs `wake`; returns 0 when the worker runs or was respawned, else 1. */
export function loopWake(
  rest: string[],
  lenv: LoopEnv,
  out: Out,
  err: Out,
): number {
  const call = parseWake(rest);
  if (call === undefined) {
    err(`usage: ${WAKE_USAGE_LINE}`);
    return REFUSED;
  }
  const early = [
    ...loopNameIssues(call.name),
    ...unitIdIssues(call.unit),
    ...envIssues(lenv.env, call.name, 'wake'),
  ];
  if (early.length > 0) return refuse(err, early);
  const ctx = unitContextOf(call.name, lenv);
  if ('issues' in ctx) return refuse(err, ctx.issues);
  const io = { out, err };
  return reapFirst(ctx, io, () => wakeInFlight(ctx, call, io));
}
