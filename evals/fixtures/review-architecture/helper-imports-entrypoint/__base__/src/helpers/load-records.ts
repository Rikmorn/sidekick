import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface Record {
  project: string;
  minutes: number;
  loggedOn: string;
}

export async function loadRecords(
  dataDir: string,
  week: string,
): Promise<Record[]> {
  const file = path.join(dataDir, `${week}.json`);
  const raw = await fs.readFile(file, 'utf-8').catch(() => '[]');
  return JSON.parse(raw) as Record[];
}
