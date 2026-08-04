export interface Event {
  id: string;
  /** ISO date, e.g. "2026-08-04" — day precision by contract. */
  at: string;
}

/** Events are kept day-precise; range queries are INCLUSIVE on both ends. */
export function sameDay(a: string, b: string): boolean {
  return a === b;
}
