/**
 * The checks of `sidekick worktree move`, which change nothing: where it runs,
 * whether it already ran, the refusals that keep a worktree as it is, and the
 * move each branch needs. Its git is read-only, `ls-remote` included.
 * `worktree-move.ts` runs them, then the move.
 */

import * as path from 'node:path';
import { findRepo, type Repo } from './desk-children.js';
import type { Runner } from './pm-data.js';
import { parseFlags } from './profile.js';
import { shellArg } from './shell.js';
import { statusEntriesIn, type WorktreeEntry } from './worker-listing.js';
import { readRecords } from './worker-record.js';
import {
  branchExists,
  checkoutOf,
  commitOf,
  creationCommit,
  HEADS,
  physical,
} from './worker-repo.js';
import { nativeBranch, shortBranch } from './worker-worktree.js';
import { markKeyOf, markOf } from './worktree-mark.js';
import { type Out, omittedWords, type WorktreeEnv } from './worktree-read.js';
import { isWorkers, type Omitted } from './worktree-state.js';

export type MoveArgs =
  | { kind: 'branch'; branch: string; from: string | undefined }
  | { kind: 'pr'; number: number };

type BranchArgs = Extract<MoveArgs, { kind: 'branch' }>;

const DIGITS = /^\d+$/;

/** `move <branch> [--from <base>]` or `move --pr <n>`; undefined when the arguments fit neither. */
export function parseMoveArgs(rest: string[]): MoveArgs | undefined {
  const parsed = parseFlags(rest, {
    from: { type: 'string' },
    pr: { type: 'string' },
  });
  if (parsed === undefined) return undefined;
  const { values, positionals } = parsed;
  const from = typeof values.from === 'string' ? values.from : undefined;
  if (typeof values.pr === 'string') {
    const number = Number(values.pr);
    const fits =
      positionals.length === 0 &&
      from === undefined &&
      DIGITS.test(values.pr) &&
      Number.isSafeInteger(number) &&
      number > 0;
    return fits ? { kind: 'pr', number } : undefined;
  }
  if (positionals.length !== 1 || from === '') return undefined;
  return { kind: 'branch', branch: positionals[0], from };
}

/** The fresh worktree `move` runs in. `created` is `worktree-<name>`'s creation commit, which is also its HEAD. */
export interface Here {
  repo: Repo;
  entry: WorktreeEntry;
  /** The worktree folder's last segment. */
  name: string;
  created: string;
}

/** Where the new branch starts. `remote` is fetched before it resolves. */
export type Base =
  | { kind: 'here' }
  | { kind: 'local'; rev: string; sha: string }
  | { kind: 'remote'; remote: string; branch: string };

/** One kind of move: by where `<branch>` is, or to a pull request's head. */
export type MovePlan =
  | { kind: 'new'; branch: string; base: Base }
  | { kind: 'switch'; branch: string }
  | { kind: 'held'; branch: string; own: string; sha: string; heldAt: string }
  | { kind: 'origin'; branch: string }
  | { kind: 'pr'; number: number };

export type MoveCheck =
  | { kind: 'refused'; lines: string[] }
  | { kind: 'already'; line: string }
  | { kind: 'ready'; here: Here; plan: MovePlan };

type Refused = Extract<MoveCheck, { kind: 'refused' }>;

const refuse = (...lines: string[]): Refused => ({ kind: 'refused', lines });

// The worktree before its creation commit is read.
type Place = Omit<Here, 'created'>;

const ORIGIN = 'origin';
const SEPARATOR = ' · ';
// How many changed paths a refusal names before it counts the rest.
const PATHS_CAP = 20;
// ls-remote --exit-code exits 2 when no ref matches.
const NO_MATCH = 2;

const INSIDE_WAY =
  'run move inside the worktree EnterWorktree or claude -w made';
const FRESH_WAY =
  'move runs only on a fresh worktree: start one with EnterWorktree or claude -w';
const BRIEF_WAY = "a worker's brief sets its branch, not move";
const AGAIN_WAY = 'then run move again';

// git opens a fatal message with this prefix, which a refusal line drops.
const FATAL = /^fatal: /;

/** git's message on one line, since each line move prints holds one finding. */
export const gitWords = (stderr: string): string =>
  stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join(' ');

