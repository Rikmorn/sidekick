import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  branchRemains,
  cutShort,
  type Fixture,
  fixture,
  type Harness,
  harness,
  ID,
  kept,
  ok,
  REPORT,
  REPORT_TEXT,
  type Rm,
  removed,
  savedReport,
  WORKTREE_ID,
} from './fixtures/worker/finish.js';
import { git, removeTemps } from './fixtures/worker/repo.js';
import { execRunner, type Runner } from './pm-data.js';
import { SHORT_SHA } from './worker-finish.js';
import {
  readRecords,
  type WorkerRecord,
  writeRecord,
} from './worker-record.js';

afterEach(removeTemps);

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

// The way out after a claude rm answer finish cannot read: the re-run, then the hand route.
const wayOut = (rerun: string, hand: string): string =>
  `run finish again with ${rerun}, which restores any files claude rm deleted, then runs claude rm again; or complete the removal by hand with ${hand}`;

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
      'no session in claude agents --json --all is named "w1". If finish already removed it, clear any worktree or branch it left by hand; otherwise check the name in the brief',
    );
  });

  test('on a re-run after a finish that removed the worker, naming that cause', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
    h.claude.state.agents = JSON.stringify([]);
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err).toEqual([
      'no session in claude agents --json --all is named "w1". If finish already removed it, clear any worktree or branch it left by hand; otherwise check the name in the brief',
    ]);
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

  test('work that has not landed, naming the target and the three ways on', () => {
    const fx = fixture();
    const h = harness(fx);
    const branch = git(fx.top, 'symbolic-ref', 'HEAD');
    const sha = git(fx.top, 'rev-parse', 'HEAD');
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      `worktree-w1 has not landed in ${branch} (${sha}): its head ${fx.head} is not there, and the history walk tried 0 commits and found no match. Land it and run finish again; name the target with --into <rev>; discarding it is your call, with sidekick worker finish ${fx.brief} --discard`,
    );
  });

  test('work that has not landed, in a run with --no-report, offering --discard with --no-report', () => {
    const fx = fixture();
    const h = harness(fx);
    const branch = git(fx.top, 'symbolic-ref', 'HEAD');
    const sha = git(fx.top, 'rev-parse', 'HEAD');
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief, '--no-report'),
      `worktree-w1 has not landed in ${branch} (${sha}): its head ${fx.head} is not there, and the history walk tried 0 commits and found no match. Land it and run finish again; name the target with --into <rev>; discarding it is your call, with sidekick worker finish ${fx.brief} --no-report --discard`,
    );
  });

  test('a worktree off its branch, in a run with --no-report, offering --discard with --no-report', () => {
    const fx = fixture();
    git(fx.worktree, 'checkout', '-q', '--detach');
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief, '--no-report'),
      `the worktree ${fx.worktree} has a detached HEAD checked out, not worktree-w1, so finish cannot check that its commits have landed: check out worktree-w1 there and run finish again; discarding it is your call, with sidekick worker finish ${fx.brief} --no-report --discard`,
    );
  });

  test('--into a branch the work has not reached, with an orphan target', () => {
    const fx = fixture();
    fx.orphan('orphan');
    const h = harness(fx);
    const sha = git(fx.top, 'rev-parse', 'orphan');
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief, '--into', 'orphan'),
      `worktree-w1 has not landed in refs/heads/orphan (${sha}): its head ${fx.head} is not there, and the history walk tried 0 commits and found no match. Land it and run finish again; name the target with --into <rev>; discarding it is your call, with sidekick worker finish ${fx.brief} --discard`,
    );
  });

  test("--into the worker's own branch", () => {
    const fx = fixture();
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief, '--into', 'worktree-w1'),
      "the target refs/heads/worktree-w1 is the worker's own branch, which holds its head whether or not the work landed, so it cannot show the work landed there: name the branch it should land in with --into <rev>",
    );
  });

  test('--into a rev that names no commit', () => {
    const fx = fixture();
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief, '--into', 'nowhere'),
      "--into nowhere names no commit in the main checkout's repo, so finish cannot check that worktree-w1 landed there: name a branch, tag, or commit that exists",
    );
  });

  test('--into together with --discard, as a usage error', () => {
    const fx = fixture();
    const h = harness(fx);
    expect(h.finish(fx.brief, '--into', 'main', '--discard')).toBe(1);
    expect(h.err[0]).toStartWith('usage: sidekick worker');
    expect(h.out).toEqual([]);
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
    expect(h.err).toHaveLength(3);
    expect(h.err[0]).toStartWith(
      `the worktree ${fx.worktree} has an unreadable HEAD (`,
    );
    expect(h.err[1]).toStartWith(
      `git status failed in the worktree ${fx.worktree}: `,
    );
    expect(h.err[2]).toStartWith(
      `the worktree has no run report at ${path.join(fx.worktree, REPORT)}: `,
    );
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
      `the branch worktree-w1 does not exist, so finish cannot check that the work has landed: discarding it is your call, with claude rm ${ID}`,
    );
  });

  test('a worktree on a detached HEAD, whose commits the branch lacks', () => {
    const fx = fixture();
    fx.integrate();
    git(fx.worktree, 'checkout', '-q', '--detach');
    git(fx.worktree, 'commit', '-q', '--allow-empty', '-m', 'mid-rebase');
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      `the worktree ${fx.worktree} has a detached HEAD checked out, not worktree-w1, so finish cannot check that its commits have landed: check out worktree-w1 there and run finish again; discarding it is your call, with sidekick worker finish ${fx.brief} --discard`,
    );
  });

  test('a worktree folder that is not a worktree, but a folder of the main checkout', () => {
    const fx = fixture();
    fx.integrate();
    git(fx.top, 'worktree', 'remove', '--force', fx.worktree);
    fs.mkdirSync(path.join(fx.worktree, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(fx.worktree, REPORT), REPORT_TEXT);
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(1);
    const branch = git(fx.top, 'symbolic-ref', 'HEAD');
    expect(h.err).toContain(
      `the worktree ${fx.worktree} has ${branch} checked out, not worktree-w1, so finish cannot check that its commits have landed: check out worktree-w1 there and run finish again; discarding it is your call, with sidekick worker finish ${fx.brief} --discard`,
    );
    expect(h.claude.named('rm')).toEqual([]);
  });

  test('a report that cannot be read, even under --no-report', () => {
    const fx = fixture();
    fx.integrate();
    const report = path.join(fx.worktree, REPORT);
    fs.rmSync(report);
    fs.mkdirSync(report);
    const h = harness(fx);
    expect(h.finish(fx.brief, '--no-report')).toBe(1);
    expect(h.err).toHaveLength(1);
    expect(h.err[0]).toStartWith(`cannot read ${report}: `);
    expect(h.claude.named('stop')).toEqual([]);
    expect(h.claude.named('rm')).toEqual([]);
    expect(fs.existsSync(fx.worktree)).toBe(true);
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
    expect(h.err.join('\n')).toContain('has not landed');
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
      `claude rm ${ID} did not say removed, and finish does not know its answer, so finish removed nothing more:`,
      'kept 213245a1 — A Claude Code lock on the worktree names a process that is still running',
      wayOut(`sidekick worker finish ${fx.brief}`, `claude rm ${ID}`),
    ]);
    expect(fs.existsSync(fx.worktree)).toBe(true);
  });

  test('a claude rm that exits non-zero while printing removed', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    h.claude.state.rm = [
      {
        result: ok({ stdout: `removed ${ID}\n`, code: 1 }),
        removes: 'nothing',
      },
    ];
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err).toEqual([
      `claude rm ${ID} failed with exit code 1, so finish removed nothing more:`,
      `removed ${ID}`,
      wayOut(`sidekick worker finish ${fx.brief}`, `claude rm ${ID}`),
    ]);
    expect(h.out).not.toContain(`session ${ID} removed`);
  });

  test.each([
    ['--into', ['--into', 'feature'], '--into feature'],
    ['--discard', ['--discard'], '--discard'],
    ['--no-report', ['--no-report'], '--no-report'],
    [
      '--into and --no-report, in the usage order',
      ['--into', 'feature', '--no-report'],
      '--no-report --into feature',
    ],
  ])('a claude rm answer it does not know, naming the re-run with %s', (_label, args, flags) => {
    const fx = fixture();
    fx.integrate();
    git(fx.top, 'branch', 'feature');
    const h = harness(fx);
    h.claude.state.rm = [
      { result: ok({ stdout: `kept ${ID}\n` }), removes: 'nothing' },
    ];
    expect(h.finish(fx.brief, ...args)).toBe(1);
    expect(h.err).toEqual([
      `claude rm ${ID} did not say removed, and finish does not know its answer, so finish removed nothing more:`,
      `kept ${ID}`,
      wayOut(`sidekick worker finish ${fx.brief} ${flags}`, `claude rm ${ID}`),
    ]);
  });

  test.each([
    [
      'a file left uncommitted',
      (fx: Fixture): void => {
        fs.writeFileSync(path.join(fx.worktree, 'late.txt'), 'late\n');
      },
      (fx: Fixture): string =>
        `the worktree ${fx.worktree} holds uncommitted work besides the report, which its removal would destroy: late.txt. Commit and integrate it, or remove it, then run finish again`,
    ],
    [
      'the report edited after it was saved',
      (fx: Fixture): void => {
        fs.appendFileSync(path.join(fx.worktree, REPORT), 'one more line\n');
      },
      (fx: Fixture): string =>
        `the worker's report at ${path.join(fx.worktree, REPORT)} no longer matches the copy at ${path.join(fx.top, REPORT)}`,
    ],
    [
      'the worktree moved off its branch',
      (fx: Fixture): void => {
        git(fx.worktree, 'checkout', '-q', '--detach');
      },
      (fx: Fixture): string =>
        `the worktree ${fx.worktree} has a detached HEAD checked out, not worktree-w1, so finish cannot check that its commits have landed: check out worktree-w1 there and run finish again; discarding it is your call, with sidekick worker finish ${fx.brief} --discard`,
    ],
    [
      'a commit landing on the branch',
      (fx: Fixture): void => {
        fs.writeFileSync(path.join(fx.worktree, 'late.txt'), 'late\n');
        git(fx.worktree, 'add', 'late.txt');
        git(fx.worktree, 'commit', '-q', '-m', 'late');
      },
      (fx: Fixture): string =>
        `worktree-w1 moved to ${git(fx.top, 'rev-parse', 'worktree-w1')} after finish verified its head ${fx.head}, so finish has not checked the new commits: run finish again`,
    ],
  ])('%s while the job stopped, before claude rm runs', (_label, act, line) => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    h.claude.state.whileStopping = () => act(fx);
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err).toEqual([
      'the worktree changed after finish checked it, so finish removed nothing:',
      line(fx),
    ]);
    expect(h.claude.named('rm')).toEqual([]);
    expect(fs.existsSync(fx.worktree)).toBe(true);
  });

  test('a report that appears under --no-report while the job stopped', () => {
    const fx = fixture();
    fx.integrate();
    const report = path.join(fx.worktree, REPORT);
    fs.rmSync(report);
    const h = harness(fx);
    h.claude.state.whileStopping = () => fs.writeFileSync(report, 'late\n');
    expect(h.finish(fx.brief, '--no-report')).toBe(1);
    expect(h.err).toEqual([
      'the worktree changed after finish checked it, so finish removed nothing:',
      `a run report appeared at ${report}`,
    ]);
    expect(h.claude.named('rm')).toEqual([]);
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

describe('finish passes a landing', () => {
  test.each([
    'rebase',
    'squash',
  ] as const)('a %s into the main checkout, with no --into', (how) => {
    const fx = fixture();
    fx.landOnMain(how);
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
    const sha = git(fx.top, 'rev-parse', 'HEAD').slice(0, SHORT_SHA);
    expect(h.out[0]).toBe(
      `worktree-w1 landed in ${git(fx.top, 'symbolic-ref', 'HEAD')} at ${sha}`,
    );
    expect(h.err).toEqual([]);
    expect(branchRemains(fx)).toBe(false);
  });

  test.each([
    'rebase',
    'squash',
  ] as const)('a %s that a later edit on the main checkout conflicts with, naming the landing commit, not the tip', (how) => {
    const fx = fixture();
    fx.landOnMain(how);
    const landing = git(fx.top, 'rev-parse', 'HEAD');
    fs.writeFileSync(path.join(fx.top, 'b.txt'), 'b\nedited\n');
    git(fx.top, 'add', 'b.txt');
    git(fx.top, 'commit', '-q', '-m', 'edit beside the landed lines');
    const tip = git(fx.top, 'rev-parse', 'HEAD');
    expect(tip).not.toBe(landing);
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.out[0]).toBe(
      `worktree-w1 landed in ${git(fx.top, 'symbolic-ref', 'HEAD')} at ${landing.slice(0, SHORT_SHA)}`,
    );
    expect(h.out[0]).not.toContain(tip.slice(0, SHORT_SHA));
    expect(h.err).toEqual([]);
  });

  test('a squash on a side branch, named with --into', () => {
    const fx = fixture();
    fx.landOnBranch('feature', 'squash');
    const h = harness(fx);
    expect(h.finish(fx.brief, '--into', 'feature')).toBe(0);
    const sha = git(fx.top, 'rev-parse', 'feature').slice(0, SHORT_SHA);
    expect(h.out[0]).toBe(`worktree-w1 landed in refs/heads/feature at ${sha}`);
  });

  test('a fast-forward, with the main checkout on a detached HEAD', () => {
    const fx = fixture();
    fx.integrate();
    git(fx.top, 'checkout', '-q', '--detach');
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
    const sha = git(fx.top, 'rev-parse', 'HEAD').slice(0, SHORT_SHA);
    expect(h.out[0]).toBe(`worktree-w1 landed in HEAD at ${sha}`);
  });
});

const backup = (fx: Fixture): string => `refs/sidekick/landed/w1/${fx.head}`;

describe('finish keeps the branch in a backup ref', () => {
  test('writing the ref at the head, and saying how to restore it', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
    expect(
      git(
        fx.top,
        'for-each-ref',
        '--format=%(refname) %(objectname)',
        'refs/sidekick/',
      ),
    ).toBe(`${backup(fx)} ${fx.head}`);
    expect(h.out.at(-1)).toBe(
      `worktree-w1 is kept as ${backup(fx)}: restore it with git branch worktree-w1 ${backup(fx)}`,
    );
  });

  test('so the printed command restores the branch at the head', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
    expect(branchRemains(fx)).toBe(false);
    git(fx.top, 'branch', 'worktree-w1', backup(fx));
    expect(git(fx.top, 'rev-parse', 'refs/heads/worktree-w1')).toBe(fx.head);
  });

  test('and a re-run after an unknown claude rm answer finds the ref in place', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    h.claude.state.rm = [
      { result: ok({ stdout: 'kept 213245a1\n' }), removes: 'nothing' },
      removed(),
    ];
    expect(h.finish(fx.brief)).toBe(1);
    expect(git(fx.top, 'rev-parse', backup(fx))).toBe(fx.head);
    expect(h.finish(fx.brief)).toBe(0);
    expect(git(fx.top, 'rev-parse', backup(fx))).toBe(fx.head);
  });

  test('refusing, with git words, when the ref cannot be written', () => {
    const fx = fixture();
    fx.integrate();
    // A ref named like a prefix of the backup ref blocks its creation.
    git(fx.top, 'update-ref', 'refs/sidekick/landed', fx.head);
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err).toHaveLength(1);
    expect(h.err[0]).toContain(`cannot keep ${backup(fx)}: `);
    expect(h.err[0]).toContain('refs/sidekick/landed');
    expect(h.err[0]).toContain('exists');
    expect(h.claude.named('rm')).toEqual([]);
  });

  test('refusing, naming the ref, when it holds another commit', () => {
    const fx = fixture();
    fx.integrate();
    const other = git(
      fx.top,
      'commit-tree',
      `${fx.head}^{tree}`,
      '-m',
      'other',
    );
    git(fx.top, 'update-ref', backup(fx), other);
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err).toHaveLength(1);
    expect(h.err[0]).toContain(`cannot keep ${backup(fx)}: `);
    expect(h.err[0]).toContain('reference already exists');
    expect(git(fx.top, 'rev-parse', backup(fx))).toBe(other);
    expect(h.claude.named('rm')).toEqual([]);
  });

  test('leaving a key that only resembles the branch config alone', () => {
    const fx = fixture();
    fx.integrate();
    git(fx.top, 'config', 'branch-worktree-w1.foo', 'x');
    const h = harness(fx);
    h.claude.state.rm = [removed('the worktree')];
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.out.at(-1)).toContain('is kept as');
    expect(git(fx.top, 'config', '--get', 'branch-worktree-w1.foo')).toBe('x');
  });

  test('deleting a leftover branch with its branch config', () => {
    const fx = fixture();
    fx.integrate();
    const key = 'branch.worktree-w1.vscode-merge-base';
    git(fx.top, 'config', key, 'origin/main');
    const h = harness(fx);
    h.claude.state.rm = [removed('the worktree')];
    expect(h.finish(fx.brief)).toBe(0);
    expect(branchRemains(fx)).toBe(false);
    expect(() => git(fx.top, 'config', '--get', key)).toThrow();
  });

  test('keeping a leftover branch that moved after the check, and refusing', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    const other = git(
      fx.top,
      'commit-tree',
      `${fx.head}^{tree}`,
      '-m',
      'other',
    );
    h.claude.state.rm = [
      {
        ...removed('the worktree'),
        during: () => {
          git(fx.top, 'update-ref', 'refs/heads/worktree-w1', other);
        },
      },
    ];
    expect(h.finish(fx.brief)).toBe(1);
    expect(git(fx.top, 'rev-parse', 'refs/heads/worktree-w1')).toBe(other);
    expect(h.err).toHaveLength(1);
    expect(h.err[0]).toContain(
      'git update-ref -d refs/heads/worktree-w1 failed',
    );
    expect(h.err[0]).toContain(`is at ${other} but expected ${fx.head}`);
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
      `worktree-w1 landed in ${git(fx.top, 'symbolic-ref', 'HEAD')} at ${git(fx.top, 'rev-parse', 'HEAD').slice(0, SHORT_SHA)}`,
      `report saved to ${path.join(fx.top, REPORT)}`,
      `session ${ID} removed`,
      `worktree ${fx.worktree} removed`,
      'branch worktree-w1 removed',
      `worktree-w1 is kept as ${backup(fx)}: restore it with git branch worktree-w1 ${backup(fx)}`,
    ]);
    expect(h.err).toEqual([]);
    expect(h.slept).toEqual([]);
  });

  test.each([
    'stopped',
    'done',
  ])('without claude stop for a job already %s, with no live process', (state) => {
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

  // Measured on Claude Code 2.1.300: a worker whose turn ended lists as done
  // while its process still runs and holds the lock.
  test('with claude stop for a done job whose lock names a live process', () => {
    const fx = fixture();
    fx.integrate();
    fs.writeFileSync(
      path.join(fx.top, '.git', 'worktrees', 'w1', 'locked'),
      'claude session w1 (pid 4242 start Wed Oct 14 19:43:38 2026)',
    );
    const worker = { running: true };
    const h = harness(fx, { isAlive: () => worker.running });
    h.claude.state.agents = JSON.stringify([
      { id: ID, kind: 'background', name: 'w1', state: 'done' },
    ]);
    h.claude.state.whileStopping = () => {
      worker.running = false;
    };
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.claude.named('stop')).toEqual([['stop', ID]]);
    expect(h.slept).toEqual([]);
  });

  const record = (fx: Fixture): WorkerRecord => ({
    version: 2,
    name: 'w1',
    main: null,
    job: ID,
    brief: fx.brief,
    dispatchedAt: '2026-10-15T10:00:00.000Z',
  });

  test('and removes its dispatch record', () => {
    const fx = fixture();
    fx.integrate();
    const commonDir = path.join(fx.top, '.git');
    writeRecord(commonDir, record(fx));
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
    expect(readRecords(commonDir)).toEqual({ records: [], warnings: [] });
  });

  test('without a dispatch record present', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.err).toEqual([]);
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

  // Measured on 2026-10-15, Claude Code 2.1.300: claude rm on a job finish had
  // just stopped printed the kept message and exited 1.
  test('by the discard line, when claude rm exits 1 as it keeps the session', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    const keptOnce = kept(fx, fx.head);
    h.claude.state.rm = [
      { ...keptOnce, result: { ...keptOnce.result, code: 1 } },
      removed(),
    ];
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.claude.named('rm')).toEqual([
      ['rm', ID],
      ['rm', ID, '--discard-unpushed', `${fx.head}@${WORKTREE_ID}`],
    ]);
    expect(h.out).toContain(`session ${ID} removed`);
  });

  test('running both claude rm calls without a limit, and the listing and claude stop with 30 s', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    h.claude.state.rm = [kept(fx, fx.head), removed()];
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.claude.calls.map((c) => [c.args[0], c.timeoutMs])).toEqual([
      ['agents', 30_000],
      ['stop', 30_000],
      ['rm', 0],
      ['rm', 0],
    ]);
  });

  test('refusing when the discard line does not end in removed', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    h.claude.state.rm = [kept(fx, fx.head), kept(fx, fx.head)];
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err[0]).toBe(
      `claude rm ${ID} --discard-unpushed ${fx.head}@${WORKTREE_ID} did not say removed, and finish does not know its answer, so finish removed nothing more:`,
    );
    expect(h.err.at(-1)).toBe(
      wayOut(
        `sidekick worker finish ${fx.brief}`,
        `claude rm ${ID} --discard-unpushed ${fx.head}@${WORKTREE_ID}`,
      ),
    );
  });

  test('with the same report already in the main checkout, as on a re-run', () => {
    const fx = fixture();
    fx.integrate();
    fs.writeFileSync(path.join(fx.top, REPORT), REPORT_TEXT);
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.out[1]).toBe(`report already at ${path.join(fx.top, REPORT)}`);
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
    expect(h.out[1]).toBe('no report to save: the worktree holds none');
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

  test('deleting a branch that survives claude rm with git update-ref -d', () => {
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

describe('finish after a removal cut short', () => {
  const uncommitted = (fx: Fixture, paths: string): string =>
    `the worktree ${fx.worktree} holds uncommitted work besides the report, which its removal would destroy: ${paths}. Commit and integrate it, or remove it, then run finish again`;

  // A first run whose claude rm deletes the tracked files and is cut short,
  // then a re-run whose claude rm removes; returns the re-run's lines.
  function cutThenRerun(h: Harness, fx: Fixture, cut: Rm, args: string[]) {
    h.claude.state.rm = [cut, removed()];
    expect(h.finish(fx.brief, ...args)).toBe(1);
    expect(h.err).toEqual([
      `claude rm ${ID} failed with exit code 1, so finish removed nothing more`,
      wayOut(
        ['sidekick worker finish', fx.brief, ...args].join(' '),
        `claude rm ${ID}`,
      ),
    ]);
    expect(fs.existsSync(path.join(fx.worktree, 'a.txt'))).toBe(false);
    const first = h.out.length;
    expect(h.finish(fx.brief, ...args)).toBe(0);
    return h.out.slice(first);
  }

  // The lines of a re-run that restores a.txt and b.txt, then removes.
  const rerunLines = (fx: Fixture, report: string): string[] => [
    `worktree-w1 landed in ${git(fx.top, 'symbolic-ref', 'HEAD')} at ${git(fx.top, 'rev-parse', 'HEAD').slice(0, SHORT_SHA)}`,
    report,
    `restored 2 deleted files in ${fx.worktree} from its index, so claude rm finds it clean`,
    `session ${ID} removed`,
    `worktree ${fx.worktree} removed`,
    'branch worktree-w1 removed',
    `worktree-w1 is kept as ${backup(fx)}: restore it with git branch worktree-w1 ${backup(fx)}`,
  ];

  test('completes it on a re-run, restoring the deleted files so claude rm meets a clean worktree', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    const rerun = cutThenRerun(h, fx, cutShort(), []);
    expect(rerun).toEqual(
      rerunLines(fx, `report already at ${path.join(fx.top, REPORT)}`),
    );
    expect(h.err).toHaveLength(2);
    expect(h.claude.statusAtRm).toEqual([`?? ${REPORT}`, `?? ${REPORT}`]);
    expect(h.claude.named('rm')).toEqual([
      ['rm', ID],
      ['rm', ID],
    ]);
    expect(savedReport(fx)).toBe(REPORT_TEXT);
    expect(fs.existsSync(fx.worktree)).toBe(false);
    expect(branchRemains(fx)).toBe(false);
  });

  test('completes it on a re-run with --no-report and no report', () => {
    const fx = fixture();
    fx.integrate();
    fs.rmSync(path.join(fx.worktree, REPORT));
    const h = harness(fx);
    const rerun = cutThenRerun(h, fx, cutShort(), ['--no-report']);
    expect(rerun).toEqual(
      rerunLines(fx, 'no report to save: the worktree holds none'),
    );
    expect(h.claude.statusAtRm).toEqual(['', '']);
    expect(savedReport(fx)).toBeUndefined();
    expect(fs.existsSync(fx.worktree)).toBe(false);
  });

  test("counts the copy beside the plan as saved earlier when the cut also deleted the worktree's report", () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    const cut: Rm = {
      ...cutShort(),
      during: () => fs.rmSync(path.join(fx.worktree, REPORT)),
    };
    const rerun = cutThenRerun(h, fx, cut, []);
    expect(rerun).toEqual(
      rerunLines(fx, `report already at ${path.join(fx.top, REPORT)}`),
    );
    expect(h.claude.statusAtRm).toEqual([`?? ${REPORT}`, '']);
    expect(savedReport(fx)).toBe(REPORT_TEXT);
    expect(fs.existsSync(fx.worktree)).toBe(false);
  });

  test.each([
    ['--into feature', ['--into', 'feature']],
    ['--discard', ['--discard']],
  ])("refuses a re-run without the cut run's %s with the not-landed text alone, not the deleted files", (_label, args) => {
    const fx = fixture();
    fx.landOnBranch('feature', 'squash');
    const h = harness(fx);
    h.claude.state.rm = [cutShort()];
    expect(h.finish(fx.brief, ...args)).toBe(1);
    expect(h.err).toEqual([
      `claude rm ${ID} failed with exit code 1, so finish removed nothing more`,
      wayOut(
        ['sidekick worker finish', fx.brief, ...args].join(' '),
        `claude rm ${ID}`,
      ),
    ]);
    const first = h.err.length;
    const branch = git(fx.top, 'symbolic-ref', 'HEAD');
    const sha = git(fx.top, 'rev-parse', 'HEAD');
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err.slice(first)).toEqual([
      `worktree-w1 has not landed in ${branch} (${sha}): its head ${fx.head} is not there, and the history walk tried 0 commits and found no match. Land it and run finish again; name the target with --into <rev>; discarding it is your call, with sidekick worker finish ${fx.brief} --discard`,
    ]);
    expect(h.claude.named('rm')).toEqual([['rm', ID]]);
    expect(fs.existsSync(path.join(fx.worktree, 'a.txt'))).toBe(false);
  });

  test("refuses, with git's words, when a deleted file reappears before the restore", () => {
    const fx = fixture();
    fx.integrate();
    const a = path.join(fx.worktree, 'a.txt');
    const runGit: Runner = (cmd, args, cwd) => {
      if (args.includes('checkout-index')) fs.writeFileSync(a, 'late\n');
      return execRunner(cmd, args, cwd);
    };
    const h = harness(fx, { runGit });
    h.claude.state.rm = [cutShort(), removed()];
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err.at(-1)).toBe(
      `git checkout-index failed in the worktree ${fx.worktree}, so finish removed nothing: a.txt already exists, no checkout`,
    );
    expect(h.claude.named('rm')).toEqual([['rm', ID]]);
    expect(fs.readFileSync(a, 'utf-8')).toBe('late\n');
  });

  test('refuses a deletion the worker left uncommitted on a first run, restoring nothing and writing no ref', () => {
    const fx = fixture();
    fx.integrate();
    const a = path.join(fx.worktree, 'a.txt');
    fs.rmSync(a);
    const h = harness(fx);
    expectRefusedUntouched(h, fx, h.finish(fx.brief), uncommitted(fx, 'a.txt'));
    expect(h.err).toHaveLength(1);
    expect(fs.existsSync(a)).toBe(false);
    expect(git(fx.top, 'for-each-ref', 'refs/sidekick/')).toBe('');
  });

  test('refuses deleted files beside an untracked file, even with a backup ref, naming both', () => {
    const fx = fixture();
    fx.integrate();
    git(fx.top, 'update-ref', backup(fx), fx.head);
    const a = path.join(fx.worktree, 'a.txt');
    fs.rmSync(a);
    fs.writeFileSync(path.join(fx.worktree, 'notes.txt'), 'notes\n');
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      uncommitted(fx, 'a.txt, notes.txt'),
    );
    expect(h.err).toHaveLength(1);
    expect(fs.existsSync(a)).toBe(false);
  });

  test('refuses a listed worktree folder whose .git file is gone, alone, naming claude rm', () => {
    const fx = fixture();
    fx.integrate();
    fs.rmSync(path.join(fx.worktree, '.git'));
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      `the worktree ${fx.worktree} holds no .git entry while git still lists it, so a removal went past git's link to it: claude rm ${ID} completes the removal`,
    );
    expect(h.err).toHaveLength(1);
  });
});

