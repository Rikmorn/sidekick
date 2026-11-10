import { afterEach, describe, expect, test } from 'bun:test';
import { childFacts, findRepo } from './desk-children.js';
import { fixture } from './fixtures/worker/finish.js';
import { recording, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner, MAX_OUTPUT, type Runner } from './pm-data.js';

afterEach(removeTemps);

describe('childFacts', () => {
  test("reads the worktree's status with the runtime's largest output, so a long status is not cut off", () => {
    const fx = fixture();
    const found = findRepo(execRunner, fx.top);
    if (found.repo === undefined) throw new Error('no repo');
    const { runGit, calls } = recording();
    const { facts } = childFacts(
      { runGit, repo: found.repo, find: () => undefined },
      {
        version: 2,
        name: 'w1',
        job: null,
        main: null,
        brief: fx.brief,
        dispatchedAt: '2026-11-10T00:00:00Z',
      },
      { cwd: fx.worktree },
    );
    expect(facts.worktreeExists).toBe(true);
    const reads = calls.filter((c) => c.args.includes('status'));
    expect(reads.map((c) => c.opts?.maxBuffer)).toEqual([MAX_OUTPUT]);
  });
});

describe('findRepo', () => {
  test("a failed git worktree list keeps the desk's warning word for word, and gives git's first line apart", () => {
    const top = repo();
    const runGit: Runner = (cmd, args, cwd) =>
      args[0] === 'worktree'
        ? { code: 128, stdout: '', stderr: 'fatal: broken\nmore detail\n' }
        : execRunner(cmd, args, cwd);
    expect(findRepo(runGit, top)).toEqual({
      warnings: [
        `git worktree list failed in ${top}, so no children show: fatal: broken`,
      ],
      listIssue: 'fatal: broken',
    });
  });

  test('a repo it finds, and a folder outside git, carry no list issue', () => {
    const found = findRepo(execRunner, repo());
    expect(found.warnings).toEqual([]);
    expect(found.listIssue).toBeUndefined();
    expect(found.revParseIssue).toBeUndefined();
    const outside = findRepo(execRunner, tmp());
    expect(outside.repo).toBeUndefined();
    expect(outside.warnings).toEqual([]);
    expect(outside.listIssue).toBeUndefined();
  });

  test("a failed git rev-parse gives git's first line apart, and no desk warning", () => {
    const runGit: Runner = () => ({
      code: 128,
      stdout: '',
      stderr:
        "fatal: detected dubious ownership in repository at '/x/odin'\nTo add an exception for this directory, call:\n",
    });
    expect(findRepo(runGit, '/x/odin')).toEqual({
      warnings: [],
      revParseIssue:
        "fatal: detected dubious ownership in repository at '/x/odin'",
    });
  });
});
