/**
 * The reconcile: what `sidekick loop start` does to one loop. It is pure, and
 * every fact it reads comes in through `ReconcileInput`: the state files, the
 * session listing, the launch hash, the clock, the boot time, and `--now`.
 */

import type { Armed, LoopState } from './loop-state.js';
import { type Job, LISTING } from './worker-jobs.js';

/** The age at which an arm's jobs count as gone: its renewal fires at six days, a day before a recurring job's seven-day expiry. */
export const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

/** What `chooseAction` reads about one loop. */
export interface ReconcileInput {
  name: string;
  /** `loop.json`'s `paused`. */
  paused: boolean;
  state: LoopState | undefined;
  /** The current launch's arm, as `currentArmed` gives it. */
  armed: Armed | undefined;
  /** The whole listing, every row of `claude agents --json --all`. */
  rows: readonly Job[];
  /** The launch hash now; a paused loop's choice never reads it. */
  hash: string;
  now: Date;
  bootTime: Date;
  /** `--now`: act on a session that is not between ticks. */
  stopNow: boolean;
}

/**
 * Why a loop launches fresh: `new` when it has no row or no `state.json`,
 * `changed` when the hash differs or the row is not the job `state.json`
 * names, `jobs-gone` when its cron jobs are not alive, and `rebooted` when the
 * machine booted since the session started.
 */
export type LaunchReason = 'new' | 'changed' | 'jobs-gone' | 'rebooted';

/**
 * What `start` does to one loop, by `kind`:
 * - `leave`: nothing; `armed` false means the jobs are not alive, which `start` warns about.
 * - `off`: nothing, since the loop is paused and no session of it runs.
 * - `pause`: `claude stop <job>`, keeping the row and `state.json`.
 * - `respawn`: `claude respawn <job>`, then set `startedAt`.
 * - `relaunch`: `claude stop <job>`, `claude rm <job>`, then a fresh launch.
 * - `launch`: `claude rm <remove>` when set, then a fresh launch. `remove` never names a row with a pid.
 * - `refuse`: nothing; `lines` say why, and what to run instead.
 */
export type Action =
  | { kind: 'leave'; job: string; armed: boolean }
  | { kind: 'off' }
  | { kind: 'pause'; job: string }
  | { kind: 'respawn'; job: string }
  | { kind: 'relaunch'; job: string }
  | { kind: 'launch'; remove: string | undefined; reason: LaunchReason }
  | { kind: 'refuse'; lines: string[] };

/** Whether the arm's jobs are alive: it exists, was made under six days ago, and its renewal is still ahead. */
export function jobsAlive(armed: Armed | undefined, now: Date): boolean {
  if (armed === undefined) return false;
  const age = now.getTime() - Date.parse(armed.at);
  return age < SIX_DAYS_MS && Date.parse(armed.renewalAt) > now.getTime();
}

// The row's `status` between ticks; it reads `busy` mid-tick (docs/research/loop/2026-11-12-loop-probes.md §U12).
const BETWEEN_TICKS = 'idle';
// `waiting` is a session held at a prompt or a dialog (docs/research/control-centre/2026-10-15-desk-probes.md).
const KNOWN_ACTIVE: ReadonlySet<string> = new Set(['busy', 'waiting']);

type Row =
  | { kind: 'none' }
  | { kind: 'live'; job: string; status: string | undefined }
  | { kind: 'stopped'; job: string };
type LiveRow = Extract<Row, { kind: 'live' }>;
// How the row stands against `state.json`: no file, the launch it records, or a row by name while the job it names is gone.
type Origin =
  | { kind: 'unrecorded' }
  | { kind: 'recorded'; state: LoopState }
  | { kind: 'other'; job: string };
type Refuse = Extract<Action, { kind: 'refuse' }>;
type Found = { kind: 'row'; row: Row } | Refuse;

const sessionOf = (name: string): string => `loop-${name}`;
const refuse = (lines: string[]): Refuse => ({ kind: 'refuse', lines });

