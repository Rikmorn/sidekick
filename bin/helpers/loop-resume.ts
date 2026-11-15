/**
 * `sidekick loop resume <name> --reason <text>`: the operator's reset of a
 * tripped breaker, once its cause is settled. It writes `resumed` with the
 * reason, which restarts the count of units failed in a row. It refuses when
 * the breaker has not tripped, so the line always marks a real reset. It is
 * not among the loop's fixed verbs, so a loop cannot clear its own breaker.
 * It takes the units lock and reaps nothing, since a reap can stop a worker
 * or refuse, and neither belongs in the operator's reset.
 */

import type { LoopEnv } from './loop.js';
import { envIssues } from './loop-dispatch-checks.js';
import { appendRecord } from './loop-record.js';
import {
  loopNameIssues,
  reasonIssues,
  type UnitContext,
  underUnitsLock,
  unitContextOf,
} from './loop-unit-context.js';
import { breakerTripped, failedInARow, readLedger } from './loop-units.js';
import { parseFlags } from './profile.js';

export const RESUME_USAGE_LINE = 'sidekick loop resume <name> --reason <text>';

type Out = (line: string) => void;

const REFUSED = 1;

const refuse = (err: Out, issues: string[]): number => {
  for (const issue of issues) err(issue);
  return REFUSED;
};

const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

interface ResumeCall {
  name: string;
  reason: string;
}

function parseResume(rest: string[]): ResumeCall | undefined {
  const parsed = parseFlags(rest, { reason: { type: 'string' } });
  if (parsed === undefined || parsed.positionals.length !== 1) return undefined;
  const { reason } = parsed.values;
  if (typeof reason !== 'string') return undefined;
  return { name: parsed.positionals[0], reason };
}

// Under the units lock: the breaker's count, then `resumed` once it has tripped.
function resumeTripped(
  ctx: UnitContext,
  call: ResumeCall,
  out: Out,
  err: Out,
): number {
  const now = ctx.lenv.now();
  const ledger = readLedger(ctx.loopDir, now);
  if ('issues' in ledger) {
    return refuse(err, [
      ...ledger.issues,
      "resume cannot read the loop's record, so it cannot count the units failed in a row",
    ]);
  }
  const { caps } = ctx.manifest;
  if (!breakerTripped(ledger.lines, caps)) {
    return refuse(err, [
      `the breaker has not tripped: ${failedInARow(ledger.lines)} units failed in a row, the cap is ${caps.failedUnitsInARow}, so resume has nothing to reset`,
    ]);
  }
  try {
    appendRecord(ctx.loopDir, {
      v: 1,
      at: now.toISOString(),
      kind: 'resumed',
      reason: call.reason,
    });
  } catch (e) {
    return refuse(err, [
      `cannot write the record in ${ctx.loopDir}: ${messageOf(e)}`,
    ]);
  }
  out(
    `loop ${call.name} resumed: the count of units failed in a row restarts at 0`,
  );
  return 0;
}

/** Runs `resume`; returns 0 once `resumed` is written, else 1. */
export function loopResume(
  rest: string[],
  lenv: LoopEnv,
  out: Out,
  err: Out,
): number {
  const call = parseResume(rest);
  if (call === undefined) {
    err(`usage: ${RESUME_USAGE_LINE}`);
    return REFUSED;
  }
  const early = [
    ...loopNameIssues(call.name),
    ...reasonIssues(call.reason),
    ...envIssues(lenv.env, call.name, 'resume'),
  ];
  if (early.length > 0) return refuse(err, early);
  const ctx = unitContextOf(call.name, lenv);
  if ('issues' in ctx) return refuse(err, ctx.issues);
  return underUnitsLock(ctx, err, () => resumeTripped(ctx, call, out, err));
}
