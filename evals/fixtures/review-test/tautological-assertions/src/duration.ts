/** Milliseconds, floored and clamped to a non-negative finite value. */
export function clampMs(ms: number): number {
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0;
}

/**
 * Human-readable duration built from whole seconds: "1h 05m" above an hour,
 * "5m 09s" above a minute, "45s" below one.
 */
export function formatDuration(ms: number): string {
  const total = Math.floor(clampMs(ms) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}
