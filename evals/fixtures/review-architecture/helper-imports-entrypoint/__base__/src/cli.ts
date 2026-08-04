import { loadRecords } from './helpers/load-records.js';
import { formatReport } from './helpers/report-formatter.js';

export interface Config {
  dataDir: string;
  roundToMinutes: number;
  currency: string;
}

export let activeConfig: Config = {
  dataDir: '.',
  roundToMinutes: 15,
  currency: 'GBP',
};

function parseArgs(argv: string[]): { week: string } {
  const i = argv.indexOf('--week');
  return { week: i === -1 ? '' : (argv[i + 1] ?? '') };
}

export async function main(argv: string[]): Promise<string> {
  activeConfig = {
    dataDir: process.env.TIMESHEET_DIR ?? '.',
    roundToMinutes: Number(process.env.TIMESHEET_ROUND ?? 15),
    currency: process.env.TIMESHEET_CURRENCY ?? 'GBP',
  };
  const { week } = parseArgs(argv);
  const records = await loadRecords(activeConfig.dataDir, week);
  return formatReport(records, activeConfig.roundToMinutes);
}
