/**
 * The loop's worktree as `sidekick loop dispatch` checks and moves it. It
 * must be a linked worktree of the loop's repo on the loop's branch, with
 * clean tracked files, and it holds nothing of its own, so dispatch
 * fast-forwards it to origin's default branch before a worker branches from
 * it. Every git call into it runs through the hardened runner, after the
 * chain check.
 */

import * as path from 'node:path';
import { sessionOf } from './loop-start-prepare.js';
import type { Runner } from './pm-data.js';
import { isFolder } from './profile-role.js';
import { realPathOf } from './sidekick-home.js';
import { chainOf, hardenedRunner } from './worker-git.js';
import { commitOf, HEADS, headCommit, isTrackedClean } from './worker-repo.js';
import { nativeBranch, nativeFolder, shortBranch } from './worker-worktree.js';

/** The loop's worktree once its checks pass: its folder, its branch, and the hardened runner into it. */
export interface LoopTree {
  folder: string;
  branch: string;
  runGit: Runner;
}

const ORIGIN_HEAD = 'refs/remotes/origin/HEAD';
const REMOTES = 'refs/remotes/';

// git exits 1 from `symbolic-ref -q` on a detached HEAD or a ref that is not
// set, and from `merge-base --is-ancestor` when the first commit is not an
// ancestor.
const NO = 1;

const failed = (what: string, folder: string, stderr: string): string =>
  `${what} failed in ${folder}: ${stderr.trim() === '' ? 'git printed nothing' : stderr.trim()}`;

function branchIssues(run: Runner, folder: string, branch: string): string[] {
  const held = run('git', ['symbolic-ref', '-q', 'HEAD'], folder);
  if (held.code !== 0 && held.code !== NO) {
    return [failed('git symbolic-ref HEAD', folder, held.stderr)];
  }
  const ref = held.code === 0 ? held.stdout.trim() : undefined;
  if (ref === `${HEADS}${branch}`) return [];
  const what =
    ref === undefined ? 'a detached HEAD' : `the branch ${shortBranch(ref)}`;
  return [
    `${folder} holds ${what}, not ${branch}: switch it back with git switch ${branch} in that folder`,
  ];
}

const cleanIssues = (run: Runner, folder: string): string[] =>
  isTrackedClean(run, folder)
    ? []
    : [
        `${folder}: tracked files have uncommitted changes, and the loop's worktree holds nothing of its own: once nothing in them is needed, discard them with git restore --staged --worktree . in that folder`,
      ];

/**
 * Checks the loop's worktree, `<repo>/.claude/worktrees/loop-<name>`: it
 * exists, its link to the repo holds with the admin folder's name
 * `loop-<name>`, it holds the branch `worktree-loop-<name>`, and its tracked
 * files are clean. `start` never checks it, so this is its first check.
 */
export function checkLoopTree(
  repo: string,
  name: string,
  runGit: Runner,
): LoopTree | { issues: string[] } {
  const session = sessionOf(name);
  const folder = nativeFolder(repo, session);
  if (!isFolder(folder)) {
    return {
      issues: [
        `${folder} does not exist: Claude Code makes the loop's worktree when sidekick loop start launches the loop, so run sidekick loop start ${name}`,
      ],
    };
  }
  const chain = chainOf(folder, realPathOf(path.join(repo, '.git')), session);
  if ('issues' in chain) {
    return {
      issues: [
        ...chain.issues,
        `${folder}: the loop's worktree no longer links to ${repo} as git made it, so dispatch runs no git in it`,
      ],
    };
  }
  const run = hardenedRunner(runGit, {
    worktree: folder,
    gitDir: chain.gitDir,
  });
  const branch = nativeBranch(session);
  const issues = [
    ...branchIssues(run, folder, branch),
    ...cleanIssues(run, folder),
  ];
  return issues.length > 0 ? { issues } : { folder, branch, runGit: run };
}

type Relation = 'behind' | 'ahead' | 'diverged';

