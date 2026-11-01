import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { execRunner } from './pm-data.js';
import {
  processIsAlive,
  runWorkerCli,
  sleepSync,
  WORKER_USAGE_LINE,
  type WorkerEnv,
} from './worker.js';

const noClaude = (): never => {
  throw new Error('no claude in tests');
};

function harness() {
  const out: string[] = [];
  const err: string[] = [];
  const wenv: WorkerEnv = {
    env: {},
    cwd: '/nowhere',
    home: '/home/test',
    workTree: undefined,
    tmpdir: '/nowhere',
    runClaude: noClaude,
    write: () => {},
    runGit: execRunner,
    sleep: () => {},
    isAlive: () => false,
  };
  const run = (...args: string[]) =>
    runWorkerCli(
      args,
      wenv,
      (l) => out.push(l),
      (l) => err.push(l),
    );
  return { out, err, run };
}

describe('runWorkerCli', () => {
  test.each([
    ['no verb', []],
    ['an unknown verb', ['nope']],
    ['dispatch with no brief', ['dispatch', '--permission-mode', 'auto']],
    ['dispatch with two briefs', ['dispatch', 'a.md', 'b.md']],
    ['dispatch with an unknown flag', ['dispatch', 'a.md', '--force']],
    [
      'dispatch with a flag missing its value',
      ['dispatch', 'a.md', '--profile'],
    ],
    [
      'dispatch with an empty --plugin-dir',
      ['dispatch', 'a.md', '--plugin-dir', ''],
    ],
    ['finish with no brief', ['finish', '--no-report']],
    ['finish with two briefs', ['finish', 'a.md', 'b.md']],
    ['finish with an unknown flag', ['finish', 'a.md', '--force']],
    ['finish with a value on --no-report', ['finish', 'a.md', '--no-report=x']],
    [
      'finish with both a brief and --name',
      ['finish', 'a.md', '--name', 'w1', '--discard'],
    ],
    ['finish with --name missing its value', ['finish', '--name']],
    [
      'finish with --into and --discard under --name',
      ['finish', '--name', 'w1', '--into', 'main', '--discard'],
    ],
    ['finish with an empty --worktree', ['finish', 'a.md', '--worktree', '']],
    [
      'finish with --worktree missing its value',
      ['finish', 'a.md', '--worktree'],
    ],
  ])('%s prints the worker usage and returns 1', (_label, args) => {
    const h = harness();
    expect(h.run(...args)).toBe(1);
    expect(h.err).toEqual([`usage: ${WORKER_USAGE_LINE}`]);
    expect(h.out).toEqual([]);
  });

  test('the usage line names both verbs and every flag of each', () => {
    expect(WORKER_USAGE_LINE).toBe(
      'sidekick worker dispatch <brief> --permission-mode <mode> [--profile <name>] [--plugin-dir <dir>] [--allow-push] | finish (<brief> | --name <name>) [--no-report] [--into <rev> | --discard] [--worktree <path>]',
    );
  });
});

const NEEDS_REPORT =
  '--name needs --no-report or --discard, since there is no brief to say where the run report goes';
const NEEDS_INTO =
  '--name needs --into <rev> or --discard, since there is no brief to name the target';

describe('runWorkerCli finish --name', () => {
  test.each([
    ['without --no-report', ['--into', 'main'], [NEEDS_REPORT]],
    ['in landed mode without --into', ['--no-report'], [NEEDS_INTO]],
    ['with neither', [], [NEEDS_REPORT, NEEDS_INTO]],
  ])('%s names the flags it needs and returns 1', (_label, flags, lines) => {
    const h = harness();
    expect(h.run('finish', '--name', 'w1', ...flags)).toBe(1);
    expect(h.err).toEqual(lines);
    expect(h.out).toEqual([]);
  });

  test("refuses a name the brief's rule refuses, before the flags it needs", () => {
    const h = harness();
    expect(h.run('finish', '--name', 'W 1')).toBe(1);
    expect(h.err).toEqual([
      `--name "W 1" is not a worker's name: it must match ^[a-z0-9][a-z0-9-]{0,39}$`,
    ]);
    expect(h.out).toEqual([]);
  });

  test('takes --discard alone, which needs no report and no target', () => {
    const h = harness();
    expect(h.run('finish', '--name', 'w1', '--discard')).toBe(1);
    expect(h.err).toEqual([
      'not inside a git work tree: run sidekick worker from a checkout of the repo',
    ]);
  });
});

describe('the process seams', () => {
  test('sleepSync blocks for at least the time asked', () => {
    const start = performance.now();
    sleepSync(20);
    expect(performance.now() - start).toBeGreaterThanOrEqual(19);
  });

  test('processIsAlive is true for this process and false for a reaped one', () => {
    expect(processIsAlive(process.pid)).toBe(true);
    const gone = spawnSync('true').pid;
    expect(gone).toBeGreaterThan(0);
    expect(processIsAlive(gone)).toBe(false);
  });
});
