/**
 * `sidekick loop start (<name> | --all) [--record] [--now]`: brings each loop
 * to the state its definition asks for, and never runs two sessions for one
 * loop. It takes each loop's lock, reaps each loop's overrun attempt, then
 * takes the session listing once, prepares every loop, commits the sidekick
 * folder, acts on each loop's choice, waits for the new launches to arm, and
 * prints one line per loop.
 */

import * as path from 'node:path';
import type { LoopEnv } from './loop.js';
import { reapBeforeStart } from './loop-reap.js';
import type { Action } from './loop-reconcile.js';
import { actOn, type Launched, type Outcome } from './loop-start-act.js';
import {
  configDirIssue,
  type Prepared,
  prepareLoop,
  type StartFlags,
} from './loop-start-prepare.js';
import { currentArmed, readArmed, takeLock } from './loop-state.js';
import { loopNames, loopsRoot } from './loop-store.js';
import { snapshotStore } from './memory-snapshot.js';
import { parseFlags } from './profile.js';
import { isProfileName } from './profile-manifest.js';
import { isFolder } from './profile-role.js';
import { ensureSidekickRepo, sidekickHome } from './sidekick-home.js';
import { listJobs } from './worker-jobs.js';

export const START_USAGE_LINE =
  'sidekick loop start (<name> | --all) [--record] [--now]';

type Out = (line: string) => void;
type Io = { out: Out; err: Out };

// A commit message names a launch by this many of its hash's characters.
const HASH_SHOWN = 12;
const MS_PER_S = 1000;
const REFUSED: Outcome = { kind: 'refused' };
const NO_LISTING =
  'start cannot tell a running loop from a stopped one without the listing, so it changed no loop.';
const STARTS_PROCESS: ReadonlySet<Action['kind']> = new Set([
  'launch',
  'relaunch',
  'respawn',
]);

type Wanted =
  | { kind: 'all'; flags: StartFlags }
  | { kind: 'one'; name: string; flags: StartFlags };

// A loop whose lock this start holds, one another start holds, or one with nothing to lock (a bad name or no folder), which `prepareLoop` refuses.
type Seat =
  | { kind: 'held'; name: string; dir: string; release: () => void }
  | { kind: 'busy'; name: string; issue: string }
  | { kind: 'unheld'; name: string };
type Held = Extract<Seat, { kind: 'held' }>;

interface Result {
  name: string;
  outcome: Outcome;
}

const prefixed =
  (sink: Out, name: string): Out =>
  (line) =>
    sink(`${name}: ${line}`);

function parseStart(rest: string[]): Wanted | undefined {
  const parsed = parseFlags(rest, {
    all: { type: 'boolean' },
    record: { type: 'boolean' },
    now: { type: 'boolean' },
  });
  if (parsed === undefined) return undefined;
  const flags = {
    record: parsed.values.record === true,
    now: parsed.values.now === true,
  };
  const { positionals } = parsed;
  if (parsed.values.all === true) {
    return positionals.length === 0 ? { kind: 'all', flags } : undefined;
  }
  return positionals.length === 1
    ? { kind: 'one', name: positionals[0], flags }
    : undefined;
}

// The name is checked first, since it is a path segment of the lock.
function seatOf(name: string, root: string, lenv: LoopEnv): Seat {
  const dir = path.join(root, name);
  if (!isProfileName(name) || !isFolder(dir)) return { kind: 'unheld', name };
  const lock = takeLock(dir, {
    pid: lenv.pid,
    now: lenv.now(),
    bootTime: lenv.bootTime(),
    isAlive: lenv.isAlive,
  });
  return lock.kind === 'held'
    ? { kind: 'held', name, dir, release: lock.release }
    : { kind: 'busy', name, issue: lock.issue };
}

