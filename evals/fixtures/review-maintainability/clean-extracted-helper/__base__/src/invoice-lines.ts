export interface InvoiceLine {
  sku: string;
  quantity: number;
  unitCents: number;
  voided: boolean;
}

export function renderLines(lines: InvoiceLine[]): string[] {
  const rendered: string[] = [];
  for (const line of lines) {
    if (line.voided) {
      continue;
    }
    const totalCents = line.quantity * line.unitCents;
    const pounds = (totalCents / 100).toFixed(2);
    rendered.push(`${line.sku} x${line.quantity} - GBP ${pounds}`);
  }
  return rendered;
}
