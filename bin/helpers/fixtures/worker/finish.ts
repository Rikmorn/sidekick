/**
 * Test-only. The fixture, the fake `claude`, and the harness for the
 * `sidekick worker finish` tests. `tsc` checks this file and has no `bun:test`
 * types, so the assertions stay in the test files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execRunner } from '../../pm-data.js';
import type { ClaudeResult, ClaudeRunner } from '../../profile-launch.js';
import { runWorkerCli, type WorkerEnv } from '../../worker.js';
import { git, repo, tmp } from './repo.js';

export const ID = '213245a1';
export const WORKTREE_ID = '2988dbbac0e06558461ca712ce2c6b7d';
export const REPORT = 'docs/run-report.md';
export const REPORT_TEXT = '# Run report\n\nDONE\n';
/** The worker's session id, which its listing row and its transcript carry. */
export const SESSION_ID = '0b5e1c2a-7d4f-4e6b-9a1c-3f2e8d7c6b5a';

const besides: string[] = [];

/**
 * A folder beside `top`, named `<top><suffix>`, as worktrunk places a
 * worktree. `removeTemps` does not reach it, so each test file that uses it
 * registers `afterEach(removeBesides)`.
 */
export function beside(top: string, suffix: string): string {
  const dir = `${top}${suffix}`;
  besides.push(dir);
  return dir;
}

/** Removes every folder `beside` named since the last call. */
export function removeBesides(): void {
  for (const dir of besides.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Writes Claude Code's transcript of the worker's session under `configDir`,
 * with `start` as its first entry, and returns the file.
 */
export function writeTranscript(
  configDir: string,
  start: Record<string, unknown>,
): string {
  const folder = path.join(configDir, 'projects', 'worker-project');
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `${SESSION_ID}.jsonl`);
  fs.writeFileSync(file, `${JSON.stringify(start)}\n`);
  return file;
}

export interface FixtureOptions {
  /** Where the worker's worktree goes, given the main checkout's top. */
  worktree?: (top: string) => string;
  /** The worker's branch. */
  branch?: string;
}

// Claude Code's own place for worker w1's worktree.
const nativeWorktree = (top: string): string =>
  path.join(top, '.claude', 'worktrees', 'w1');

// A main checkout whose `docs/` holds the brief for worker `w1`, and that
// worker's worktree, by default Claude Code's own on `worktree-w1`, holding one
// commit and the run report. The worker's transcript, under `configDir`, says
// it started in the worktree on its branch. `integrate` fast-forwards the main
// checkout onto the worker's branch.
export function fixture({
  worktree: placeWorktree = nativeWorktree,
  branch = 'worktree-w1',
}: FixtureOptions = {}) {
  const top = repo();
  const docs = path.join(top, 'docs');
  fs.mkdirSync(docs);
  const brief = path.join(docs, 'x-brief.md');
  fs.writeFileSync(
    brief,
    [
      '---',
      'name: w1',
      `plan: ${path.join(docs, 'plan.md')}`,
      `spec: ${path.join(docs, 'spec.md')}`,
      `rulings: ${path.join(docs, 'rulings.md')}`,
      `baseline: ${git(top, 'rev-parse', 'HEAD')}`,
      'skill: subagent-driven-development',
      'place: worktree',
      `report: ${REPORT}`,
      'orchestrator: orch',
      '---',
      '',
    ].join('\n'),
  );
  const worktree = placeWorktree(top);
  git(top, 'worktree', 'add', '-q', worktree, '-b', branch);
  fs.writeFileSync(path.join(worktree, 'b.txt'), 'b\n');
  git(worktree, 'add', 'b.txt');
  git(worktree, 'commit', '-q', '-m', 'work');
  const head = git(worktree, 'rev-parse', 'HEAD');
  fs.mkdirSync(path.join(worktree, 'docs'));
  fs.writeFileSync(path.join(worktree, REPORT), REPORT_TEXT);
  const configDir = tmp();
  const transcript = writeTranscript(configDir, {
    cwd: worktree,
    gitBranch: branch,
  });
  const integrate = (): void => {
    git(top, 'merge', '-q', '--ff-only', branch);
  };
  // Puts the worker's commit into `cwd`'s checked-out branch as a new commit
  // (a rebase landing) or as one squash commit. Cherry-pick writes nothing to
  // stderr, which `git merge --squash` would.
  const apply = (cwd: string, how: 'rebase' | 'squash'): void => {
    if (how === 'rebase') {
      git(cwd, 'cherry-pick', head);
      return;
    }
    git(cwd, 'cherry-pick', '--no-commit', head);
    git(cwd, 'commit', '-q', '-m', 'squash');
  };
  // Commits something unrelated on the main checkout, then lands the worker's
  // work there as a new commit.
  const landOnMain = (how: 'rebase' | 'squash'): void => {
    fs.writeFileSync(path.join(top, 'c.txt'), 'c\n');
    git(top, 'add', 'c.txt');
    git(top, 'commit', '-q', '-m', 'unrelated');
    apply(top, how);
  };
  // Lands the work on a new branch the main checkout does not check out, from
  // a short-lived worktree of its own.
  const landOnBranch = (name: string, how: 'rebase' | 'squash'): void => {
    git(top, 'branch', name);
    const side = path.join(tmp(), 'side');
    git(top, 'worktree', 'add', '-q', side, name);
    apply(side, how);
    git(top, 'worktree', 'remove', '--force', side);
  };
  // A branch with no history in common with the main checkout's.
  const orphan = (name: string): void => {
    const root = git(top, 'commit-tree', 'HEAD^{tree}', '-m', 'orphan');
    git(top, 'branch', name, root);
  };
  return {
    top,
    docs,
    brief,
    worktree,
    branch,
    head,
    configDir,
    transcript,
    integrate,
    landOnMain,
    landOnBranch,
    orphan,
  };
}

export type Fixture = ReturnType<typeof fixture>;

export const ok = (over: Partial<ClaudeResult> = {}): ClaudeResult => ({
  code: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  ...over,
});

/**
 * What one `claude rm` prints, and what it removes, as the real one would.
 * `tracked files` deletes the worktree's tracked files and leaves its `.git`.
 */
export interface Rm {
  result: ClaudeResult;
  removes: 'everything' | 'the worktree' | 'tracked files' | 'nothing';
  // A side effect that runs after the removal, as the repo changing mid-rm.
  during?: () => void;
}

export const removed = (removes: Rm['removes'] = 'everything'): Rm => ({
  result: ok({ stdout: `removed ${ID}\n` }),
  removes,
});

/**
 * A `claude rm` cut short, as #267's re-run found it: the tracked files gone,
 * the worktree and its `.git` file left, and no answer. It exits non-zero, as
 * a killed run does; `finish` sets `claude rm` no limit, so it never times out.
 */
export const cutShort = (): Rm => ({
  result: ok({ code: 1 }),
  removes: 'tracked files',
});

// The kept message measured on 2026-10-14, offering the discard line for `sha`.
export const kept = (fx: Fixture, sha: string): Rm => ({
  result: ok({
    stdout: [
      `kept ${ID} — its worktree is still at “${fx.worktree}”`,
      `  1 unpushed commit on “${fx.branch}”: ${sha.slice(0, 7)} “work”. It exists on no remote, so deleting the worktree would lose it.`,
      `  push it and run 'claude rm ${ID}' again, or discard the worktree and its commits: claude rm ${ID} --discard-unpushed ${sha}@${WORKTREE_ID}`,
      '',
    ].join('\n'),
  }),
  removes: 'nothing',
});

export interface Call {
  args: string[];
  cwd: string;
  timeoutMs: number;
}

// Every file git tracks in the worktree, deleted from disk.
function deleteTracked(fx: Fixture): void {
  const files = git(fx.worktree, 'ls-files', '-z').split('\0');
  for (const file of files.filter((f) => f !== '')) {
    fs.rmSync(path.join(fx.worktree, file));
  }
}

// The worktree's status as `claude rm` meets it, each untracked file by name.
const statusNow = (fx: Fixture): string =>
  fs.existsSync(fx.worktree)
    ? git(fx.worktree, 'status', '--porcelain', '--untracked-files=all')
    : '(no worktree)';

/**
 * The worker's row in `claude agents --json --all`: a background job whose
 * session started in the worktree. `over` replaces or adds fields.
 */
export const agentRow = (
  fx: Fixture,
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: ID,
  kind: 'background',
  name: 'w1',
  state: 'working',
  cwd: fx.worktree,
  sessionId: SESSION_ID,
  ...over,
});

