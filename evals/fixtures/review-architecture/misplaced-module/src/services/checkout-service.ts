import { query } from '../db/client.js';
import { discountCentsFor, tierFor } from '../db/discount-rules.js';

export interface Cart {
  customerId: string;
  subtotalCents: number;
}

export interface Priced {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

async function lifetimeSpendCents(customerId: string): Promise<number> {
  const rows = await query(
    'select coalesce(sum(amount_cents), 0) as spend from orders where customer_id = ?',
    [customerId],
  );
  return rows.length === 0 ? 0 : Number(rows[0].spend);
}

export async function priceCart(cart: Cart): Promise<Priced> {
  const spend = await lifetimeSpendCents(cart.customerId);
  const discountCents = discountCentsFor(tierFor(spend), cart.subtotalCents);
  return {
    subtotalCents: cart.subtotalCents,
    discountCents,
    totalCents: cart.subtotalCents - discountCents,
  };
}
