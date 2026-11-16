/**
 * `sidekick hook pre-enter-worktree`: before `EnterWorktree` creates a
 * worktree, fetch the default branch so the worktree starts from the remote's
 * tip. A call with a `path` enters an existing worktree and fetches nothing,
 * and so does every call in a loop's unit worker. The fetch recurses into no
 * submodule. It never fails the call: a malformed event, a missing
 * `origin/HEAD`, a failed or slow git call all return quietly (ADR-0010).
 */
import { defaultBranchOf } from './memory-start.js';
import type { Runner } from './pm-data.js';
import { isUnitWorker } from './unit-worker.js';
import { NO_RECURSE_SUBMODULES } from './worker-git.js';

/** The fetch's limit; the hook's own timeout in hooks.json sits above it. */
export const FETCH_LIMIT_MS = 5_000;

interface EnterWorktreeEvent {
  cwd: string;
  tool_input: Record<string, unknown>;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

function isEnterWorktreeEvent(v: unknown): v is EnterWorktreeEvent {
  return (
    isRecord(v) &&
    v.tool_name === 'EnterWorktree' &&
    typeof v.cwd === 'string' &&
    v.cwd !== '' &&
    isRecord(v.tool_input)
  );
}

function parseEvent(stdin: string): EnterWorktreeEvent | undefined {
  try {
    const parsed: unknown = JSON.parse(stdin);
    return isEnterWorktreeEvent(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** What the hook reads beside its event. */
export interface FetchDeps {
  runGit: Runner;
  /** The process environment, whose `SIDEKICK_WORKER` may mark a unit worker. */
  env: NodeJS.ProcessEnv;
  /** The home folder the loop store sits under. */
  home: string;
}

export function enterWorktreeFetch(stdin: string, deps: FetchDeps): void {
  try {
    const event = parseEvent(stdin);
    if (event === undefined || event.tool_input.path !== undefined) return;
    // A unit worker's folder holds what it planted, and its overlay's deny
    // on `EnterWorktree` refuses the call only after this hook has run.
    if (isUnitWorker(deps.env, event.cwd, deps.home)) return;
    const branch = defaultBranchOf(deps.runGit, event.cwd);
    if (branch === undefined) return;
    deps.runGit(
      'git',
      [
        'fetch',
        NO_RECURSE_SUBMODULES,
        'origin',
        `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
      ],
      event.cwd,
      { timeoutMs: FETCH_LIMIT_MS },
    );
  } catch {
    // A hook never fails the call it watches.
  }
}
