import { describe, expect, test } from 'bun:test';
import type { ClaudeResult, ClaudeRunner } from './profile-launch.js';
import { listJobs } from './worker-jobs.js';

interface Call {
  args: string[];
  opts: { cwd: string; timeoutMs: number };
}

function runner(result: Partial<ClaudeResult>) {
  const calls: Call[] = [];
  const run: ClaudeRunner = (args, opts) => {
    calls.push({ args, opts });
    return { code: 0, stdout: '', stderr: '', timedOut: false, ...result };
  };
  return { run, calls };
}

describe('listJobs', () => {
  test('runs agents --json --all in cwd within thirty seconds', () => {
    const r = runner({ stdout: '[]' });
    expect(listJobs(r.run, '/repo')).toEqual({ jobs: [] });
    expect(r.calls).toEqual([
      {
        args: ['agents', '--json', '--all'],
        opts: { cwd: '/repo', timeoutMs: 30_000 },
      },
    ]);
  });

  test('parses background and interactive rows, ignoring unknown keys', () => {
    const listing = [
      {
        id: '213245a1',
        kind: 'background',
        name: 'w1',
        state: 'done',
        cwd: '/repo/.claude/worktrees/w1',
        sessionId: 'abc',
        startedAt: 1,
      },
      { pid: 4242, kind: 'interactive', status: 'idle', id: null },
    ];
    const r = runner({ stdout: JSON.stringify(listing) });
    expect(listJobs(r.run, '/repo')).toEqual({
      jobs: [
        { id: '213245a1', kind: 'background', name: 'w1', state: 'done' },
        {
          id: undefined,
          kind: 'interactive',
          name: undefined,
          state: undefined,
        },
      ],
    });
  });

  test.each([
    ['not JSON', 'oops', 'is not JSON'],
    ['not an array', '{"jobs":[]}', 'does not parse'],
    ['a row that is not an object', '[1]', 'does not parse'],
    ['a row that is an array', '[[]]', 'does not parse'],
    ['a field of the wrong type', '[{"name":7}]', 'does not parse'],
  ])('refuses a listing that is %s', (_label, stdout, phrase) => {
    const result = listJobs(runner({ stdout }).run, '/repo');
    expect('issues' in result).toBe(true);
    if (!('issues' in result)) return;
    expect(result.issues[0]).toContain('claude agents --json --all');
    expect(result.issues[0]).toContain(phrase);
  });

  test('refuses a failed or timed-out run, printing its text', () => {
    const failed = listJobs(
      runner({ code: 2, stderr: 'unknown command' }).run,
      '/repo',
    );
    expect(failed).toEqual({
      issues: [
        'claude agents --json --all failed with exit code 2.',
        'unknown command',
      ],
    });
    const slow = listJobs(runner({ code: 1, timedOut: true }).run, '/repo');
    expect(slow).toEqual({
      issues: ['claude agents --json --all did not return in time.'],
    });
  });
});