/**
 * Plays `agents --json --all` from `state.agents`, `stop` from `state.stop`,
 * and each `rm` from `state.rm` in turn. Any other call fails the test.
 * `state.whileStopping` stands for what the worker does before it exits.
 * `statusAtRm` keeps the worktree's status at each `rm`, before it removes.
 */
export function fakeClaude(fx: Fixture) {
  const calls: Call[] = [];
  const statusAtRm: string[] = [];
  const state = {
    agents: JSON.stringify([agentRow(fx)]),
    stop: ok({ stdout: `stopped ${ID}\n` }),
    whileStopping: (): void => {},
    rm: [removed()],
  };
  const sweep = (removes: Rm['removes']): void => {
    if (removes === 'nothing') return;
    if (removes === 'tracked files') {
      deleteTracked(fx);
      return;
    }
    git(fx.top, 'worktree', 'remove', '--force', '--force', fx.worktree);
    if (removes === 'everything') git(fx.top, 'branch', '-D', fx.branch);
  };
  const run: ClaudeRunner = (args, opts) => {
    calls.push({ args, cwd: opts.cwd, timeoutMs: opts.timeoutMs });
    if (args[0] === 'agents') return ok({ stdout: state.agents });
    if (args[0] === 'stop') {
      state.whileStopping();
      return state.stop;
    }
    const rm = args[0] === 'rm' ? state.rm.shift() : undefined;
    if (rm === undefined)
      throw new Error(`unexpected claude ${args.join(' ')}`);
    statusAtRm.push(statusNow(fx));
    sweep(rm.removes);
    rm.during?.();
    return rm.result;
  };
  const named = (verb: string): string[][] =>
    calls.filter((c) => c.args[0] === verb).map((c) => c.args);
  return { run, calls, state, named, statusAtRm };
}

export function harness(fx: Fixture, over: Partial<WorkerEnv> = {}) {
  const claude = fakeClaude(fx);
  const out: string[] = [];
  const err: string[] = [];
  const slept: number[] = [];
  const wenv: WorkerEnv = {
    env: { CLAUDE_CONFIG_DIR: fx.configDir },
    cwd: fx.top,
    home: '/home/test',
    workTree: fx.top,
    tmpdir: tmp(),
    runClaude: claude.run,
    write: () => {},
    runGit: execRunner,
    sleep: (ms) => {
      slept.push(ms);
    },
    isAlive: () => false,
    ...over,
  };
  const finish = (...args: string[]) =>
    runWorkerCli(
      ['finish', ...args],
      wenv,
      (l) => out.push(l),
      (l) => err.push(l),
    );
  return { claude, out, err, slept, finish };
}

export type Harness = ReturnType<typeof harness>;

export const savedReport = (fx: Fixture): string | undefined => {
  const file = path.join(fx.top, REPORT);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : undefined;
};

export const branchRemains = (fx: Fixture): boolean =>
  git(fx.top, 'branch', '--list', fx.branch) !== '';
