export interface Order {
  items: { name: string; cents: number }[];
  taxRate: number;
}

/** Net total of the line items, before tax. */
export function subtotal(order: Order): number {
  return order.items.reduce((sum, item) => sum + item.cents, 0);
}
