/**
 * What every unit verb works from, built once per call: the loop's name, its
 * folder, its `loop.json`, and the environment. And the per-loop units lock,
 * which a verb holds while it reads the record and writes verb lines, with
 * the lookups several verbs share: the attempt in flight for a unit, the
 * worker's rows in the session listing, and the `--reason` check.
 */

import * as path from 'node:path';
import * as v from 'valibot';
import type { LoopEnv } from './loop.js';
import { REFUSED } from './loop-io.js';
import {
  LOOP_FILE,
  type LoopManifest,
  readLoopManifest,
} from './loop-manifest.js';
import { ReasonSchema } from './loop-record.js';
import type { JobCall } from './loop-start-jobs.js';
import { type Lock, takeLock } from './loop-state.js';
import { loopsRoot } from './loop-store.js';
import {
  type Attempt,
  inFlight,
  readLedger,
  readWorkerFile,
  UNITS_LOCK,
} from './loop-units.js';
import { keyHits } from './memory-patterns.js';
import { isProfileName, PROFILE_NAME_RULE } from './profile-manifest.js';
import { isFolder } from './profile-role.js';
import { type Job, listJobs } from './worker-jobs.js';

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

/**
 * Runs `run` under the units lock in the loop's folder, and releases it
 * after. A lock another verb holds refuses on `err` before `run` runs.
 */
export function underUnitsLock(
  ctx: UnitContext,
  err: (line: string) => void,
  run: () => number,
): number {
  const lock = takeUnitsLock(ctx.loopDir, ctx.lenv);
  if (lock.kind === 'busy') {
    err(lock.issue);
    return REFUSED;
  }
  try {
    return run();
  } finally {
    lock.release();
  }
}

// A worker's name as a line shows it; an attempt the record names no worker for shows as `(unnamed)`.
const workerShown = (worker: string): string =>
  worker === '' ? '(unnamed)' : worker;

/**
 * How a verb words a unit with no attempt in flight: "so `verb` `lacks`",
 * as "so discard has nothing to close".
 */
export interface InFlightWording {
  verb: string;
  lacks: string;
}

/**
 * The attempt in flight for `unit`, read under the units lock the caller
 * holds. A record that cannot be read refuses, and so does a unit with no
 * attempt in flight, naming the attempt that is in flight, if any.
 */
export function attemptInFlight(
  ctx: UnitContext,
  unit: string,
  { verb, lacks }: InFlightWording,
): Attempt | { issues: string[] } {
  const ledger = readLedger(ctx.loopDir, ctx.lenv.now());
  if ('issues' in ledger) {
    return {
      issues: [
        ...ledger.issues,
        `${verb} cannot read the loop's record, so it cannot find the attempt in flight`,
      ],
    };
  }
  const open = inFlight(ledger.lines);
  if (open !== undefined && open.unit === unit) return open;
  const lead = `no attempt for unit ${unit} is in flight, so ${verb} ${lacks}`;
  if (open === undefined) return { issues: [lead] };
  return {
    issues: [
      `${lead}; the attempt in flight is unit ${open.unit}, worker ${workerShown(open.worker)}`,
    ],
  };
}

/**
 * The worker's rows in the session listing: by the job `worker.json` in the
 * attempt's folder `dir` names, or by its session name when `worker.json`
 * names none, as a timed-out launch leaves it, or cannot be read. A listing
 * that fails returns its issues, and the caller says what it then leaves.
 */
export function workerRows(
  call: JobCall,
  dir: string,
  worker: string,
): { rows: Job[] } | { issues: string[] } {
  const file = readWorkerFile(dir);
  const job = 'issues' in file ? null : file.job;
  const listed = listJobs(call.lenv.runClaude, call.cwd);
  if ('issues' in listed) return listed;
  const isWorker = (row: Job): boolean =>
    job === null ? row.name === worker : row.id === job;
  return { rows: listed.jobs.filter(isWorker) };
}

/** Whether a row's process may run: it names a pid, or gives one in a form no one can read. */
export const mayRun = (row: Job): boolean =>
  row.pid !== undefined || ('pidMalformed' in row && row.pidMalformed === true);

/** The `--reason` rule, then the key check, which names its ids and never the text. */
export function reasonIssues(reason: string): string[] {
  const parsed = v.safeParse(ReasonSchema, reason);
  const rule = parsed.success
    ? []
    : parsed.issues.map((i) => `--reason: ${i.message}`);
  const ids = keyHits(reason);
  return [
    ...rule,
    ...(ids.length === 0
      ? []
      : [
          `--reason holds text that looks like a key (${ids.join(', ')}): keep keys out of the record`,
        ]),
  ];
}
