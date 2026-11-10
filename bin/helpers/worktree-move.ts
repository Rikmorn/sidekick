/**
 * `sidekick worktree move <branch> [--from <base>]` and `move --pr <n>`: moves
 * a fresh worktree off `worktree-<name>`, the branch Claude Code made for it,
 * onto the branch its work belongs on, and prints one line. The checks live in
 * `worktree-move-checks.ts`; the move lives here. Its git writes are `fetch`
 * into a remote-tracking ref, `switch --no-overwrite-ignore`, `config`, and
 * `update-ref -d` with the old value. Bash deny rules never see the git a CLI
 * runs, so the verb holds that line itself: it never resets, cleans, or passes
 * `--force` or `-f`.
 */

import type { Runner } from './pm-data.js';
import { shellArg } from './shell.js';
import { statusEntriesIn } from './worker-listing.js';
import { branchExists, commitOf, HEADS } from './worker-repo.js';
import { branchGoneIssues } from './worker-teardown-leftovers.js';
import { nativeBranch } from './worker-worktree.js';
import { clearMark, markKeyOf, markOf, writeMark } from './worktree-mark.js';
import {
  type Base,
  checkMove,
  gitWords,
  type Here,
  type MoveArgs,
  type MoveCheck,
  REMOTE_LIMIT_MS,
} from './worktree-move-checks.js';
import type { Out, WorktreeEnv } from './worktree-read.js';

export { type MoveArgs, parseMoveArgs } from './worktree-move-checks.js';

interface Failed {
  lines: string[];
}

// The switch's arguments after --no-overwrite-ignore, and the remote-tracking
// ref a fetch wrote before it.
interface Start {
  args: string[];
  fetched: string | undefined;
}

// What one plan does: where HEAD lands, the line's fields after the sha, the
// switch, the stale mark it clears, and the step before the drop.
interface Move {
  // The branch HEAD lands on; undefined for a detached HEAD.
  target: string | undefined;
  fields: string[];
  start: (runGit: Runner, here: Here) => Start | Failed;
  // Lines for stderr that leave the exit code 0.
  clear: (runGit: Runner, here: Here, moved: string) => string[];
  settle: (runGit: Runner, here: Here, moved: string) => string[];
}

interface RemoteBranch {
  remote: string;
  branch: string;
}

type Ready = Extract<MoveCheck, { kind: 'ready' }>;

const SEPARATOR = ' · ';
const ORIGIN = 'origin';
const DETACHED = 'a detached HEAD';
const AGAIN_WAY = 'then run move again';

// Quoted for a POSIX shell, as remove's restore line is.
const command = (args: string[]): string =>
  ['git', ...args].map(shellArg).join(' ');

const create = (branch: string, start: string): string[] => [
  '-c',
  branch,
  '--no-track',
  start,
];

const at = (args: string[]): Start => ({ args, fetched: undefined });

const stayedLine = (here: Here): string =>
  `nothing changed in ${here.entry.path}: it is still on ${nativeBranch(here.name)}`;

// The refspec names its destination: under a narrow fetch refspec, a fetch
// of a bare branch name writes only FETCH_HEAD.
function fetchInto(
  runGit: Runner,
  here: Here,
  remote: string,
  refspec: { src: string; dst: string },
): Failed | undefined {
  const spec = `+${refspec.src}:${refspec.dst}`;
  const result = runGit('git', ['fetch', remote, spec], here.entry.path, {
    timeoutMs: REMOTE_LIMIT_MS,
  });
  if (result.code === 0) return undefined;
  return {
    lines: [
      `git fetch ${remote} ${spec} failed: ${gitWords(result.stderr)}`,
      stayedLine(here),
      `check the remote ${remote}, ${AGAIN_WAY}`,
    ],
  };
}

// A new branch at a remote's branch, fetched first and read as a commit.
function fromRemote(
  runGit: Runner,
  here: Here,
  branch: string,
  from: RemoteBranch,
): Start | Failed {
  const dst = `refs/remotes/${from.remote}/${from.branch}`;
  const src = `${HEADS}${from.branch}`;
  const failed = fetchInto(runGit, here, from.remote, { src, dst });
  if (failed !== undefined) return failed;
  const sha = commitOf(runGit, here.entry.path, dst);
  if (sha !== undefined) return { args: create(branch, sha), fetched: dst };
  return {
    lines: [
      `git fetch ${from.remote} left ${dst} naming no commit`,
      stayedLine(here),
      `check the remote ${from.remote}, ${AGAIN_WAY}`,
    ],
  };
}

// GitHub keeps a pull request's head at refs/pull/<n>/head.
function prStart(runGit: Runner, here: Here, number: number): Start | Failed {
  const dst = `refs/remotes/pr/${number}`;
  const src = `refs/pull/${number}/head`;
  const failed = fetchInto(runGit, here, ORIGIN, { src, dst });
  return failed ?? { args: ['--detach', dst], fetched: dst };
}

