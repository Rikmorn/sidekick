/**
 * Weight bands as half-open intervals on grams (D-01): a weight equal to a
 * band's upper bound belongs to the next band up.
 */
export interface Band {
  upToGrams: number;
  priceCents: number;
}

const BANDS: readonly Band[] = [
  { upToGrams: 500, priceCents: 299 },
  { upToGrams: 2_000, priceCents: 499 },
  { upToGrams: 10_000, priceCents: 899 },
];

const OVERSIZE_CENTS = 1_499;

export function shippingCentsFor(weightGrams: number): number {
  for (const band of BANDS) {
    if (weightGrams < band.upToGrams) return band.priceCents;
  }
  return OVERSIZE_CENTS;
}
