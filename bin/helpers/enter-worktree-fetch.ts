/**
 * `sidekick hook pre-enter-worktree`: before `EnterWorktree` creates a
 * worktree, fetch the default branch so the worktree starts from the remote's
 * tip. A call with a `path` enters an existing worktree and fetches nothing.
 * The fetch never fails the call: a malformed event, a missing `origin/HEAD`,
 * a failed or slow git call all return quietly (ADR-0010).
 */
import { defaultBranchOf } from './memory-start.js';
import type { Runner } from './pm-data.js';

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

export function enterWorktreeFetch(stdin: string, runGit: Runner): void {
  try {
    const event = parseEvent(stdin);
    if (event === undefined || event.tool_input.path !== undefined) return;
    const branch = defaultBranchOf(runGit, event.cwd);
    if (branch === undefined) return;
    runGit(
      'git',
      [
        'fetch',
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
