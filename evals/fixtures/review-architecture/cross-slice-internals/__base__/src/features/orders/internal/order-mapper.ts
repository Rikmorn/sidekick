export interface OrderRow {
  id: string;
  customer_id: string;
  placed_at: string;
  total_cents: number;
  status_code: number;
}

export interface Order {
  id: string;
  customerId: string;
  placedAt: string;
  totalCents: number;
  settled: boolean;
}

const SETTLED_STATUS = 40;

export function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customerId: row.customer_id,
    placedAt: row.placed_at,
    totalCents: row.total_cents,
    settled: row.status_code >= SETTLED_STATUS,
  };
}

export function describe(order: Order): string {
  return `Order ${order.id} placed ${order.placedAt}`;
}
