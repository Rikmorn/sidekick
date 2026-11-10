/**
 * Removing the worker's session, the `claude rm` step of `sidekick worker
 * finish`: its discard offer, and the refusal that says how to finish by hand.
 */

import { type ClaudeResult, printedStreams } from './profile-launch.js';
import { shellArg } from './shell.js';
import type { WorkerEnv } from './worker.js';
import { physical } from './worker-repo.js';
import {
  claudeAt,
  DISCARD_LINE,
  failure,
  NO_LIMIT,
  type Ready,
  ranClean,
  type Step,
  saidRemoved,
  withText,
} from './worker-teardown.js';
import { nativeBranch, nativeFolder } from './worker-worktree.js';

// claude rm refuses a worktree a WorktreeCreate hook made.
const isHookMade = (ready: Ready): boolean =>
  physical(ready.worktree) !==
    physical(nativeFolder(ready.mainTop, ready.name)) ||
  ready.branch !== nativeBranch(ready.name);

// The re-run comes first: it restores what a cut-short claude rm deleted, and
// claude rm keeps a worktree with uncommitted changes. `args` is the claude rm
// that ran, which also completes the removal by hand: the discard line once it
// ran, else `rm <id>`.
function unknownAnswer(
  ready: Ready,
  args: string[],
  result: ClaudeResult,
): string[] {
  const what = ranClean(result)
    ? 'did not say removed, and finish does not know its answer'
    : failure(result);
  const command = `claude ${args.map(shellArg).join(' ')}`;
  const refused = withText(
    `${command} ${what}, so finish removed nothing more`,
    result,
  );
  if (isHookMade(ready)) {
    return [
      ...refused,
      `the worktree ${ready.worktree} on ${ready.branch} is not the one Claude Code makes for ${ready.name}, so a WorktreeCreate hook likely made it and claude rm will not remove it: remove it with that hook's own removal, then run ${ready.discardCommand}`,
    ];
  }
  return [
    ...refused,
    `run finish again with ${ready.rerun}, which restores any files claude rm deleted, then runs claude rm again; or complete the removal by hand with ${command}`,
  ];
}

// Runs claude rm's discard line only when it names the verified head; any
// other answer refuses, and nothing is lost. The offer counts whatever the
// exit code: claude rm exited 1 as it kept a job finish had just stopped
// (measured 2026-10-15, 2.1.300).
function discard(ready: Ready, wenv: WorkerEnv, kept: ClaudeResult): string[] {
  const text = printedStreams(kept).join('\n');
  const offer = DISCARD_LINE.exec(text);
  if (offer === null) return unknownAnswer(ready, ['rm', ready.id], kept);
  const [, sha, worktreeId] = offer;
  if (sha !== ready.head) {
    return withText(
      `claude rm offers to discard ${sha}, which is not ${ready.branch}'s verified head (${ready.head}), so finish did not run it`,
      kept,
    );
  }
  const args = ['rm', ready.id, '--discard-unpushed', `${sha}@${worktreeId}`];
  const result = claudeAt(ready, wenv, args, NO_LIMIT);
  return saidRemoved(result) ? [] : unknownAnswer(ready, args, result);
}

// claude rm's exit code does not say whether it removed or kept, so only its
// text tells. It runs with no limit, since any limit can cut its delete short.
export const removeSession: Step = (ready, wenv, out) => {
  const first = claudeAt(ready, wenv, ['rm', ready.id], NO_LIMIT);
  const issues = saidRemoved(first) ? [] : discard(ready, wenv, first);
  if (issues.length > 0) return issues;
  out(`session ${ready.id} removed`);
  return [];
};