const discarded = (fx: Fixture): string =>
  `refs/sidekick/discarded/w1/${fx.head}`;

describe('finish --discard', () => {
  test("clears an unlanded worker on the operator's word, keeping a discarded ref", () => {
    const fx = fixture();
    const commonDir = path.join(fx.top, '.git');
    writeRecord(commonDir, {
      version: 2,
      name: 'w1',
      main: null,
      job: ID,
      brief: fx.brief,
      dispatchedAt: '2026-10-15T10:00:00.000Z',
    });
    expect(readRecords(commonDir).records).toHaveLength(1);
    const h = harness(fx);
    expect(h.finish(fx.brief, '--discard')).toBe(0);
    expect(h.err).toEqual([]);
    expect(h.out[0]).toBe('worktree-w1 is discarded on your word');
    expect(h.out.at(-1)).toBe(
      `worktree-w1 is kept as ${discarded(fx)}: restore it with git branch worktree-w1 ${discarded(fx)}`,
    );
    expect(savedReport(fx)).toBe(REPORT_TEXT);
    expect(h.claude.named('stop')).toHaveLength(1);
    expect(h.out).toContain(`session ${ID} removed`);
    expect(readRecords(commonDir)).toEqual({ records: [], warnings: [] });
    expect(fs.existsSync(fx.worktree)).toBe(false);
    expect(branchRemains(fx)).toBe(false);
    expect(
      git(
        fx.top,
        'for-each-ref',
        '--format=%(refname) %(objectname)',
        'refs/sidekick/',
      ),
    ).toBe(`${discarded(fx)} ${fx.head}`);
  });

  test('keeps a ref that restores the branch at its head', () => {
    const fx = fixture();
    const h = harness(fx);
    expect(h.finish(fx.brief, '--discard')).toBe(0);
    git(fx.top, 'branch', 'worktree-w1', discarded(fx));
    expect(git(fx.top, 'rev-parse', 'refs/heads/worktree-w1')).toBe(fx.head);
  });

  test('refuses a worktree holding a modified tracked file, writing no ref', () => {
    const fx = fixture();
    fs.writeFileSync(path.join(fx.worktree, 'a.txt'), 'changed\n');
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief, '--discard'),
      `the worktree ${fx.worktree} holds uncommitted work besides the report, which its removal would destroy: a.txt. Commit it so that the backup ref keeps it, or remove it, then run finish again`,
    );
    expect(git(fx.top, 'for-each-ref', 'refs/sidekick/')).toBe('');
  });

  test('refuses with no report unless --no-report', () => {
    const fx = fixture();
    fs.rmSync(path.join(fx.worktree, REPORT));
    const refused = harness(fx);
    expectRefusedUntouched(
      refused,
      fx,
      refused.finish(fx.brief, '--discard'),
      `the worktree has no run report at ${path.join(fx.worktree, REPORT)}: ask the worker for it, or pass --no-report to finish without one`,
    );
    const h = harness(fx);
    expect(h.finish(fx.brief, '--discard', '--no-report')).toBe(0);
    expect(fs.existsSync(fx.worktree)).toBe(false);
  });

  test('runs the discard line of claude rm when its sha is the verified head', () => {
    const fx = fixture();
    const h = harness(fx);
    h.claude.state.rm = [kept(fx, fx.head), removed()];
    expect(h.finish(fx.brief, '--discard')).toBe(0);
    expect(h.claude.named('rm')).toEqual([
      ['rm', ID],
      ['rm', ID, '--discard-unpushed', `${fx.head}@${WORKTREE_ID}`],
    ]);
    expect(fs.existsSync(fx.worktree)).toBe(false);
    expect(git(fx.top, 'rev-parse', discarded(fx))).toBe(fx.head);
  });

  test('refuses a branch that is gone, naming the hand route', () => {
    const fx = fixture();
    git(fx.worktree, 'checkout', '-q', '--detach');
    git(fx.top, 'branch', '-D', 'worktree-w1');
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief, '--discard'),
      `the branch worktree-w1 does not exist, so finish has nothing to keep as a backup: clear the worker by hand with claude rm ${ID}`,
    );
  });

  test('refuses a worktree off its branch, naming the hand route', () => {
    const fx = fixture();
    git(fx.worktree, 'checkout', '-q', '--detach');
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief, '--discard'),
      `the worktree ${fx.worktree} has a detached HEAD checked out, not worktree-w1, and its commits may not all be on worktree-w1, which finish keeps as the backup: check out worktree-w1 there and run finish again; to clear it by hand, claude rm ${ID}`,
    );
  });

  test('refuses a worktree that moves off its branch while the job stops', () => {
    const fx = fixture();
    const h = harness(fx);
    h.claude.state.whileStopping = () =>
      git(fx.worktree, 'checkout', '-q', '--detach');
    expect(h.finish(fx.brief, '--discard')).toBe(1);
    expect(h.err).toEqual([
      'the worktree changed after finish checked it, so finish removed nothing:',
      `the worktree ${fx.worktree} has a detached HEAD checked out, not worktree-w1, and its commits may not all be on worktree-w1, which finish keeps as the backup: check out worktree-w1 there and run finish again; to clear it by hand, claude rm ${ID}`,
    ]);
    expect(h.claude.named('rm')).toEqual([]);
  });

  test('refuses a head that moved while the job stopped', () => {
    const fx = fixture();
    const h = harness(fx);
    h.claude.state.whileStopping = () => {
      git(fx.worktree, 'commit', '-q', '--allow-empty', '-m', 'late');
    };
    expect(h.finish(fx.brief, '--discard')).toBe(1);
    expect(h.err[1]).toBe(
      `worktree-w1 moved to ${git(fx.top, 'rev-parse', 'worktree-w1')} after finish verified its head ${fx.head}, so finish has not checked the new commits: run finish again`,
    );
    expect(git(fx.top, 'for-each-ref', 'refs/sidekick/')).toBe('');
  });
});

