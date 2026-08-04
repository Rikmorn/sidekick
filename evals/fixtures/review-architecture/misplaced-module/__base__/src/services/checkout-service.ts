import { query } from '../db/client.js';

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
  void (await lifetimeSpendCents(cart.customerId));
  return {
    subtotalCents: cart.subtotalCents,
    discountCents: 0,
    totalCents: cart.subtotalCents,
  };
}
