import { checkoutTotal } from './total.js';
import type { Cart } from './types.js';

export interface CheckoutQuote {
  cartId: string;
  amountCents: number;
}

export function quoteCheckout(cart: Cart): CheckoutQuote {
  return { cartId: cart.id, amountCents: checkoutTotal(cart) };
}
