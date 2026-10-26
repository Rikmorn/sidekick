import type { ProcessRunResult } from 'claude-code';
import { firstLine, type Settled } from '../failures';
import {
  parseSessionAnswer,
  RUN_TIMEOUT_MS,
  type SessionAnswer,
} from './contract';

const MS_PER_SECOND = 1_000;

/** One check: the command's answer, or why there is none. */
export type SessionCheck = { answer: SessionAnswer } | { failure: string };

/** The answer a `sidekick session --json` run printed, or why there is none. */
export function sessionCheckOf(ran: Settled<ProcessRunResult>): SessionCheck {
  if ('reason' in ran) {
    // A run rejects when it cannot start, a plugin refuses it, or it outlasts its
    // timeout. The declarations give no way to tell which, so the line names both.
    const seconds = RUN_TIMEOUT_MS / MS_PER_SECOND;
    return {
      failure: `the session command did not start, or did not finish within ${seconds} s: ${ran.reason}`,
    };
  }
  const { exitCode, stdout, stderr } = ran.value;
  if (exitCode !== 0) {
    const exited = `the session command exited ${exitCode}`;
    const detail = firstLine(stderr);
    return { failure: detail === undefined ? exited : `${exited}: ${detail}` };
  }
  const answer = parseSessionAnswer(stdout);
  return answer === undefined
    ? { failure: 'the session command printed no answer' }
    : { answer };
}
