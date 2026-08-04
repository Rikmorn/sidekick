export interface RetryConfig {
  attempts: number;
  timeoutMs: number;
}

export const DEFAULT_RETRY: RetryConfig = { attempts: 3, timeoutMs: 5000 };

export type ParseResult =
  | { ok: true; config: RetryConfig }
  | { ok: false; reason: string };

/** One-line description of a retry policy, for the startup banner. */
export function describeRetry(config: RetryConfig): string {
  return `${config.attempts} attempts, ${config.timeoutMs}ms timeout`;
}

/**
 * Parse the `SK_RETRY` form `<attempts>/<timeoutMs>`, e.g. "5/2000". Both
 * components must be positive integers; anything else is reported.
 */
export function parseRetry(raw: string): ParseResult {
  const parts = raw.split('/');
  if (parts.length !== 2) {
    return { ok: false, reason: 'expected "<attempts>/<timeoutMs>"' };
  }
  const attempts = Number(parts[0]);
  if (!Number.isInteger(attempts) || attempts < 1) {
    return { ok: false, reason: 'attempts must be a positive integer' };
  }
  const timeoutMs = Number(parts[1]);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    return { ok: false, reason: 'timeoutMs must be a positive integer' };
  }
  return { ok: true, config: { attempts, timeoutMs } };
}
