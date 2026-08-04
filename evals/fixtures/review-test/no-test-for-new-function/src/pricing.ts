export interface LineItem {
  sku: string;
  unitCents: number;
  qty: number;
}

export function subtotalCents(items: LineItem[]): number {
  return items.reduce((total, item) => total + item.unitCents * item.qty, 0);
}

export type Tier = 'standard' | 'plus' | 'enterprise';

const TIER_RATE: Record<Tier, number> = {
  standard: 0,
  plus: 0.1,
  enterprise: 0.2,
};

/**
 * Apply the tier discount. A discounted order never drops below the 500c
 * minimum charge, and an empty cart stays free.
 */
export function discountedTotalCents(items: LineItem[], tier: Tier): number {
  const subtotal = subtotalCents(items);
  if (subtotal === 0) {
    return 0;
  }
  const discounted = Math.round(subtotal * (1 - TIER_RATE[tier]));
  return Math.max(discounted, 500);
}
