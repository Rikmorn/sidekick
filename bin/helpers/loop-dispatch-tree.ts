/**
 * The loop's worktree as `sidekick loop dispatch` checks and moves it. It
 * must be a linked worktree of the loop's repo on the loop's branch, with
 * clean tracked files, and it holds nothing of its own, so dispatch
 * fast-forwards it to origin's default branch before a worker branches from
 * it. Every git call into it runs through the hardened runner, after the
 * chain check.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { isControl } from './loop-record.js';
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

const ASK_ORIGIN = ['ls-remote', '--symref', 'origin', 'HEAD'];
// `ls-remote --symref` prints `ref: refs/heads/<branch>\tHEAD`, then
// `<object id>\tHEAD`.
const SYMREF = /^ref: refs\/heads\/(.+)$/;
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const REPORT_COLUMNS = 2;
// A `\uXXXX` escape: four hex digits.
const HEX = 16;
const UNICODE_DIGITS = 4;
// Characters and sequences git's ref names forbid. A branch without them, or
// a control character, carries no revision syntax into the tracking ref's
// lookup, and prints plainly.
const NOT_IN_REF = /[\s~^:?*[\\]|\.\.|@\{/;
const isBranchName = (name: string): boolean =>
  !NOT_IN_REF.test(name) && ![...name].some(isControl);

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

const hasEntry = (at: string): boolean => {
  try {
    fs.lstatSync(at);
    return true;
  } catch {
    return false;
  }
};

// Replace refs and a grafts file change what a commit holds, or its parents,
// for every git call but the hardened ones. Claude Code makes the next
// worker's worktree with git of its own, so either would reach it.
function rewriteIssues(
  run: Runner,
  folder: string,
  { repo, commonDir }: { repo: string; commonDir: string },
): string[] {
  const listed = run(
    'git',
    ['for-each-ref', '--format=%(refname)', 'refs/replace/'],
    folder,
  );
  const refs =
    listed.code === 0
      ? listed.stdout.split('\n').filter((line) => line !== '')
      : [];
  const grafts = path.join(commonDir, 'info', 'grafts');
  return [
    ...(listed.code === 0
      ? []
      : [failed('git for-each-ref refs/replace/', folder, listed.stderr)]),
    ...refs.map(
      (ref) =>
        `${ref} replaces an object for every git call that reads replace refs, the next worker's worktree included: once you know where it came from, delete it with git update-ref -d ${ref} in ${repo}`,
    ),
    ...(hasEntry(grafts)
      ? [
          `${grafts} rewrites commits' parents for every git call, the next worker's worktree included: once you know where it came from, remove it`,
        ]
      : []),
  ];
}

/**
 * Checks the loop's worktree, `<repo>/.claude/worktrees/loop-<name>`: it
 * exists, its link to the repo holds with the admin folder's name
 * `loop-<name>`, it holds the branch `worktree-loop-<name>`, and its tracked
 * files are clean. The shared repo holds no replace ref and no grafts file.
 * `start` never checks it, so this is its first check.
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
  const commonDir = realPathOf(path.join(repo, '.git'));
  const chain = chainOf(folder, commonDir, session);
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
    ...rewriteIssues(run, folder, { repo, commonDir }),
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

// Origin's default branch and its commit, as origin itself reports them.
interface OriginReport {
  branch: string;
  tip: string;
}

// The `HEAD` lines of `ls-remote --symref`: one names the branch, one the
// commit. Every line holds a value and a name, so a line with any other
// number of columns, or anything else, reads as no report.
function parseReport(stdout: string): OriginReport | undefined {
  const rows = stdout
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split('\t'));
  if (rows.some((row) => row.length !== REPORT_COLUMNS)) return undefined;
  const values = rows
    .filter(([, name]) => name === 'HEAD')
    .map(([value]) => value);
  const branches = values.flatMap((value) => {
    const named = SYMREF.exec(value);
    return named !== null && isBranchName(named[1]) ? [named[1]] : [];
  });
  const tips = values.filter((value) => OBJECT_ID.test(value));
  const isOneOfEach =
    values.length === 2 && branches.length === 1 && tips.length === 1;
  return isOneOfEach ? { branch: branches[0], tip: tips[0] } : undefined;
}

// Origin's own report of its default branch and its commit, so the base
// never follows the local symref, which a worker can repoint. It reaches
// origin, so it takes the sync's limit.
function askOrigin(
  tree: LoopTree,
  timeoutMs: number,
): OriginReport | { issues: string[] } {
  const asked = tree.runGit('git', ASK_ORIGIN, tree.folder, { timeoutMs });
  const shown = `git ${ASK_ORIGIN.join(' ')}`;
  if (asked.code !== 0) {
    return { issues: [failed(shown, tree.folder, asked.stderr)] };
  }
  const report = parseReport(asked.stdout);
  return (
    report ?? {
      issues: [
        `${shown} in ${tree.folder} printed what dispatch cannot read as one branch and its commit, so dispatch cannot tell origin's default branch: ${quoted(asked.stdout)}`,
      ],
    }
  );
}

// What git printed, quoted with every control character escaped, and cut at
// `max` characters, since origin decides how much it prints.
function quoted(text: string, max = 200): string {
  const chars = [...text];
  const json = JSON.stringify(chars.slice(0, max).join(''));
  // JSON escapes C0 controls, but not DEL or C1.
  const escaped = [...json]
    .map((ch) =>
      isControl(ch)
        ? `\\u${ch.charCodeAt(0).toString(HEX).padStart(UNICODE_DIGITS, '0')}`
        : ch,
    )
    .join('');
  return chars.length > max ? `${escaped} (cut short)` : escaped;
}

const trackingRef = (branch: string): string => `refs/remotes/origin/${branch}`;

// After the fetch, the commit origin reported is here, and the branch's
// tracking ref is at it.
function trackingIssues(
  tree: LoopTree,
  repo: string,
  { branch, tip }: OriginReport,
): string[] {
  const tracking = trackingRef(branch);
  const isHere = commitOf(tree.runGit, tree.folder, tip) === tip;
  const tracked = commitOf(tree.runGit, tree.folder, tracking);
  if (isHere && tracked === tip) return [];
  const where =
    tracked === undefined
      ? `${tracking} names no commit`
      : `${tracking} is at ${tracked}`;
  const here = isHere ? `${tip} is in ${repo}` : `${tip} is not in ${repo}`;
  return [
    `origin reports ${branch} at ${tip}, but after the fetch ${where}, and ${here}: origin may have moved during the fetch, so run dispatch again; or remote.origin.fetch in ${repo} may not map refs/heads/${branch} to ${tracking}, and then dispatch refuses on every run until it does`,
  ];
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
 * Asks origin for its default branch and that branch's commit, fetches
 * origin, then fast-forwards the loop's worktree to that commit, and returns
 * the commit it then sits at. A report that cannot be read, a fetch that
 * leaves the branch's tracking ref elsewhere, and a worktree that is ahead or
 * has diverged each refuse. The fetch and the fast-forward are dispatch's only
 * writes before its attempt's folder, and each of the three runs within
 * `timeoutMs`.
 */
export function syncLoopTree(
  tree: LoopTree,
  repo: string,
  timeoutMs: number,
): { baseline: string } | { issues: string[] } {
  const report = askOrigin(tree, timeoutMs);
  if ('issues' in report) return report;
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
  const tracking = trackingIssues(tree, repo, report);
  if (tracking.length > 0) return { issues: tracking };
  const head = headCommit(tree.runGit, tree.folder);
  if (head === undefined) {
    return { issues: [`${tree.folder}: HEAD names no commit`] };
  }
  // The full ref, since a worker can shadow the short name, such as with a
  // tag or branch named `origin/<branch>`.
  const shown = trackingRef(report.branch);
  return fastForward(tree, head, { shown, tip: report.tip }, timeoutMs);
}
