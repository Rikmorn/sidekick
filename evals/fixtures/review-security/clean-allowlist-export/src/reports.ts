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

/** The reports a merchant may download, mapped to their on-disk filename. */
const DOWNLOADABLE: Record<string, string> = {
  payouts: 'payouts.csv',
  refunds: 'refunds.csv',
  'tax-summary': 'tax-summary.csv',
};

export interface Download {
  filename: string;
  csv: string;
}

/** GET /reports/:slug/download */
export async function downloadReport(req: Request): Promise<Download> {
  if (req.session === null) {
    throw new Error('unauthenticated');
  }
  const filename = DOWNLOADABLE[req.params.slug];
  if (filename === undefined) {
    throw new Error('unknown report');
  }
  const full = path.join(REPORT_ROOT, req.session.merchantId, filename);
  const csv = await fs.readFile(full, 'utf-8');
  return { filename, csv };
}
