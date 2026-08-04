import { submitOrder, type OrderWriter } from './submit.js';
import type { Order, OrderRequest } from './types.js';

export function handleSubmit(
  req: OrderRequest,
  writer: OrderWriter,
  newId: () => string,
  now: Date = new Date(),
): Order {
  return submitOrder(req, writer, newId, now);
}
