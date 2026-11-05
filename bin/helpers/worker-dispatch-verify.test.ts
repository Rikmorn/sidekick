import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner } from './pm-data.js';
import type { ClaudeResult, ClaudeRunner } from './profile-launch.js';
import { verifyWorktree } from './worker-dispatch-verify.js';

afterEach(removeTemps);

const JOB = '213245a1';

const ok = (stdout: string): ClaudeResult => ({
  code: 0,
  stdout,
  stderr: '',
  timedOut: false,
});

const jobRow = (cwd: string | null): object => ({
  id: JOB,
  kind: 'background',
  name: 'w1',
  cwd,
  state: 'working',
});

/**
 * Plays `claude agents --json --all`: each call takes the next listing, and
 * the last repeats. `sleeps` records each wait.
 */
function fakeListing(...listings: object[][]) {
  const calls: { args: string[]; cwd: string; timeoutMs: number }[] = [];
  const sleeps: number[] = [];
  const run: ClaudeRunner = (args, opts) => {
    calls.push({ args, cwd: opts.cwd, timeoutMs: opts.timeoutMs });
    const at = Math.min(calls.length, listings.length) - 1;
    return ok(JSON.stringify(listings[at]));
  };
  const sleep = (ms: number): void => {
    sleeps.push(ms);
  };
  return { run, calls, sleeps, sleep };
}

/** A repo with a second commit, so a worktree can start off the baseline. */
function twoCommits() {
  const top = repo();
  git(top, 'commit', '-q', '--allow-empty', '-m', 'second');
  const head = git(top, 'rev-parse', 'HEAD');
  const native = path.join(top, '.claude', 'worktrees', 'w1');
  return { top, head, native };
}

function verifyAt(
  where: { top: string; head: string; launchTop?: string },
  claude: ReturnType<typeof fakeListing>,
  jobId: string | null = JOB,
) {
  return verifyWorktree({
    runGit: execRunner,
    runClaude: claude.run,
    sleep: claude.sleep,
    jobId,
    name: 'w1',
    mainTop: where.top,
    launchTop: where.launchTop ?? where.top,
    baseline: where.head,
  });
}

describe('verifyWorktree matches', () => {
  test("Claude Code's own worktree: the path, the branch, and the baseline, in one read of 10 s at most", () => {
    const r = twoCommits();
    git(r.top, 'worktree', 'add', '-q', r.native, '-b', 'worktree-w1');
    const claude = fakeListing([jobRow(r.native)]);
    expect(verifyAt(r, claude)).toEqual({ kind: 'matches' });
    expect(claude.calls).toEqual([
      { args: ['agents', '--json', '--all'], cwd: r.top, timeoutMs: 10_000 },
    ]);
    expect(claude.sleeps).toEqual([]);
  });

  test('a baseline the brief abbreviates', () => {
    const r = twoCommits();
    git(r.top, 'worktree', 'add', '-q', r.native, '-b', 'worktree-w1');
    const claude = fakeListing([jobRow(r.native)]);
    const short = { ...r, head: r.head.slice(0, 7) };
    expect(verifyAt(short, claude)).toEqual({ kind: 'matches' });
  });

  test('a logical cwd against the physical path git lists', () => {
    const r = twoCommits();
    git(r.top, 'worktree', 'add', '-q', r.native, '-b', 'worktree-w1');
    const link = path.join(tmp(), 'link');
    fs.symlinkSync(r.top, link);
    const logical = path.join(link, '.claude', 'worktrees', 'w1');
    const claude = fakeListing([jobRow(logical)]);
    expect(verifyAt(r, claude)).toEqual({ kind: 'matches' });
  });

  test("a launch from a linked worktree: the main checkout's folder, at the launcher's HEAD", () => {
    const r = twoCommits();
    const sib = path.join(tmp(), 'sib');
    git(r.top, 'worktree', 'add', '-q', sib, '-b', 'sib');
    git(sib, 'commit', '-q', '--allow-empty', '-m', 'sib work');
    const sibHead = git(sib, 'rev-parse', 'HEAD');
    git(sib, 'worktree', 'add', '-q', r.native, '-b', 'worktree-w1');
    const claude = fakeListing([jobRow(r.native)]);
    const where = { top: r.top, head: sibHead, launchTop: sib };
    expect(verifyAt(where, claude)).toEqual({ kind: 'matches' });
    expect(claude.calls.map((c) => c.cwd)).toEqual([sib]);
  });

  test('once the row and its cwd appear, within the wait', () => {
    const r = twoCommits();
    git(r.top, 'worktree', 'add', '-q', r.native, '-b', 'worktree-w1');
    const claude = fakeListing([], [jobRow(null)], [jobRow(r.native)]);
    expect(verifyAt(r, claude)).toEqual({ kind: 'matches' });
    expect(claude.sleeps).toEqual([1000, 1000]);
  });

  test('a cwd at the launching checkout that moves to the worktree on a later read', () => {
    const r = twoCommits();
    git(r.top, 'worktree', 'add', '-q', r.native, '-b', 'worktree-w1');
    const claude = fakeListing([jobRow(r.top)], [jobRow(r.native)]);
    expect(verifyAt(r, claude)).toEqual({ kind: 'matches' });
    expect(claude.sleeps).toEqual([1000]);
  });

  test('a worker that has committed since: the creation commit, not the head, counts', () => {
    const r = twoCommits();
    git(r.top, 'worktree', 'add', '-q', r.native, '-b', 'worktree-w1');
    git(r.native, 'commit', '-q', '--allow-empty', '-m', 'worker work');
    const claude = fakeListing([jobRow(r.native)]);
    expect(verifyAt(r, claude)).toEqual({ kind: 'matches' });
  });
});

