import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  agentRow,
  beside,
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
  refused,
  removeBesides,
  removed,
  savedReport,
  WORKTREE_ID,
  writeTranscript,
} from './fixtures/worker/finish.js';
import {
  git,
  type RecordedCall,
  recording,
  removeTemps,
  tmp,
} from './fixtures/worker/repo.js';
import { execRunner, MAX_OUTPUT, type Runner } from './pm-data.js';
import { SHORT_SHA } from './worker-finish.js';
import { judgeFor } from './worker-finish-target.js';
import {
  readRecords,
  type WorkerRecord,
  writeRecord,
} from './worker-record.js';

afterEach(removeTemps);
afterEach(removeBesides);

// The target line when the brief names no target and `top` holds the brief.
const headTarget = (top: string): string =>
  `target: ${git(top, 'symbolic-ref', 'HEAD')} (the HEAD of ${top}, since the brief names no target)`;

// Adds a `target` line to a brief's frontmatter.
function addTarget(brief: string, target: string): void {
  const text = fs.readFileSync(brief, 'utf-8');
  fs.writeFileSync(
    brief,
    text.replace('orchestrator: orch', `orchestrator: orch\ntarget: ${target}`),
  );
}

// A sibling checkout of the fixture's repo, outside the main checkout, on a
// new branch `feature` at the main checkout's HEAD.
function sibling(fx: Fixture): string {
  const side = path.join(tmp(), 'side');
  git(fx.top, 'worktree', 'add', '-q', side, '-b', 'feature');
  return side;
}

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

// The refusal when the finder finds no worktree for w1, with what it tried.
const notFound = (tried: string[]): string[] => [
  'finish cannot find the worktree of w1, so it removed nothing. It tried:',
  ...tried,
  'name the worktree with --worktree <path>, or discard the worker with --discard',
];

// The way out after a claude rm answer finish cannot read: the re-run, then the hand route.
const wayOut = (rerun: string, hand: string): string =>
  `run finish again with ${rerun}, which restores any files claude rm deleted, then runs claude rm again; or complete the removal by hand with ${hand}`;

