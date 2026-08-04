import { ordersInPeriod, type Order } from '../orders/index.js';

export interface InvoiceLine {
  description: string;
  amountCents: number;
}

export interface Invoice {
  customerId: string;
  lines: InvoiceLine[];
  totalCents: number;
}

function lineFor(order: Order): InvoiceLine {
  return {
    description: `Order ${order.id}`,
    amountCents: order.totalCents,
  };
}

export function buildInvoice(
  customerId: string,
  from: string,
  to: string,
): Invoice {
  const lines = ordersInPeriod(customerId, from, to).map(lineFor);
  return {
    customerId,
    lines,
    totalCents: lines.reduce((sum, l) => sum + l.amountCents, 0),
  };
}
