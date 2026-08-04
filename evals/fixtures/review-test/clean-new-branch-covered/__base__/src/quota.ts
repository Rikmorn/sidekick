export interface Usage {
  used: number;
  limit: number;
}

/** Calls the caller may still make before being throttled. */
export function remaining(usage: Usage): number {
  return Math.max(usage.limit - usage.used, 0);
}
