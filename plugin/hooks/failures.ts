import type { ProcessRunResult } from 'claude-code';

/** A call that rejected gives its reason instead of its value. */
export type Settled<T> = { value: T } | { reason: string };

/** The message of an error, or the string of any other thrown value. */
export function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The first line of the text that holds anything, trimmed. */
export function firstLine(text: string): string | undefined {
  return text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '');
}

/** Awaits a call and gives its value, or the reason it rejected. */
export async function settle<T>(call: Promise<T>): Promise<Settled<T>> {
  try {
    return { value: await call };
  } catch (error) {
    return { reason: reasonOf(error) };
  }
}

const MS_PER_SECOND = 1_000;

/**
 * A process run's result as stdout, or the words for why there is none. A run
 * rejects when it cannot start, a plugin refuses it, or it outlasts its timeout.
 * The declarations give no way to tell which, so the reason names all three.
 */
export function runOutcome(
  ran: Settled<ProcessRunResult>,
  run: { name: string; timeoutMs: number },
): { ok: true; stdout: string } | { ok: false; reason: string } {
  if ('reason' in ran) {
    const seconds = run.timeoutMs / MS_PER_SECOND;
    return {
      ok: false,
      reason: `${run.name} did not start, or did not finish within ${seconds} s: ${ran.reason}`,
    };
  }
  const { exitCode, stdout, stderr } = ran.value;
  if (exitCode === 0) return { ok: true, stdout };
  const exited = `${run.name} exited ${exitCode}`;
  const detail = firstLine(stderr);
  return {
    ok: false,
    reason: detail === undefined ? exited : `${exited}: ${detail}`,
  };
}
