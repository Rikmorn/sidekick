/** Loyalty tiers and the discount each one earns. */
export type Tier = 'bronze' | 'silver' | 'gold';

const TIER_THRESHOLD_CENTS: ReadonlyArray<[Tier, number]> = [
  ['gold', 500_000],
  ['silver', 100_000],
  ['bronze', 0],
];

const TIER_DISCOUNT_BPS: Record<Tier, number> = {
  gold: 1500,
  silver: 750,
  bronze: 0,
};

export function tierFor(lifetimeSpendCents: number): Tier {
  for (const [tier, threshold] of TIER_THRESHOLD_CENTS) {
    if (lifetimeSpendCents >= threshold) return tier;
  }
  return 'bronze';
}

export function discountCentsFor(tier: Tier, subtotalCents: number): number {
  return Math.floor((subtotalCents * TIER_DISCOUNT_BPS[tier]) / 10_000);
}
