import type { Cart } from './types.js';

export function checkoutTotal(cart: Cart): number {
  return cart.lines.reduce(
    (sum, line) => sum + line.unitAmountCents * line.quantity,
    0,
  );
}
