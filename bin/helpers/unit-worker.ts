/**
 * Whether this session is a loop's unit worker, read from `SIDEKICK_WORKER`.
 * A unit worker reads issue text that anyone may have written, so what a
 * session start hands a main or a plan worker stays out of its context.
 */

import * as path from 'node:path';
import { loopsRoot } from './loop-store.js';
import { UNITS_DIR } from './loop-units.js';
import { realPathOf } from './sidekick-home.js';
import { readBrief } from './worker-brief.js';

// Whether `file` lies under `<root>/<loop>/units/`, compared as given and by real path.
function underUnits(root: string, file: string): boolean {
  const holds = (from: string, to: string): boolean => {
    const parts = path.relative(from, to).split(path.sep);
    const [loop = '', units, ...rest] = parts;
    const inside = loop !== '' && loop !== '..' && !path.isAbsolute(loop);
    return inside && units === UNITS_DIR && rest.length > 0;
  };
  return holds(root, file) || holds(realPathOf(root), realPathOf(file));
}

/**
 * Whether `SIDEKICK_WORKER` names a unit brief: one that reads as a unit
 * brief, or a path under a loop's units folder in the loop store
 * `sidekick loop` uses, read or not. Dispatch removes an attempt's folder
 * while its worker's start hooks may still run, so the path alone counts.
 * An empty value reads as no worker.
 */
export function isUnitWorker(
  env: NodeJS.ProcessEnv,
  cwd: string,
  home: string,
): boolean {
  const named = env.SIDEKICK_WORKER;
  if (named === undefined || named === '') return false;
  const file = path.resolve(cwd, named);
  const read = readBrief(file);
  if ('brief' in read && read.brief.kind === 'unit') return true;
  return underUnits(loopsRoot(env, cwd, home), file);
}