describe('verifyWorktree refuses', () => {
  test('a hook-made sibling on the branch <name>, as worktrunk makes it', () => {
    const r = twoCommits();
    const hooked = path.join(tmp(), `${path.basename(r.top)}.w1`);
    git(r.top, 'worktree', 'add', '-q', hooked, '-b', 'w1');
    const claude = fakeListing([jobRow(hooked)]);
    expect(verifyAt(r, claude)).toEqual({
      kind: 'mismatch',
      cause: 'creator',
      job: JOB,
      lines: [
        `the worker's worktree is ${hooked} on w1, not ${r.native} on worktree-w1: a WorktreeCreate hook likely made it`,
      ],
    });
  });

  test('a hook-made worktree at another commit, naming that commit', () => {
    const r = twoCommits();
    const first = git(r.top, 'rev-parse', 'HEAD~1');
    const hooked = path.join(tmp(), `${path.basename(r.top)}.w1`);
    git(r.top, 'worktree', 'add', '-q', hooked, '-b', 'w1', 'HEAD~1');
    const claude = fakeListing([jobRow(hooked)]);
    expect(verifyAt(r, claude)).toEqual({
      kind: 'mismatch',
      cause: 'creator',
      job: JOB,
      lines: [
        `the worker's worktree is ${hooked} on w1, not ${r.native} on worktree-w1: a WorktreeCreate hook likely made it`,
        `the worker's worktree was created at ${first}, not the baseline ${r.head}`,
      ],
    });
  });

  test('the right path on another branch', () => {
    const r = twoCommits();
    git(r.top, 'worktree', 'add', '-q', r.native, '-b', 'other');
    const claude = fakeListing([jobRow(r.native)]);
    const verdict = verifyAt(r, claude);
    expect(verdict).toMatchObject({ kind: 'mismatch', cause: 'creator' });
    expect(verdict).toHaveProperty('lines', [
      `the worker's worktree is ${r.native} on other, not ${r.native} on worktree-w1: a WorktreeCreate hook likely made it`,
    ]);
  });

  test('a detached worktree at the right path', () => {
    const r = twoCommits();
    git(r.top, 'worktree', 'add', '-q', '--detach', r.native);
    const claude = fakeListing([jobRow(r.native)]);
    expect(verifyAt(r, claude)).toEqual({
      kind: 'mismatch',
      cause: 'creator',
      job: JOB,
      lines: [
        `the worker's worktree is ${r.native} on a detached HEAD, not ${r.native} on worktree-w1: a WorktreeCreate hook likely made it`,
      ],
    });
  });

  test('worktree-<name> at the right path, created off the baseline', () => {
    const r = twoCommits();
    const first = git(r.top, 'rev-parse', 'HEAD~1');
    git(
      r.top,
      'worktree',
      'add',
      '-q',
      r.native,
      '-b',
      'worktree-w1',
      'HEAD~1',
    );
    const claude = fakeListing([jobRow(r.native)]);
    expect(verifyAt(r, claude)).toEqual({
      kind: 'mismatch',
      cause: 'base',
      job: JOB,
      lines: [
        `the worker's worktree was created at ${first}, not the baseline ${r.head}: worktree.baseRef is likely not "head" for this launch`,
      ],
    });
  });

  test.each([
    ['as git lists it', (top: string) => top],
    [
      'through a symlink',
      (top: string) => {
        const link = path.join(tmp(), 'link');
        fs.symlinkSync(top, link);
        return link;
      },
    ],
  ])('a cwd that stays the launching checkout, %s, through every read', (_label, spell) => {
    const r = twoCommits();
    const claude = fakeListing([jobRow(spell(r.top))]);
    expect(verifyAt(r, claude)).toEqual({
      kind: 'unchecked',
      line: `the worktree check did not run: after 30 tries, the job still runs in the launching checkout ${r.top}, so a slow WorktreeCreate hook or .worktreeinclude copy may still be making its worktree`,
    });
    expect(claude.calls).toHaveLength(30);
    expect(claude.sleeps).toEqual(Array(29).fill(1000));
  });

  test('a cwd that stays the main checkout, launched from a linked worktree', () => {
    const r = twoCommits();
    const sib = path.join(tmp(), 'sib');
    git(r.top, 'worktree', 'add', '-q', sib, '-b', 'sib');
    const sibHead = git(sib, 'rev-parse', 'HEAD');
    const claude = fakeListing([jobRow(r.top)]);
    const where = { top: r.top, head: sibHead, launchTop: sib };
    expect(verifyAt(where, claude)).toEqual({
      kind: 'unchecked',
      line: `the worktree check did not run: after 30 tries, the job still runs in the main checkout ${r.top}, so a slow WorktreeCreate hook or .worktreeinclude copy may still be making its worktree`,
    });
    expect(claude.sleeps).toEqual(Array(29).fill(1000));
  });

  // A slow creator keeps the job's cwd at the launching checkout until it ends:
  // 8 s under a scratch WorktreeCreate hook (R10 plan 9's after-file, 2026-11-05).
  test('a slow creator: a cwd at the launching checkout for 8 reads, then the worktree, matches', () => {
    const r = twoCommits();
    git(r.top, 'worktree', 'add', '-q', r.native, '-b', 'worktree-w1');
    const claude = fakeListing(...Array(8).fill([jobRow(r.top)]), [
      jobRow(r.native),
    ]);
    expect(verifyAt(r, claude)).toEqual({ kind: 'matches' });
    expect(claude.calls).toHaveLength(9);
  });

  test('a slow hook: a cwd at the launching checkout for 8 reads, then its sibling, refuses as creator', () => {
    const r = twoCommits();
    const hooked = path.join(tmp(), 'repo.w1');
    git(r.top, 'worktree', 'add', '-q', hooked, '-b', 'w1');
    const claude = fakeListing(...Array(8).fill([jobRow(r.top)]), [
      jobRow(hooked),
    ]);
    expect(verifyAt(r, claude)).toMatchObject({
      kind: 'mismatch',
      cause: 'creator',
    });
  });

  test('a cwd at a checkout that leaves the listing on the last read is unchecked, not refused', () => {
    const r = twoCommits();
    const claude = fakeListing(
      [jobRow(r.top)],
      [jobRow(r.top)],
      [jobRow(r.top)],
      [jobRow(r.top)],
      [],
    );
    expect(verifyAt(r, claude)).toEqual({
      kind: 'unchecked',
      line: `the worktree check did not run: after 5 tries, claude agents --json --all lists no job ${JOB}`,
    });
  });

  test("a worktree under the launching checkout, not the main checkout's", () => {
    const r = twoCommits();
    const sib = path.join(tmp(), 'sib');
    git(r.top, 'worktree', 'add', '-q', sib, '-b', 'sib');
    const sibHead = git(sib, 'rev-parse', 'HEAD');
    const underSib = path.join(sib, '.claude', 'worktrees', 'w1');
    git(sib, 'worktree', 'add', '-q', underSib, '-b', 'worktree-w1');
    const claude = fakeListing([jobRow(underSib)]);
    const where = { top: r.top, head: sibHead, launchTop: sib };
    expect(verifyAt(where, claude)).toMatchObject({
      kind: 'mismatch',
      cause: 'creator',
    });
  });
});

