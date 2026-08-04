import { toOrder, type Order, type OrderRow } from './internal/order-mapper.js';

export type { Order } from './internal/order-mapper.js';

const rows: OrderRow[] = [];

export function ordersInPeriod(
  customerId: string,
  from: string,
  to: string,
): Order[] {
  return rows
    .filter((r) => r.customer_id === customerId)
    .map(toOrder)
    .filter((o) => o.placedAt >= from && o.placedAt < to);
}
