/** Makes and removes the one temp folder a test run keeps everything in. */
import * as fs from 'node:fs';
import * as path from 'node:path';

export const RUN_FOLDER_PREFIX = 'sk-test-';

/** Makes a fresh run folder under `base`. */
export const makeRunFolder = (base: string): string =>
  fs.mkdtempSync(path.join(base, RUN_FOLDER_PREFIX));

/** Removes `dir` and its contents; returns a warning naming `dir` when that fails. */
export function removeRunFolder(dir: string): string | undefined {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return undefined;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return `the test run's temp folder ${dir} was not removed: ${reason}`;
  }
}