describe('finish prints commands that survive a space', () => {
  // The fixture's brief, copied under a folder and a file name that hold a space.
  function spacedBrief(fx: Fixture, report = REPORT): string {
    const dir = path.join(fx.top, 'my docs');
    fs.mkdirSync(dir);
    const file = path.join(dir, 'x brief.md');
    fs.writeFileSync(
      file,
      fs
        .readFileSync(fx.brief, 'utf-8')
        .replace(`report: ${REPORT}`, `report: ${report}`),
    );
    return file;
  }

  test('a brief path with a space, in the discard command', () => {
    const fx = fixture();
    const brief = spacedBrief(fx);
    const h = harness(fx);
    expect(h.finish(brief)).toBe(1);
    expect(h.err.join('\n')).toContain(
      `discarding it is your call, with sidekick worker finish '${brief}' --discard`,
    );
  });

  test('a brief path with a space, in the re-run command', () => {
    const fx = fixture();
    fx.integrate();
    const brief = spacedBrief(fx);
    const h = harness(fx);
    h.claude.state.rm = [
      { result: ok({ stdout: `kept ${ID}\n` }), removes: 'nothing' },
    ];
    expect(h.finish(brief)).toBe(1);
    expect(h.err.at(-1)).toBe(
      wayOut(`sidekick worker finish '${brief}'`, `claude rm ${ID}`),
    );
  });

  test('a report path with a space passes', () => {
    const fx = fixture();
    fx.integrate();
    const report = 'docs/run report.md';
    fs.renameSync(
      path.join(fx.worktree, REPORT),
      path.join(fx.worktree, report),
    );
    const brief = spacedBrief(fx, report);
    const h = harness(fx);
    expect(h.finish(brief)).toBe(0);
    expect(fs.readFileSync(path.join(fx.top, report), 'utf-8')).toBe(
      REPORT_TEXT,
    );
  });

  test('an --into rev with a space, in the re-run command', () => {
    const fx = fixture();
    fx.landOnBranch('feature', 'squash');
    const rev = 'feature@{2099-01-01 00:00}';
    const h = harness(fx);
    h.claude.state.rm = [
      { result: ok({ stdout: `kept ${ID}\n` }), removes: 'nothing' },
    ];
    expect(h.finish(fx.brief, '--into', rev)).toBe(1);
    expect(h.err.at(-1)).toBe(
      wayOut(
        `sidekick worker finish ${fx.brief} --into '${rev}'`,
        `claude rm ${ID}`,
      ),
    );
  });
});
