import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner } from './pm-data.js';
import type { ClaudeResult, ClaudeRunner } from './profile-launch.js';
import { runWorkerCli, type WorkerEnv } from './worker.js';

afterEach(removeTemps);

const ID = '213245a1';
const WORKTREE_ID = '2988dbbac0e06558461ca712ce2c6b7d';
const REPORT = 'docs/run-report.md';
const REPORT_TEXT = '# Run report\n\nDONE\n';

/**
 * A main checkout whose `docs/` holds the brief for worker `w1`, and that
 * worker's worktree on `worktree-w1`, holding one commit and the run report.
 * `integrate` fast-forwards the main checkout onto the worker's branch.
 */
function fixture() {
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

type Fixture = ReturnType<typeof fixture>;

const ok = (over: Partial<ClaudeResult> = {}): ClaudeResult => ({
  code: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  ...over,
});

// What one `claude rm` prints, and what it removes, as the real one would.
interface Rm {
  result: ClaudeResult;
  removes: 'everything' | 'the worktree' | 'nothing';
}

const removed = (removes: Rm['removes'] = 'everything'): Rm => ({
  result: ok({ stdout: `removed ${ID}\n` }),
  removes,
});

// The kept message measured on 2026-10-14, offering the discard line for `sha`.
const kept = (fx: Fixture, sha: string): Rm => ({
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

interface Call {
  args: string[];
  cwd: string;
}

/**
 * Plays `agents --json --all` from `state.agents`, `stop` from `state.stop`,
 * and each `rm` from `state.rm` in turn. Any other call fails the test.
 */
function fakeClaude(fx: Fixture) {
  const calls: Call[] = [];
  const state = {
    agents: JSON.stringify([
      { id: ID, kind: 'background', name: 'w1', state: 'working' },
    ]),
    stop: ok({ stdout: `stopped ${ID}\n` }),
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
    if (args[0] === 'stop') return state.stop;
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

function harness(fx: Fixture, over: Partial<WorkerEnv> = {}) {
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

type Harness = ReturnType<typeof harness>;

const savedReport = (fx: Fixture): string | undefined => {
  const file = path.join(fx.top, REPORT);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : undefined;
};

const branchRemains = (fx: Fixture): boolean =>
  git(fx.top, 'branch', '--list', 'worktree-w1') !== '';

// A refusal before any step: nothing stopped, removed, or copied.
function expectRefusedUntouched(
  h: Harness,
  fx: Fixture,
  code: number,
  line: string,
): void {
  expect(code).toBe(1);
  expect(h.err).toContain(line);
  expect(h.claude.named('stop')).toEqual([]);
  expect(h.claude.named('rm')).toEqual([]);
  expect(savedReport(fx)).toBeUndefined();
  expect(fs.existsSync(fx.worktree)).toBe(true);
}

describe('finish refuses', () => {
  test('when no session has the name', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    h.claude.state.agents = JSON.stringify([
      { id: 'ffff0000', kind: 'background', name: 'other', state: 'done' },
    ]);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      'no session in claude agents --json --all is named "w1": check the name in the brief; finish clears only a worker that claude still lists',
    );
  });

  test('when two sessions have the name', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    h.claude.state.agents = JSON.stringify([
      { id: ID, kind: 'background', name: 'w1', state: 'done' },
      { pid: 7, kind: 'interactive', name: 'w1' },
    ]);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      `2 sessions in claude agents --json --all are named "w1" (${ID}, an interactive session), so finish cannot tell which is the worker: clear the worker by hand with claude rm <id>`,
    );
  });

  test('when the one session by the name is interactive, not a worker job', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    h.claude.state.agents = JSON.stringify([
      { pid: 7, kind: 'interactive', name: 'w1', id: null, state: null },
    ]);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      'the session named "w1" is an interactive session, not a worker job: finish clears only a worker that sidekick worker dispatch started',
    );
  });

  test('work that is not integrated, leaving the discard to claude rm', () => {
    const fx = fixture();
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      `worktree-w1 is not integrated: its head ${fx.head} is not in the main checkout's HEAD. Integrate it and run finish again; discarding it is your call, with claude rm ${ID}`,
    );
  });

  test.each([
    ['a modified tracked file', 'a.txt'],
    ['an untracked file', 'notes/scratch.md'],
  ])('a worktree holding %s besides the report', (_label, file) => {
    const fx = fixture();
    fx.integrate();
    fs.mkdirSync(path.dirname(path.join(fx.worktree, file)), {
      recursive: true,
    });
    fs.writeFileSync(path.join(fx.worktree, file), 'changed\n');
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      `the worktree ${fx.worktree} holds uncommitted work besides the report, which its removal would destroy: ${file}. Commit and integrate it, or remove it, then run finish again`,
    );
  });

  test('a worktree holding a staged rename, naming both of its paths', () => {
    const fx = fixture();
    fx.integrate();
    git(fx.worktree, 'mv', 'a.txt', 'c.txt');
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      `the worktree ${fx.worktree} holds uncommitted work besides the report, which its removal would destroy: c.txt, a.txt. Commit and integrate it, or remove it, then run finish again`,
    );
  });

  test('a worktree folder that is gone', () => {
    const fx = fixture();
    fx.integrate();
    fs.rmSync(fx.worktree, { recursive: true, force: true });
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err).toHaveLength(2);
    expect(h.err[0]).toStartWith(
      `git status failed in the worktree ${fx.worktree}: fatal: cannot change to`,
    );
    expect(h.err[1]).toStartWith('the worktree has no run report');
    expect(h.claude.named('rm')).toEqual([]);
  });

  test('a branch that is gone, leaving the discard to claude rm', () => {
    const fx = fixture();
    fx.integrate();
    git(fx.worktree, 'checkout', '-q', '--detach');
    git(fx.top, 'branch', '-D', 'worktree-w1');
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      `the branch worktree-w1 does not exist, so finish cannot check that the work is integrated: discarding it is your call, with claude rm ${ID}`,
    );
  });

  test('a worktree with no report', () => {
    const fx = fixture();
    fx.integrate();
    fs.rmSync(path.join(fx.worktree, REPORT));
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      `the worktree has no run report at ${path.join(fx.worktree, REPORT)}: ask the worker for it, or pass --no-report to finish without one`,
    );
  });

  test('a different report already in the main checkout', () => {
    const fx = fixture();
    fx.integrate();
    fs.writeFileSync(path.join(fx.top, REPORT), '# Another report\n');
    const h = harness(fx);
    const code = h.finish(fx.brief);
    expect(code).toBe(1);
    expect(h.err).toContain(
      `${path.join(fx.top, REPORT)} already exists and differs from the worker's report at ${path.join(fx.worktree, REPORT)}: move one aside, then run finish again`,
    );
    expect(h.claude.named('rm')).toEqual([]);
    expect(savedReport(fx)).toBe('# Another report\n');
  });

  test('every reason about the worktree at once', () => {
    const fx = fixture();
    fs.rmSync(path.join(fx.worktree, REPORT));
    fs.writeFileSync(path.join(fx.worktree, 'a.txt'), 'changed\n');
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err).toHaveLength(3);
    expect(h.err.join('\n')).toContain('is not integrated');
    expect(h.err.join('\n')).toContain('uncommitted work');
    expect(h.err.join('\n')).toContain('no run report');
  });

  test('a run from a linked worktree, naming the main checkout', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx, { cwd: fx.worktree, workTree: fx.worktree });
    const code = h.finish(fx.brief);
    expect(code).toBe(1);
    expect(h.err).toEqual([
      `${fx.worktree} is a linked worktree: run sidekick worker from the main checkout, whose git dir is ${path.join(fx.top, '.git')}`,
    ]);
    expect(h.claude.calls).toEqual([]);
  });

  test('a brief that fails to parse, and checks nothing else', () => {
    const fx = fixture();
    fs.writeFileSync(fx.brief, 'no frontmatter\n');
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err).toEqual([`${fx.brief}: the brief must open with a --- line`]);
    expect(h.claude.calls).toEqual([]);
  });

  test('a claude stop that fails, before claude rm runs', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    h.claude.state.stop = ok({ code: 1, stderr: 'No running job 213245a1\n' });
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err).toEqual([
      `claude stop ${ID} failed with exit code 1, so finish stopped before claude rm:`,
      'No running job 213245a1',
    ]);
    expect(h.claude.named('rm')).toEqual([]);
    expect(fs.existsSync(fx.worktree)).toBe(true);
  });

  test('a discard line whose sha is not the verified head, without running it', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    const other = 'a'.repeat(40);
    h.claude.state.rm = [kept(fx, other)];
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err[0]).toBe(
      `claude rm offers to discard ${other}, which is not worktree-w1's verified head (${fx.head}), so finish did not run it:`,
    );
    expect(h.err.join('\n')).toContain(`--discard-unpushed ${other}@`);
    expect(h.claude.named('rm')).toEqual([['rm', ID]]);
    expect(fs.existsSync(fx.worktree)).toBe(true);
  });

  test('a claude rm answer it does not know, printing it', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    h.claude.state.rm = [
      {
        result: ok({
          stdout:
            'kept 213245a1 — A Claude Code lock on the worktree names a process that is still running\n',
        }),
        removes: 'nothing',
      },
    ];
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err).toEqual([
      `claude rm ${ID} did not say removed, and finish does not know its answer, so it removed nothing more:`,
      'kept 213245a1 — A Claude Code lock on the worktree names a process that is still running',
    ]);
    expect(fs.existsSync(fx.worktree)).toBe(true);
  });

  test('a lock whose process outlives 15 seconds, before claude rm runs', () => {
    const fx = fixture();
    fx.integrate();
    fs.writeFileSync(
      path.join(fx.top, '.git', 'worktrees', 'w1', 'locked'),
      'claude session w1 (pid 4242 start Tue Oct 14 2026 10:00:00)',
    );
    const h = harness(fx, { isAlive: () => true });
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.slept.reduce((sum, ms) => sum + ms, 0)).toBe(15_000);
    expect(h.err).toEqual([
      "the worktree's lock still names a running process, pid 4242, after 15 s: run finish again once it exits",
    ]);
    expect(h.claude.named('rm')).toEqual([]);
  });
});