/**
 * What `start` does to one loop. Its candidates are the listing's row for
 * `state.job` and each row named `loop-<name>`. A paused loop is `off` while no
 * candidate might run. Otherwise more than one candidate, an interactive
 * session, or a pid that is not a number refuses. A single row goes to the
 * pause rows when paused, else to the rest of the table. There, a row by name
 * counts as changed when `state.job` is set and gone from the listing.
 */
export function chooseAction(input: ReconcileInput): Action {
  const job = input.state?.job ?? null;
  const candidates = candidatesOf(input, job);
  if (input.paused && candidates.every(isStopped)) return { kind: 'off' };
  const found = pickRow(input.name, candidates, job);
  if (found.kind === 'refuse') return found;
  return input.paused
    ? whilePaused(input, found.row)
    : whileRunning(input, found.row);
}

// Every row that could be the loop's session: the job `state.json` names, and each row by the loop's name.
function candidatesOf(input: ReconcileInput, job: string | null): Job[] {
  const byJob = job === null ? [] : input.rows.filter((r) => r.id === job);
  const byName = input.rows.filter((r) => r.name === sessionOf(input.name));
  return byJob.length > 0
    ? [...byJob, ...byName.filter((r) => !byJob.includes(r))]
    : byName;
}

// A row start can act on and whose process is known to be gone.
const isStopped = (row: Job): boolean =>
  row.id !== undefined && row.pidMalformed !== true && row.pid === undefined;

function pickRow(
  name: string,
  candidates: readonly Job[],
  job: string | null,
): Found {
  const [first, ...others] = candidates;
  if (first === undefined) return { kind: 'row', row: { kind: 'none' } };
  if (others.length > 0) return refuse(severalLines(name, candidates, job));
  return classify(name, first);
}

function classify(name: string, row: Job): Found {
  if (row.id === undefined) return refuse(interactiveLines(name, row.pid));
  if (row.pidMalformed === true) return refuse(malformedLines(name, row.id));
  const found: Row =
    row.pid === undefined
      ? { kind: 'stopped', job: row.id }
      : { kind: 'live', job: row.id, status: row.status };
  return { kind: 'row', row: found };
}

// The pause rows: a paused loop is stopped between ticks, and never launched or respawned.
function whilePaused(input: ReconcileInput, row: Row): Action {
  switch (row.kind) {
    case 'none':
    case 'stopped':
      return { kind: 'off' };
    case 'live':
      return mayStop(row, input.stopNow)
        ? { kind: 'pause', job: row.job }
        : refuse(notBetweenTicksLines(row, pausedWhy(input.name), 'stop'));
    default: {
      const unhandled: never = row;
      throw new Error(`unhandled row ${JSON.stringify(unhandled)}`);
    }
  }
}

function whileRunning(input: ReconcileInput, row: Row): Action {
  switch (row.kind) {
    case 'none':
      return { kind: 'launch', remove: undefined, reason: 'new' };
    case 'live':
      return liveAction(input, row, originOf(input));
    case 'stopped':
      return stoppedAction(input, row.job, originOf(input));
    default: {
      const unhandled: never = row;
      throw new Error(`unhandled row ${JSON.stringify(unhandled)}`);
    }
  }
}

// A row by name is the launch's own only while `state.job` is null: a respawn keeps a job's id (docs/research/loop/2026-11-12-loop-probes.md §U21).
function originOf(input: ReconcileInput): Origin {
  const { state } = input;
  if (state === undefined) return { kind: 'unrecorded' };
  const { job } = state;
  if (job === null || input.rows.some((r) => r.id === job)) {
    return { kind: 'recorded', state };
  }
  return { kind: 'other', job };
}

// A live row that `state.json` does not record counts as changed, so it is relaunched, never removed while it runs.
function liveAction(
  input: ReconcileInput,
  row: LiveRow,
  origin: Origin,
): Action {
  const isUnchanged =
    origin.kind === 'recorded' && origin.state.hash === input.hash;
  if (isUnchanged) {
    return {
      kind: 'leave',
      job: row.job,
      armed: jobsAlive(input.armed, input.now),
    };
  }
  if (mayStop(row, input.stopNow)) return { kind: 'relaunch', job: row.job };
  const why = relaunchWhy(input.name, row.job, origin);
  return refuse(notBetweenTicksLines(row, why, 'relaunch'));
}

