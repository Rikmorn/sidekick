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
  ])('%s prints the worker usage and returns 1', (_label, args) => {
    const h = harness();
    expect(h.run(...args)).toBe(1);
    expect(h.err).toEqual([`usage: ${WORKER_USAGE_LINE}`]);
    expect(h.out).toEqual([]);
  });

  test('the usage line names both verbs and every dispatch flag', () => {
    expect(WORKER_USAGE_LINE).toBe(
      'sidekick worker dispatch <brief> --permission-mode <mode> [--profile <name>] [--plugin-dir <dir>] [--allow-push] | finish <brief> [--no-report]',
    );
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
