import type { ProcessRunResult } from 'claude-code';
import { runOutcome, type Settled } from '../failures';
import {
  parseSessionAnswer,
  RUN_TIMEOUT_MS,
  type SessionAnswer,
} from './contract';

/** One check: the command's answer, or why there is none. */
export type SessionCheck = { answer: SessionAnswer } | { failure: string };

/** The answer a `sidekick session --json` run printed, or why there is none. */
export function sessionCheckOf(ran: Settled<ProcessRunResult>): SessionCheck {
  const outcome = runOutcome(ran, {
    name: 'the session command',
    timeoutMs: RUN_TIMEOUT_MS,
  });
  if (!outcome.ok) return { failure: outcome.reason };
  const answer = parseSessionAnswer(outcome.stdout);
  return answer === undefined
    ? { failure: 'the session command printed no answer' }
    : { answer };
}
