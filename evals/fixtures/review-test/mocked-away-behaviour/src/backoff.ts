/** Longest wait we are willing to insert between delivery attempts. */
export const MAX_BACKOFF_MS = 2000;

/**
 * Delay before retry `attempt` (zero-based): 100ms doubling each time, capped
 * at MAX_BACKOFF_MS so a long outage does not stall the notifier for minutes.
 */
export function backoffMs(attempt: number): number {
  const raw = 100 * 2 ** Math.max(attempt, 0);
  return Math.min(raw, MAX_BACKOFF_MS);
}
