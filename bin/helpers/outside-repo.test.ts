import { afterEach, describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { danglingWorktree, removeTemps, tmp } from './fixtures/worker/repo.js';
import { outsideRepo, revParseLine } from './outside-repo.js';
import { execRunner } from './pm-data.js';

afterEach(removeTemps);

describe('outsideRepo', () => {
  test('"not a git repository", a silent failure, or a path that is no folder reads as outside', () => {
    const dir = tmp();
    expect(
      outsideRepo(
        'fatal: not a git repository (or any of the parent directories): .git',
        dir,
      ),
    ).toBe(true);
    expect(outsideRepo('', dir)).toBe(true);
    expect(outsideRepo('spawnSync git ENOENT', path.join(dir, 'gone'))).toBe(
      true,
    );
  });

  test("git's outside form for a mount point reads as outside", () => {
    expect(
      outsideRepo(
        'fatal: not a git repository (or any parent up to mount point /mnt)',
        tmp(),
      ),
    ).toBe(true);
  });

  test('any other line in a folder is a failure to quote', () => {
    const dir = tmp();
    expect(outsideRepo(`fatal: invalid gitfile format: ${dir}/.git`, dir)).toBe(
      false,
    );
    expect(outsideRepo('spawnSync git ENOENT', dir)).toBe(false);
  });

  test('a linked worktree whose git dir is gone is a failure to quote', () => {
    const { dir, gitDir } = danglingWorktree();
    for (const flag of ['--git-common-dir', '--show-toplevel']) {
      const result = execRunner('git', ['rev-parse', flag], dir);
      const issue = revParseLine(result.stderr);
      expect({ code: result.code, issue }).toEqual({
        code: 128,
        issue: `fatal: not a git repository: ${gitDir}`,
      });
      expect(outsideRepo(issue, dir)).toBe(false);
    }
  });
});

describe('revParseLine', () => {
  test("keeps git's first line, trimmed", () => {
    expect(
      revParseLine(
        "\nfatal: detected dubious ownership in repository at '/x'\nTo add an exception, call:\n",
      ),
    ).toBe("fatal: detected dubious ownership in repository at '/x'");
    expect(revParseLine('')).toBe('');
  });
});
