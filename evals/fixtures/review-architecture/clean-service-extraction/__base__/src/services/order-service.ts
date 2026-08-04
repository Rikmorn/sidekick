import { findById } from '../repositories/order-repository.js';

export interface Quote {
  orderId: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
}

const FLAT_SHIPPING_CENTS = 499;

export async function quote(orderId: string): Promise<Quote | null> {
  const order = await findById(orderId);
  if (order === null) return null;
  const shippingCents = FLAT_SHIPPING_CENTS;
  return {
    orderId: order.id,
    subtotalCents: order.subtotalCents,
    shippingCents,
    totalCents: order.subtotalCents + shippingCents,
  };
}