// start never acts on a loop it holds no lock on: `prepareLoop` refuses a bad name or a missing folder, and a folder made since is left alone.
function refuseUnheld(
  seat: Exclude<Seat, Held>,
  flags: StartFlags,
  lenv: LoopEnv,
  err: Out,
): Outcome {
  const tell = prefixed(err, seat.name);
  if (seat.kind === 'busy') {
    tell(seat.issue);
    return REFUSED;
  }
  const prepared = prepareLoop(seat.name, flags, { lenv, rows: [], err: tell });
  const lines =
    prepared.kind === 'refused'
      ? prepared.lines
      : [
          `${prepared.dir} appeared while start ran, so start holds no lock on it and changed nothing; run start again`,
        ];
  for (const line of lines) tell(line);
  return REFUSED;
}

function commitEntries(p: Prepared): string[] {
  switch (p.kind) {
    case 'refused':
      return [];
    case 'paused':
      return p.action.kind === 'pause' ? [`${p.name} pause`] : [];
    case 'ready':
      return STARTS_PROCESS.has(p.action.kind)
        ? [`${p.name} ${p.action.kind} ${p.hash.slice(0, HASH_SHOWN)}`]
        : [];
    default: {
      const unhandled: never = p;
      throw new Error(`unhandled preparation ${JSON.stringify(unhandled)}`);
    }
  }
}

// One commit per run, before the first claude call that acts, so its message names every loop that acts and what it launches. The history serves tracing, so a failed commit only warns.
function commitStart(
  prepared: readonly Prepared[],
  lenv: LoopEnv,
  err: Out,
): void {
  const entries = prepared.flatMap(commitEntries);
  if (entries.length === 0) return;
  const store = sidekickHome(lenv.env, lenv.cwd, lenv.home);
  const issues = ensureSidekickRepo(store, lenv.runGit);
  const commit = { message: `loop start: ${entries.join(', ')}`, trailers: [] };
  const isCommitted =
    issues.length === 0 &&
    snapshotStore(store, commit, lenv.runGit) !== 'failed';
  if (isCommitted) return;
  for (const issue of issues) err(issue);
  err(
    `git could not commit the sidekick folder ${store}, so its history lacks this start; the loops start anyway.`,
  );
}

// Each loop's overrun attempt is reaped first. The listing runs once, after every lock is taken and every reap is done, so no other start changes a row between the listing and the act. Each lock is released once its loop's last write is done.
function actOnHeld(
  held: readonly Held[],
  flags: StartFlags,
  lenv: LoopEnv,
  io: Io,
): Result[] {
  for (const seat of held) {
    reapBeforeStart(seat.name, seat.dir, lenv, {
      out: prefixed(io.out, seat.name),
      err: prefixed(io.err, seat.name),
    });
  }
  const listed = listJobs(lenv.runClaude, lenv.cwd);
  if ('issues' in listed) {
    for (const line of [...listed.issues, NO_LISTING]) io.err(line);
    return held.map((seat) => ({ name: seat.name, outcome: REFUSED }));
  }
  const rows = listed.jobs;
  const prepared = held.map((seat) => ({
    seat,
    loop: prepareLoop(seat.name, flags, {
      lenv,
      rows,
      err: prefixed(io.err, seat.name),
    }),
  }));
  commitStart(
    prepared.map(({ loop }) => loop),
    lenv,
    io.err,
  );
  const results: Result[] = [];
  for (const { seat, loop } of prepared) {
    try {
      const ctx = { name: seat.name, lenv, rows, record: flags.record, ...io };
      results.push({ name: seat.name, outcome: actOn(loop, ctx) });
    } finally {
      seat.release();
    }
  }
  return results;
}

// Each loop's outcome, in the order the names came.
function startSeated(
  seats: readonly Seat[],
  flags: StartFlags,
  lenv: LoopEnv,
  io: Io,
): Result[] {
  const early = seats.flatMap((seat) =>
    seat.kind === 'held'
      ? []
      : [{ name: seat.name, outcome: refuseUnheld(seat, flags, lenv, io.err) }],
  );
  const held = seats.filter((seat): seat is Held => seat.kind === 'held');
  const late = held.length === 0 ? [] : actOnHeld(held, flags, lenv, io);
  const order = (r: Result): number =>
    seats.findIndex((seat) => seat.name === r.name);
  return [...early, ...late].sort((a, b) => order(a) - order(b));
}

