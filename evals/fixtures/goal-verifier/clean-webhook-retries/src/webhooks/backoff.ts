const BASE_MS = 500;
const MAX_MS = 30_000;

/** Doubling backoff for a 1-based attempt number, capped at 30s (D-01). */
export function backoffMs(attempt: number): number {
  const delay = BASE_MS * 2 ** (attempt - 1);
  return delay > MAX_MS ? MAX_MS : delay;
}
