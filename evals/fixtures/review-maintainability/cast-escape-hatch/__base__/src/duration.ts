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