// Polls every fresh launch's armed.json until each is current or the limit passes; returns the loops that armed.
function armedNames(
  launches: readonly Launched[],
  lenv: LoopEnv,
  { armWaitMs, pollMs }: { armWaitMs: number; pollMs: number },
): Set<string> {
  const armed = new Set<string>();
  for (let waited = 0; ; waited += pollMs) {
    for (const launch of launches) {
      if (currentArmed(launch.state, readArmed(launch.dir)) !== undefined) {
        armed.add(launch.name);
      }
    }
    if (armed.size === launches.length || waited >= armWaitMs) return armed;
    lenv.sleep(pollMs);
  }
}

const armedText = (armed: boolean): string => (armed ? 'armed' : 'not armed');

function launchedLine(launch: Launched, armed: boolean): string {
  const job = launch.state.job ?? 'with no job id';
  const replacing =
    launch.replaced === undefined ? '' : ` in place of ${launch.replaced}`;
  return `${launch.name}: ${launch.verb} ${job}${replacing} (${launch.why}), ${armedText(armed)}`;
}

function summaryLine({ name, outcome }: Result, armed: Set<string>): string {
  switch (outcome.kind) {
    case 'left':
      return `${name}: left ${outcome.job} (unchanged), ${armedText(outcome.armed)}`;
    case 'paused':
      return `${name}: paused`;
    case 'respawned':
      return `${name}: respawned ${outcome.job} (stopped, cron jobs alive), armed`;
    case 'launched':
      return launchedLine(outcome.launched, armed.has(name));
    case 'refused':
      return `${name}: refused`;
    case 'failed':
      return `${name}: failed`;
    default: {
      const unhandled: never = outcome;
      throw new Error(`unhandled outcome ${JSON.stringify(unhandled)}`);
    }
  }
}

const notArmedLine = (launch: Launched, armWaitMs: number): string =>
  `${launch.name}: no armed.json for this launch after ${armWaitMs / MS_PER_S} s, so its cron jobs may not exist; read the session's output with claude logs ${launch.state.job ?? launch.state.session}`;

/**
 * Runs `start`; returns 1 when any loop refused or failed, else 0. The wait
 * for the arm defaults to 90 s, polled every 2 s, so it fits a session's
 * 120-second Bash call.
 */
export function runStart(
  rest: string[],
  lenv: LoopEnv,
  out: Out,
  err: Out,
  {
    armWaitMs = 90_000,
    pollMs = 2_000,
  }: { armWaitMs?: number; pollMs?: number } = {},
): number {
  const wanted = parseStart(rest);
  if (wanted === undefined) {
    err(`usage: ${START_USAGE_LINE}`);
    return 1;
  }
  const issue = configDirIssue(lenv.env);
  if (issue !== undefined) {
    err(issue);
    return 1;
  }
  const root = loopsRoot(lenv.env, lenv.cwd, lenv.home);
  const names = wanted.kind === 'all' ? loopNames(root) : [wanted.name];
  if (names.length === 0) {
    out(`the loop store ${root} holds no loop`);
    return 0;
  }
  const seats: Seat[] = [];
  try {
    for (const name of names) seats.push(seatOf(name, root, lenv));
    const results = startSeated(seats, wanted.flags, lenv, { out, err });
    const launches = results.flatMap(({ outcome }) =>
      outcome.kind === 'launched' ? [outcome.launched] : [],
    );
    const armed = armedNames(launches, lenv, { armWaitMs, pollMs });
    for (const launch of launches) {
      if (!armed.has(launch.name)) err(notArmedLine(launch, armWaitMs));
    }
    for (const result of results) out(summaryLine(result, armed));
    const isFailed = results.some(
      ({ outcome }) => outcome.kind === 'refused' || outcome.kind === 'failed',
    );
    return isFailed ? 1 : 0;
  } finally {
    // `release` removes the lock only while it holds this start's text, so a second call removes nothing.
    for (const seat of seats) if (seat.kind === 'held') seat.release();
  }
}
