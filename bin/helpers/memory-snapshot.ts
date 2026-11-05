/**
 * The snapshot commit of the memory store: one `git add -A` and one commit
 * at each session start, run by a detached process so the hook never waits.
 */

import { spawn, spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { envWithoutRepoVars } from './git-env.js';
import type { StartSource } from './memory-start-render.js';
import { isWorkTreeTop } from './memory-store.js';
import type { Runner } from './pm-data.js';

export type SnapshotOutcome = 'committed' | 'clean' | 'failed';

/** One deadline for the whole snapshot, not for each git call. */
export const SNAPSHOT_DEADLINE_MS = 5000;

/**
 * Commits whatever changed in `store`. Returns `failed` when `store` is not
 * a git work tree's top, so a store folder inside another repo never commits
 * into that repo, and on any git failure, a held index lock included.
 */
export function snapshotStore(
  store: string,
  sessionId: string,
  source: string,
  runGit: Runner,
): SnapshotOutcome {
  if (!isWorkTreeTop(store, runGit)) return 'failed';
  const run = (args: string[]) => runGit('git', args, store);
  if (run(['add', '-A']).code !== 0) return 'failed';
  // Exit 0 means nothing is staged, 1 means something is.
  const staged = run(['diff', '--cached', '--quiet']);
  if (staged.code === 0) return 'clean';
  if (staged.code !== 1) return 'failed';
  const commit = run([
    'commit',
    '-m',
    `memory: snapshot at ${source} of session ${sessionId}`,
    '--trailer',
    `Session: ${sessionId}`,
  ]);
  return commit.code === 0 ? 'committed' : 'failed';
}

/** The exit code `deadlineRunner` gives a call made after its deadline, or cut by it. */
export const DEADLINE_EXIT = 124;

/** A runner whose calls share one deadline, and the time, on its clock, that deadline falls. */
export type DeadlineRunner = Runner & { readonly endsAt: number };

// spawnSync sets this code on its error when its timeout kills the child.
const TIMED_OUT = 'ETIMEDOUT';
// The shell's exit code for a command that could not run.
const SPAWN_FAILED_EXIT = 127;

/**
 * A runner whose calls share one deadline, `ms` from now. A call made after
 * the deadline, or still running at it, returns exit code `DEADLINE_EXIT`;
 * any other spawn error, such as a missing folder, returns 127.
 */
export function deadlineRunner(ms: number, now: () => number): DeadlineRunner {
  const endsAt = now() + ms;
  const run: Runner = (cmd, args, cwd) => {
    const left = endsAt - now();
    if (left <= 0) {
      return { code: DEADLINE_EXIT, stdout: '', stderr: 'deadline passed' };
    }
    const r = spawnSync(cmd, args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: left,
      env: envWithoutRepoVars(process.env),
    });
    if (r.error) {
      const timedOut = 'code' in r.error && r.error.code === TIMED_OUT;
      const code = timedOut ? DEADLINE_EXIT : SPAWN_FAILED_EXIT;
      return { code, stdout: '', stderr: r.error.message };
    }
    return {
      code: r.status ?? 1,
      stdout: r.stdout ?? '',
      stderr: r.stderr ?? '',
    };
  };
  return Object.assign(run, { endsAt });
}

/**
 * Starts `sidekick memory snapshot` as a detached process and returns at
 * once. A spawn error is swallowed: the hook must not fail the session.
 */
export function startSnapshot(
  pluginDir: string,
  store: string,
  sessionId: string,
  source: StartSource,
): void {
  try {
    const child = spawn(
      process.execPath,
      [
        path.join(pluginDir, 'bin', 'sidekick'),
        'memory',
        'snapshot',
        '--store',
        store,
        '--session',
        sessionId,
        '--source',
        source,
      ],
      { detached: true, stdio: 'ignore' },
    );
    child.on('error', () => {});
    child.unref();
  } catch {}
}
