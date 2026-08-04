import type { Order } from './types.js';

/** `month` is `YYYY-MM`. Orders are stored with ISO-8601 `placedAt` stamps. */
export function listOrdersForMonth(orders: Order[], month: string): Order[] {
  return orders
    .filter((order) => order.placedAt.startsWith(`${month}-`))
    .sort((a, b) => a.placedAt.localeCompare(b.placedAt));
}
