import type { BillingPeriod, UsageEvent } from './events.js';

/** Half-open window: `start` inclusive, `end` exclusive (D-01). */
export function countInPeriod(
  events: UsageEvent[],
  period: BillingPeriod,
): number {
  const start = Date.parse(period.start);
  const end = Date.parse(period.end);
  return events.filter((event) => {
    const at = Date.parse(event.at);
    return at >= start && at < end;
  }).length;
}