// How `head` stands to `tip`, which differ, by two ancestry reads.
function relationOf(
  tree: LoopTree,
  head: string,
  tip: string,
): Relation | { issue: string } {
  const isAncestor = (a: string, b: string): boolean | { issue: string } => {
    const r = tree.runGit(
      'git',
      ['merge-base', '--is-ancestor', a, b],
      tree.folder,
    );
    if (r.code === 0) return true;
    if (r.code === NO) return false;
    return { issue: failed('git merge-base', tree.folder, r.stderr) };
  };
  const behind = isAncestor(head, tip);
  if (typeof behind !== 'boolean') return behind;
  if (behind) return 'behind';
  const ahead = isAncestor(tip, head);
  if (typeof ahead !== 'boolean') return ahead;
  return ahead ? 'ahead' : 'diverged';
}

function standingIssue(tree: LoopTree, relation: Relation, shown: string) {
  const { folder, branch } = tree;
  const how =
    relation === 'ahead'
      ? `is ahead of ${shown} by commits of its own`
      : `has diverged from ${shown}`;
  return `${folder}: ${branch} ${how}, and the loop's worktree holds nothing of its own: keep those commits on a branch of their own, then move ${branch} to origin's tip with git reset --keep ${shown} in that folder`;
}

// The default branch's tip that origin/HEAD names, as its short name and commit.
function originTip(
  tree: LoopTree,
  repo: string,
): { shown: string; tip: string } | { issues: string[] } {
  const ref = tree.runGit(
    'git',
    ['symbolic-ref', '-q', ORIGIN_HEAD],
    tree.folder,
  );
  if (ref.code === NO) {
    return {
      issues: [
        `${ORIGIN_HEAD} is not set in ${repo}, so dispatch cannot tell origin's default branch: run git remote set-head origin --auto in ${repo}`,
      ],
    };
  }
  if (ref.code !== 0) {
    return {
      issues: [
        failed(`git symbolic-ref ${ORIGIN_HEAD}`, tree.folder, ref.stderr),
      ],
    };
  }
  const target = ref.stdout.trim();
  const tip = commitOf(tree.runGit, tree.folder, target);
  if (tip === undefined) {
    return {
      issues: [`${ORIGIN_HEAD} names ${target}, which names no commit`],
    };
  }
  const shown = target.startsWith(REMOTES)
    ? target.slice(REMOTES.length)
    : target;
  return { shown, tip };
}

// A checkout cut short leaves `index.lock` behind, so the fast-forward takes
// the sync's own limit, which the caller sets for slow work.
function fastForward(
  tree: LoopTree,
  head: string,
  { shown, tip }: { shown: string; tip: string },
  timeoutMs: number,
): { baseline: string } | { issues: string[] } {
  if (head === tip) return { baseline: head };
  const relation = relationOf(tree, head, tip);
  if (typeof relation !== 'string') return { issues: [relation.issue] };
  if (relation !== 'behind') {
    return { issues: [standingIssue(tree, relation, shown)] };
  }
  const merged = tree.runGit(
    'git',
    ['merge', '--ff-only', '--quiet', tip],
    tree.folder,
    { timeoutMs },
  );
  if (merged.code !== 0) {
    return {
      issues: [failed('git merge --ff-only', tree.folder, merged.stderr)],
    };
  }
  const moved = headCommit(tree.runGit, tree.folder);
  return moved === tip
    ? { baseline: moved }
    : { issues: [`${tree.folder}: HEAD is not ${tip} after the fast-forward`] };
}

/**
 * Fetches origin, then fast-forwards the loop's worktree to the branch
 * `refs/remotes/origin/HEAD` names, and returns the commit it then sits at. A
 * worktree that is ahead or has diverged refuses. The fetch and the
 * fast-forward are dispatch's only writes before its attempt's folder, and
 * each runs within `timeoutMs`.
 */
export function syncLoopTree(
  tree: LoopTree,
  repo: string,
  timeoutMs: number,
): { baseline: string } | { issues: string[] } {
  const fetched = tree.runGit(
    'git',
    ['fetch', '--quiet', 'origin'],
    tree.folder,
    { timeoutMs },
  );
  if (fetched.code !== 0) {
    return {
      issues: [failed('git fetch origin', tree.folder, fetched.stderr)],
    };
  }
  const origin = originTip(tree, repo);
  if ('issues' in origin) return origin;
  const head = headCommit(tree.runGit, tree.folder);
  if (head === undefined) {
    return { issues: [`${tree.folder}: HEAD names no commit`] };
  }
  return fastForward(tree, head, origin, timeoutMs);
}
