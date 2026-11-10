/**
 * What `sidekick worker finish` removes once claude rm has run: a worktree it
 * left behind, a leftover branch at its verified head, and the desk record.
 * `worktree-move.ts` and `worktree-remove.ts` reuse the branch deletion.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Runner } from './pm-data.js';
import { shellArg } from './shell.js';
import type { WorkerEnv } from './worker.js';
import { lockReasonOf, worktreeListed } from './worker-listing.js';
import { removeRecord } from './worker-record.js';
import { branchExists } from './worker-repo.js';
import type { Ready, Step } from './worker-teardown.js';
import { nativeBranch } from './worker-worktree.js';
import {
  type LockState,
  lockStateOf,
  removeGitWorktree,
} from './worktree-lock.js';
import { omittedWords } from './worktree-read.js';
import { filesState } from './worktree-state.js';

// The report's copy in the worktree is untracked, so the leftover's re-check
// and git worktree remove both refuse it. When the saved copy holds the same
// bytes right now, deleting that one file loses nothing; any other case stays
// for the re-check to refuse. A re-run finds the report `in place`, saved by
// the run before it.
function clearSavedReport(ready: Ready): void {
  const step = ready.reportStep;
  if (step.kind === 'none' || step.kind === 'no brief') return;
  if (step.from === step.to) return;
  try {
    const saved = fs.readFileSync(step.to);
    if (fs.readFileSync(step.from).equals(saved)) fs.unlinkSync(step.from);
  } catch {
    // A missing or unreadable copy stays, and the re-check refuses on it.
  }
}

// The record is forgotten by now, so a re-run of finish finds nothing. The
// path resolves where the worker's name may not, as under --worktree. remove
// deletes only the branch named for the worktree's folder or one sidekick
// worktree move marked for it, and move refuses in a worker's worktree.
function forgottenWayOut({
  worktree,
  branch,
}: Pick<Ready, 'worktree' | 'branch'>): string {
  const route = `finish has forgotten the worker, so once you clear what stopped the removal, run sidekick worktree remove ${shellArg(worktree)}`;
  const removable = nativeBranch(path.basename(worktree));
  if (branch === removable) return route;
  return `${route}. remove leaves the branch ${branch} in place, since it deletes only ${removable} or a branch sidekick worktree move made for that worktree, and writes a backup ref for its head first`;
}

// The files git's removal would lose, ignored ones included, read right before
// it as `remove` reads them; a report copy clearSavedReport left counts too.
function leftoverIssues(runGit: Runner, ready: Ready): string[] {
  const { worktree } = ready;
  const state = filesState(runGit, ready);
  switch (state.kind) {
    case 'folder gone':
    case 'removable':
      return [];
    case 'dirty':
      return [
        `the worktree ${worktree} holds files its removal would lose: ${state.paths.join(', ')}${omittedWords(state.omitted)}`,
      ];
    case 'held':
      return [
        `finish cannot tell what the worktree ${worktree} holds, so it removed nothing more: ${state.by}`,
      ];
    default: {
      const _exhaustive: never = state;
      throw new Error(`Unhandled state: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

const lockNow = (
  { mainTop, worktree }: Pick<Ready, 'mainTop' | 'worktree'>,
  { runGit, isAlive }: WorkerEnv,
): LockState => lockStateOf(lockReasonOf(runGit, mainTop, worktree), isAlive);

// A worktree claude rm reported removed but git still lists is removed here when
// no live session or other lock holds it and its files lose nothing. Every
// refusal ends with the way out by its path.
function worktreeGoneIssues(ready: Ready, wenv: WorkerEnv): string[] {
  const { runGit } = wenv;
  const { mainTop: top, worktree } = ready;
  const list = worktreeListed(runGit, top, worktree);
  if ('issue' in list) {
    return [
      `git worktree list failed, so finish cannot confirm the worktree is gone: ${list.issue}`,
      forgottenWayOut(ready),
    ];
  }
  if (!list.listed) return [];
  const first = lockNow(ready, wenv);
  const unlocked = first.kind === 'dead' || first.kind === 'none';
  if (unlocked) clearSavedReport(ready);
  // A live or other lock refuses in removeGitWorktree, before any file is read.
  const files = unlocked ? leftoverIssues(runGit, ready) : [];
  // The files check takes seconds, and a session may lock the worktree meanwhile.
  const lock = unlocked && files.length === 0 ? lockNow(ready, wenv) : first;
  const issues =
    files.length > 0 ? files : removeGitWorktree(runGit, top, worktree, lock);
  if (issues.length === 0) return [];
  return [
    `claude rm said removed, but git still lists the worktree ${worktree}`,
    ...issues,
    forgottenWayOut(ready),
  ];
}

/**
 * Deletes `branch` only at the verified `head`, since update-ref -d refuses a
 * branch that moved, then its config section. A missing branch is fine.
 */
export function branchGoneIssues(
  runGit: Runner,
  top: string,
  branch: string,
  head: string,
): string[] {
  if (!branchExists(runGit, top, branch)) return [];
  const ref = `refs/heads/${branch}`;
  const result = runGit('git', ['update-ref', '-d', ref, head], top);
  if (result.code !== 0) {
    return [`git update-ref -d ${ref} failed: ${result.stderr.trim()}`];
  }
  return dropBranchConfig(runGit, top, branch);
}

// The characters POSIX ERE reads as special outside a bracket expression; a
// branch name may hold `.`, `(`, `)`, `+`, `{`, `|`, and `$`.
const ERE_SPECIAL = /[.[\\()*+?{|^$]/g;

const literalPattern = (text: string): string =>
  text.replace(ERE_SPECIAL, (char) => `\\${char}`);

// update-ref -d, unlike git branch -d, leaves the [branch "<name>"] section's
// keys behind. Each goes by --unset-all, since --remove-section cannot read a
// section name holding `]`; a key with several values lists once per value.
function dropBranchConfig(
  runGit: Runner,
  top: string,
  branch: string,
): string[] {
  // --get-regexp reads its pattern as an ERE, so the name goes in escaped.
  // A key's last part holds no dot, so `[^.]+$` leaves out `branch.<b>.x.*`.
  const listed = runGit(
    'git',
    [
      'config',
      '--local',
      '--name-only',
      '--get-regexp',
      `^${literalPattern(`branch.${branch}`)}\\.[^.]+$`,
    ],
    top,
  );
  if (listed.code !== 0) return [];
  const keys = new Set(listed.stdout.split('\n').filter((key) => key !== ''));
  return [...keys].flatMap((key) => {
    // --local: --unset-all writes only the local file.
    const result = runGit(
      'git',
      ['config', '--local', '--unset-all', key],
      top,
    );
    if (result.code === 0) return [];
    return [`git config --unset-all ${key} failed: ${result.stderr.trim()}`];
  });
}

/** Removes a worktree claude rm left behind when no live session or other lock holds it, then deletes a leftover branch only at the verified head. */
export const removeLeftovers: Step = (ready, wenv, out) => {
  const worktree = worktreeGoneIssues(ready, wenv);
  if (worktree.length > 0) return worktree;
  out(`worktree ${ready.worktree} removed`);
  const branch = branchGoneIssues(
    wenv.runGit,
    ready.mainTop,
    ready.branch,
    ready.head,
  );
  if (branch.length > 0) return branch;
  out(`branch ${ready.branch} removed`);
  return [];
};

// `sidekick desk` lists workers from this record, so it goes with the session.
export const forgetRecord: Step = (ready) => {
  removeRecord(ready.commonDir, ready.name);
  return [];
};
