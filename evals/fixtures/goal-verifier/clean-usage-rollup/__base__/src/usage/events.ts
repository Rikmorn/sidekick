export interface UsageEvent {
  id: string;
  accountId: string;
  /** ISO-8601 instant the event was recorded. */
  at: string;
  kind: string;
}

export interface BillingPeriod {
  /** ISO-8601, inclusive. */
  start: string;
  /** ISO-8601, exclusive. */
  end: string;
}

export function eventsForAccount(
  all: UsageEvent[],
  accountId: string,
): UsageEvent[] {
  return all.filter((event) => event.accountId === accountId);
}
