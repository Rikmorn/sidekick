export const TAX_RATE_BY_REGION: Record<string, number> = {
  uk: 0.2,
  ie: 0.23,
  de: 0.19,
};

export function grossTotalCents(netCents: number, region: string): number {
  const rate = TAX_RATE_BY_REGION[region] ?? 0;
  return Math.round(netCents * (1 + rate));
}
