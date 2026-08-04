/** Milliseconds, floored and clamped to a non-negative finite value. */
export function clampMs(ms: number): number {
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0;
}
