/**
 * The loop store, `<config>/sidekick/loops/`: one folder per loop, holding its
 * `loop.json` beside the runtime entries a launch writes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { isFolder } from './profile-role.js';
import { storeRoots } from './profile-store.js';

/** The runtime entries of a loop's folder; `IGNORED` in `sidekick-home.ts` must git-ignore each in every loop's folder. */
export const RUNTIME_ENTRIES: readonly string[] = ['records', 'state.json'];

/** The folder that holds every loop's folder. */
export function loopsRoot(
  env: NodeJS.ProcessEnv,
  cwd: string,
  home: string,
): string {
  const [root] = storeRoots('loops', env, cwd, home, { kind: 'outside' });
  return root.dir;
}

// A missing or unreadable folder lists nothing.
const entriesOf = (dir: string): string[] => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
};

/** The loop folders in `root`, sorted, skipping hidden entries and files. */
export function loopNames(root: string): string[] {
  return entriesOf(root)
    .filter((name) => !name.startsWith('.') && isFolder(path.join(root, name)))
    .sort();
}
