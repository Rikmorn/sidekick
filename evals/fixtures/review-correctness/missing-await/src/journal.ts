import * as fs from 'node:fs/promises';

export interface Entry {
  at: string;
  event: string;
}

export async function appendEntry(file: string, entry: Entry): Promise<void> {
  await fs.appendFile(file, `${JSON.stringify(entry)}\n`);
}

/** Persist a batch and report how many entries were written. */
export async function appendBatch(
  file: string,
  entries: Entry[],
): Promise<{ written: number }> {
  for (const entry of entries) {
    appendEntry(file, entry);
  }
  return { written: entries.length };
}
