import { listOrdersForMonth } from '../orders/repo.js';
import type { Order } from '../orders/types.js';

export function monthlyReport(orders: Order[], month: string): Order[] {
  return listOrdersForMonth(orders, month);
}