function stoppedAction(
  input: ReconcileInput,
  job: string,
  origin: Origin,
): Action {
  const launchOver = (reason: LaunchReason): Action => ({
    kind: 'launch',
    remove: job,
    reason,
  });
  if (origin.kind === 'unrecorded') return launchOver('new');
  if (origin.kind === 'other') return launchOver('changed');
  const { state } = origin;
  if (state.hash !== input.hash) return launchOver('changed');
  // An unreadable `startedAt` compares false, so it reads as a boot since.
  const startedSinceBoot =
    Date.parse(state.startedAt) > input.bootTime.getTime();
  if (startedSinceBoot && jobsAlive(input.armed, input.now)) {
    return { kind: 'respawn', job };
  }
  return launchOver(startedSinceBoot ? 'jobs-gone' : 'rebooted');
}

const mayStop = (row: LiveRow, stopNow: boolean): boolean =>
  row.status === BETWEEN_TICKS || stopNow;

const who = (name: string, job: string): string =>
  `${sessionOf(name)} (job ${job})`;

const pausedWhy = (name: string): string =>
  `${sessionOf(name)} is paused in loop.json, so start stops it between ticks.`;

function relaunchWhy(name: string, job: string, origin: Origin): string {
  switch (origin.kind) {
    case 'unrecorded':
      return `${who(name, job)} is running, but no state.json records its launch, so start relaunches it between ticks.`;
    case 'other':
      return `${who(name, job)} is running, but state.json names job ${origin.job}, which the listing no longer shows, so start relaunches it between ticks.`;
    case 'recorded':
      return `${who(name, job)} needs a relaunch, since its definition changed, and start relaunches only between ticks.`;
    default: {
      const unhandled: never = origin;
      throw new Error(`unhandled origin ${JSON.stringify(unhandled)}`);
    }
  }
}

function statusLine(row: LiveRow): string {
  const { status } = row;
  if (status === undefined) {
    return `Job ${row.job} reports no status, so start cannot tell whether it is between ticks.`;
  }
  if (KNOWN_ACTIVE.has(status)) {
    return `Job ${row.job} is not between ticks: its status reads ${status}.`;
  }
  return `Job ${row.job} reports the status ${JSON.stringify(status)}, so start cannot tell whether it is between ticks.`;
}

function notBetweenTicksLines(
  row: LiveRow,
  why: string,
  verb: 'stop' | 'relaunch',
): string[] {
  return [
    why,
    statusLine(row),
    `Run start again between ticks, or add --now to ${verb} it at once.`,
  ];
}

function describeCandidate(row: Job, job: string | null): string {
  if (row.id === undefined) {
    const pid = row.pid === undefined ? '' : ` (pid ${row.pid})`;
    return `an interactive session${pid}`;
  }
  return row.id === job
    ? `job ${row.id}, which state.json names`
    : `job ${row.id}`;
}

function severalLines(
  name: string,
  rows: readonly Job[],
  job: string | null,
): string[] {
  const listed = rows.map((r) => describeCandidate(r, job)).join('; ');
  return [
    `More than one session could be ${sessionOf(name)}: ${listed}. Start cannot tell which is the loop, so it changes none of them.`,
    'Stop and remove each one that is not the loop, with claude stop <id> then claude rm <id>, or close it if it is interactive. Then run start again.',
  ];
}

function interactiveLines(name: string, pid: number | undefined): string[] {
  const at = pid === undefined ? '' : ` (pid ${pid})`;
  return [
    `${sessionOf(name)} is an interactive session${at}, not a background job, so start can neither stop nor remove it.`,
    'Close that session or rename it, then run start again.',
  ];
}

function malformedLines(name: string, job: string): string[] {
  return [
    `${LISTING} gives job ${job} a pid that is not a number, so start cannot tell whether ${sessionOf(name)} is running.`,
    `Stop it with claude stop ${job}, then run start again. If its pid still reads wrong, remove it with claude rm ${job} first.`,
  ];
}