describe('verifyWorktree says the check did not run', () => {
  test('with no job id, listing nothing', () => {
    const r = twoCommits();
    const claude = fakeListing([]);
    expect(verifyAt(r, claude, null)).toEqual({
      kind: 'unchecked',
      line: "the worktree check did not run: claude's output named no job id for w1",
    });
    expect(claude.calls).toEqual([]);
  });

  test('with no row within the wait, saying what it saw', () => {
    const r = twoCommits();
    const claude = fakeListing([]);
    expect(verifyAt(r, claude)).toEqual({
      kind: 'unchecked',
      line: `the worktree check did not run: after 5 tries, claude agents --json --all lists no job ${JOB}`,
    });
    expect(claude.calls).toHaveLength(5);
    expect(claude.sleeps).toEqual([1000, 1000, 1000, 1000]);
  });

  test('with a row that lists no cwd', () => {
    const r = twoCommits();
    const claude = fakeListing([jobRow(null)]);
    expect(verifyAt(r, claude)).toEqual({
      kind: 'unchecked',
      line: `the worktree check did not run: after 5 tries, the job ${JOB} lists no cwd`,
    });
  });

  test('with a cwd that is no worktree git lists', () => {
    const r = twoCommits();
    const plain = tmp();
    const claude = fakeListing([jobRow(plain)]);
    expect(verifyAt(r, claude)).toEqual({
      kind: 'unchecked',
      line: `the worktree check did not run: after 5 tries, the job's cwd ${plain} is no worktree git lists`,
    });
  });

  test('at once when the listing fails', () => {
    const r = twoCommits();
    const sleeps: number[] = [];
    const run: ClaudeRunner = () => ({
      code: 2,
      stdout: '',
      stderr: 'agent view is off\n',
      timedOut: false,
    });
    const verdict = verifyWorktree({
      runGit: execRunner,
      runClaude: run,
      sleep: (ms) => sleeps.push(ms),
      jobId: JOB,
      name: 'w1',
      mainTop: r.top,
      launchTop: r.top,
      baseline: r.head,
    });
    expect(verdict).toEqual({
      kind: 'unchecked',
      line: 'the worktree check did not run: claude agents --json --all failed with exit code 2. agent view is off',
    });
    expect(sleeps).toEqual([]);
  });

  test('when the branch has no reflog to read its creation commit from', () => {
    const r = twoCommits();
    git(r.top, 'worktree', 'add', '-q', r.native, '-b', 'worktree-w1');
    fs.rmSync(path.join(r.top, '.git', 'logs', 'refs', 'heads', 'worktree-w1'));
    const claude = fakeListing([jobRow(r.native)]);
    expect(verifyAt(r, claude)).toEqual({
      kind: 'unchecked',
      line: 'the worktree check did not run: refs/heads/worktree-w1 has no reflog to read its creation commit from',
    });
  });

  test('takes its tries, interval, and read limit from the caller', () => {
    const r = twoCommits();
    const claude = fakeListing([]);
    const verdict = verifyWorktree({
      runGit: execRunner,
      runClaude: claude.run,
      sleep: claude.sleep,
      jobId: JOB,
      name: 'w1',
      mainTop: r.top,
      launchTop: r.top,
      baseline: r.head,
      tries: 2,
      intervalMs: 50,
      readTimeoutMs: 3000,
    });
    expect(verdict).toMatchObject({ kind: 'unchecked' });
    expect(claude.calls.map((c) => c.timeoutMs)).toEqual([3000, 3000]);
    expect(claude.sleeps).toEqual([50]);
  });
});
