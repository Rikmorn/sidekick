/**
 * `sidekick loop reap <name>`, and the reap that every unit verb, `record`,
 * and `start` run first, under the loop's units lock. The attempt in flight
 * is reaped once its working time passes the work cap: it is written
 * `failed` and discarded as `discard` does. Its waits count only up to the
 * wait cap, so an attempt runs at most the two caps together, whatever the
 * model writes, and the cap holds whenever the loop does anything.
 */

import type { LoopEnv } from './loop.js';
import { discardAttempt } from './loop-discard.js';
import { envIssues } from './loop-dispatch-checks.js';
import {
  loopNameIssues,
  takeUnitsLock,
  type UnitContext,
  unitContextOf,
} from './loop-unit-context.js';
import { inFlight, readLedger, workingMinutes } from './loop-units.js';
import { parseFlags } from './profile.js';

export const REAP_USAGE_LINE = 'sidekick loop reap <name>';

type Out = (line: string) => void;
type Io = { out: Out; err: Out };

/** What a reap printed: one lead and the discard's lines per attempt it reaped; or why it could not judge or close one. */
export type Reaped = { lines: string[] } | { issues: string[] };

const REFUSED = 1;
const CANNOT_TIME =
  "reap cannot read the loop's record, so it cannot time the attempt in flight";
const REAP_SKIPPED =
  'reap could not run, so an attempt past its work cap may run on:';

const refuse = (err: Out, issues: string[]): number => {
  for (const issue of issues) err(issue);
  return REFUSED;
};

const print = (sink: Out, lines: string[]): void => {
  for (const line of lines) sink(line);
};

/**
 * Reaps the attempt in flight once its working time passes
 * `workMinutesPerUnit`, and leaves one within its time. It runs under the
 * units lock its caller holds. A record it cannot read refuses, since a
 * reap that skips a file could miss the attempt.
 */
export function reapDue(ctx: UnitContext): Reaped {
  const now = ctx.lenv.now();
  const ledger = readLedger(ctx.loopDir, now);
  if ('issues' in ledger) return { issues: [...ledger.issues, CANNOT_TIME] };
  const open = inFlight(ledger.lines);
  if (open === undefined) return { lines: [] };
  const { caps } = ctx.manifest;
  const worked = workingMinutes(ledger.lines, open, caps, now);
  if (worked <= caps.workMinutesPerUnit) return { lines: [] };
  const reason = `worked ${Math.ceil(worked)} minutes, past the work cap of ${caps.workMinutesPerUnit} minutes`;
  const who = open.worker === '' ? '(unnamed)' : open.worker;
  const lead = `unit ${open.unit} · worker ${who} ${reason}, so reap stops and discards it`;
  const discarded = discardAttempt(ctx, open, reason, true);
  return 'issues' in discarded
    ? { issues: [lead, ...discarded.issues] }
    : { lines: [lead, ...discarded.lines] };
}

/**
 * Takes the units lock, reaps, then runs `act` under the same lock. A busy
 * lock, or a reap that cannot judge or close the attempt, refuses before
 * `act` runs.
 */
export function reapFirst(ctx: UnitContext, io: Io, act: () => number): number {
  const lock = takeUnitsLock(ctx.loopDir, ctx.lenv);
  if (lock.kind === 'busy') return refuse(io.err, [lock.issue]);
  try {
    const reaped = reapDue(ctx);
    if ('issues' in reaped) return refuse(io.err, reaped.issues);
    print(io.out, reaped.lines);
    return act();
  } finally {
    lock.release();
  }
}

/**
 * Reaps loop `name`, whose folder is `loopDir`, under the units lock its
 * caller holds. It reads `loop.json` only once an attempt is in flight, so a
 * loop with none needs no `loop.json`. What it reaped prints on `out`, and
 * what stopped it on `err`; neither stops the caller.
 */
export function reapInFlight(
  name: string,
  loopDir: string,
  lenv: LoopEnv,
  io: Io,
): void {
  const ledger = readLedger(loopDir, lenv.now());
  const isIdle = 'lines' in ledger && inFlight(ledger.lines) === undefined;
  if (isIdle) return;
  const ctx = unitContextOf(name, lenv);
  const reaped = 'issues' in ctx ? ctx : reapDue(ctx);
  if ('issues' in reaped) print(io.err, [REAP_SKIPPED, ...reaped.issues]);
  else print(io.out, reaped.lines);
}

/**
 * `start`'s reap of one loop before it acts: under the loop's units lock,
 * so a reboot clears an overrun before a relaunch. A lock another verb
 * holds leaves the reap to that verb, which reaps first, and `start` goes on.
 */
export function reapBeforeStart(
  name: string,
  loopDir: string,
  lenv: LoopEnv,
  io: Io,
): void {
  const lock = takeUnitsLock(loopDir, lenv);
  if (lock.kind === 'busy') {
    io.err(`${lock.issue}; start leaves the reap to the verb that holds it`);
    return;
  }
  try {
    reapInFlight(name, loopDir, lenv, io);
  } finally {
    lock.release();
  }
}

/** Runs `reap <name>`: prints a lead and the discard's lines per attempt it reaped, or nothing. */
export function loopReap(
  rest: string[],
  lenv: LoopEnv,
  out: Out,
  err: Out,
): number {
  const parsed = parseFlags(rest, {});
  if (parsed === undefined || parsed.positionals.length !== 1) {
    err(`usage: ${REAP_USAGE_LINE}`);
    return REFUSED;
  }
  const [name] = parsed.positionals;
  const early = [...loopNameIssues(name), ...envIssues(lenv.env, name, 'reap')];
  if (early.length > 0) return refuse(err, early);
  const ctx = unitContextOf(name, lenv);
  if ('issues' in ctx) return refuse(err, ctx.issues);
  return reapFirst(ctx, { out, err }, () => 0);
}
