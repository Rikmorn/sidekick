import { findById } from '../repositories/order-repository.js';
import { shippingCentsFor } from './shipping-bands.js';

export interface Quote {
  orderId: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
}

export async function quote(orderId: string): Promise<Quote | null> {
  const order = await findById(orderId);
  if (order === null) return null;
  const shippingCents = shippingCentsFor(order.weightGrams);
  return {
    orderId: order.id,
    subtotalCents: order.subtotalCents,
    shippingCents,
    totalCents: order.subtotalCents + shippingCents,
  };
}
