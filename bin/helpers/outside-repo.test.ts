import { afterEach, describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { removeTemps, tmp } from './fixtures/worker/repo.js';
import { outsideRepo, revParseLine } from './outside-repo.js';

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

  test('any other line in a folder is a failure to quote', () => {
    const dir = tmp();
    expect(outsideRepo(`fatal: invalid gitfile format: ${dir}/.git`, dir)).toBe(
      false,
    );
    expect(outsideRepo('spawnSync git ENOENT', dir)).toBe(false);
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
