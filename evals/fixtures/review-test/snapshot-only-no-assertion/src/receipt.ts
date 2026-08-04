export interface Order {
  items: { name: string; cents: number }[];
  taxRate: number;
}

export interface Receipt {
  lines: string[];
  taxCents: number;
  totalCents: number;
}

/** Net total of the line items, before tax. */
export function subtotal(order: Order): number {
  return order.items.reduce((sum, item) => sum + item.cents, 0);
}

/**
 * Render a receipt. Tax rounds half-up to the nearest cent and the total is
 * net plus that rounded tax, so the printed lines always reconcile.
 */
export function buildReceipt(order: Order): Receipt {
  const net = subtotal(order);
  const taxCents = Math.round(net * order.taxRate);
  return {
    lines: order.items.map(
      (item) => `${item.name} ${(item.cents / 100).toFixed(2)}`,
    ),
    taxCents,
    totalCents: net + taxCents,
  };
}