// The last line of a refusal over a worktree claude rm left, once the record is forgotten.
const forgottenWayOut = (fx: Fixture): string =>
  `finish has forgotten the worker, so once you clear what stopped the removal, run sidekick worktree remove ${fx.worktree}`;

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
      'no session in claude agents --json --all is named "w1". If finish already removed it, run sidekick worktree list, then sidekick worktree remove <name> for a worktree the worker left, since remove takes no branch. A branch left with no worktree holds the worker\'s commits, and blocks a new worktree named w1. Once you have checked that its commits have landed, delete it with git branch -D worktree-w1, or dispatch under another name. Otherwise check the name in the brief',
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
      'no session in claude agents --json --all is named "w1". If finish already removed it, run sidekick worktree list, then sidekick worktree remove <name> for a worktree the worker left, since remove takes no branch. A branch left with no worktree holds the worker\'s commits, and blocks a new worktree named w1. Once you have checked that its commits have landed, delete it with git branch -D worktree-w1, or dispatch under another name. Otherwise check the name in the brief',
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

  test('a worktree folder that is not a worktree, but a folder of the main checkout, as no worktree found', () => {
    const fx = fixture();
    fx.integrate();
    git(fx.top, 'worktree', 'remove', '--force', fx.worktree);
    fs.mkdirSync(path.join(fx.worktree, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(fx.worktree, REPORT), REPORT_TEXT);
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err).toEqual(
      notFound([
        `the transcript's first cwd ${fx.worktree} is in the main checkout`,
        `the job listing's cwd ${fx.worktree} is in the main checkout`,
        'by name, no worktree has worktree-w1 checked out',
      ]),
    );
    expect(h.claude.named('stop')).toEqual([]);
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
    expect(h.out[1]).toBe(
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
    expect(h.out[1]).toBe(
      `worktree-w1 landed in ${git(fx.top, 'symbolic-ref', 'HEAD')} at ${landing.slice(0, SHORT_SHA)}`,
    );
    expect(h.out[1]).not.toContain(tip.slice(0, SHORT_SHA));
    expect(h.err).toEqual([]);
  });

  test('a squash on a side branch, named with --into', () => {
    const fx = fixture();
    fx.landOnBranch('feature', 'squash');
    const h = harness(fx);
    expect(h.finish(fx.brief, '--into', 'feature')).toBe(0);
    const sha = git(fx.top, 'rev-parse', 'feature').slice(0, SHORT_SHA);
    expect(h.out[1]).toBe(`worktree-w1 landed in refs/heads/feature at ${sha}`);
  });

  test('a fast-forward, with the main checkout on a detached HEAD', () => {
    const fx = fixture();
    fx.integrate();
    git(fx.top, 'checkout', '-q', '--detach');
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
    const sha = git(fx.top, 'rev-parse', 'HEAD').slice(0, SHORT_SHA);
    expect(h.out.slice(0, 2)).toEqual([
      `target: HEAD (the HEAD of ${fx.top}, since the brief names no target)`,
      `worktree-w1 landed in HEAD at ${sha}`,
    ]);
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
      headTarget(fx.top),
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
    expect(h.out[2]).toBe(`report already at ${path.join(fx.top, REPORT)}`);
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
    expect(h.out[2]).toBe('no report to save: the worktree holds none');
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

  const lockWorktree = (fx: Fixture, reason: string): void => {
    fs.writeFileSync(
      path.join(fx.top, '.git', 'worktrees', 'w1', 'locked'),
      reason,
    );
  };
  const exitedLock =
    'claude session w1 (pid 4242 start Tue Oct 14 2026 10:00:00)';

  test('removing a leftover that claude rm left locked by an exited session (#316)', () => {
    const fx = fixture();
    fx.integrate();
    lockWorktree(fx, exitedLock);
    const h = harness(fx);
    h.claude.state.rm = [removed('nothing')];
    const code = h.finish(fx.brief, '--discard');
    expect([code, h.err]).toEqual([0, []]);
    expect(h.out).toContain(`worktree ${fx.worktree} removed`);
    expect(h.out).toContain('branch worktree-w1 removed');
    expect(branchRemains(fx)).toBe(false);
    expect(fs.existsSync(fx.worktree)).toBe(false);
  });

  test('removing an unlocked leftover with git worktree remove', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    h.claude.state.rm = [removed('nothing')];
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.out).toContain(`worktree ${fx.worktree} removed`);
    expect(branchRemains(fx)).toBe(false);
    expect(savedReport(fx)).toBe(REPORT_TEXT);
  });

  test('a re-run that finds the report in place clears its copy from a leftover (#316)', () => {
    const fx = fixture();
    // An earlier run saved the report, then stopped before claude rm.
    fs.writeFileSync(path.join(fx.top, REPORT), REPORT_TEXT);
    lockWorktree(fx, exitedLock);
    const h = harness(fx);
    h.claude.state.rm = [removed('nothing')];
    const code = h.finish(fx.brief, '--discard');
    expect([code, h.err]).toEqual([0, []]);
    expect(h.out).toContain(`report already at ${path.join(fx.top, REPORT)}`);
    expect(h.out).toContain(`worktree ${fx.worktree} removed`);
    expect(h.out).toContain('branch worktree-w1 removed');
    expect(fs.existsSync(fx.worktree)).toBe(false);
    expect(branchRemains(fx)).toBe(false);
    expect(savedReport(fx)).toBe(REPORT_TEXT);
  });

  test('refusing when git worktree list fails after claude rm, naming worktree remove', () => {
    const fx = fixture();
    fx.integrate();
    const runGit: Runner = (cmd, args, cwd, opts) => {
      const listing = args[0] === 'worktree' && args[1] === 'list';
      if (listing && h.claude.named('rm').length > 0) {
        return { code: 128, stdout: '', stderr: 'fatal: cannot list\n' };
      }
      return execRunner(cmd, args, cwd, opts);
    };
    const h = harness(fx, { runGit });
    h.claude.state.rm = [removed('nothing')];
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err).toEqual([
      'git worktree list failed, so finish cannot confirm the worktree is gone: fatal: cannot list',
      forgottenWayOut(fx),
    ]);
  });

  const leftoverLosses = (fx: Fixture, files: string): string =>
    `the worktree ${fx.worktree} holds files its removal would lose: ${files}`;

  test('keeping a report copy that differs from the saved one, refusing before git removes it', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    h.claude.state.rm = [
      {
        ...removed('nothing'),
        during: () =>
          fs.writeFileSync(path.join(fx.top, REPORT), 'changed after save\n'),
      },
    ];
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err[1]).toBe(leftoverLosses(fx, REPORT));
    expect(h.err.at(-1)).toBe(forgottenWayOut(fx));
    expect(fs.readFileSync(path.join(fx.worktree, REPORT), 'utf8')).toBe(
      REPORT_TEXT,
    );
    expect(branchRemains(fx)).toBe(true);
  });

  test('keeping an untracked file under --no-report, refusing before git removes it', () => {
    const fx = fixture();
    fx.integrate();
    fs.rmSync(path.join(fx.worktree, REPORT));
    const h = harness(fx);
    h.claude.state.rm = [
      {
        ...removed('nothing'),
        during: () =>
          fs.writeFileSync(path.join(fx.worktree, 'stray.txt'), 's'),
      },
    ];
    expect(h.finish(fx.brief, '--no-report')).toBe(1);
    expect(h.err[1]).toBe(leftoverLosses(fx, 'stray.txt'));
    expect(h.err.at(-1)).toBe(forgottenWayOut(fx));
    expect(fs.existsSync(path.join(fx.worktree, 'stray.txt'))).toBe(true);
  });

  test('keeping an untracked file with no brief, refusing before git removes it', () => {
    const fx = fixture();
    fx.integrate();
    fs.rmSync(path.join(fx.worktree, REPORT));
    const h = harness(fx);
    h.claude.state.rm = [
      {
        ...removed('nothing'),
        during: () =>
          fs.writeFileSync(path.join(fx.worktree, 'stray.txt'), 's'),
      },
    ];
    expect(h.finish('--name', 'w1', '--discard')).toBe(1);
    expect(h.err[1]).toBe(leftoverLosses(fx, 'stray.txt'));
    expect(h.err.at(-1)).toBe(forgottenWayOut(fx));
    expect(fs.existsSync(path.join(fx.worktree, 'stray.txt'))).toBe(true);
  });

  test('refusing a leftover locked by a live session, naming worktree remove', () => {
    const fx = fixture();
    fx.integrate();
    lockWorktree(fx, exitedLock);
    // The session starts again after finish's wait ended, before claude rm.
    const h = harness(fx, {
      isAlive: (pid) => pid === 4242 && h.claude.named('rm').length > 0,
    });
    h.claude.state.rm = [removed('nothing')];
    expect(h.finish(fx.brief, '--discard')).toBe(1);
    expect(h.err).toEqual([
      `claude rm said removed, but git still lists the worktree ${fx.worktree}`,
      `${fx.worktree} is locked by a live session (pid 4242)`,
      forgottenWayOut(fx),
    ]);
    expect(branchRemains(fx)).toBe(true);
    expect(fs.existsSync(fx.worktree)).toBe(true);
  });

  test('refusing a leftover a live session locks during the files check, keeping its lock (#316)', () => {
    const fx = fixture();
    fx.integrate();
    lockWorktree(fx, exitedLock);
    const liveLock =
      'claude session w2 (pid 5151 start Tue Oct 14 2026 10:05:00)';
    // The files check runs git status after the first lock reading; a session
    // locks the worktree at that moment.
    let relocked = false;
    const runGit: Runner = (cmd, args, cwd, opts) => {
      const afterRm = h.claude.named('rm').length > 0;
      if (afterRm && !relocked && args.includes('status')) {
        lockWorktree(fx, liveLock);
        relocked = true;
      }
      return execRunner(cmd, args, cwd, opts);
    };
    const h = harness(fx, { runGit, isAlive: (pid) => pid === 5151 });
    h.claude.state.rm = [removed('nothing')];
    expect(h.finish(fx.brief, '--discard')).toBe(1);
    expect(relocked).toBe(true);
    expect(h.err).toEqual([
      `claude rm said removed, but git still lists the worktree ${fx.worktree}`,
      `${fx.worktree} is locked by a live session (pid 5151)`,
      forgottenWayOut(fx),
    ]);
    const lockFile = path.join(fx.top, '.git', 'worktrees', 'w1', 'locked');
    expect(fs.readFileSync(lockFile, 'utf8')).toBe(liveLock);
    expect(git(fx.top, 'worktree', 'list', '--porcelain')).toContain(
      `worktree ${fx.worktree}\n`,
    );
    expect(fs.existsSync(fx.worktree)).toBe(true);
    expect(branchRemains(fx)).toBe(true);
  });

  test('refusing a leftover locked by something other than a claude session, though its pid is dead', () => {
    const fx = fixture();
    fx.integrate();
    const reason = 'backup job (pid 4242 start Tue Oct 14 2026 10:00:00)';
    lockWorktree(fx, reason);
    const h = harness(fx);
    h.claude.state.rm = [removed('nothing')];
    expect(h.finish(fx.brief, '--discard')).toBe(1);
    expect(h.err).toEqual([
      `claude rm said removed, but git still lists the worktree ${fx.worktree}`,
      `${fx.worktree} is locked: ${reason}`,
      forgottenWayOut(fx),
    ]);
    expect(branchRemains(fx)).toBe(true);
  });

  test('still waiting on a lock naming a running pid without the claude session prefix', () => {
    const fx = fixture();
    fx.integrate();
    lockWorktree(fx, 'backup job (pid 4242 start Tue Oct 14 2026 10:00:00)');
    const h = harness(fx, { isAlive: () => true });
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.slept.reduce((sum, ms) => sum + ms, 0)).toBe(15_000);
    expect(h.claude.named('rm')).toEqual([]);
  });

  test('refusing a leftover with a lock that names no pid, naming worktree remove', () => {
    const fx = fixture();
    fx.integrate();
    lockWorktree(fx, 'locked by hand');
    const h = harness(fx);
    h.claude.state.rm = [removed('nothing')];
    expect(h.finish(fx.brief, '--discard')).toBe(1);
    expect(h.err).toEqual([
      `claude rm said removed, but git still lists the worktree ${fx.worktree}`,
      `${fx.worktree} is locked: locked by hand`,
      forgottenWayOut(fx),
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
    headTarget(fx.top),
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
    const runGit: Runner = (cmd, args, cwd, opts) => {
      if (args.includes('checkout-index')) fs.writeFileSync(a, 'late\n');
      return execRunner(cmd, args, cwd, opts);
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

  // The calls of the restore, which reads its paths from stdin.
  const restores = (calls: RecordedCall[]): RecordedCall[] =>
    calls.filter((c) => c.args.includes('checkout-index'));

  test('restores a file whose name holds a glob, a colon, or a newline, through stdin', () => {
    const fx = fixture();
    const odd = ['a*b', 'c:d', 'e\nf'];
    for (const name of odd)
      fs.writeFileSync(path.join(fx.worktree, name), 'x\n');
    git(fx.worktree, 'add', '--', ...odd);
    git(fx.worktree, 'commit', '-q', '-m', 'odd names');
    fx.integrate();
    const { runGit, calls } = recording();
    const h = harness(fx, { runGit });
    const rerun = cutThenRerun(h, fx, cutShort(), []);
    expect(rerun).toContain(
      `restored 5 deleted files in ${fx.worktree} from its index, so claude rm finds it clean`,
    );
    expect(h.claude.statusAtRm[1]).toBe(`?? ${REPORT}`);
    const [restore] = restores(calls);
    expect(restore.args).toEqual([
      '-C',
      fx.worktree,
      'checkout-index',
      '--stdin',
      '-z',
    ]);
    const paths = (restore.opts?.input ?? '')
      .split('\0')
      .filter((p) => p !== '');
    expect(paths.sort()).toEqual(['a*b', 'a.txt', 'b.txt', 'c:d', 'e\nf']);
  });

  test('a partial removal with nothing deleted runs no checkout-index', () => {
    const fx = fixture();
    fx.integrate();
    git(fx.top, 'update-ref', backup(fx), fx.head);
    const { runGit, calls } = recording();
    const h = harness(fx, { runGit });
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.out.join('\n')).not.toContain('restored');
    expect(restores(calls)).toEqual([]);
  });

  test('completes a cut-short removal whose status lists more than 1 MB (#293)', () => {
    const fx = fixture();
    const folder = path.join(fx.worktree, `d${'x'.repeat(100)}`);
    fs.mkdirSync(folder);
    for (let i = 0; i < 5500; i++) {
      const name = `${String(i).padStart(5, '0')}${'x'.repeat(115)}`;
      fs.writeFileSync(path.join(folder, name), '');
    }
    git(fx.worktree, 'add', '--', folder);
    git(fx.worktree, 'commit', '-q', '-m', 'many long names');
    const tracked = git(fx.worktree, 'ls-files').split('\n').length;
    fx.integrate();
    const { runGit, calls } = recording();
    const h = harness(fx, { runGit });
    h.claude.state.rm = [cutShort(), removed()];
    expect(h.finish(fx.brief)).toBe(1);
    const status = execRunner(
      'git',
      ['-C', fx.worktree, 'status', '--porcelain', '-z'],
      fx.top,
      { maxBuffer: MAX_OUTPUT },
    );
    expect(status.stdout.length).toBeGreaterThan(1024 * 1024);
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.out).toContain(
      `restored ${tracked} deleted files in ${fx.worktree} from its index, so claude rm finds it clean`,
    );
    expect(h.claude.statusAtRm[1]).toBe(`?? ${REPORT}`);
    expect(fs.existsSync(fx.worktree)).toBe(false);
    const argv = restores(calls).flatMap((c) => c.args);
    expect(argv).toEqual([
      '-C',
      fx.worktree,
      'checkout-index',
      '--stdin',
      '-z',
    ]);
  }, 60_000);

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

  test('a --worktree path with a space, in the re-run and discard commands', () => {
    const fx = fixture({ worktree: (top) => beside(top, ' w1') });
    expect(fx.worktree).toContain(' ');
    const h = harness(fx);
    expect(h.finish(fx.brief, '--worktree', fx.worktree)).toBe(1);
    expect(h.err[0]).toEndWith(
      `discarding it is your call, with sidekick worker finish ${fx.brief} --discard --worktree '${fx.worktree}'`,
    );
    fx.integrate();
    const again = harness(fx);
    again.claude.state.rm = [
      { result: ok({ stdout: `kept ${ID}\n` }), removes: 'nothing' },
    ];
    expect(again.finish(fx.brief, '--worktree', fx.worktree)).toBe(1);
    // The worktree is beside the main checkout, so it counts as hook-made.
    expect(again.err.at(-1)).toEndWith(
      `then run sidekick worker finish ${fx.brief} --discard --worktree '${fx.worktree}'`,
    );
  });
});

// worktrunk's shape: a worktree beside the main checkout, on a branch named
// for the worker, neither of them Claude Code's.
const worktrunk = {
  worktree: (top: string): string => beside(top, '.w1'),
  branch: 'w1',
};

const targetLines = (h: Harness): string[] =>
  h.out.filter((line) => line.startsWith('target: '));

// The refusal when a reader found the worktree on a branch nothing shows is
// the worker's, with the command that confirms it.
const unproven = (fx: Fixture, how: string, confirm: string): string =>
  `finish found the worktree ${fx.worktree} through ${how}, but it is on ${fx.branch}, not worktree-w1, so nothing shows the branch is the worker's: if it is, confirm with ${confirm}`;

// Hides a worktrunk-shaped worktree from every reader: the transcript starts
// in a folder no worktree holds, the listing names the main checkout, and no
// worktree is on worktree-w1. Gives the lines that say what the finder tried.
function lose(fx: Fixture, h: Harness): string[] {
  const elsewhere = tmp();
  writeTranscript(fx.configDir, { cwd: elsewhere, gitBranch: 'w1' });
  h.claude.state.agents = JSON.stringify([agentRow(fx, { cwd: fx.top })]);
  return [
    `the transcript's first cwd ${elsewhere} is in no worktree git lists`,
    `the job listing's cwd ${fx.top} is in the main checkout`,
    'by name, no worktree has worktree-w1 checked out',
  ];
}

// What the real claude rm printed for worktrunk's worktrees (#287, 2026-11-02).
const NO_REMOVE_HOOK =
  'Worktree not removed. No WorktreeRemove hook is enabled here (hooks are disabled, or the repo defines only WorktreeCreate). The session stays until the directory is gone.';
const UNCHECKED_FILES =
  "The worktree has files that weren't checked against a repository (it has none of its own, or a hook manages it). They may be unsaved work.";

describe('finish, when claude rm refuses a worktree a WorktreeCreate hook made', () => {
  test.each([
    ['no WorktreeRemove hook', NO_REMOVE_HOOK],
    ['unchecked files', UNCHECKED_FILES],
  ])("with --discard, for %s, names the hook's removal then finish --discard", (_label, text) => {
    const fx = fixture(worktrunk);
    const h = harness(fx);
    h.claude.state.rm = [refused(text)];
    expect(h.finish(fx.brief, '--discard')).toBe(1);
    expect(h.err.at(-1)).toBe(
      `the worktree ${fx.worktree} on w1 is not the one Claude Code makes for w1, so a WorktreeCreate hook likely made it and claude rm will not remove it: remove it with that hook's own removal, then run sidekick worker finish ${fx.brief} --discard`,
    );
    expect(h.err.join('\n')).toContain(text);
    expect(h.err.join('\n')).not.toContain('run finish again with');
    expect(fs.existsSync(fx.worktree)).toBe(true);
  });

  test('when landed, names the same way out', () => {
    const fx = fixture(worktrunk);
    fx.integrate();
    const h = harness(fx);
    h.claude.state.rm = [refused(NO_REMOVE_HOOK)];
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err.at(-1)).toContain(
      `then run sidekick worker finish ${fx.brief} --discard`,
    );
    expect(h.err.join('\n')).not.toContain('run finish again with');
  });

  test("keeps the generic way out for Claude Code's own worktree", () => {
    const fx = fixture();
    const h = harness(fx);
    h.claude.state.rm = [refused(NO_REMOVE_HOOK)];
    expect(h.finish(fx.brief, '--discard')).toBe(1);
    expect(h.err.at(-1)).toContain('run finish again with');
  });
});

