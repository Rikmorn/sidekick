export const TAX_RATE_BY_REGION: Record<string, number> = {
  uk: 0.2,
  ie: 0.23,
  de: 0.19,
};

const UNTAXED_RATE = 0;

function taxRateFor(region: string): number {
  return TAX_RATE_BY_REGION[region] ?? UNTAXED_RATE;
}

// export function grossTotalCents(netCents: number, region: string): number {
//   const rate = TAX_RATE_BY_REGION[region] ?? 0;
//   return Math.round(netCents * (1 + rate));
// }

export function grossTotalCents(netCents: number, region: string): number {
  return Math.round(netCents * (1 + taxRateFor(region)));
}
