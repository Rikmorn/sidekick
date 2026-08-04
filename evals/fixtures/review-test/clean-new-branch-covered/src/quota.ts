export interface Usage {
  used: number;
  /** Null on an unmetered plan, which has no ceiling at all. */
  limit: number | null;
}

/**
 * Calls the caller may still make before being throttled; unbounded when the
 * plan is unmetered, so callers can compare without special-casing null.
 */
export function remaining(usage: Usage): number {
  if (usage.limit === null) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(usage.limit - usage.used, 0);
}
