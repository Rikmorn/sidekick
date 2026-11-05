import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { removeTemps, repo } from './fixtures/worker/repo.js';
import { execRunner } from './pm-data.js';
import { ensureWorktreesExcluded } from './worker-exclude.js';

afterEach(removeTemps);

describe('ensureWorktreesExcluded', () => {
  const excludeOf = (top: string): string =>
    path.join(top, '.git', 'info', 'exclude');

  test('writes the entry once, and a second run writes nothing', () => {
    const top = repo();
    const commonDir = path.join(top, '.git');
    const before = fs.readFileSync(excludeOf(top), 'utf-8');
    expect(ensureWorktreesExcluded(execRunner, top, commonDir)).toEqual({
      line: `added .claude/worktrees/ to ${excludeOf(top)}`,
    });
    const after = fs.readFileSync(excludeOf(top), 'utf-8');
    expect(after).toBe(`${before}.claude/worktrees/\n`);
    expect(ensureWorktreesExcluded(execRunner, top, commonDir)).toEqual({
      line: undefined,
    });
    expect(fs.readFileSync(excludeOf(top), 'utf-8')).toBe(after);
  });

  test('writes nothing when .gitignore already ignores the folder', () => {
    const top = repo();
    fs.writeFileSync(path.join(top, '.gitignore'), '.claude/\n');
    const before = fs.readFileSync(excludeOf(top), 'utf-8');
    expect(
      ensureWorktreesExcluded(execRunner, top, path.join(top, '.git')),
    ).toEqual({ line: undefined });
    expect(fs.readFileSync(excludeOf(top), 'utf-8')).toBe(before);
  });

  test('puts the entry on its own line when the last line has no newline', () => {
    const top = repo();
    fs.writeFileSync(excludeOf(top), '# kept\nlast-line');
    ensureWorktreesExcluded(execRunner, top, path.join(top, '.git'));
    expect(fs.readFileSync(excludeOf(top), 'utf-8')).toBe(
      '# kept\nlast-line\n.claude/worktrees/\n',
    );
  });

  test('creates a missing info folder', () => {
    const top = repo();
    fs.rmSync(path.join(top, '.git', 'info'), { recursive: true });
    ensureWorktreesExcluded(execRunner, top, path.join(top, '.git'));
    expect(fs.readFileSync(excludeOf(top), 'utf-8')).toBe(
      '.claude/worktrees/\n',
    );
  });

  test('refuses an excludes file it cannot read, writing nothing', () => {
    const top = repo();
    fs.rmSync(excludeOf(top));
    fs.mkdirSync(excludeOf(top));
    const result = ensureWorktreesExcluded(
      execRunner,
      top,
      path.join(top, '.git'),
    );
    const issues = 'issues' in result ? result.issues : [];
    expect(issues).toHaveLength(1);
    expect(issues[0]).toStartWith(
      `cannot read ${excludeOf(top)}, where dispatch adds .claude/worktrees/: `,
    );
    expect(fs.readdirSync(excludeOf(top))).toEqual([]);
  });

  test('refuses an excludes file it cannot write', () => {
    const top = repo();
    const before = fs.readFileSync(excludeOf(top), 'utf-8');
    fs.chmodSync(excludeOf(top), 0o444);
    const result = ensureWorktreesExcluded(
      execRunner,
      top,
      path.join(top, '.git'),
    );
    const issues = 'issues' in result ? result.issues : [];
    expect(issues).toHaveLength(1);
    expect(issues[0]).toStartWith(
      `cannot add .claude/worktrees/ to ${excludeOf(top)}: `,
    );
    expect(fs.readFileSync(excludeOf(top), 'utf-8')).toBe(before);
  });
});