describe('finish clears the worker', () => {
  test('by a plain removed: saves the report, stops the job, and runs rm once', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
    expect(savedReport(fx)).toBe(REPORT_TEXT);
    expect(h.claude.named('stop')).toEqual([['stop', ID]]);
    expect(h.claude.named('rm')).toEqual([['rm', ID]]);
    expect(h.out).toEqual([
      `report saved to ${path.join(fx.top, REPORT)}`,
      `session ${ID} removed`,
      `worktree ${fx.worktree} removed`,
      'branch worktree-w1 removed',
    ]);
    expect(h.err).toEqual([]);
    expect(h.slept).toEqual([]);
  });

  test.each([
    'stopped',
    'done',
  ])('without claude stop for a job already %s', (state) => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    h.claude.state.agents = JSON.stringify([
      { id: ID, kind: 'background', name: 'w1', state },
    ]);
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.claude.named('stop')).toEqual([]);
    expect(h.claude.named('rm')).toEqual([['rm', ID]]);
  });

  test('by the discard line, when its sha is the verified head', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    h.claude.state.rm = [kept(fx, fx.head), removed()];
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.claude.named('rm')).toEqual([
      ['rm', ID],
      ['rm', ID, '--discard-unpushed', `${fx.head}@${WORKTREE_ID}`],
    ]);
    expect(h.out).toContain(`session ${ID} removed`);
    expect(fs.existsSync(fx.worktree)).toBe(false);
    expect(branchRemains(fx)).toBe(false);
  });

  test('refusing when the discard line does not end in removed', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    h.claude.state.rm = [kept(fx, fx.head), kept(fx, fx.head)];
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err[0]).toBe(
      `claude rm ${ID} --discard-unpushed ${fx.head}@${WORKTREE_ID} did not say removed, and finish does not know its answer, so it removed nothing more:`,
    );
  });

  test('with the same report already in the main checkout, as on a re-run', () => {
    const fx = fixture();
    fx.integrate();
    fs.writeFileSync(path.join(fx.top, REPORT), REPORT_TEXT);
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.out[0]).toBe(`report already at ${path.join(fx.top, REPORT)}`);
  });

  test('on a re-run after a claude stop that failed', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    h.claude.state.stop = ok({ code: 1, stderr: 'try again\n' });
    expect(h.finish(fx.brief)).toBe(1);
    h.claude.state.stop = ok();
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.out).toContain(`report already at ${path.join(fx.top, REPORT)}`);
    expect(fs.existsSync(fx.worktree)).toBe(false);
  });

  test('with --no-report, when the worktree holds none', () => {
    const fx = fixture();
    fx.integrate();
    fs.rmSync(path.join(fx.worktree, REPORT));
    const h = harness(fx);
    expect(h.finish(fx.brief, '--no-report')).toBe(0);
    expect(h.out[0]).toBe('no report to save: the worktree holds none');
    expect(savedReport(fx)).toBeUndefined();
  });

  test('with --no-report, still saving a report the worktree holds', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    expect(h.finish(fx.brief, '--no-report')).toBe(0);
    expect(savedReport(fx)).toBe(REPORT_TEXT);
  });

  test('from a subfolder, with a relative brief, running claude from the top', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx, { cwd: fx.docs });
    expect(h.finish('x-brief.md')).toBe(0);
    expect(h.claude.calls.length).toBeGreaterThan(0);
    for (const call of h.claude.calls) expect(call.cwd).toBe(fx.top);
    expect(savedReport(fx)).toBe(REPORT_TEXT);
  });

  test('after the process its lock names exits', () => {
    const fx = fixture();
    fx.integrate();
    fs.writeFileSync(
      path.join(fx.top, '.git', 'worktrees', 'w1', 'locked'),
      'claude session w1 (pid 4242 start Tue Oct 14 2026 10:00:00)',
    );
    const asked: number[] = [];
    const h = harness(fx, {
      isAlive: (pid) => {
        asked.push(pid);
        return asked.length <= 2;
      },
    });
    expect(h.finish(fx.brief)).toBe(0);
    expect(asked).toEqual([4242, 4242, 4242]);
    expect(h.slept).toHaveLength(2);
    expect(h.claude.named('rm')).toEqual([['rm', ID]]);
  });

  test.each([
    ['a pid of 0', 'claude session w1 (pid 0 start x)'],
    ['no pid', 'locked by hand'],
  ])('without waiting on a lock with %s', (_label, text) => {
    const fx = fixture();
    fx.integrate();
    fs.writeFileSync(
      path.join(fx.top, '.git', 'worktrees', 'w1', 'locked'),
      text,
    );
    const asked: number[] = [];
    const h = harness(fx, {
      isAlive: (pid) => {
        asked.push(pid);
        return true;
      },
    });
    expect(h.finish(fx.brief)).toBe(0);
    expect(asked).toEqual([]);
    expect(h.slept).toEqual([]);
  });

  test('deleting a branch that survives claude rm with git branch -d', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    h.claude.state.rm = [removed('the worktree')];
    expect(h.finish(fx.brief)).toBe(0);
    expect(branchRemains(fx)).toBe(false);
    expect(h.out).toContain('branch worktree-w1 removed');
  });

  test('refusing when git still lists the worktree after removed', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    h.claude.state.rm = [
      { result: ok({ stdout: `removed ${ID}\n` }), removes: 'nothing' },
    ];
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err).toEqual([
      `claude rm said removed, but git still lists the worktree ${fx.worktree}`,
    ]);
    expect(branchRemains(fx)).toBe(true);
  });
});