describe('finish finds the worktree wherever it was made', () => {
  test("in worktrunk's shape, ../<repo>.w1 on w1, through the transcript alone, landing and tearing it down", () => {
    const fx = fixture(worktrunk);
    expect(fx.worktree).toBe(
      path.join(path.dirname(fx.top), `${path.basename(fx.top)}.w1`),
    );
    fx.integrate();
    const h = harness(fx);
    // The row names no cwd and no worktree is on worktree-w1, so only the
    // transcript can find it.
    h.claude.state.agents = JSON.stringify([agentRow(fx, { cwd: null })]);
    expect(h.finish(fx.brief)).toBe(0);
    const ref = `refs/sidekick/landed/w1/${fx.head}`;
    expect(h.out).toEqual([
      headTarget(fx.top),
      `w1 landed in ${git(fx.top, 'symbolic-ref', 'HEAD')} at ${fx.head.slice(0, SHORT_SHA)}`,
      `report saved to ${path.join(fx.top, REPORT)}`,
      `session ${ID} removed`,
      `worktree ${fx.worktree} removed`,
      'branch w1 removed',
      `w1 is kept as ${ref}: restore it with git branch w1 ${ref}`,
    ]);
    expect(h.err).toEqual([]);
    expect(fs.existsSync(fx.worktree)).toBe(false);
    expect(branchRemains(fx)).toBe(false);
  });

  test("through the job listing's cwd when no transcript names it, on Claude Code's own branch", () => {
    const fx = fixture({ worktree: (top) => beside(top, '.w1') });
    fx.integrate();
    fs.rmSync(fx.transcript);
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.err).toEqual([]);
    expect(h.out).toContain(`worktree ${fx.worktree} removed`);
    expect(h.out).toContain('branch worktree-w1 removed');
    expect(fs.existsSync(fx.worktree)).toBe(false);
  });

  test.each([
    ['landed', []],
    ['discard', ['--discard']],
  ])("refusing in %s mode a branch only the listing found, which is not Claude Code's, naming --worktree", (_label, args) => {
    const fx = fixture(worktrunk);
    fx.integrate();
    fs.rmSync(fx.transcript);
    const commonDir = path.join(fx.top, '.git');
    writeRecord(commonDir, recordFor(fx));
    const refs = allRefs(fx);
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief, ...args),
      unproven(
        fx,
        "the job listing's cwd",
        `sidekick worker finish ${fx.brief} ${[...args, '--worktree', fx.worktree].join(' ')}`,
      ),
    );
    expect(h.err).toHaveLength(1);
    expect(h.out).toEqual([]);
    expect(readRecords(commonDir).records).toHaveLength(1);
    expect(allRefs(fx)).toBe(refs);
  });

  test('then landing the same worktree once --worktree confirms it', () => {
    const fx = fixture(worktrunk);
    fx.integrate();
    fs.rmSync(fx.transcript);
    expect(harness(fx).finish(fx.brief)).toBe(1);
    const h = harness(fx);
    expect(h.finish(fx.brief, '--worktree', fx.worktree)).toBe(0);
    expect(h.err).toEqual([]);
    expect(h.out).toContain(`worktree ${fx.worktree} removed`);
    expect(h.out).toContain('branch w1 removed');
    expect(branchRemains(fx)).toBe(false);
  });

  test("refusing a branch the transcript found with no gitBranch, which is not Claude Code's", () => {
    const fx = fixture(worktrunk);
    fx.integrate();
    writeTranscript(fx.configDir, { cwd: fx.worktree });
    const h = harness(fx);
    h.claude.state.agents = JSON.stringify([agentRow(fx, { cwd: null })]);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      unproven(
        fx,
        "the transcript's first cwd, which names no branch",
        `sidekick worker finish ${fx.brief} --worktree ${fx.worktree}`,
      ),
    );
  });

  test.each([
    [
      'landed',
      [],
      (fx: Fixture) =>
        `the worktree ${fx.worktree} has refs/heads/other checked out, not w1, so finish cannot check that its commits have landed: check out w1 there and run finish again; discarding it is your call, with sidekick worker finish ${fx.brief} --discard`,
    ],
    [
      'discard',
      ['--discard'],
      (fx: Fixture) =>
        `the worktree ${fx.worktree} has refs/heads/other checked out, not w1, and its commits may not all be on w1, which finish keeps as the backup: check out w1 there and run finish again; to clear it by hand, claude rm ${ID}`,
    ],
  ])('refusing in %s mode a transcript-found worktree switched to another named branch, as off its branch', (_label, args, line) => {
    const fx = fixture(worktrunk);
    fx.integrate();
    git(fx.worktree, 'checkout', '-q', '-b', 'other');
    const refs = allRefs(fx);
    const h = harness(fx);
    expectRefusedUntouched(h, fx, h.finish(fx.brief, ...args), line(fx));
    expect(h.err).toHaveLength(1);
    expect(allRefs(fx)).toBe(refs);
  });

  test('from a sibling checkout, running claude from the main checkout', () => {
    const fx = fixture();
    fx.integrate();
    const side = sibling(fx);
    const h = harness(fx, { cwd: side, workTree: side });
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.err).toEqual([]);
    expect(h.out[0]).toBe(headTarget(fx.top));
    expect(h.claude.calls.length).toBeGreaterThan(0);
    for (const call of h.claude.calls) expect(call.cwd).toBe(fx.top);
    expect(savedReport(fx)).toBe(REPORT_TEXT);
    expect(fs.existsSync(fx.worktree)).toBe(false);
    expect(fs.existsSync(side)).toBe(true);
  });

  test('copying the report into the sibling checkout that holds the brief, run from there', () => {
    const fx = fixture();
    const side = sibling(fx);
    git(side, 'merge', '-q', '--ff-only', fx.branch);
    fs.mkdirSync(path.join(side, 'docs'));
    const brief = path.join(side, 'docs', 'x-brief.md');
    fs.copyFileSync(fx.brief, brief);
    const h = harness(fx, { cwd: side, workTree: side });
    expect(h.finish(brief)).toBe(0);
    expect(h.out.slice(0, 3)).toEqual([
      `target: refs/heads/feature (the HEAD of ${side}, since the brief names no target)`,
      `worktree-w1 landed in refs/heads/feature at ${fx.head.slice(0, SHORT_SHA)}`,
      `report saved to ${path.join(side, REPORT)}`,
    ]);
    expect(fs.readFileSync(path.join(side, REPORT), 'utf-8')).toBe(REPORT_TEXT);
    expect(savedReport(fx)).toBeUndefined();
  });

  test('waiting on the lock git lists for the worktree when its admin folder took a suffix', () => {
    const fx = fixture({
      worktree: (top) => {
        // Held first, this worktree takes the admin folder w1, so the
        // worker's takes w11.
        const other = path.join(tmp(), 'w1');
        git(top, 'worktree', 'add', '-q', other, '-b', 'other');
        git(
          top,
          'worktree',
          'lock',
          '--reason',
          'claude session other (pid 1111 start x)',
          other,
        );
        return path.join(top, '.claude', 'worktrees', 'w1');
      },
    });
    fx.integrate();
    const gitdir = path.join(fx.top, '.git', 'worktrees', 'w11', 'gitdir');
    expect(fs.readFileSync(gitdir, 'utf-8').trim()).toBe(
      path.join(fx.worktree, '.git'),
    );
    git(
      fx.top,
      'worktree',
      'lock',
      '--reason',
      'claude session w1 (pid 4242 start x)',
      fx.worktree,
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
  });

  test('refusing in landed mode when nothing finds it, naming each place it tried', () => {
    const fx = fixture(worktrunk);
    fx.integrate();
    const h = harness(fx);
    const tried = lose(fx, h);
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err).toEqual(notFound(tried));
    expect(h.out).toEqual([]);
    expect(h.claude.named('stop')).toEqual([]);
    expect(h.claude.named('rm')).toEqual([]);
    expect(savedReport(fx)).toBeUndefined();
    expect(fs.existsSync(fx.worktree)).toBe(true);
    expect(branchRemains(fx)).toBe(true);
  });

  test("refusing with git's words when git worktree list fails as it looks", () => {
    const fx = fixture();
    fx.integrate();
    const listed: string[] = [];
    // checkoutFacts lists first; the finder's listing is the second.
    const runGit: Runner = (cmd, args, cwd, opts) => {
      const listing = args[0] === 'worktree' && args[1] === 'list';
      if (listing) listed.push(cwd);
      if (listing && listed.length === 2) {
        return { code: 128, stdout: '', stderr: 'fatal: cannot list\n' };
      }
      return execRunner(cmd, args, cwd, opts);
    };
    const h = harness(fx, { runGit });
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err).toEqual([
      'git worktree list failed, so finish cannot find the worktree of w1: fatal: cannot list',
    ]);
    expect(h.claude.named('stop')).toEqual([]);
  });
});

