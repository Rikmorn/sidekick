import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  BRANCH_CASCADE,
  originHeadOrCascade,
  resolveFromGit,
} from './default-branch.js';

describe('default-branch', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-default-branch-'));
    execSync('git init -q', { cwd: tmpRoot });
    execSync('git config user.email test@test.example', { cwd: tmpRoot });
    execSync('git config user.name Test', { cwd: tmpRoot });
  });

  afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

  function commit(): void {
    fs.writeFileSync(path.join(tmpRoot, 'a'), 'x');
    execSync('git add a && git commit -q -m initial', { cwd: tmpRoot });
  }

  describe('resolveFromGit', () => {
    it('reports origin_head, and prefers it over every local branch', () => {
      commit();
      // `release` sits outside the cascade, so only origin/HEAD can yield it.
      execSync(
        'git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/release',
        { cwd: tmpRoot },
      );
      expect(resolveFromGit(tmpRoot)).toEqual({
        branch: 'release',
        source: 'origin_head',
      });
    });

    it('reports cascade when origin/HEAD is unset', () => {
      commit();
      execSync('git branch -m master', { cwd: tmpRoot });
      execSync('git checkout -q -b feature/sk-78', { cwd: tmpRoot });
      expect(resolveFromGit(tmpRoot)).toEqual({
        branch: 'master',
        source: 'cascade',
      });
    });

    // The state `branch-precheck` reports as `unknown` and `init` turns into
    // `main`. Sharing a resolver that answered `main` here would erase the
    // distinction, so this case is what keeps the two callers separable.
    it('reports unknown with an empty branch when git offers nothing', () => {
      commit();
      execSync('git branch -m feature/sk-78', { cwd: tmpRoot });
      expect(resolveFromGit(tmpRoot)).toEqual({
        branch: '',
        source: 'unknown',
      });
    });
  });

  describe('originHeadOrCascade', () => {
    it("falls back to 'main' where resolveFromGit reports unknown", () => {
      commit();
      execSync('git branch -m feature/sk-78', { cwd: tmpRoot });
      expect(resolveFromGit(tmpRoot).source).toBe('unknown');
      expect(originHeadOrCascade(tmpRoot)).toBe('main');
    });

    it('passes through the answer origin/HEAD gave', () => {
      commit();
      execSync(
        'git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/release',
        { cwd: tmpRoot },
      );
      expect(originHeadOrCascade(tmpRoot)).toBe('release');
    });
  });

  it('tries the cascade names in precedence order', () => {
    expect([...BRANCH_CASCADE]).toEqual([
      'main',
      'master',
      'dev',
      'trunk',
      'develop',
    ]);
  });
});
