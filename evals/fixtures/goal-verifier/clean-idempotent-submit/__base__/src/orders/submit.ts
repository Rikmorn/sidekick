import type { Order, OrderRequest } from './types.js';

export interface OrderWriter {
  insert(order: Order): void;
}

export function submitOrder(
  req: OrderRequest,
  writer: OrderWriter,
  newId: () => string,
  now: Date,
): Order {
  const order: Order = {
    id: newId(),
    customerId: req.customerId,
    amountCents: req.amountCents,
  };
  writer.insert(order);
  return order;
}
