import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, tmp } from './fixtures/worker/repo.js';
import { execRunner } from './pm-data.js';
import {
  configDir,
  ensureSidekickRepo,
  sameFolder,
  sidekickHome,
} from './sidekick-home.js';

afterEach(removeTemps);

describe('sidekickHome', () => {
  test('is <home>/.claude/sidekick with no variable', () => {
    expect(sidekickHome({}, '/work', '/home/u')).toBe(
      '/home/u/.claude/sidekick',
    );
  });

  test('follows CLAUDE_CONFIG_DIR', () => {
    expect(
      sidekickHome({ CLAUDE_CONFIG_DIR: '/cfg' }, '/work', '/home/u'),
    ).toBe('/cfg/sidekick');
  });

  test('an empty variable counts as unset', () => {
    expect(sidekickHome({ CLAUDE_CONFIG_DIR: '' }, '/work', '/home/u')).toBe(
      '/home/u/.claude/sidekick',
    );
  });

  test('a relative variable resolves against cwd', () => {
    expect(configDir({ CLAUDE_CONFIG_DIR: 'cfg' }, '/work', '/home/u')).toBe(
      '/work/cfg',
    );
  });
});

describe('ensureSidekickRepo', () => {
  test('makes the folder a repo of its own with the four ignore lines', () => {
    const dir = path.join(tmp(), 'a', 'sidekick');
    expect(ensureSidekickRepo(dir, execRunner)).toEqual([]);
    expect(git(dir, 'rev-parse', '--show-toplevel')).toBe(dir);
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8')).toBe(
      'loops/*/records/\nloops/*/state.json\nloops/*/armed.json\nloops/*/start.lock\n',
    );
  });

  test('appends only the missing lines, keeps order, and copes with no final newline', () => {
    const dir = path.join(tmp(), 'sidekick');
    ensureSidekickRepo(dir, execRunner);
    fs.writeFileSync(
      path.join(dir, '.gitignore'),
      'z\nloops/*/state.json\na\nloops/*/records/',
    );
    expect(ensureSidekickRepo(dir, execRunner)).toEqual([]);
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8')).toBe(
      'z\nloops/*/state.json\na\nloops/*/records/\nloops/*/armed.json\nloops/*/start.lock\n',
    );
  });

  test('a second call keeps the history and the operator lines, appending missing ignore lines once', () => {
    const dir = path.join(tmp(), 'sidekick');
    ensureSidekickRepo(dir, execRunner);
    fs.writeFileSync(path.join(dir, '.gitignore'), 'mine\n');
    git(dir, 'add', '-A');
    git(
      dir,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@example.com',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-m',
      'first',
    );
    const head = git(dir, 'rev-parse', 'HEAD');
    expect(ensureSidekickRepo(dir, execRunner)).toEqual([]);
    const expected =
      'mine\nloops/*/records/\nloops/*/state.json\nloops/*/armed.json\nloops/*/start.lock\n';
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8')).toBe(
      expected,
    );
    expect(ensureSidekickRepo(dir, execRunner)).toEqual([]);
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8')).toBe(
      expected,
    );
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(head);
  });

  test('a folder inside another repo gets a repo of its own', () => {
    const outer = tmp();
    git(outer, 'init', '-q');
    const dir = path.join(outer, 'inner', 'sidekick');
    expect(ensureSidekickRepo(dir, execRunner)).toEqual([]);
    expect(git(dir, 'rev-parse', '--show-toplevel')).toBe(dir);
  });

  test('reports a folder it cannot make', () => {
    const file = path.join(tmp(), 'file');
    fs.writeFileSync(file, 'x');
    const issues = ensureSidekickRepo(path.join(file, 'sub'), execRunner);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain(path.join(file, 'sub'));
  });
});

describe('sameFolder', () => {
  test('a symlink and its target are one folder', () => {
    const base = tmp();
    fs.mkdirSync(path.join(base, 'real'));
    fs.symlinkSync(path.join(base, 'real'), path.join(base, 'link'));
    expect(sameFolder(path.join(base, 'link'), path.join(base, 'real'))).toBe(
      true,
    );
  });

  test('missing paths compare as resolved paths', () => {
    expect(sameFolder('/no/a', '/no/a/../a')).toBe(true);
    expect(sameFolder('/no/a', '/no/b')).toBe(false);
  });

  test('a missing path under a link compares by its deepest existing folder', () => {
    const base = tmp();
    fs.mkdirSync(path.join(base, 'real'));
    fs.symlinkSync(path.join(base, 'real'), path.join(base, 'link'));
    const real = fs.realpathSync(path.join(base, 'real'));
    const missing = path.join(base, 'link', '.claude', 'profiles');
    expect(sameFolder(missing, path.join(real, '.claude', 'profiles'))).toBe(
      true,
    );
    expect(sameFolder(missing, path.join(real, '.claude', 'other'))).toBe(
      false,
    );
  });
});
