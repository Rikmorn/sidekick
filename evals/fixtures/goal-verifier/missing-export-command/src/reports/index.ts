import { listOrdersForMonth } from '../orders/repo.js';
import type { Order } from '../orders/types.js';
import { toCsv } from './csv.js';

export function monthlyReport(orders: Order[], month: string): Order[] {
  return listOrdersForMonth(orders, month);
}

export function monthlyReportCsv(orders: Order[], month: string): string {
  return toCsv(listOrdersForMonth(orders, month));
}
