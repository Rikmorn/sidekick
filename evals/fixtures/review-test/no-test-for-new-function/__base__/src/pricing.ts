export interface LineItem {
  sku: string;
  unitCents: number;
  qty: number;
}

export function subtotalCents(items: LineItem[]): number {
  return items.reduce((total, item) => total + item.unitCents * item.qty, 0);
}
