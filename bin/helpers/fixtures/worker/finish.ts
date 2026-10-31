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

// A main checkout whose `docs/` holds the brief for worker `w1`, and that
// worker's worktree on `worktree-w1`, holding one commit and the run report.
// `integrate` fast-forwards the main checkout onto the worker's branch.
export function fixture() {
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
  const worktree = path.join(top, '.claude', 'worktrees', 'w1');
  git(top, 'worktree', 'add', '-q', worktree, '-b', 'worktree-w1');
  fs.writeFileSync(path.join(worktree, 'b.txt'), 'b\n');
  git(worktree, 'add', 'b.txt');
  git(worktree, 'commit', '-q', '-m', 'work');
  const head = git(worktree, 'rev-parse', 'HEAD');
  fs.mkdirSync(path.join(worktree, 'docs'));
  fs.writeFileSync(path.join(worktree, REPORT), REPORT_TEXT);
  const integrate = (): void => {
    git(top, 'merge', '-q', '--ff-only', 'worktree-w1');
  };
  return { top, docs, brief, worktree, head, integrate };
}

export type Fixture = ReturnType<typeof fixture>;

export const ok = (over: Partial<ClaudeResult> = {}): ClaudeResult => ({
  code: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  ...over,
});

// What one `claude rm` prints, and what it removes, as the real one would.
export interface Rm {
  result: ClaudeResult;
  removes: 'everything' | 'the worktree' | 'nothing';
}

export const removed = (removes: Rm['removes'] = 'everything'): Rm => ({
  result: ok({ stdout: `removed ${ID}\n` }),
  removes,
});

// The kept message measured on 2026-10-14, offering the discard line for `sha`.
export const kept = (fx: Fixture, sha: string): Rm => ({
  result: ok({
    stdout: [
      `kept ${ID} — its worktree is still at “${fx.worktree}”`,
      `  1 unpushed commit on “worktree-w1”: ${sha.slice(0, 7)} “work”. It exists on no remote, so deleting the worktree would lose it.`,
      `  push it and run 'claude rm ${ID}' again, or discard the worktree and its commits: claude rm ${ID} --discard-unpushed ${sha}@${WORKTREE_ID}`,
      '',
    ].join('\n'),
  }),
  removes: 'nothing',
});

export interface Call {
  args: string[];
  cwd: string;
}

// Plays `agents --json --all` from `state.agents`, `stop` from `state.stop`,
// and each `rm` from `state.rm` in turn. Any other call fails the test.
// `state.whileStopping` stands for what the worker does before it exits.
export function fakeClaude(fx: Fixture) {
  const calls: Call[] = [];
  const state = {
    agents: JSON.stringify([
      { id: ID, kind: 'background', name: 'w1', state: 'working' },
    ]),
    stop: ok({ stdout: `stopped ${ID}\n` }),
    whileStopping: (): void => {},
    rm: [removed()],
  };
  const sweep = (removes: Rm['removes']): void => {
    if (removes === 'nothing') return;
    git(fx.top, 'worktree', 'remove', '--force', '--force', fx.worktree);
    if (removes === 'everything') git(fx.top, 'branch', '-D', 'worktree-w1');
  };
  const run: ClaudeRunner = (args, opts) => {
    calls.push({ args, cwd: opts.cwd });
    if (args[0] === 'agents') return ok({ stdout: state.agents });
    if (args[0] === 'stop') {
      state.whileStopping();
      return state.stop;
    }
    const rm = args[0] === 'rm' ? state.rm.shift() : undefined;
    if (rm === undefined)
      throw new Error(`unexpected claude ${args.join(' ')}`);
    sweep(rm.removes);
    return rm.result;
  };
  const named = (verb: string): string[][] =>
    calls.filter((c) => c.args[0] === verb).map((c) => c.args);
  return { run, calls, state, named };
}

export function harness(fx: Fixture, over: Partial<WorkerEnv> = {}) {
  const claude = fakeClaude(fx);
  const out: string[] = [];
  const err: string[] = [];
  const slept: number[] = [];
  const wenv: WorkerEnv = {
    env: {},
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
  git(fx.top, 'branch', '--list', 'worktree-w1') !== '';