function newStart(branch: string, base: Base): Move['start'] {
  switch (base.kind) {
    case 'here':
      return (_, here) => at(create(branch, here.created));
    case 'local':
      return () => at(create(branch, base.sha));
    case 'remote':
      return (runGit, here) => fromRemote(runGit, here, branch, base);
    default: {
      const _exhaustive: never = base;
      throw new Error(`Unhandled base: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// `--from` as typed: a remote base is `<remote>/<branch>` by construction.
function baseWords(base: Base): string {
  switch (base.kind) {
    case 'here':
      return "the worktree's commit";
    case 'local':
      return base.rev;
    case 'remote':
      return `${base.remote}/${base.branch}`;
    default: {
      const _exhaustive: never = base;
      throw new Error(`Unhandled base: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// A branch left unmarked is one remove keeps: the safe side.
const markStep =
  (branch: string): Move['settle'] =>
  (runGit, here, moved) => {
    const issues = writeMark(runGit, here.entry.path, branch, here.name);
    if (issues.length === 0) return [];
    const key = markKeyOf(branch);
    return [
      ...issues.map(gitWords),
      `${moved}, and ${branch} stays unmarked, so remove keeps it`,
      `mark it with: ${command(['config', '--local', key, here.name])}`,
    ];
  };

// A mark outlives a worktree another tool removes, and a later worktree of
// that name would then have remove delete a branch move did not make.
const clearStale =
  (branch: string): Move['clear'] =>
  (runGit, here, moved) => {
    const dir = here.entry.path;
    const mark = markOf(runGit, dir, branch);
    if (mark === undefined) return [];
    const issues = clearMark(runGit, dir, branch);
    const key = markKeyOf(branch);
    if (issues.length === 0) {
      return [
        `cleared the stale mark ${key}, which named the worktree ${mark}: move leaves an existing or tracking branch unmarked, so remove keeps ${branch}`,
      ];
    }
    return [
      ...issues.map(gitWords),
      `${moved}, and ${branch} stays marked for the worktree ${mark}, so remove deletes it from a worktree of that name`,
      `clear it with: ${command(['config', '--local', '--unset', key])}`,
    ];
  };

const nothingToClear: Move['clear'] = () => [];

// switch --track exits 128 under a narrow fetch refspec, after it has changed
// the work tree, so the upstream is written as config.
const upstreamStep =
  (branch: string): Move['settle'] =>
  (runGit, here, moved) => {
    const writes = [
      ['config', '--local', `branch.${branch}.remote`, ORIGIN],
      ['config', '--local', `branch.${branch}.merge`, `${HEADS}${branch}`],
    ];
    for (const args of writes) {
      const result = runGit('git', args, here.entry.path);
      if (result.code !== 0) {
        return [
          `${command(args)} failed: ${gitWords(result.stderr)}`,
          `${moved}, and ${branch} has no upstream`,
          `set it with: ${command(writes[0])}`,
          `and: ${command(writes[1])}`,
        ];
      }
    }
    return [];
  };

const settled: Move['settle'] = () => [];

function moveOf(plan: Ready['plan']): Move {
  switch (plan.kind) {
    case 'new':
      return {
        target: plan.branch,
        fields: ['new branch', `from ${baseWords(plan.base)}`],
        start: newStart(plan.branch, plan.base),
        clear: nothingToClear,
        settle: markStep(plan.branch),
      };
    case 'switch':
      return {
        target: plan.branch,
        fields: ['existing branch', `from ${plan.branch}`],
        start: () => at([plan.branch]),
        clear: clearStale(plan.branch),
        settle: settled,
      };
    case 'held':
      return {
        target: plan.own,
        fields: [
          'new branch for a held one',
          `from ${plan.branch}`,
          `land onto ${plan.branch}`,
        ],
        start: () => at(create(plan.own, plan.sha)),
        clear: nothingToClear,
        settle: markStep(plan.own),
      };
    case 'origin': {
      const from = { remote: ORIGIN, branch: plan.branch };
      return {
        target: plan.branch,
        fields: ['tracking branch', `from ${ORIGIN}/${plan.branch}`],
        start: (runGit, here) => fromRemote(runGit, here, plan.branch, from),
        clear: clearStale(plan.branch),
        settle: upstreamStep(plan.branch),
      };
    }
    case 'pr':
      return {
        target: undefined,
        fields: [
          `pull request ${plan.number}, read-only`,
          `from pr/${plan.number}`,
        ],
        start: (runGit, here) => prStart(runGit, here, plan.number),
        clear: nothingToClear,
        settle: settled,
      };
    default: {
      const _exhaustive: never = plan;
      throw new Error(`Unhandled plan: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// The ref HEAD names, `HEAD` when detached, or undefined when git cannot say.
function headRef(runGit: Runner, dir: string): string | undefined {
  const result = runGit(
    'git',
    ['rev-parse', '--symbolic-full-name', 'HEAD'],
    dir,
  );
  return result.code === 0 ? result.stdout.trim() : undefined;
}

function onWords(ref: string | undefined): string {
  if (ref === undefined) return 'a HEAD git cannot read';
  return ref === 'HEAD' ? DETACHED : ref.replace(HEADS, '');
}

// What a failed switch left, read back: git can fail after it has changed the
// work tree. With nothing changed, git's words name the files in the way.
function leftLines(runGit: Runner, here: Here): string[] {
  const dir = here.entry.path;
  const own = nativeBranch(here.name);
  const ref = headRef(runGit, dir);
  const status = statusEntriesIn(runGit, here.repo.top, dir);
  const clean = !('issue' in status) && status.entries.length === 0;
  if (ref === `${HEADS}${own}` && clean) {
    return [
      stayedLine(here),
      `move or delete the files git names, ${AGAIN_WAY}`,
    ];
  }
  const changes =
    'issue' in status
      ? `and git status failed: ${gitWords(status.issue)}`
      : `changed paths: ${status.entries.length}`;
  return [
    `git left ${dir} on ${onWords(ref)}, ${changes}`,
    `check git status in ${dir} before you run move again`,
  ];
}

// --no-overwrite-ignore: a plain switch replaces an ignored file the target
// tracks, and exits 0.
function switchTo(
  runGit: Runner,
  here: Here,
  start: Start,
): Failed | undefined {
  const args = ['switch', '--no-overwrite-ignore', ...start.args];
  const result = runGit('git', args, here.entry.path);
  if (result.code === 0) return undefined;
  const fetched =
    start.fetched === undefined
      ? []
      : [`${start.fetched} holds the fetched commit`];
  return {
    lines: [
      `${command(args)} failed: ${gitWords(result.stderr)}`,
      ...fetched,
      ...leftLines(runGit, here),
    ],
  };
}

// HEAD's commit after the switch. The drop runs only once HEAD has left
// worktree-<name>, since update-ref -d deletes a checked-out branch too.
function landed(
  runGit: Runner,
  here: Here,
  target: string | undefined,
): string | Failed {
  const dir = here.entry.path;
  const want = target === undefined ? 'HEAD' : `${HEADS}${target}`;
  const ref = headRef(runGit, dir);
  const sha = commitOf(runGit, dir, 'HEAD');
  if (ref === want && sha !== undefined) return sha;
  const own = nativeBranch(here.name);
  return {
    lines: [
      `git switch exited 0, but ${dir} is on ${onWords(ref)}, not ${target ?? DETACHED}`,
      `move marked nothing and kept ${own}: check git status in ${dir}, ${AGAIN_WAY}`,
    ],
  };
}

// worktree-<name> holds no commits of its own: the checks found HEAD at its
// creation commit.
function dropLines(runGit: Runner, here: Here, moved: string): string[] {
  const dir = here.entry.path;
  const own = nativeBranch(here.name);
  const issues = branchGoneIssues(runGit, dir, own, here.created);
  if (issues.length === 0) return [];
  if (branchExists(runGit, dir, own)) {
    const remove = ['update-ref', '-d', `${HEADS}${own}`, here.created];
    return [
      ...issues.map(gitWords),
      `${moved}, and ${own} stays at its creation commit ${here.created}, holding no commits of its own`,
      `delete it with: ${command(remove)}`,
    ];
  }
  const section = ['config', '--remove-section', `branch.${own}`];
  return [
    ...issues.map(gitWords),
    `${moved}, and ${own} is gone, but its config section stays`,
    `drop it with: ${command(section)}`,
  ];
}

const fail = (lines: string[], err: Out): number => {
  for (const line of lines) err(line);
  return 1;
};

// The fetch, the switch, a stale mark cleared, then the mark or upstream and
// the drop, each running in the worktree's folder.
function makeMove(runGit: Runner, ready: Ready, out: Out, err: Out): number {
  const { here } = ready;
  const move = moveOf(ready.plan);
  const start = move.start(runGit, here);
  if ('lines' in start) return fail(start.lines, err);
  const switchFailed = switchTo(runGit, here, start);
  if (switchFailed !== undefined) return fail(switchFailed.lines, err);
  const sha = landed(runGit, here, move.target);
  if (typeof sha !== 'string') return fail(sha.lines, err);
  const moved = `the worktree moved to ${move.target ?? DETACHED} at ${sha}`;
  const notes = move.clear(runGit, here, moved);
  const issues = [
    ...move.settle(runGit, here, moved),
    ...dropLines(runGit, here, moved),
  ];
  if (issues.length > 0) return fail([...notes, ...issues], err);
  for (const line of notes) err(line);
  out([move.target ?? 'detached', sha, ...move.fields].join(SEPARATOR));
  return 0;
}

/** Moves the worktree holding `env.cwd` as `args` asks; returns the exit code. */
export function moveWorktree(
  args: MoveArgs,
  env: WorktreeEnv,
  out: Out,
  err: Out,
): number {
  const checked = checkMove(args, env, err);
  switch (checked.kind) {
    case 'refused':
      return fail(checked.lines, err);
    case 'already':
      out(checked.line);
      return 0;
    case 'ready':
      return makeMove(env.runGit, checked, out, err);
    default: {
      const _exhaustive: never = checked;
      throw new Error(`Unhandled check: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
