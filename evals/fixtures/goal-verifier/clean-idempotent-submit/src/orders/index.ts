import { IdempotencyStore } from './idempotency.js';
import { submitOrder, type OrderWriter } from './submit.js';
import type { Order, OrderRequest } from './types.js';

const keys = new IdempotencyStore();

export function handleSubmit(
  req: OrderRequest,
  writer: OrderWriter,
  newId: () => string,
  now: Date = new Date(),
): Order {
  return submitOrder(req, writer, newId, now, keys);
}
