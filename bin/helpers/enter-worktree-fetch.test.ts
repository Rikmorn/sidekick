import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  enterWorktreeFetch,
  FETCH_LIMIT_MS,
  type FetchDeps,
} from './enter-worktree-fetch.js';
import {
  git,
  removeTemps,
  repoWithOrigin,
  tmp,
} from './fixtures/worker/repo.js';
import {
  execRunner,
  type Runner,
  type RunResult,
  TIMED_OUT,
} from './pm-data.js';
import { readBrief } from './worker-brief.js';

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

// A main's deps: no SIDEKICK_WORKER, so the home is never read.
const depsOf = (
  runGit: Runner,
  env: NodeJS.ProcessEnv = {},
  home = '/no-home',
): FetchDeps => ({ runGit, env, home });

const FETCH_ARGS = [
  'fetch',
  '--no-recurse-submodules',
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
      enterWorktreeFetch(event(input), depsOf(runGit));
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
    enterWorktreeFetch(event({ name: 'x' }), depsOf(runGit));
    expect(calls.map((c) => c.args[0])).toEqual(['symbolic-ref']);
  });

  test('a failed fetch throws nothing', () => {
    const { runGit } = recorder(HEAD_OK, {
      code: 128,
      stdout: '',
      stderr: 'x',
    });
    expect(() => enterWorktreeFetch(event({}), depsOf(runGit))).not.toThrow();
  });

  test('a timed-out fetch throws nothing', () => {
    const { runGit } = recorder(HEAD_OK, {
      code: TIMED_OUT,
      stdout: '',
      stderr: 'slow',
    });
    expect(() => enterWorktreeFetch(event({}), depsOf(runGit))).not.toThrow();
  });

  test('a runner that throws is swallowed', () => {
    const { runGit } = recorder(HEAD_OK, 'throw');
    expect(() => enterWorktreeFetch(event({}), depsOf(runGit))).not.toThrow();
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
      enterWorktreeFetch(stdin, depsOf(runGit));
      expect(calls).toEqual([]);
    });
  }
});

// What a worker can plant in its worktree for a fetch to reach: an embedded
// repo staged as a gitlink, a `.gitmodules` that has fetch recurse into it,
// and the embedded repo's own `core.sshCommand`, which makes `marker`. Its
// remote names an ssh host, so the planted command stands in for ssh.
function plantSubmoduleFetch(worktree: string, marker: string): void {
  const nested = path.join(worktree, 'nested');
  fs.mkdirSync(nested);
  git(nested, 'init', '-q', '-b', 'main');
  git(nested, 'config', 'user.name', 'test');
  git(nested, 'config', 'user.email', 'test@example.com');
  git(nested, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(nested, 'n.txt'), 'n\n');
  git(nested, 'add', 'n.txt');
  git(nested, 'commit', '-q', '-m', 'n');
  git(nested, 'remote', 'add', 'origin', 'ssh://example.invalid/x');
  git(nested, 'config', 'core.sshCommand', `touch '${marker}'; false`);
  fs.writeFileSync(
    path.join(worktree, '.gitmodules'),
    '[submodule "nested"]\n\tpath = nested\n\turl = ./nested\n\tfetchRecurseSubmodules = true\n',
  );
  git(worktree, 'add', '.gitmodules', 'nested');
}

// A brief of `kind` in `dir`, with the fields `readBrief` checks.
function writeBrief(kind: 'unit' | 'plan', dir: string): string {
  const fields =
    kind === 'unit'
      ? [
          'kind: unit',
          `unit: ${dir}/unit.md`,
          'skill: plug:skill',
          'report: unit-report.md',
        ]
      : [
          `plan: ${dir}/plan.md`,
          `spec: ${dir}/spec.md`,
          'skill: subagent-driven-development',
          'report: docs/report.md',
        ];
  const brief = path.join(dir, 'brief.md');
  fs.writeFileSync(
    brief,
    [
      '---',
      ...fields,
      'name: w1',
      `rulings: ${dir}/rulings.md`,
      'baseline: abc1234',
      'place: worktree',
      'orchestrator: orch',
      '---',
      '',
    ].join('\n'),
  );
  return brief;
}

describe("enterWorktreeFetch, by the session's role", () => {
  test('a unit worker, marked by its brief, runs no git', () => {
    const { runGit, calls } = recorder(HEAD_OK);
    const brief = writeBrief('unit', tmp());
    expect(readBrief(brief)).toMatchObject({ brief: { kind: 'unit' } });
    const env = { SIDEKICK_WORKER: brief };
    enterWorktreeFetch(event({ name: 'x' }), depsOf(runGit, env, tmp()));
    expect(calls).toEqual([]);
  });

  test("a unit worker, marked by a path under a loop's units folder, runs no git", () => {
    const { runGit, calls } = recorder(HEAD_OK);
    const home = tmp();
    const brief = path.join(
      home,
      '.claude',
      'sidekick',
      'loops',
      'fixer',
      'units',
      'fix-bug-42',
      'w1',
      'brief.md',
    );
    const env = { SIDEKICK_WORKER: brief };
    enterWorktreeFetch(event({ name: 'x' }), depsOf(runGit, env, home));
    expect(calls).toEqual([]);
  });

  test('a plan worker and a main each fetch', () => {
    const brief = writeBrief('plan', tmp());
    expect(readBrief(brief)).toMatchObject({ brief: { kind: 'plan' } });
    const plan = { SIDEKICK_WORKER: brief };
    for (const env of [plan, {}, { SIDEKICK_WORKER: '' }]) {
      const { runGit, calls } = recorder(HEAD_OK);
      enterWorktreeFetch(event({ name: 'x' }), depsOf(runGit, env, tmp()));
      expect(calls.map((c) => c.args)).toEqual([
        ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'],
        FETCH_ARGS,
      ]);
    }
  });
});

describe('enterWorktreeFetch with real git', () => {
  test("a creating event moves the repo's origin/<default> to the remote's new commit", () => {
    const { top, advance } = repoWithOrigin();
    const before = git(top, 'rev-parse', 'origin/main');
    const after = advance();
    expect(after).not.toBe(before);
    expect(git(top, 'rev-parse', 'origin/main')).toBe(before);

    enterWorktreeFetch(event({ name: 'x' }, top), depsOf(execRunner));
    expect(git(top, 'rev-parse', 'origin/main')).toBe(after);
  });

  test("the fetch runs no command an embedded repo's config names, where a plain fetch does", () => {
    const { top, advance } = repoWithOrigin();
    const worktree = path.join(tmp(), 'wt');
    git(top, 'worktree', 'add', '-q', '-b', 'worktree-u1', worktree);
    const marker = path.join(tmp(), 'ssh-ran');
    plantSubmoduleFetch(worktree, marker);
    // The control: a plain fetch there runs the planted command.
    execRunner(
      'git',
      ['fetch', 'origin', '+refs/heads/main:refs/remotes/origin/main'],
      worktree,
    );
    expect(fs.existsSync(marker)).toBe(true);
    fs.rmSync(marker);

    const after = advance();
    enterWorktreeFetch(event({ name: 'x' }, worktree), depsOf(execRunner));
    expect(git(top, 'rev-parse', 'origin/main')).toBe(after);
    expect(fs.existsSync(marker)).toBe(false);
  });
});
