/**
 * What `finish` does when the finder found no worktree. The operator's
 * `--worktree` refuses in either mode, and landed mode refuses. Discard mode
 * stops the job, removes its session and desk record, and deletes no branch,
 * since it holds no verified head to judge one by. Each step returns the
 * issues that stop the run, none on success.
 */

import { type ClaudeResult, printedStreams } from './profile-launch.js';
import { shellArg } from './shell.js';
import type { WorkerEnv } from './worker.js';
import { type FinishOptions, rerunCommand } from './worker-finish-args.js';
import {
  notFoundIssues,
  operatorIssues,
  type Tried,
  triedLine,
} from './worker-finish-tree.js';
import type { WorktreeEntry } from './worker-listing.js';
import { removeRecord } from './worker-record.js';
import {
  DISCARD_LINE,
  failure,
  NO_LIMIT,
  type Out,
  ranClean,
  saidRemoved,
  withText,
} from './worker-teardown.js';
import { runStop } from './worker-teardown-stop.js';

/** What `finish --discard` clears when the finder found no worktree. */
export interface Gone {
  id: string;
  name: string;
  mainTop: string;
  commonDir: string;
  /** The command that repeats this run. */
  rerun: string;
  /** Each place the finder tried, and why it rejected it. */
  tried: Tried[];
}

/** The job and repo a not-found result concerns, and the linked worktrees git lists. */
export type GoneAt = Omit<Gone, 'rerun' | 'tried'> & {
  linked: WorktreeEntry[];
};

/**
 * The refusal, or what discard mode clears. The operator named their path, so
 * it refuses in either mode, quoting what git lists.
 */
export function whenNotFound(
  tried: Tried[],
  at: GoneAt,
  opts: FinishOptions,
): Gone | { issues: string[] } {
  const { linked, ...job } = at;
  if (opts.worktree !== undefined) {
    return { issues: operatorIssues(at.name, tried, linked) };
  }
  if (opts.mode.kind === 'landed') {
    return { issues: notFoundIssues(at.name, tried) };
  }
  return { ...job, rerun: rerunCommand(opts), tried };
}

type GoneStep = (gone: Gone, wenv: WorkerEnv, out: Out) => string[];

const sayNotFound: GoneStep = (gone, _wenv, out) => {
  out(
    `finish cannot find the worktree of ${gone.name}, so it removes only its session and record. It tried:`,
  );
  for (const tried of gone.tried) out(triedLine(tried));
  return [];
};

// With no worktree there is no lock to read, and a job listed as done may still
// idle and hold one, which makes claude rm keep everything. So the stop runs
// whatever the job lists as; claude stop exits 0 on a done job either way.
const stop: GoneStep = (gone, wenv) => runStop(gone, wenv);

// claude rm's offer names a sha, and with no worktree finish verified no head
// to check it against, so the offer goes to the operator.
function keptIssues(gone: Gone, result: ClaudeResult): string[] {
  const hand = `claude rm ${shellArg(gone.id)}`;
  const offer = DISCARD_LINE.exec(printedStreams(result).join('\n'));
  if (offer !== null) {
    return [
      ...withText(
        `${hand} offers to discard ${offer[1]}, but finish found no worktree, so it has no verified head to check that against and did not run it`,
        result,
      ),
      'check what the discard would lose before you run it by hand, or name the worktree with --worktree <path> so that finish verifies its head first',
    ];
  }
  const what = ranClean(result)
    ? 'did not say removed, and finish does not know its answer'
    : failure(result);
  // claude rm keeps a session whose lock names a running process, so the hand
  // route stops the job first.
  const stopFirst = `claude stop ${shellArg(gone.id)}, then ${hand}`;
  return [
    ...withText(`${hand} ${what}, so finish removed nothing more`, result),
    `run finish again with ${gone.rerun}, or complete the removal by hand with ${stopFirst}`,
  ];
}

// No limit, since any limit can cut claude rm's delete short.
const removeSession: GoneStep = (gone, wenv, out) => {
  const cwd = gone.mainTop;
  const result = wenv.runClaude(['rm', gone.id], { cwd, timeoutMs: NO_LIMIT });
  if (!saidRemoved(result)) return keptIssues(gone, result);
  out(`session ${gone.id} removed`);
  return [];
};

// `sidekick desk` lists workers from this record, so it goes with the session.
const forgetRecord: GoneStep = (gone) => {
  removeRecord(gone.commonDir, gone.name);
  return [];
};

/**
 * The way on once the worker's session is gone. A leftover `worktree-<name>`
 * blocks a new worktree of that name; dispatch refuses it, since it checks
 * that the branch is free.
 */
export const leftoverRoute = (name: string): string =>
  `run sidekick worktree list, then sidekick worktree remove <name> for a worktree the worker left, since remove takes no branch. A branch left with no worktree holds the worker's commits, and blocks a new worktree named ${name}; dispatch refuses it`;

const sayByHand: GoneStep = (gone, _wenv, out) => {
  out(
    `the worktree of ${gone.name} was not found, so finish deleted no branch: ${leftoverRoute(gone.name)}`,
  );
  return [];
};

// In order: what the finder tried, then the session goes before its record.
const GONE_STEPS: GoneStep[] = [
  sayNotFound,
  stop,
  removeSession,
  forgetRecord,
  sayByHand,
];

/** Clears a worker whose worktree no reader found; the issues of the first step that fails. */
export function clearGone(gone: Gone, wenv: WorkerEnv, out: Out): string[] {
  for (const step of GONE_STEPS) {
    const issues = step(gone, wenv, out);
    if (issues.length > 0) return issues;
  }
  return [];
}