// The linked worktree holding cwd, from the checkout git says holds it. Only
// findRepo's warnings go to err, since the refusal names a missing repository.
function whereItRuns(env: WorktreeEnv, err: Out): Place | Refused {
  const found = findRepo(env.runGit, env.cwd);
  for (const warning of found.warnings) err(warning);
  const repo = found.repo;
  if (repo === undefined) {
    return refuse(`move found no repository at ${env.cwd}: ${INSIDE_WAY}`);
  }
  const checkout = checkoutOf(env.runGit, env.cwd);
  if ('issue' in checkout) {
    return refuse(
      `${env.cwd} is in no work tree, as git says: ${gitWords(checkout.issue)}`,
      INSIDE_WAY,
    );
  }
  const top = physical(checkout.top);
  const at = repo.worktrees.findIndex((entry) => physical(entry.path) === top);
  if (at === 0) {
    return refuse(
      `${checkout.top} is the main checkout, not a linked worktree: ${INSIDE_WAY}`,
    );
  }
  if (at === -1) {
    return refuse(`git lists no worktree at ${checkout.top}: ${INSIDE_WAY}`);
  }
  const entry = repo.worktrees[at];
  return { repo, entry, name: path.basename(entry.path) };
}

const heldElsewhere = (place: Place, branch: string): boolean =>
  place.repo.worktrees.some(
    (entry) => entry !== place.entry && entry.branch === `${HEADS}${branch}`,
  );

// On <branch>, other than Claude Code's own; or, for the held row, on its own
// name's branch, marked for it, while <branch> is held elsewhere.
function onBranchMoved(
  runGit: Runner,
  place: Place,
  on: string | undefined,
  branch: string,
): boolean {
  const { entry, name } = place;
  if (on === branch) return branch !== nativeBranch(name);
  const ownMarked = on === name && markOf(runGit, entry.path, name) === name;
  return ownMarked && heldElsewhere(place, branch);
}

