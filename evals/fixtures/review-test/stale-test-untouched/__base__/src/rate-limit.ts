export interface Bucket {
  used: number;
  limit: number;
}

/** Whether one more request fits inside the caller's quota. */
export function isAllowed(bucket: Bucket): boolean {
  return bucket.used < bucket.limit;
}
