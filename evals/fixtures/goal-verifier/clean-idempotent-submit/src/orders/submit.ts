import type { IdempotencyStore } from './idempotency.js';
import type { Order, OrderRequest } from './types.js';

export interface OrderWriter {
  insert(order: Order): void;
}

export function submitOrder(
  req: OrderRequest,
  writer: OrderWriter,
  newId: () => string,
  now: Date,
  keys: IdempotencyStore,
): Order {
  const seen = keys.lookup(req.idempotencyKey, now);
  if (seen !== undefined) return seen;

  const order: Order = {
    id: newId(),
    customerId: req.customerId,
    amountCents: req.amountCents,
  };
  writer.insert(order);
  keys.remember(req.idempotencyKey, order, now);
  return order;
}