describe('finish names its target in one line', () => {
  test('from --into', () => {
    const fx = fixture();
    fx.landOnBranch('feature', 'squash');
    const h = harness(fx);
    expect(h.finish(fx.brief, '--into', 'feature')).toBe(0);
    expect(h.out[0]).toBe('target: refs/heads/feature (from --into)');
    expect(targetLines(h)).toHaveLength(1);
  });

  test("from the brief's target", () => {
    const fx = fixture();
    fx.landOnBranch('feature', 'squash');
    addTarget(fx.brief, 'feature');
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.out[0]).toBe("target: refs/heads/feature (the brief's target)");
    expect(targetLines(h)).toHaveLength(1);
  });

  test("from the HEAD of the brief's checkout, since the brief names no target", () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.out[0]).toBe(headTarget(fx.top));
    expect(targetLines(h)).toHaveLength(1);
  });

  test("from --into over the brief's target, which it then never reads", () => {
    const fx = fixture();
    fx.landOnBranch('feature', 'squash');
    addTarget(fx.brief, 'nowhere');
    const h = harness(fx);
    expect(h.finish(fx.brief, '--into', 'feature')).toBe(0);
    expect(h.out[0]).toBe('target: refs/heads/feature (from --into)');
  });

  test('from --into, resolved in the checkout finish runs in', () => {
    const fx = fixture();
    const side = sibling(fx);
    git(side, 'merge', '-q', '--ff-only', fx.branch);
    const h = harness(fx, { cwd: side, workTree: side });
    expect(h.finish(fx.brief, '--into', 'HEAD')).toBe(0);
    expect(h.out[0]).toBe('target: refs/heads/feature (from --into)');
  });

  test("from a brief's target that starts with a dash, read as a branch, not an option", () => {
    const fx = fixture();
    fx.integrate();
    git(fx.top, 'update-ref', 'refs/heads/-x', 'HEAD');
    addTarget(fx.brief, '-x');
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.out[0]).toBe("target: refs/heads/-x (the brief's target)");
  });

  test('none in discard mode', () => {
    const fx = fixture();
    const h = harness(fx);
    expect(h.finish(fx.brief, '--discard')).toBe(0);
    expect(targetLines(h)).toEqual([]);
  });

  test('before a not-landed refusal, naming the target it judged and why', () => {
    const fx = fixture();
    const h = harness(fx);
    const branch = git(fx.top, 'symbolic-ref', 'HEAD');
    const sha = git(fx.top, 'rev-parse', 'HEAD');
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.out).toEqual([headTarget(fx.top)]);
    expect(h.err).toEqual([
      `worktree-w1 has not landed in ${branch} (${sha}): its head ${fx.head} is not there, and the history walk tried 0 commits and found no match. Land it and run finish again; name the target with --into <rev>; discarding it is your call, with sidekick worker finish ${fx.brief} --discard`,
    ]);
  });

  test('before a not-landed refusal against --into, saying it came from --into', () => {
    const fx = fixture();
    fx.orphan('orphan');
    const h = harness(fx);
    expect(h.finish(fx.brief, '--into', 'orphan')).toBe(1);
    expect(h.out).toEqual(['target: refs/heads/orphan (from --into)']);
    expect(h.err).toHaveLength(1);
  });

  test('before a refusal from a landed check that fails to run', () => {
    const fx = fixture();
    const runGit: Runner = (cmd, args, cwd, opts) =>
      args.includes('merge-tree')
        ? { code: 129, stdout: '', stderr: 'usage: git merge-tree\n' }
        : execRunner(cmd, args, cwd, opts);
    const h = harness(fx, { runGit });
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.out).toEqual([headTarget(fx.top)]);
    expect(h.err).toEqual([
      `finish cannot check that worktree-w1 landed in ${git(fx.top, 'symbolic-ref', 'HEAD')}: git merge-tree --write-tree failed, and finish needs git 2.40 or later: usage: git merge-tree`,
    ]);
  });

  test("before the other checks' refusals, once the target resolves", () => {
    const fx = fixture();
    fx.integrate();
    fs.writeFileSync(path.join(fx.worktree, 'notes.md'), 'x\n');
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.out).toEqual([headTarget(fx.top)]);
    expect(h.err).toEqual([
      `the worktree ${fx.worktree} holds uncommitted work besides the report, which its removal would destroy: notes.md. Commit and integrate it, or remove it, then run finish again`,
    ]);
  });

  test('none before a refusal when the branch does not exist, since no target resolves', () => {
    const fx = fixture();
    fx.integrate();
    git(fx.worktree, 'checkout', '-q', '--detach');
    git(fx.top, 'branch', '-D', 'worktree-w1');
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.out).toEqual([]);
  });

  test('none before a refusal in discard mode', () => {
    const fx = fixture();
    fs.writeFileSync(path.join(fx.worktree, 'notes.md'), 'x\n');
    const h = harness(fx);
    expect(h.finish(fx.brief, '--discard')).toBe(1);
    expect(h.out).toEqual([]);
    expect(h.err).toHaveLength(1);
  });

  test("refusing a brief's target that names no branch", () => {
    const fx = fixture();
    fx.integrate();
    addTarget(fx.brief, 'nowhere');
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      "the brief's target nowhere names no branch, so finish cannot check that worktree-w1 landed there: create the branch, fix the brief's target, or name the target with --into <rev>",
    );
    expect(h.out).toEqual([]);
  });

  test("refusing the worker's own branch as the brief's target", () => {
    const fx = fixture();
    addTarget(fx.brief, 'worktree-w1');
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      "the target refs/heads/worktree-w1 is the worker's own branch, which holds its head whether or not the work landed, so it cannot show the work landed there: name the branch it should land in with --into <rev>",
    );
  });
});

