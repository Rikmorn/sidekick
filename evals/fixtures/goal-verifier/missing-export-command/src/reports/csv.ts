import type { Order } from '../orders/types.js';

const HEADER = 'id,placed_at,customer,total_cents';

function escapeField(value: string): string {
  if (!/[",]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

export function toCsv(orders: Order[]): string {
  const rows = orders.map((order) =>
    [
      escapeField(order.id),
      escapeField(order.placedAt),
      escapeField(order.customer),
      String(order.totalCents),
    ].join(','),
  );
  return [HEADER, ...rows].join('\n');
}
