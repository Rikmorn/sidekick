/**
 * `sidekick loop discard <name> --unit <id> --reason <text> [--failed]`:
 * gives up on the unit's attempt in flight, as `discardAttempt` closes it.
 * `--failed` writes `failed` before `discarded`, so the breaker counts it;
 * a plain discard, such as a role's requeue, does not. It reaps first,
 * under the units lock, as every unit verb does; when the reap closes the
 * unit's own attempt, the discard is done. A refusal names every reason it
 * finds. One before the reap changes nothing, and one after it keeps what
 * the reap wrote.
 */

import * as v from 'valibot';
import type { LoopEnv } from './loop.js';
import { discardAttempt } from './loop-discard.js';
import { envIssues } from './loop-dispatch-checks.js';
import { reapFirst } from './loop-reap.js';
import { ReasonSchema } from './loop-record.js';
import {
  loopNameIssues,
  type UnitContext,
  unitContextOf,
} from './loop-unit-context.js';
import {
  type Attempt,
  inFlight,
  readLedger,
  unitIdIssues,
} from './loop-units.js';
import { keyHits } from './memory-patterns.js';
import { parseFlags } from './profile.js';

export const DISCARD_USAGE_LINE =
  'sidekick loop discard <name> --unit <id> --reason <text> [--failed]';

type Out = (line: string) => void;
type Io = { out: Out; err: Out };

const REFUSED = 1;

const refuse = (err: Out, issues: string[]): number => {
  for (const issue of issues) err(issue);
  return REFUSED;
};

interface DiscardCall {
  name: string;
  unit: string;
  reason: string;
  failed: boolean;
}

function parseDiscard(rest: string[]): DiscardCall | undefined {
  const parsed = parseFlags(rest, {
    unit: { type: 'string' },
    reason: { type: 'string' },
    failed: { type: 'boolean' },
  });
  if (parsed === undefined || parsed.positionals.length !== 1) return undefined;
  const { unit, reason, failed } = parsed.values;
  if (typeof unit !== 'string' || typeof reason !== 'string') return undefined;
  return { name: parsed.positionals[0], unit, reason, failed: failed === true };
}

// The reason's own rule, then the key check, which names its ids and never the text.
function reasonIssues(reason: string): string[] {
  const parsed = v.safeParse(ReasonSchema, reason);
  const rule = parsed.success
    ? []
    : parsed.issues.map((i) => `--reason: ${i.message}`);
  const ids = keyHits(reason);
  return [
    ...rule,
    ...(ids.length === 0
      ? []
      : [
          `--reason holds text that looks like a key (${ids.join(', ')}): keep keys out of the record`,
        ]),
  ];
}

// Every refusal that reads no file: the name, the unit id, the reason, and the environment.
const earlyIssues = (call: DiscardCall, env: NodeJS.ProcessEnv): string[] => [
  ...loopNameIssues(call.name),
  ...unitIdIssues(call.unit),
  ...reasonIssues(call.reason),
  ...envIssues(env, call.name, 'discard'),
];

const notInFlight = (unit: string, open: Attempt | undefined): string => {
  const lead = `no attempt for unit ${unit} is in flight, so discard has nothing to close`;
  if (open === undefined) return lead;
  const who = open.worker === '' ? '(unnamed)' : open.worker;
  return `${lead}; the attempt in flight is unit ${open.unit}, worker ${who}`;
};

// Under the units lock, once the reap has run: the unit's attempt, closed.
// When the reap closed that very attempt, the discard is done.
function discardInFlight(
  ctx: UnitContext,
  call: DiscardCall,
  io: Io,
  reaped: Attempt | undefined,
): number {
  const isReaped = reaped !== undefined && reaped.unit === call.unit;
  if (isReaped) {
    io.out(
      `reap closed unit ${call.unit}'s attempt as failed, past its work cap, so discard has nothing more to close`,
    );
    return 0;
  }
  const ledger = readLedger(ctx.loopDir, ctx.lenv.now());
  if ('issues' in ledger) {
    return refuse(io.err, [
      ...ledger.issues,
      "discard cannot read the loop's record, so it cannot find the attempt in flight",
    ]);
  }
  const open = inFlight(ledger.lines);
  if (open === undefined || open.unit !== call.unit) {
    return refuse(io.err, [notInFlight(call.unit, open)]);
  }
  const discarded = discardAttempt(ctx, open, call.reason, call.failed);
  if ('issues' in discarded) return refuse(io.err, discarded.issues);
  for (const line of discarded.lines) io.out(line);
  return 0;
}

/** Runs `discard`; returns 0 once the attempt closed, by the reap or with a worktree left for the operator included, else 1. */
export function loopDiscard(
  rest: string[],
  lenv: LoopEnv,
  out: Out,
  err: Out,
): number {
  const call = parseDiscard(rest);
  if (call === undefined) {
    err(`usage: ${DISCARD_USAGE_LINE}`);
    return REFUSED;
  }
  const early = earlyIssues(call, lenv.env);
  if (early.length > 0) return refuse(err, early);
  const ctx = unitContextOf(call.name, lenv);
  if ('issues' in ctx) return refuse(err, ctx.issues);
  const io = { out, err };
  return reapFirst(ctx, io, (reaped) => discardInFlight(ctx, call, io, reaped));
}