describe('finish with a brief in no checkout', () => {
  // The fixture's brief, copied to a folder no git checkout holds.
  function strayBrief(fx: Fixture): string {
    const file = path.join(tmp(), 'x-brief.md');
    fs.copyFileSync(fx.brief, file);
    return file;
  }

  test("refuses the HEAD fallback and the report's copy, naming the brief's folder", () => {
    const fx = fixture();
    fx.integrate();
    const brief = strayBrief(fx);
    const folder = path.dirname(brief);
    const h = harness(fx);
    expect(h.finish(brief)).toBe(1);
    expect(h.err).toEqual([
      `the brief's folder ${folder} is in no git checkout, so finish has no HEAD to check that worktree-w1 landed in: name the target with --into <rev>`,
      `the brief's folder ${folder} is in no git checkout, so finish has nowhere to save the run report at ${path.join(fx.worktree, REPORT)}: move the brief into a checkout of the repo, then run finish again`,
    ]);
    expect(h.claude.named('stop')).toEqual([]);
    expect(fs.existsSync(fx.worktree)).toBe(true);
  });

  test('passes with --into and --no-report when the worktree holds no report', () => {
    const fx = fixture();
    fx.integrate();
    fs.rmSync(path.join(fx.worktree, REPORT));
    const brief = strayBrief(fx);
    const main = git(fx.top, 'symbolic-ref', '--short', 'HEAD');
    const h = harness(fx);
    expect(h.finish(brief, '--no-report', '--into', main)).toBe(0);
    expect(h.err).toEqual([]);
    expect(h.out[0]).toBe(`target: refs/heads/${main} (from --into)`);
    expect(h.out).toContain('no report to save: the worktree holds none');
    expect(fs.existsSync(fx.worktree)).toBe(false);
  });
});

// The worker's dispatch record, as dispatch writes it.
const recordFor = (fx: Fixture): WorkerRecord => ({
  version: 2,
  name: 'w1',
  main: null,
  job: ID,
  brief: fx.brief,
  dispatchedAt: '2026-11-01T10:00:00.000Z',
});

// Every ref in the fixture's repo with the commit it names.
const allRefs = (fx: Fixture): string =>
  git(fx.top, 'for-each-ref', '--format=%(refname) %(objectname)');

const mainBranch = (fx: Fixture): string =>
  git(fx.top, 'symbolic-ref', '--short', 'HEAD');

// The refusal when --worktree names no worktree finish can clear: why, then
// each linked worktree git lists.
const operatorRefusal = (tried: string, listed: string[]): string[] => [
  'finish cannot find the worktree of w1, so it removed nothing. It tried:',
  tried,
  ...(listed.length === 0
    ? ['git lists no linked worktree']
    : ['git lists these linked worktrees:', ...listed]),
  "name the worker's worktree with --worktree <path>, or run finish without --worktree",
];

describe('finish --worktree', () => {
  test("names the worker's worktree when no reader finds it, resolving a path relative to where finish runs", () => {
    const fx = fixture(worktrunk);
    fx.integrate();
    const h = harness(fx);
    lose(fx, h);
    const relative = path.relative(fx.top, fx.worktree);
    expect(relative).toStartWith('..');
    expect(h.finish(fx.brief, '--worktree', relative)).toBe(0);
    expect(h.err).toEqual([]);
    const ref = `refs/sidekick/landed/w1/${fx.head}`;
    expect(h.out).toEqual([
      headTarget(fx.top),
      `w1 landed in ${git(fx.top, 'symbolic-ref', 'HEAD')} at ${fx.head.slice(0, SHORT_SHA)}`,
      `report saved to ${path.join(fx.top, REPORT)}`,
      `session ${ID} removed`,
      `worktree ${fx.worktree} removed`,
      'branch w1 removed',
      `w1 is kept as ${ref}: restore it with git branch w1 ${ref}`,
    ]);
    expect(fs.existsSync(fx.worktree)).toBe(false);
    expect(branchRemains(fx)).toBe(false);
  });

  test('names a leftover it cannot remove by its path, which resolves where the name does not', () => {
    const fx = fixture(worktrunk);
    fx.integrate();
    const h = harness(fx);
    lose(fx, h);
    git(fx.top, 'worktree', 'lock', '--reason', 'locked by hand', fx.worktree);
    h.claude.state.rm = [removed('nothing')];
    expect(h.finish(fx.brief, '--worktree', fx.worktree)).toBe(1);
    const folder = path.basename(fx.worktree);
    expect(h.err).toEqual([
      `claude rm said removed, but git still lists the worktree ${fx.worktree}`,
      `${fx.worktree} is locked: locked by hand`,
      `${forgottenWayOut(fx)}. remove leaves the branch w1 in place, since it deletes only worktree-${folder} or a branch sidekick worktree move made for that worktree, and writes a backup ref for its head first`,
    ]);
    expect(folder).not.toBe('w1');
  });

  test('takes a subfolder of the worktree as the worktree', () => {
    const fx = fixture(worktrunk);
    fx.integrate();
    const h = harness(fx);
    lose(fx, h);
    expect(
      h.finish(fx.brief, '--worktree', path.join(fx.worktree, 'docs')),
    ).toBe(0);
    expect(h.out).toContain(`worktree ${fx.worktree} removed`);
  });

  test('refuses the main checkout, quoting what git lists', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    expect(h.finish(fx.brief, '--worktree', fx.top)).toBe(1);
    expect(h.err).toEqual(
      operatorRefusal(`the --worktree path ${fx.top} is in the main checkout`, [
        `${fx.worktree}: worktree-w1`,
      ]),
    );
    expect(h.out).toEqual([]);
    expect(h.claude.named('stop')).toEqual([]);
    expect(h.claude.named('rm')).toEqual([]);
  });

  test.each([
    ['landed', []],
    ['discard', ['--discard']],
  ])('refuses in %s mode a path git does not list, quoting each linked worktree with its branch or detached', (_label, args) => {
    const fx = fixture();
    fx.integrate();
    // git lists linked worktrees sorted by path (git 2.50.1, 2026-11-01),
    // and `<top>.loose` sorts before `<top>/.claude`.
    const loose = beside(fx.top, '.loose');
    git(fx.top, 'worktree', 'add', '-q', '--detach', loose);
    const commonDir = path.join(fx.top, '.git');
    writeRecord(commonDir, recordFor(fx));
    const nowhere = tmp();
    const refs = allRefs(fx);
    const h = harness(fx);
    expect(h.finish(fx.brief, ...args, '--worktree', nowhere)).toBe(1);
    expect(h.err).toEqual(
      operatorRefusal(
        `the --worktree path ${nowhere} is in no worktree git lists`,
        [`${loose}: detached`, `${fx.worktree}: worktree-w1`],
      ),
    );
    expect(h.out).toEqual([]);
    expect(h.claude.named('stop')).toEqual([]);
    expect(h.claude.named('rm')).toEqual([]);
    expect(readRecords(commonDir).records).toHaveLength(1);
    expect(allRefs(fx)).toBe(refs);
    expect(fs.existsSync(fx.worktree)).toBe(true);
  });

  test('refuses a detached worktree, which holds no branch to land', () => {
    const fx = fixture();
    fx.integrate();
    const loose = beside(fx.top, '.loose');
    git(fx.top, 'worktree', 'add', '-q', '--detach', loose);
    const h = harness(fx);
    expect(h.finish(fx.brief, '--worktree', loose)).toBe(1);
    expect(h.err).toEqual(
      operatorRefusal(`the --worktree path ${loose} is detached`, [
        `${loose}: detached`,
        `${fx.worktree}: worktree-w1`,
      ]),
    );
  });

  test('says git lists no linked worktree when it lists none', () => {
    const fx = fixture();
    fx.integrate();
    git(fx.top, 'worktree', 'remove', '--force', fx.worktree);
    const h = harness(fx);
    expect(h.finish(fx.brief, '--worktree', fx.worktree)).toBe(1);
    expect(h.err).toEqual(
      operatorRefusal(
        `the --worktree path ${fx.worktree} is in the main checkout`,
        [],
      ),
    );
  });

  test("refuses the brief's checkout", () => {
    const fx = fixture();
    fx.integrate();
    const side = sibling(fx);
    fs.mkdirSync(path.join(side, 'docs'));
    const brief = path.join(side, 'docs', 'x-brief.md');
    fs.copyFileSync(fx.brief, brief);
    const h = harness(fx);
    expect(h.finish(brief, '--worktree', side)).toBe(1);
    expect(h.err[1]).toBe(
      `the --worktree path ${side} is in the brief's checkout ${side}`,
    );
    expect(h.claude.named('rm')).toEqual([]);
  });

  test("refuses a subfolder of the brief's checkout, naming that checkout", () => {
    const fx = fixture();
    fx.integrate();
    const side = sibling(fx);
    const docs = path.join(side, 'docs');
    fs.mkdirSync(docs);
    const brief = path.join(docs, 'x-brief.md');
    fs.copyFileSync(fx.brief, brief);
    const h = harness(fx);
    expect(h.finish(brief, '--worktree', docs)).toBe(1);
    expect(h.err[1]).toBe(
      `the --worktree path ${docs} is in the brief's checkout ${side}`,
    );
    expect(h.claude.named('rm')).toEqual([]);
  });

  test('accepts a prunable entry, whose missing folder the checks then refuse', () => {
    const fx = fixture();
    fx.integrate();
    fs.rmSync(fx.worktree, { recursive: true, force: true });
    expect(git(fx.top, 'worktree', 'list', '--porcelain')).toContain(
      'prunable',
    );
    const h = harness(fx);
    expect(h.finish(fx.brief, '--worktree', fx.worktree)).toBe(1);
    expect(h.err).toHaveLength(3);
    expect(h.err[0]).toStartWith(
      `the worktree ${fx.worktree} has an unreadable HEAD (`,
    );
    expect(h.claude.named('rm')).toEqual([]);
  });

  test('carries --worktree into the discard command a refusal offers', () => {
    const fx = fixture();
    const h = harness(fx);
    expect(h.finish(fx.brief, '--worktree', fx.worktree)).toBe(1);
    expect(h.err[0]).toEndWith(
      `discarding it is your call, with sidekick worker finish ${fx.brief} --discard --worktree ${fx.worktree}`,
    );
  });
});

