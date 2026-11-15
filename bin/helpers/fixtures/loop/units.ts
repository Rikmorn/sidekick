/**
 * Test-only. A loop with one unit's attempt in flight, for the tests of the
 * `sidekick loop` unit verbs: the loop's folder and `loop.json`, its repo,
 * the worker's worktree where Claude Code makes it, the attempt's folder as
 * dispatch writes it, the `dispatched` line, and a fake `claude` that lists,
 * stops, respawns, and removes the worker as the real one would. `tsc`
 * checks this file and has no `bun:test` types, so the assertions stay in
 * the test files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LoopEnv } from '../../loop.js';
import { UNIT_REPORT, writeAttempt } from '../../loop-dispatch-attempt.js';
import { appendRecord, type RecordLine } from '../../loop-record.js';
import { readLedger, writeWorkerFile } from '../../loop-units.js';
import { execRunner } from '../../pm-data.js';
import type { ClaudeResult, ClaudeRunner } from '../../profile-launch.js';
import { nativeFolder } from '../../worker-worktree.js';
import { git, repo, tmp } from '../worker/repo.js';

export const LOOP = 'fixer';
export const UNIT = 'fix-bug-42';
export const WORKER = 'fixer-abc123';
export const JOB = 'job-7';
export const ISSUE = 42;
export const WORKER_PID = 9001;
export const NOW = new Date(2026, 10, 15, 10, 20);
export const MINUTE_MS = 60_000;
/** The work cap the fixture's `loop.json` sets, in minutes. */
export const WORK_CAP = 180;
/** The wait cap the fixture's `loop.json` sets, in minutes. */
export const WAIT_CAP = 60;
export const REPORT_TEXT = '# Unit report\n\n## Proposals\n\nNone.\n';

export interface UnitFixtureOptions {
  /** Minutes before `NOW` the attempt was dispatched. */
  dispatchedAgo?: number;
  /** `worker.json`'s job: the listing's id, or null as a timed-out launch leaves it. */
  job?: string | null;
  /** Whether the listing holds the worker's row. */
  listed?: boolean;
  /** Whether the worker's process runs, so its row names a pid. */
  running?: boolean;
  /** Whether the worktree holds the run report, uncommitted as the brief asks. */
  report?: boolean;
}

const ok = (over: Partial<ClaudeResult> = {}): ClaudeResult => ({
  code: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  ...over,
});

