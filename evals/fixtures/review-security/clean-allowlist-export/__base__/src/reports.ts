import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const REPORT_ROOT = process.env.REPORT_ROOT ?? '/var/app/reports';

export interface Session {
  userId: string;
  merchantId: string;
}

export interface Request {
  params: Record<string, string>;
  session: Session | null;
}

export interface ReportRow {
  label: string;
  amountCents: number;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Nightly job output — one CSV per merchant per report slug. */
export async function writeReport(
  merchantId: string,
  slug: string,
  rows: ReportRow[],
): Promise<void> {
  const dir = path.join(REPORT_ROOT, merchantId);
  await fs.mkdir(dir, { recursive: true });
  const csv = [
    'label,amount_cents',
    ...rows.map((r) => `${csvCell(r.label)},${r.amountCents}`),
  ].join('\n');
  await fs.writeFile(path.join(dir, `${slug}.csv`), csv);
}