const NO_REPORT_READ =
  'no report saved: --name reads no brief, so finish does not know where the report is';

describe('finish --name', () => {
  test('lands a worker whose brief was deleted, with --no-report and --into', () => {
    const fx = fixture();
    fx.integrate();
    fs.rmSync(fx.brief);
    fs.rmSync(path.join(fx.worktree, REPORT));
    const commonDir = path.join(fx.top, '.git');
    writeRecord(commonDir, recordFor(fx));
    const main = mainBranch(fx);
    const h = harness(fx);
    expect(h.finish('--name', 'w1', '--no-report', '--into', main)).toBe(0);
    expect(h.err).toEqual([]);
    const ref = `refs/sidekick/landed/w1/${fx.head}`;
    expect(h.out).toEqual([
      `target: refs/heads/${main} (from --into)`,
      `worktree-w1 landed in refs/heads/${main} at ${fx.head.slice(0, SHORT_SHA)}`,
      NO_REPORT_READ,
      `session ${ID} removed`,
      `worktree ${fx.worktree} removed`,
      'branch worktree-w1 removed',
      `worktree-w1 is kept as ${ref}: restore it with git branch worktree-w1 ${ref}`,
    ]);
    expect(readRecords(commonDir)).toEqual({ records: [], warnings: [] });
    expect(fs.existsSync(fx.worktree)).toBe(false);
    expect(branchRemains(fx)).toBe(false);
  });

  test('refuses a report left in the worktree, which with no brief is uncommitted work', () => {
    const fx = fixture();
    fx.integrate();
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish('--name', 'w1', '--no-report', '--into', mainBranch(fx)),
      `the worktree ${fx.worktree} holds uncommitted work, which its removal would destroy: ${REPORT}. Commit and integrate it, or remove it, then run finish again`,
    );
  });

  test('refuses work that has not landed, offering the discard with --name', () => {
    const fx = fixture();
    fs.rmSync(path.join(fx.worktree, REPORT));
    const main = mainBranch(fx);
    const sha = git(fx.top, 'rev-parse', 'HEAD');
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish('--name', 'w1', '--no-report', '--into', main),
      `worktree-w1 has not landed in refs/heads/${main} (${sha}): its head ${fx.head} is not there, and the history walk tried 0 commits and found no match. Land it and run finish again; name the target with --into <rev>; discarding it is your call, with sidekick worker finish --name w1 --no-report --discard`,
    );
  });

  test('discards with --discard alone, repeating --name in its re-run command', () => {
    const fx = fixture();
    fs.rmSync(path.join(fx.worktree, REPORT));
    const h = harness(fx);
    h.claude.state.rm = [
      { result: ok({ stdout: `kept ${ID}\n` }), removes: 'nothing' },
    ];
    expect(h.finish('--name', 'w1', '--discard')).toBe(1);
    expect(h.out.slice(0, 2)).toEqual([
      'worktree-w1 is discarded on your word',
      NO_REPORT_READ,
    ]);
    expect(h.err.at(-1)).toBe(
      wayOut('sidekick worker finish --name w1 --discard', `claude rm ${ID}`),
    );
  });

  test('names --name, not the brief, when no session has the name', () => {
    const fx = fixture();
    const h = harness(fx);
    h.claude.state.agents = JSON.stringify([]);
    expect(h.finish('--name', 'w1', '--discard')).toBe(1);
    expect(h.err).toEqual([
      'no session in claude agents --json --all is named "w1". If finish already removed it, run sidekick worktree list, then sidekick worktree remove <name> for a worktree the worker left, since remove takes no branch. A branch left with no worktree holds the worker\'s commits, and blocks a new worktree named w1. Once you have checked that its commits have landed, delete it with git branch -D worktree-w1, or dispatch under another name. Otherwise check the name given to --name',
    ]);
  });
});

// A worker dispatched from a sibling checkout on `feature`, whose brief is
// gone and whose session, after a respawn, names that checkout in both its
// transcript and its listing. With `record`, the dispatch record names the
// brief's folder in the sibling, which still exists.
function dispatchedFromSibling(
  fx: Fixture,
  { record }: { record: boolean },
): { side: string; h: Harness } {
  const side = sibling(fx);
  const folder = path.join(side, 'docs');
  fs.mkdirSync(folder);
  fs.rmSync(fx.brief);
  if (record) {
    const brief = path.join(folder, 'x-brief.md');
    writeRecord(path.join(fx.top, '.git'), { ...recordFor(fx), brief });
  }
  writeTranscript(fx.configDir, { cwd: side, gitBranch: 'feature' });
  return { side, h: harness(fx) };
}

describe('finish --name keeps the checkout that dispatched the worker', () => {
  test('rejecting it by the dispatch record, as that checkout', () => {
    const fx = fixture(worktrunk);
    fx.integrate();
    const { side, h } = dispatchedFromSibling(fx, { record: true });
    h.claude.state.agents = JSON.stringify([agentRow(fx, { cwd: side })]);
    const main = mainBranch(fx);
    expect(h.finish('--name', 'w1', '--no-report', '--into', main)).toBe(1);
    expect(h.err).toEqual(
      notFound([
        `the transcript's first cwd ${side} is in the checkout that dispatched the worker ${side}`,
        `the job listing's cwd ${side} is in the checkout that dispatched the worker ${side}`,
        'by name, no worktree has worktree-w1 checked out',
      ]),
    );
    expect(h.claude.named('stop')).toEqual([]);
    expect(fs.existsSync(side)).toBe(true);
  });

  test('rejecting the checkout finish runs in when the record is gone', () => {
    const fx = fixture(worktrunk);
    fx.integrate();
    const { side } = dispatchedFromSibling(fx, { record: false });
    const h = harness(fx, { cwd: side, workTree: side });
    h.claude.state.agents = JSON.stringify([agentRow(fx, { cwd: side })]);
    const main = mainBranch(fx);
    expect(h.finish('--name', 'w1', '--no-report', '--into', main)).toBe(1);
    expect(h.err).toEqual(
      notFound([
        `the transcript's first cwd ${side} is in the checkout finish runs in ${side}`,
        `the job listing's cwd ${side} is in the checkout finish runs in ${side}`,
        'by name, no worktree has worktree-w1 checked out',
      ]),
    );
    expect(h.claude.named('stop')).toEqual([]);
  });

  test('rejecting the checkout finish runs in when the folder the record names is gone', () => {
    const fx = fixture(worktrunk);
    fx.integrate();
    const { side } = dispatchedFromSibling(fx, { record: true });
    fs.rmSync(path.join(side, 'docs'), { recursive: true });
    const h = harness(fx, { cwd: side, workTree: side });
    h.claude.state.agents = JSON.stringify([agentRow(fx, { cwd: side })]);
    expect(
      h.finish('--name', 'w1', '--no-report', '--into', mainBranch(fx)),
    ).toBe(1);
    expect(h.err[1]).toBe(
      `the transcript's first cwd ${side} is in the checkout finish runs in ${side}`,
    );
  });

  test("then finding the worker's own worktree by Claude Code's name, and landing it", () => {
    const fx = fixture();
    fx.integrate();
    fs.rmSync(path.join(fx.worktree, REPORT));
    const { side, h } = dispatchedFromSibling(fx, { record: true });
    h.claude.state.agents = JSON.stringify([agentRow(fx, { cwd: side })]);
    expect(
      h.finish('--name', 'w1', '--no-report', '--into', mainBranch(fx)),
    ).toBe(0);
    expect(h.err).toEqual([]);
    expect(h.out).toContain(`worktree ${fx.worktree} removed`);
    expect(fs.existsSync(side)).toBe(true);
    expect(git(side, 'symbolic-ref', '--short', 'HEAD')).toBe('feature');
  });
});

