import * as fs from 'node:fs/promises';

export interface Entry {
  at: string;
  event: string;
}

export async function appendEntry(file: string, entry: Entry): Promise<void> {
  await fs.appendFile(file, `${JSON.stringify(entry)}\n`);
}
