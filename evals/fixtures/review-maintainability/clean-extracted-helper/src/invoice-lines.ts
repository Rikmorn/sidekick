const PENCE_PER_POUND = 100;

export interface InvoiceLine {
  sku: string;
  quantity: number;
  unitCents: number;
  voided: boolean;
}

function isBillable(line: InvoiceLine): boolean {
  return !line.voided;
}

function lineTotalCents(line: InvoiceLine): number {
  return line.quantity * line.unitCents;
}

function formatPounds(cents: number): string {
  return `GBP ${(cents / PENCE_PER_POUND).toFixed(2)}`;
}

function renderLine(line: InvoiceLine): string {
  return `${line.sku} x${line.quantity} - ${formatPounds(lineTotalCents(line))}`;
}

export function renderLines(lines: InvoiceLine[]): string[] {
  return lines.filter(isBillable).map(renderLine);
}