const GONE_HEAD =
  'finish cannot find the worktree of w1, so it removes only its session and record. It tried:';
const GONE_TAIL =
  "the worktree of w1 was not found, so finish deleted no branch: run sidekick worktree list, then sidekick worktree remove <name> for a worktree the worker left, since remove takes no branch. A branch left with no worktree holds the worker's commits, and blocks a new worktree named w1. Once you have checked that its commits have landed, delete it with git branch -D worktree-w1, or dispatch under another name";

describe('finish --discard with no worktree found', () => {
  test('removes the session and the record, and leaves every branch and worktree in place', () => {
    const fx = fixture(worktrunk);
    const commonDir = path.join(fx.top, '.git');
    writeRecord(commonDir, recordFor(fx));
    const h = harness(fx);
    const tried = lose(fx, h);
    h.claude.state.rm = [removed('nothing')];
    const refs = allRefs(fx);
    expect(h.finish(fx.brief, '--discard')).toBe(0);
    expect(h.err).toEqual([]);
    expect(h.out).toEqual([
      GONE_HEAD,
      ...tried,
      `session ${ID} removed`,
      GONE_TAIL,
    ]);
    expect(h.claude.named('stop')).toEqual([['stop', ID]]);
    expect(h.claude.named('rm')).toEqual([['rm', ID]]);
    expect(readRecords(commonDir)).toEqual({ records: [], warnings: [] });
    expect(allRefs(fx)).toBe(refs);
    expect(fs.existsSync(fx.worktree)).toBe(true);
    expect(savedReport(fx)).toBeUndefined();
  });

  test('runs claude from the main checkout, claude rm without a limit', () => {
    const fx = fixture(worktrunk);
    const h = harness(fx);
    lose(fx, h);
    h.claude.state.rm = [removed('nothing')];
    expect(h.finish(fx.brief, '--discard')).toBe(0);
    const rm = h.claude.calls.filter((c) => c.args[0] === 'rm');
    expect(rm).toEqual([{ args: ['rm', ID], cwd: fx.top, timeoutMs: 0 }]);
  });

  // With no worktree there is no lock to read, and a done worker's idle process
  // still holds one (the dispatch bench, 2026-10-14), so the stop always runs.
  test.each([
    'done',
    'stopped',
  ])('runs claude stop before claude rm for a job listed as %s', (state) => {
    const fx = fixture(worktrunk);
    const h = harness(fx);
    lose(fx, h);
    h.claude.state.agents = JSON.stringify([
      agentRow(fx, { cwd: fx.top, state }),
    ]);
    h.claude.state.rm = [removed('nothing')];
    expect(h.finish(fx.brief, '--discard')).toBe(0);
    const verbs = h.claude.calls
      .map((c) => c.args[0])
      .filter((verb) => verb !== 'agents');
    expect(verbs).toEqual(['stop', 'rm']);
    expect(h.claude.named('stop')).toEqual([['stop', ID]]);
  });

  // claude rm keeps a session whose worktree lock names a running process,
  // exiting 0 (the dispatch probes, "Stopping and cleanup").
  test('refuses when claude rm keeps the session, naming claude stop before claude rm by hand', () => {
    const fx = fixture(worktrunk);
    const commonDir = path.join(fx.top, '.git');
    writeRecord(commonDir, recordFor(fx));
    const h = harness(fx);
    lose(fx, h);
    const text = `kept ${ID}: a Claude Code lock on the worktree names a process that is still running`;
    h.claude.state.rm = [
      { result: ok({ stdout: `${text}\n` }), removes: 'nothing' },
    ];
    expect(h.finish(fx.brief, '--discard')).toBe(1);
    expect(h.err).toEqual([
      `claude rm ${ID} did not say removed, and finish does not know its answer, so finish removed nothing more:`,
      text,
      `run finish again with sidekick worker finish ${fx.brief} --discard, or complete the removal by hand with claude stop ${ID}, then claude rm ${ID}`,
    ]);
    expect(readRecords(commonDir).records).toHaveLength(1);
  });

  test('clears a worker named with --name whose brief is gone', () => {
    const fx = fixture(worktrunk);
    fs.rmSync(fx.brief);
    const h = harness(fx);
    const tried = lose(fx, h);
    h.claude.state.rm = [removed('nothing')];
    const refs = allRefs(fx);
    expect(h.finish('--name', 'w1', '--discard')).toBe(0);
    expect(h.out).toEqual([
      GONE_HEAD,
      ...tried,
      `session ${ID} removed`,
      GONE_TAIL,
    ]);
    expect(allRefs(fx)).toBe(refs);
  });

  test("refuses claude rm's offer to discard, printing claude's text, and keeps the record", () => {
    const fx = fixture(worktrunk);
    const commonDir = path.join(fx.top, '.git');
    writeRecord(commonDir, recordFor(fx));
    const h = harness(fx);
    lose(fx, h);
    const offer = kept(fx, fx.head);
    h.claude.state.rm = [offer];
    const refs = allRefs(fx);
    expect(h.finish(fx.brief, '--discard')).toBe(1);
    expect(h.err).toEqual([
      `claude rm ${ID} offers to discard ${fx.head}, but finish found no worktree, so it has no verified head to check that against and did not run it:`,
      offer.result.stdout.trim(),
      'check what the discard would lose before you run it by hand, or name the worktree with --worktree <path> so that finish verifies its head first',
    ]);
    expect(h.claude.named('rm')).toEqual([['rm', ID]]);
    expect(readRecords(commonDir).records).toHaveLength(1);
    expect(allRefs(fx)).toBe(refs);
    expect(h.out).not.toContain(GONE_TAIL);
  });

  test('refuses a claude rm answer it does not know, printing it', () => {
    const fx = fixture(worktrunk);
    const h = harness(fx);
    lose(fx, h);
    h.claude.state.rm = [
      { result: ok({ stdout: `kept ${ID}\n` }), removes: 'nothing' },
    ];
    expect(h.finish(fx.brief, '--discard')).toBe(1);
    expect(h.err).toEqual([
      `claude rm ${ID} did not say removed, and finish does not know its answer, so finish removed nothing more:`,
      `kept ${ID}`,
      `run finish again with sidekick worker finish ${fx.brief} --discard, or complete the removal by hand with claude stop ${ID}, then claude rm ${ID}`,
    ]);
  });

  test('refuses a claude rm that fails, naming its exit code', () => {
    const fx = fixture(worktrunk);
    const h = harness(fx);
    lose(fx, h);
    h.claude.state.rm = [{ result: ok({ code: 2 }), removes: 'nothing' }];
    expect(h.finish(fx.brief, '--discard')).toBe(1);
    expect(h.err).toEqual([
      `claude rm ${ID} failed with exit code 2, so finish removed nothing more`,
      `run finish again with sidekick worker finish ${fx.brief} --discard, or complete the removal by hand with claude stop ${ID}, then claude rm ${ID}`,
    ]);
  });

  test('refuses a claude stop that fails, before claude rm runs', () => {
    const fx = fixture(worktrunk);
    const h = harness(fx);
    lose(fx, h);
    h.claude.state.stop = ok({ code: 1, stderr: 'No running job 213245a1\n' });
    expect(h.finish(fx.brief, '--discard')).toBe(1);
    expect(h.err).toEqual([
      `claude stop ${ID} failed with exit code 1, so finish stopped before claude rm:`,
      'No running job 213245a1',
    ]);
    expect(h.claude.named('rm')).toEqual([]);
  });

  // On 2.1.322 the row drops its pid once the stop has run and claude stop
  // returns before the process exits (spec probe, 2026-11-10), so the wait
  // reads the pid from the listing taken before the stop.
  describe('waits on the process the listing named', () => {
    const PID = 4242;

    test.each([
      'done',
      'working',
    ])('waits for a job listed as %s before claude rm', (state) => {
      const fx = fixture(worktrunk);
      const commonDir = path.join(fx.top, '.git');
      writeRecord(commonDir, recordFor(fx));
      let stopped = false;
      let polls = 0;
      const h = harness(fx, {
        isAlive: (pid) => pid === PID && (!stopped || polls++ < 2),
      });
      lose(fx, h);
      h.claude.state.agents = JSON.stringify([
        agentRow(fx, { cwd: fx.top, state, pid: PID }),
      ]);
      h.claude.state.whileStopping = () => {
        stopped = true;
      };
      h.claude.state.rm = [removed('nothing')];
      expect(h.finish(fx.brief, '--discard')).toBe(0);
      expect(h.slept.length).toBeGreaterThanOrEqual(1);
      expect(h.claude.named('rm')).toEqual([['rm', ID]]);
      expect(readRecords(commonDir)).toEqual({ records: [], warnings: [] });
    });

    test('refuses when the process never exits, and runs no claude rm', () => {
      const fx = fixture(worktrunk);
      const commonDir = path.join(fx.top, '.git');
      writeRecord(commonDir, recordFor(fx));
      const h = harness(fx, { isAlive: (pid) => pid === PID });
      lose(fx, h);
      h.claude.state.agents = JSON.stringify([
        agentRow(fx, { cwd: fx.top, state: 'done', pid: PID }),
      ]);
      expect(h.finish(fx.brief, '--discard')).toBe(1);
      expect(h.err).toEqual([
        `the job's process, pid ${PID}, still runs 15 s after claude stop: run finish again with sidekick worker finish ${fx.brief} --discard once it exits`,
      ]);
      expect(h.claude.named('rm')).toEqual([]);
      expect(readRecords(commonDir).records).toHaveLength(1);
    });

    test('does not sleep when the process is gone as the stop returns', () => {
      const fx = fixture(worktrunk);
      let stopped = false;
      const h = harness(fx, { isAlive: (pid) => pid === PID && !stopped });
      lose(fx, h);
      h.claude.state.agents = JSON.stringify([
        agentRow(fx, { cwd: fx.top, state: 'done', pid: PID }),
      ]);
      h.claude.state.whileStopping = () => {
        stopped = true;
      };
      h.claude.state.rm = [removed('nothing')];
      expect(h.finish(fx.brief, '--discard')).toBe(0);
      expect(h.slept).toEqual([]);
      expect(h.claude.named('rm')).toEqual([['rm', ID]]);
    });

    test('does not wait after a claude stop that fails', () => {
      const fx = fixture(worktrunk);
      const h = harness(fx, { isAlive: (pid) => pid === PID });
      lose(fx, h);
      h.claude.state.agents = JSON.stringify([
        agentRow(fx, { cwd: fx.top, state: 'done', pid: PID }),
      ]);
      h.claude.state.stop = ok({
        code: 1,
        stderr: 'No running job 213245a1\n',
      });
      expect(h.finish(fx.brief, '--discard')).toBe(1);
      expect(h.err).toEqual([
        `claude stop ${ID} failed with exit code 1, so finish stopped before claude rm:`,
        'No running job 213245a1',
      ]);
      expect(h.slept).toEqual([]);
      expect(h.claude.named('rm')).toEqual([]);
    });
  });
});

