export interface Bucket {
  used: number;
  limit: number;
  /** Extra headroom granted to a bucket that has been idle; defaults to none. */
  burst?: number;
}

/**
 * Whether one more request fits inside the caller's quota. A bucket that has
 * exhausted its steady-state limit may still spend its burst allowance.
 */
export function isAllowed(bucket: Bucket): boolean {
  if (bucket.used < bucket.limit) {
    return true;
  }
  const burst = bucket.burst ?? 0;
  return bucket.used < bucket.limit + burst;
}
