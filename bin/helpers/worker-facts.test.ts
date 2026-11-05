import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner, type Runner } from './pm-data.js';
import { checkoutFacts } from './worker-facts.js';

afterEach(removeTemps);

describe('checkoutFacts', () => {
  test('gives the same main checkout from the main, a sibling, a nested worktree, and their subfolders', () => {
    const top = repo();
    const sibling = path.join(tmp(), 'sib');
    const nested = path.join(top, '.claude', 'worktrees', 'x');
    git(top, 'worktree', 'add', '-q', '-b', 'sib', sibling);
    git(top, 'worktree', 'add', '-q', '-b', 'nest', nested);
    const main = git(top, 'symbolic-ref', '--short', 'HEAD');
    const commonDir = path.join(top, '.git');
    const cases: [string, string][] = [
      [top, main],
      [sibling, 'sib'],
      [nested, 'nest'],
    ];
    for (const [launch, branch] of cases) {
      const sub = path.join(launch, 'sub', 'deep');
      fs.mkdirSync(sub, { recursive: true });
      for (const cwd of [launch, sub]) {
        const facts = checkoutFacts(execRunner, cwd);
        expect(facts).toMatchObject({
          launchTop: launch,
          mainTop: top,
          commonDir,
          branch,
        });
        const listed = 'worktrees' in facts ? facts.worktrees : [];
        expect(listed[0].path).toBe(top);
        expect(listed.map((w) => w.path).sort()).toEqual(
          [top, sibling, nested].sort(),
        );
      }
    }
  });

  test('resolves a symlinked path to the physical checkout', () => {
    const top = repo();
    const link = path.join(tmp(), 'link');
    fs.symlinkSync(top, link);
    expect(checkoutFacts(execRunner, link)).toMatchObject({
      launchTop: top,
      mainTop: top,
    });
  });

  test('gives no branch on a detached HEAD', () => {
    const top = repo();
    git(top, 'checkout', '-q', '--detach');
    expect(checkoutFacts(execRunner, top)).toMatchObject({
      launchTop: top,
      branch: undefined,
    });
  });

  test('gives the branch whole when a tag shares its name', () => {
    const top = repo();
    git(top, 'checkout', '-q', '-b', 'feat');
    git(top, 'tag', 'feat');
    expect(checkoutFacts(execRunner, top)).toMatchObject({ branch: 'feat' });
  });

  test('gives no branch when HEAD names a ref outside refs/heads/', () => {
    const top = repo();
    git(top, 'tag', 'feat');
    git(top, 'symbolic-ref', 'HEAD', 'refs/tags/feat');
    expect(checkoutFacts(execRunner, top)).toMatchObject({
      launchTop: top,
      branch: undefined,
    });
  });

  test('gives an issue when git cannot read HEAD, rather than calling it detached', () => {
    const top = repo();
    const failing: Runner = (cmd, args, cwd) =>
      args[0] === 'symbolic-ref'
        ? { code: 128, stdout: '', stderr: 'fatal: broken\n' }
        : execRunner(cmd, args, cwd);
    expect(checkoutFacts(failing, top)).toEqual({
      issues: [
        'git symbolic-ref HEAD failed with exit code 128: fatal: broken',
      ],
    });
  });

  test('gives an issue outside a work tree', () => {
    expect(checkoutFacts(execRunner, tmp())).toEqual({
      issues: [expect.stringContaining('not inside a git work tree')],
    });
  });
});