describe('the target with no brief', () => {
  test('refuses without --into, which the arguments already require', () => {
    const judge = judgeFor(
      execRunner,
      { launchTop: '/r', mainTop: '/r', brief: undefined },
      { name: 'worktree-w1', head: 'a'.repeat(40) },
      {
        subject: { kind: 'name', name: 'w1' },
        noReport: true,
        mode: { kind: 'landed', into: undefined },
        worktree: undefined,
      },
      ID,
    );
    expect(judge).toEqual({
      issues: [
        '--name reads no brief, so finish has no target to check that worktree-w1 landed in: name the target with --into <rev>',
      ],
    });
  });
});

describe('finish and ignored files', () => {
  const IGNORE = 'node_modules/\nscratch/\ndocs/\n';
  const skipList = (fx: Fixture): string =>
    path.join(fx.top, '.git', 'sidekick', 'disposable');
  const write = (fx: Fixture, file: string, text = 'x\n'): void => {
    const target = path.join(fx.worktree, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };
  const ignoredLine = (fx: Fixture, files: string): string =>
    `the worktree ${fx.worktree} holds ignored files that its removal would delete, and the main checkout lacks them or holds other contents: ${files}. Move or delete them, or add their folder to ${skipList(fx)}, then run finish again`;

  test('landed mode refuses a new ignored file and removes nothing', () => {
    const fx = fixture({ ignore: IGNORE });
    fx.integrate();
    write(fx, 'scratch/run.sh');
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      ignoredLine(fx, 'scratch/run.sh'),
    );
  });

  test('an ignored file beside a partial removal refuses on its own line, and a re-run without it restores the deleted files', () => {
    const fx = fixture({ ignore: IGNORE });
    fx.integrate();
    git(fx.top, 'update-ref', backup(fx), fx.head);
    const a = path.join(fx.worktree, 'a.txt');
    fs.rmSync(a);
    write(fx, 'scratch/run.sh');
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      ignoredLine(fx, 'scratch/run.sh'),
    );
    expect(h.err).toEqual([ignoredLine(fx, 'scratch/run.sh')]);
    expect(fs.existsSync(a)).toBe(false);
    expect(h.out.join('\n')).not.toContain('restored');
    fs.rmSync(path.join(fx.worktree, 'scratch'), { recursive: true });
    expect(h.finish(fx.brief)).toBe(0);
    expect(h.out).toContain(
      `restored 1 deleted file in ${fx.worktree} from its index, so claude rm finds it clean`,
    );
  });

  // Ignored files under `cache/`, which sorts before the report's `docs/`.
  const cacheFiles = (fx: Fixture, count: number): string[] =>
    Array.from({ length: count }, (_, i) => {
      const file = `cache/f${String(i).padStart(2, '0')}`;
      write(fx, file);
      return file;
    });

  test('the report takes no place under the cap, so 20 other ignored files say no more', () => {
    const fx = fixture({ ignore: 'cache/\ndocs/\n' });
    fx.integrate();
    const files = cacheFiles(fx, 20);
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      ignoredLine(fx, files.join(', ')),
    );
  });

  test('past the cap, the ignored line counts the rest as at least one more, as list and remove do', () => {
    const fx = fixture({ ignore: 'cache/\ndocs/\n' });
    fx.integrate();
    const files = cacheFiles(fx, 21);
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief),
      ignoredLine(fx, `${files.slice(0, 20).join(', ')}, and at least 1 more`),
    );
  });

  test('--discard refuses a new ignored file the same way', () => {
    const fx = fixture({ ignore: IGNORE });
    write(fx, 'scratch/run.sh');
    const h = harness(fx);
    expectRefusedUntouched(
      h,
      fx,
      h.finish(fx.brief, '--discard'),
      ignoredLine(fx, 'scratch/run.sh'),
    );
  });

  test('the report under an ignored folder is not a loss', () => {
    const fx = fixture({ ignore: IGNORE });
    fx.integrate();
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
    expect(savedReport(fx)).toBe(REPORT_TEXT);
    expect(fs.existsSync(fx.worktree)).toBe(false);
  });

  test('a file under node_modules is not a loss, and the worktree is removed', () => {
    const fx = fixture({ ignore: IGNORE });
    fx.integrate();
    write(fx, 'node_modules/pkg/index.js');
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
    expect(fs.existsSync(fx.worktree)).toBe(false);
  });

  test('a folder on the skip list is not a loss', () => {
    const fx = fixture({ ignore: IGNORE });
    fx.integrate();
    write(fx, 'scratch/run.sh');
    fs.mkdirSync(path.dirname(skipList(fx)), { recursive: true });
    fs.writeFileSync(skipList(fx), 'scratch\n');
    const h = harness(fx);
    expect(h.finish(fx.brief)).toBe(0);
  });

  test('an ignored file written into a leftover while claude rm runs refuses before git removes it (#316)', () => {
    const fx = fixture({ ignore: IGNORE });
    fx.integrate();
    const h = harness(fx);
    h.claude.state.rm = [
      { ...removed('nothing'), during: () => write(fx, 'scratch/late.sh') },
    ];
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err).toEqual([
      `claude rm said removed, but git still lists the worktree ${fx.worktree}`,
      `the worktree ${fx.worktree} holds files its removal would lose: scratch/late.sh`,
      `finish has forgotten the worker, so once you clear what stopped the removal, run sidekick worktree remove ${fx.worktree}`,
    ]);
    expect(fs.existsSync(path.join(fx.worktree, 'scratch', 'late.sh'))).toBe(
      true,
    );
    expect(branchRemains(fx)).toBe(true);
  });

  test('an ignored file written after the first check refuses at the re-check', () => {
    const fx = fixture({ ignore: IGNORE });
    fx.integrate();
    const h = harness(fx);
    h.claude.state.whileStopping = () => write(fx, 'scratch/late.sh');
    expect(h.finish(fx.brief)).toBe(1);
    expect(h.err).toContain(ignoredLine(fx, 'scratch/late.sh'));
    expect(h.claude.named('rm')).toEqual([]);
    expect(fs.existsSync(fx.worktree)).toBe(true);
  });
});
