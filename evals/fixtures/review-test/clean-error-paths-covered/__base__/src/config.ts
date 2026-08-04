export interface RetryConfig {
  attempts: number;
  timeoutMs: number;
}

export const DEFAULT_RETRY: RetryConfig = { attempts: 3, timeoutMs: 5000 };

/** One-line description of a retry policy, for the startup banner. */
export function describeRetry(config: RetryConfig): string {
  return `${config.attempts} attempts, ${config.timeoutMs}ms timeout`;
}
