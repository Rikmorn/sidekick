import type { Promo } from './types.js';

/**
 * Apply a promo to a gross total in cents. Percent discounts round down to the
 * nearest cent; no discount takes the total below zero.
 */
export function applyPromo(grossCents: number, promo: Promo): number {
  const discount =
    promo.kind === 'percent'
      ? Math.floor((grossCents * promo.value) / 100)
      : promo.value;
  const net = grossCents - discount;
  return net < 0 ? 0 : net;
}