const writeJson = (file: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const manifest = (top: string) => ({
  description: 'Fix bugs filed in the repo',
  repo: top,
  profile: LOOP,
  schedule: '7 * * * *',
  tick: '/fixer:tick',
  hosts: [],
  gates: ['bun run test'],
  caps: {
    attemptsPerUnit: 2,
    workMinutesPerUnit: WORK_CAP,
    waitMinutesPerUnit: WAIT_CAP,
    unitsPerDay: 4,
    failedUnitsInARow: 3,
  },
  mandate: { reads: [], classes: {}, never: [] },
});

/** One `claude` call the fake saw. */
export interface ClaudeCall {
  args: string[];
  cwd: string;
}

/**
 * Plays `agents --json --all` from `rows`, `stop` from `stopResult`,
 * `respawn` from `respawnResult`, and `rm` as a clean removal of the
 * worker's worktree and branch. A stop that runs clean ends the row's
 * process, and a respawn that runs clean starts it again as `WORKER_PID`.
 * Any other call fails the test.
 */
function fakeClaude(top: string, worktree: string, alive: Set<number>) {
  const calls: ClaudeCall[] = [];
  const state = {
    rows: [] as Record<string, unknown>[],
    stopResult: ok(),
    respawnResult: ok(),
  };
  const run: ClaudeRunner = (args, opts) => {
    calls.push({ args, cwd: opts.cwd });
    const [verb, id] = args;
    if (verb === 'agents') return ok({ stdout: JSON.stringify(state.rows) });
    if (verb === 'stop') {
      if (state.stopResult.code !== 0) return state.stopResult;
      state.rows = state.rows.map((row) => {
        if (row.id !== id) return row;
        if (typeof row.pid === 'number') alive.delete(row.pid);
        const { pid: _pid, ...rest } = row;
        return { ...rest, state: 'stopped' };
      });
      return state.stopResult;
    }
    if (verb === 'respawn') {
      const { code, timedOut } = state.respawnResult;
      if (code !== 0 || timedOut) return state.respawnResult;
      state.rows = state.rows.map((row) =>
        row.id === id ? { ...row, state: 'working', pid: WORKER_PID } : row,
      );
      alive.add(WORKER_PID);
      return state.respawnResult;
    }
    if (verb === 'rm') {
      git(top, 'worktree', 'remove', '--force', '--force', worktree);
      git(top, 'branch', '-D', `worktree-${WORKER}`);
      state.rows = state.rows.filter((row) => row.id !== id);
      return ok({ stdout: `removed ${id}\n` });
    }
    throw new Error(`unexpected claude ${args.join(' ')}`);
  };
  const named = (verb: string): string[][] =>
    calls.filter((c) => c.args[0] === verb).map((c) => c.args);
  return { run, calls, state, named };
}

/**
 * The loop `fixer` with unit `fix-bug-42` in flight in worker
 * `fixer-abc123`, dispatched `dispatchedAgo` minutes before `NOW`. The
 * worker's worktree holds one commit, and the report when asked.
 */
export function unitFixture({
  dispatchedAgo = 60,
  job = JOB,
  listed = true,
  running = true,
  report = true,
}: UnitFixtureOptions = {}) {
  const home = tmp();
  const config = path.join(home, '.claude');
  const top = repo();
  const loopDir = path.join(config, 'sidekick', 'loops', LOOP);
  writeJson(path.join(loopDir, 'loop.json'), manifest(top));
  const baseline = git(top, 'rev-parse', 'HEAD');
  const worktree = nativeFolder(top, WORKER);
  git(top, 'worktree', 'add', '-q', worktree, '-b', `worktree-${WORKER}`);
  fs.writeFileSync(path.join(worktree, 'b.txt'), 'b\n');
  git(worktree, 'add', 'b.txt');
  git(worktree, 'commit', '-q', '-m', 'work');
  if (report) fs.writeFileSync(path.join(worktree, UNIT_REPORT), REPORT_TEXT);
  const dispatchedAt = new Date(NOW.getTime() - dispatchedAgo * MINUTE_MS);
  const written = writeAttempt({
    loopDir,
    loop: LOOP,
    unit: UNIT,
    worker: WORKER,
    issue: {
      number: ISSUE,
      title: 'Fix the widget',
      body: 'The widget breaks.',
      url: 'https://github.com/acme/widgets/issues/42',
      comments: [],
      dropped: 0,
    },
    skill: 'fixer:fix-bug',
    baseline,
    orchestrator: `loop-${LOOP}`,
    worktree,
    hosts: [],
    gates: [],
    dispatchedAt,
  });
  if ('issues' in written) throw new Error(written.issues.join('\n'));
  const issues = writeWorkerFile(written.dir, {
    v: 1,
    worker: WORKER,
    job,
    issue: ISSUE,
    dispatchedAt: dispatchedAt.toISOString(),
  });
  if (issues.length > 0) throw new Error(issues.join('\n'));
  appendRecord(loopDir, {
    v: 1,
    at: dispatchedAt.toISOString(),
    kind: 'dispatched',
    unit: UNIT,
    worker: WORKER,
    issue: ISSUE,
  });
  const alive = new Set<number>();
  const claude = fakeClaude(top, worktree, alive);
  if (listed) {
    if (running) alive.add(WORKER_PID);
    claude.state.rows.push({
      id: job ?? JOB,
      kind: 'background',
      name: WORKER,
      cwd: worktree,
      state: running ? 'working' : 'stopped',
      ...(running ? { pid: WORKER_PID } : {}),
    });
  }
  const slept: number[] = [];
  const lenv = (over: Partial<LoopEnv> = {}): LoopEnv => ({
    env: { CLAUDE_CONFIG_DIR: config },
    cwd: top,
    home,
    workTree: { kind: 'inside', top },
    tmpdir: tmp(),
    runClaude: claude.run,
    runGit: execRunner,
    write: () => {},
    now: () => NOW,
    bootTime: () => new Date(NOW.getTime() - 600 * MINUTE_MS),
    sleep: (ms) => {
      slept.push(ms);
    },
    isAlive: (pid) => alive.has(pid),
    pid: 4321,
    managedFile: path.join(home, 'managed-settings.json'),
    ...over,
  });
  // Every line of the loop's record, oldest first.
  const ledger = (): RecordLine[] => {
    const read = readLedger(loopDir, NOW);
    if ('issues' in read) throw new Error(read.issues.join('\n'));
    return read.lines;
  };
  return {
    home,
    config,
    top,
    loopDir,
    worktree,
    attempt: written.dir,
    brief: written.briefPath,
    claude,
    alive,
    slept,
    lenv,
    ledger,
  };
}

export type UnitFixture = ReturnType<typeof unitFixture>;

/** The unit whose attempt `unnamedInFlight` puts in flight. */
export const UNNAMED_UNIT = 'triage-7';

/**
 * Closes the fixture's attempt, then puts one in flight for `UNNAMED_UNIT`
 * whose `dispatched` line names no worker, as only a hand-written record has
 * it. Both lines fall within the work cap, so no reap touches them.
 */
export function unnamedInFlight(fx: UnitFixture): void {
  const ago = (minutes: number): string =>
    new Date(NOW.getTime() - minutes * MINUTE_MS).toISOString();
  appendRecord(fx.loopDir, {
    v: 1,
    at: ago(50),
    kind: 'discarded',
    unit: UNIT,
    worker: WORKER,
    reason: 'requeued',
  });
  appendRecord(fx.loopDir, {
    v: 1,
    at: ago(10),
    kind: 'dispatched',
    unit: UNNAMED_UNIT,
  });
}

/** Every entry under `dir`, a folder as `<path>/`, a file with its text. */
export function snapshot(dir: string): Record<string, string> {
  const walk = (at: string): [string, string][] =>
    fs.readdirSync(at, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(at, entry.name);
      const rel = path.relative(dir, full);
      const own: [string, string] = entry.isDirectory()
        ? [`${rel}/`, '']
        : [rel, fs.readFileSync(full, 'utf8')];
      return entry.isDirectory() ? [own, ...walk(full)] : [own];
    });
  return Object.fromEntries(walk(dir));
}
