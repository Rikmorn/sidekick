import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { enterWorktreeFetch, FETCH_LIMIT_MS } from './enter-worktree-fetch.js';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import {
  execRunner,
  type Runner,
  type RunResult,
  TIMED_OUT,
} from './pm-data.js';

afterEach(removeTemps);

interface Call {
  cmd: string;
  args: string[];
  cwd: string;
  timeoutMs: number | undefined;
}

/** A Runner that records each call; `fetchResult` answers the fetch. */
function recorder(
  head: RunResult,
  fetchResult: RunResult | 'throw' = { code: 0, stdout: '', stderr: '' },
): { runGit: Runner; calls: Call[] } {
  const calls: Call[] = [];
  const runGit: Runner = (cmd, args, cwd, opts) => {
    calls.push({ cmd, args, cwd, timeoutMs: opts?.timeoutMs });
    if (args[0] !== 'fetch') return head;
    if (fetchResult === 'throw') throw new Error('spawn failed');
    return fetchResult;
  };
  return { runGit, calls };
}

const HEAD_OK: RunResult = { code: 0, stdout: 'origin/main\n', stderr: '' };
const HEAD_NONE: RunResult = { code: 1, stdout: '', stderr: '' };

const event = (toolInput: unknown, cwd: unknown = '/work'): string =>
  JSON.stringify({
    hook_event_name: 'PreToolUse',
    tool_name: 'EnterWorktree',
    cwd,
    tool_input: toolInput,
  });

const FETCH_ARGS = [
  'fetch',
  'origin',
  '+refs/heads/main:refs/remotes/origin/main',
];

describe('enterWorktreeFetch, creating events', () => {
  for (const [label, input] of [
    ['a name', { name: 'feature' }],
    ['neither name nor path', {}],
  ] as const) {
    test(`a call with ${label} reads origin/HEAD, then fetches in the event's cwd`, () => {
      const { runGit, calls } = recorder(HEAD_OK);
      enterWorktreeFetch(event(input), runGit);
      expect(calls).toHaveLength(2);
      expect(calls[0]?.args).toEqual([
        'symbolic-ref',
        '-q',
        '--short',
        'refs/remotes/origin/HEAD',
      ]);
      expect(calls[1]).toEqual({
        cmd: 'git',
        args: FETCH_ARGS,
        cwd: '/work',
        timeoutMs: 5000,
      });
      expect(FETCH_LIMIT_MS).toBe(5000);
    });
  }

  test('no origin/HEAD runs no fetch', () => {
    const { runGit, calls } = recorder(HEAD_NONE);
    enterWorktreeFetch(event({ name: 'x' }), runGit);
    expect(calls.map((c) => c.args[0])).toEqual(['symbolic-ref']);
  });

  test('a failed fetch throws nothing', () => {
    const { runGit } = recorder(HEAD_OK, {
      code: 128,
      stdout: '',
      stderr: 'x',
    });
    expect(() => enterWorktreeFetch(event({}), runGit)).not.toThrow();
  });

  test('a timed-out fetch throws nothing', () => {
    const { runGit } = recorder(HEAD_OK, {
      code: TIMED_OUT,
      stdout: '',
      stderr: 'slow',
    });
    expect(() => enterWorktreeFetch(event({}), runGit)).not.toThrow();
  });

  test('a runner that throws is swallowed', () => {
    const { runGit } = recorder(HEAD_OK, 'throw');
    expect(() => enterWorktreeFetch(event({}), runGit)).not.toThrow();
  });
});

describe('enterWorktreeFetch, events that run no git', () => {
  const cases: [string, string][] = [
    ['a call with path', event({ path: '/elsewhere' })],
    ['a call with name and path', event({ name: 'x', path: '/elsewhere' })],
    ['malformed JSON', '{not json'],
    ['an empty stdin', ''],
    ['a non-object event', '42'],
    ['no cwd', JSON.stringify({ tool_name: 'EnterWorktree', tool_input: {} })],
    ['a non-string cwd', event({}, 7)],
    ['an empty cwd', event({}, '')],
    ['a tool_input that is not an object', event('name')],
    [
      'no tool_input',
      JSON.stringify({ tool_name: 'EnterWorktree', cwd: '/w' }),
    ],
    [
      'another tool',
      JSON.stringify({ tool_name: 'Read', cwd: '/w', tool_input: {} }),
    ],
  ];
  for (const [label, stdin] of cases) {
    test(label, () => {
      const { runGit, calls } = recorder(HEAD_OK);
      enterWorktreeFetch(stdin, runGit);
      expect(calls).toEqual([]);
    });
  }
});

describe('enterWorktreeFetch with real git', () => {
  test("a creating event moves the repo's origin/<default> to the remote's new commit", () => {
    // The sandbox blocks `git push`, so the bare remote takes each commit by
    // fetching from the working repo.
    const feed = (bare: string, from: string): void => {
      git(bare, 'fetch', '-q', from, '+refs/heads/main:refs/heads/main');
    };
    const first = repo();
    git(first, 'branch', '-M', 'main');
    const bare = tmp();
    git(bare, 'init', '-q', '--bare', '-b', 'main');
    feed(bare, first);
    git(first, 'remote', 'add', 'origin', bare);
    git(first, 'fetch', '-q', 'origin');
    git(first, 'remote', 'set-head', 'origin', 'main');
    const before = git(first, 'rev-parse', 'origin/main');

    fs.writeFileSync(path.join(first, 'b.txt'), 'b\n');
    git(first, 'add', 'b.txt');
    git(first, 'commit', '-q', '-m', 'new');
    feed(bare, first);
    const after = git(first, 'rev-parse', 'HEAD');
    expect(after).not.toBe(before);
    expect(git(first, 'rev-parse', 'origin/main')).toBe(before);

    enterWorktreeFetch(event({ name: 'x' }, first), execRunner);
    expect(git(first, 'rev-parse', 'origin/main')).toBe(after);
  });
});