// Whether a move already left the worktree where `args` asks.
function isMoved(
  runGit: Runner,
  place: Place,
  args: MoveArgs,
  on: string | undefined,
): boolean {
  switch (args.kind) {
    case 'branch':
      return onBranchMoved(runGit, place, on, args.branch);
    case 'pr': {
      const pr = `refs/remotes/pr/${args.number}`;
      const head = place.entry.head;
      return (
        on === undefined && commitOf(runGit, place.entry.path, pr) === head
      );
    }
    default: {
      const _exhaustive: never = args;
      throw new Error(`Unhandled args: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// The re-run's line, `<branch or detached> · <sha> · already moved`.
function rerunLine(
  runGit: Runner,
  place: Place,
  args: MoveArgs,
): string | undefined {
  const { entry } = place;
  if (entry.head === undefined) return undefined;
  const on = entry.branch === undefined ? undefined : shortBranch(entry.branch);
  if (!isMoved(runGit, place, args, on)) return undefined;
  return [on ?? 'detached', entry.head, 'already moved'].join(SEPARATOR);
}

// A worker's session, by its environment, or a worker's worktree, by its
// record. A record that will not read may be this worktree's worker's.
function workerRefusal(env: WorktreeEnv, place: Place): Refused | undefined {
  const brief = env.env.SIDEKICK_WORKER;
  if (brief !== undefined && brief !== '') {
    return refuse(
      `this session is a worker, as SIDEKICK_WORKER is set to ${brief}: ${BRIEF_WAY}`,
    );
  }
  const stored = readRecords(place.repo.commonDir);
  const record = stored.records.find((candidate) =>
    isWorkers(place.repo.top, candidate.name, place.entry),
  );
  if (record !== undefined) {
    return refuse(
      `${place.entry.path} is the worker ${record.name}'s worktree: ${BRIEF_WAY}`,
    );
  }
  if (stored.warnings.length === 0) return undefined;
  return refuse(
    `a worker record would not read, so ${place.entry.path} may be that worker's worktree: ${stored.warnings.join('; ')}`,
    `fix or remove the named record, ${AGAIN_WAY}`,
  );
}

// The held row's branch left without this worktree's mark when its mark
// failed: the line that marks it lets a re-run find the move done.
const markWay = (name: string): string => {
  const mark = ['git', 'config', '--local', markKeyOf(name), name];
  return `if move made ${name} and could not mark it, mark it with: ${mark.map(shellArg).join(' ')}, ${AGAIN_WAY}`;
};

function branchRefusal(runGit: Runner, place: Place): Refused | undefined {
  const { entry, name } = place;
  const own = nativeBranch(name);
  if (entry.branch === `${HEADS}${own}`) return undefined;
  if (entry.branch === undefined) {
    return refuse(
      `${entry.path} has a detached HEAD at ${entry.head ?? 'no commit'}, not ${own}`,
      FRESH_WAY,
    );
  }
  const found = `${entry.path} is on ${shortBranch(entry.branch)}, not ${own}`;
  const onOwnNameNotMarkedForIt =
    entry.branch === `${HEADS}${name}` &&
    markOf(runGit, entry.path, name) !== name;
  if (onOwnNameNotMarkedForIt) return refuse(found, markWay(name), FRESH_WAY);
  return refuse(found, FRESH_WAY);
}

// Ignored files are not read: .worktreeinclude copies some into every new worktree.
function changesRefusal(runGit: Runner, place: Place): Refused | undefined {
  const { entry } = place;
  const status = statusEntriesIn(runGit, place.repo.top, entry.path);
  if ('issue' in status) {
    return refuse(
      `git status failed in ${entry.path}, so move cannot tell whether it has changes: ${gitWords(status.issue)}`,
      `check git status in ${entry.path}, ${AGAIN_WAY}`,
    );
  }
  if (status.entries.length === 0) return undefined;
  const paths = status.entries.map((e) => e.path);
  const omitted: Omitted = {
    kind: 'exact',
    count: Math.max(0, paths.length - PATHS_CAP),
  };
  return refuse(
    `${entry.path} has tracked or untracked changes: ${paths.slice(0, PATHS_CAP).join(', ')}${omittedWords(omitted)}`,
    `take them out of the worktree or delete them, ${AGAIN_WAY}`,
  );
}

const commitCount = (count: number): string =>
  `${count} ${count === 1 ? 'commit' : 'commits'}`;

// The clause counting commits on top of base; empty when head is not ahead of it.
function onTopWords(runGit: Runner, dir: string, base: string, head: string) {
  const result = runGit(
    'git',
    ['rev-list', '--count', `${base}..${head}`],
    dir,
  );
  const count = Number(result.stdout.trim());
  if (result.code !== 0 || !Number.isSafeInteger(count)) {
    return `, with commits git rev-list could not count (${gitWords(result.stderr)}) on top of it`;
  }
  if (count === 0) return '';
  return `, with ${commitCount(count)} on top of it`;
}

// The creation commit, when HEAD still sits on it.
function freshHead(runGit: Runner, place: Place): string | Refused {
  const { entry, name } = place;
  const created = creationCommit(runGit, entry.path, entry.branch);
  if ('issue' in created) {
    return refuse(
      `move cannot tell whether ${entry.path} is fresh: ${created.issue}`,
      FRESH_WAY,
    );
  }
  if (entry.head === created.sha) return created.sha;
  const head = entry.head ?? 'no commit';
  const onTop = onTopWords(runGit, entry.path, created.sha, head);
  return refuse(
    `the HEAD of ${entry.path} is ${head}, not ${nativeBranch(name)}'s creation commit ${created.sha}${onTop}`,
    FRESH_WAY,
  );
}

// git's verdict on the name, and the name `@{-N}` stands for.
function nameRefusal(
  runGit: Runner,
  dir: string,
  branch: string,
): Refused | undefined {
  const verdict = branchNameOf(runGit, dir, branch);
  if ('issue' in verdict) {
    return refuse(
      `git check-ref-format refuses ${branch}: ${verdict.issue}`,
      'choose another name',
    );
  }
  if (verdict.read === branch) return undefined;
  return refuse(
    `git reads ${branch} as the branch ${verdict.read}: name it as ${verdict.read}`,
  );
}

// The name `git check-ref-format --branch` reads `name` as, which differs for
// `@{-N}`, or git's words, less `fatal: `, when it refuses the name.
function branchNameOf(
  runGit: Runner,
  dir: string,
  name: string,
): { read: string } | { issue: string } {
  const result = runGit('git', ['check-ref-format', '--branch', name], dir);
  if (result.code !== 0) {
    return { issue: gitWords(result.stderr).replace(FATAL, '') };
  }
  return { read: result.stdout.trim() };
}

// A name git takes as a branch as typed, so a refspec built from it fetches one branch.
function isPlainBranchName(runGit: Runner, dir: string, name: string): boolean {
  const verdict = branchNameOf(runGit, dir, name);
  return 'read' in verdict && verdict.read === name;
}

function remotesOf(runGit: Runner, dir: string): string[] | Refused {
  const result = runGit('git', ['remote'], dir);
  if (result.code !== 0) {
    return refuse(
      `git remote failed in ${dir}: ${gitWords(result.stderr)}`,
      `check git remote in ${dir}, ${AGAIN_WAY}`,
    );
  }
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

// The longest remote `name` is, or begins with as a path segment.
const remoteOf = (name: string, remotes: string[]): string | undefined =>
  remotes
    .filter((remote) => name === remote || name.startsWith(`${remote}/`))
    .sort((a, b) => b.length - a.length)[0];

function ambiguityRefusal(
  branch: string,
  remotes: string[],
): Refused | undefined {
  const remote = remoteOf(branch, remotes);
  if (remote === undefined) return undefined;
  if (remote === branch) {
    return refuse(
      `${branch} is a remote's name, so it reads as that remote: choose another name`,
    );
  }
  const rest = branch.slice(remote.length + 1);
  return refuse(
    `${branch} begins with ${remote}/, a remote's name, so it reads as a branch of ${remote}: name it without the remote, as ${rest}`,
  );
}

const fromRefusal = (branch: string, where: string): Refused =>
  refuse(
    `${branch} exists${where}, and --from asks move to create it: drop --from to move onto it`,
  );

// The held row names its branch after the worktree, and git refuses some
// folder names as a branch, such as HEAD or one that begins with a dot.
function ownNameRefusal(
  runGit: Runner,
  place: Place,
  heldAt: string,
  branch: string,
): Refused | undefined {
  const { entry, name } = place;
  const verdict = branchNameOf(runGit, entry.path, name);
  if ('read' in verdict && verdict.read === name) return undefined;
  const why =
    'issue' in verdict
      ? `git refuses ${name} as a branch name: ${verdict.issue}`
      : `git reads ${name} as the branch ${verdict.read}`;
  return refuse(
    `${heldAt} holds ${branch}, so move would create a branch named for this worktree, ${name}, but ${why}`,
    `start a worktree under a name git takes as a branch and run move there, or land the work onto ${branch} from another worktree`,
  );
}

// A local branch: Claude Code's own refuses, one another checkout holds gets a
// branch of the worktree's name, and a free one is switched to.
function localPlan(
  runGit: Runner,
  place: Place,
  branch: string,
): MovePlan | Refused {
  const { entry, name } = place;
  if (branch === nativeBranch(name)) {
    return refuse(
      `${branch} is the branch Claude Code made for this worktree, which move replaces: name the branch to move onto`,
    );
  }
  const holder = place.repo.worktrees.find(
    (other) => other.branch === `${HEADS}${branch}`,
  );
  if (holder === undefined) return { kind: 'switch', branch };
  const badName = ownNameRefusal(runGit, place, holder.path, branch);
  if (badName !== undefined) return badName;
  const sha = commitOf(runGit, entry.path, `${HEADS}${branch}`);
  if (sha === undefined) {
    return refuse(
      `${branch} names no commit, so move cannot branch from it`,
      `check ${branch} in ${holder.path}, ${AGAIN_WAY}`,
    );
  }
  if (branchExists(runGit, entry.path, name)) {
    return refuse(
      `${holder.path} holds ${branch}, so move would create the branch ${name} at its commit, but ${name} exists`,
      `switch ${holder.path} to another branch, or start a worktree under another name, ${AGAIN_WAY}`,
    );
  }
  return { kind: 'held', branch, own: name, sha, heldAt: holder.path };
}

// Whether origin has `branch`, matched whole: ls-remote matches a pattern
// against the tail of each ref, so `feat` also matches `refs/heads/x/feat`.
function onOrigin(
  runGit: Runner,
  dir: string,
  branch: string,
): boolean | Refused {
  const ref = `${HEADS}${branch}`;
  const result = runGit(
    'git',
    ['ls-remote', '--exit-code', '--heads', ORIGIN, ref],
    dir,
  );
  if (result.code === NO_MATCH) return false;
  if (result.code !== 0) {
    return refuse(
      `git ls-remote origin failed, so move cannot tell whether origin has ${branch}: ${gitWords(result.stderr)}`,
      `check the remote origin, ${AGAIN_WAY}`,
    );
  }
  return result.stdout.split('\n').some((line) => line.split('\t')[1] === ref);
}

// `<remote>/<b>` is a remote's branch when `<b>` is a branch name as typed and
// no local branch has the whole name. Anything else, such as `origin/main~1`,
// resolves as a commit from the last fetch.
function baseOf(
  runGit: Runner,
  dir: string,
  from: string | undefined,
  remotes: string[],
): Base | Refused {
  if (from === undefined) return { kind: 'here' };
  const remote = remoteOf(from, remotes);
  const remoteBranch =
    remote === undefined ? '' : from.slice(remote.length + 1);
  const isRemoteBranch =
    remote !== undefined &&
    remoteBranch !== '' &&
    isPlainBranchName(runGit, dir, remoteBranch) &&
    !branchExists(runGit, dir, from);
  if (isRemoteBranch) {
    return { kind: 'remote', remote, branch: remoteBranch };
  }
  const sha = commitOf(runGit, dir, from);
  if (sha === undefined) {
    return refuse(
      `--from ${from} names no commit: give a branch, tag, or commit, or <remote>/<branch> for a remote's branch`,
    );
  }
  return { kind: 'local', rev: from, sha };
}

function branchPlan(
  runGit: Runner,
  place: Place,
  args: BranchArgs,
  remotes: string[],
): MovePlan | Refused {
  const { branch, from } = args;
  const dir = place.entry.path;
  if (branchExists(runGit, dir, branch)) {
    return localPlan(runGit, place, branch);
  }
  const remote = remotes.includes(ORIGIN)
    ? onOrigin(runGit, dir, branch)
    : false;
  if (typeof remote !== 'boolean') return remote;
  if (remote) {
    return from === undefined
      ? { kind: 'origin', branch }
      : fromRefusal(branch, ' on origin');
  }
  const base = baseOf(runGit, dir, from, remotes);
  if (base.kind === 'refused') return base;
  return { kind: 'new', branch, base };
}

// git's verdict on the name, a remote's prefix, and --from on a local branch
// refuse first; then the kind of move `<branch>` needs.
function branchMove(
  runGit: Runner,
  place: Place,
  args: BranchArgs,
): MovePlan | Refused {
  const dir = place.entry.path;
  const named = nameRefusal(runGit, dir, args.branch);
  if (named !== undefined) return named;
  const remotes = remotesOf(runGit, dir);
  if (!Array.isArray(remotes)) return remotes;
  const ambiguous = ambiguityRefusal(args.branch, remotes);
  if (ambiguous !== undefined) return ambiguous;
  if (args.from !== undefined && branchExists(runGit, dir, args.branch)) {
    return fromRefusal(args.branch, '');
  }
  return branchPlan(runGit, place, args, remotes);
}

function prMove(
  runGit: Runner,
  place: Place,
  number: number,
): MovePlan | Refused {
  const remotes = remotesOf(runGit, place.entry.path);
  if (!Array.isArray(remotes)) return remotes;
  if (remotes.includes(ORIGIN)) return { kind: 'pr', number };
  return refuse(
    `--pr reads pull requests from origin, and this repository has no remote named origin: add the GitHub remote as origin, ${AGAIN_WAY}`,
  );
}

/** Every check before a move, in order; changes nothing. */
export function checkMove(
  args: MoveArgs,
  env: WorktreeEnv,
  err: Out,
): MoveCheck {
  const { runGit } = env;
  const place = whereItRuns(env, err);
  if ('lines' in place) return place;
  const line = rerunLine(runGit, place, args);
  if (line !== undefined) return { kind: 'already', line };
  const unfresh =
    workerRefusal(env, place) ??
    branchRefusal(runGit, place) ??
    changesRefusal(runGit, place);
  if (unfresh !== undefined) return unfresh;
  const created = freshHead(runGit, place);
  if (typeof created !== 'string') return created;
  const plan =
    args.kind === 'pr'
      ? prMove(runGit, place, args.number)
      : branchMove(runGit, place, args);
  if (plan.kind === 'refused') return plan;
  return { kind: 'ready', here: { ...place, created }, plan };
}
