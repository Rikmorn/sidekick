import { afterEach, describe, expect, test } from 'bun:test';
import { findRepo } from './desk-children.js';
import { removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner, type Runner } from './pm-data.js';

afterEach(removeTemps);

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
    expect(findRepo(execRunner, tmp())).toEqual({ warnings: [] });
  });
});
