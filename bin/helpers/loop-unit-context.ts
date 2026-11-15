/**
 * What every unit verb works from, built once per call: the loop's name, its
 * folder, its `loop.json`, and the environment. And the per-loop units lock,
 * which a verb holds while it reads the record and writes verb lines.
 */

import * as path from 'node:path';
import type { LoopEnv } from './loop.js';
import {
  LOOP_FILE,
  type LoopManifest,
  readLoopManifest,
} from './loop-manifest.js';
import { type Lock, takeLock } from './loop-state.js';
import { loopsRoot } from './loop-store.js';
import { UNITS_LOCK } from './loop-units.js';
import { isProfileName, PROFILE_NAME_RULE } from './profile-manifest.js';
import { isFolder } from './profile-role.js';

/** One loop as a unit verb sees it. */
export interface UnitContext {
  name: string;
  loopDir: string;
  manifest: LoopManifest;
  lenv: LoopEnv;
}

/** What refuses `name` as a loop's name, checked before it names a path. */
export const loopNameIssues = (name: string): string[] =>
  isProfileName(name)
    ? []
    : [`"${name}" is not a loop name: use ${PROFILE_NAME_RULE}`];

/**
 * Loop `name` in the store the environment names, with its `loop.json`. It
 * reads no launch state, so it serves a loop that `start` has not launched,
 * and a paused one. A store that holds no such loop refuses.
 */
export function unitContextOf(
  name: string,
  lenv: LoopEnv,
): UnitContext | { issues: string[] } {
  const named = loopNameIssues(name);
  if (named.length > 0) return { issues: named };
  const root = loopsRoot(lenv.env, lenv.cwd, lenv.home);
  const loopDir = path.join(root, name);
  if (!isFolder(loopDir)) {
    return {
      issues: [
        `the loop store ${root} holds no loop "${name}": if the loop exists, CLAUDE_CONFIG_DIR here names another store than the one sidekick loop start used`,
      ],
    };
  }
  const read = readLoopManifest(path.join(loopDir, LOOP_FILE));
  return read.ok
    ? { name, loopDir, manifest: read.manifest, lenv }
    : { issues: read.issues };
}

/** Takes the units lock in `loopDir`, as `start` takes its own lock. */
export const takeUnitsLock = (loopDir: string, lenv: LoopEnv): Lock =>
  takeLock(
    loopDir,
    {
      pid: lenv.pid,
      now: lenv.now(),
      bootTime: lenv.bootTime(),
      isAlive: lenv.isAlive,
    },
    UNITS_LOCK,
  );
