export const DURATION_UNITS = {
  Seconds: 's',
  Minutes: 'm',
  Hours: 'h',
} as const;

export type DurationUnit = (typeof DURATION_UNITS)[keyof typeof DURATION_UNITS];

const MS_PER_UNIT = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
} satisfies Record<DurationUnit, number>;

export function toMilliseconds(amount: number, unit: DurationUnit): number {
  return amount * MS_PER_UNIT[unit];
}

/** Retention windows arrive from the CLI as strings such as "30m" or "12h". */
export function parseRetentionWindow(raw: string): number {
  const unit = raw.slice(-1) as DurationUnit;
  const amount = Number(raw.slice(0, -1));
  if (!Number.isFinite(amount)) {
    throw new Error(`cannot read a duration from "${raw}"`);
  }
  return toMilliseconds(amount, unit);
}
