/**
 * The snapshot commit of the memory store: one `git add -A` and one commit
 * at each session start, run by a detached process so the hook never waits.
 */

import { spawn, spawnSync } from 'node:child_process';
import * as path from 'node:path';
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

// Variables that point git at a repo other than the one in the working folder.
const REPO_LOCATING_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
];

function envWithoutRepoVars(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const kept = { ...env };
  for (const name of REPO_LOCATING_VARS) delete kept[name];
  return kept;
}

/** A runner whose calls share one deadline; a call that outlives it fails. */
export function deadlineRunner(ms: number, now: () => number): Runner {
  const end = now() + ms;
  return (cmd, args, cwd) => {
    const left = end - now();
    if (left <= 0) return { code: 124, stdout: '', stderr: 'deadline passed' };
    const r = spawnSync(cmd, args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: left,
      env: envWithoutRepoVars(process.env),
    });
    if (r.error) return { code: 127, stdout: '', stderr: r.error.message };
    return {
      code: r.status ?? 1,
      stdout: r.stdout ?? '',
      stderr: r.stderr ?? '',
    };
  };
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
