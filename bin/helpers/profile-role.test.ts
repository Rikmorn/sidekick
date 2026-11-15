import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { keyHits } from './memory-patterns.js';
import {
  isFolder,
  pluginDirIssues,
  pluginNameOf,
  rolePluginIssues,
} from './profile-role.js';
import type { Profile } from './profile-store.js';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-profile-role-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const profileWith = (pluginDirs: string[]): Profile => ({
  name: 'p',
  dir: path.join(tmp, 'p'),
  root: tmp,
  store: 'user',
  shadows: undefined,
  manifest: { description: 'd' },
  pluginDirs,
  hasRules: false,
});

describe('isFolder', () => {
  test('is true for a folder, false for a file or a missing path', () => {
    const file = path.join(tmp, 'f');
    fs.writeFileSync(file, '');
    expect(isFolder(tmp)).toBe(true);
    expect(isFolder(file)).toBe(false);
    expect(isFolder(path.join(tmp, 'none'))).toBe(false);
  });
});

describe('pluginNameOf', () => {
  const manifest = (dir: string, text: string): void => {
    fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), text);
  };

  test('reads the name the manifest gives, past its other keys', () => {
    manifest(tmp, '{"name":"fixer","version":"1.0.0"}');
    expect(pluginNameOf(tmp)).toEqual({ name: 'fixer' });
  });

  test.each([
    ['a missing manifest', null, 'ENOENT'],
    ['a manifest that is not JSON', '{nope', 'JSON'],
    ['a manifest with no name', '{"version":"1"}', 'name'],
    ['an empty name', '{"name":""}', 'must not be empty'],
  ])('%s gives the reason, naming the file', (_label, text, why) => {
    if (text !== null) manifest(tmp, text);
    const read = pluginNameOf(tmp);
    if (!('issue' in read)) throw new Error('expected an issue');
    expect(read.issue).toStartWith(
      path.join(tmp, '.claude-plugin', 'plugin.json'),
    );
    expect(read.issue).toContain(why);
  });
});

describe('pluginDirIssues', () => {
  test('passes undefined and a folder', () => {
    expect(pluginDirIssues(undefined)).toEqual([]);
    expect(pluginDirIssues(tmp)).toEqual([]);
  });
  test('refuses a path that is not a folder', () => {
    const missing = path.join(tmp, 'none');
    expect(pluginDirIssues(missing)).toEqual([
      `--plugin-dir: ${missing} is not a folder`,
    ]);
  });
});

describe('rolePluginIssues', () => {
  test('passes a profile with no plugin dirs or folders that exist', () => {
    expect(rolePluginIssues(profileWith([]))).toEqual([]);
    expect(rolePluginIssues(profileWith([tmp]))).toEqual([]);
  });
  test('names profile.json and each missing resolved path', () => {
    const missing = path.join(tmp, 'p', 'plugin');
    expect(rolePluginIssues(profileWith([tmp, missing]))).toEqual([
      `${path.join(tmp, 'p', 'profile.json')}: pluginDirs: ${missing} is not a folder`,
    ]);
  });
});

describe('rolePluginIssues key scan', () => {
  const key = (): string => `token ${'ghp'}${'_'}${'a1'.repeat(18)}`;
  const plugin = (): string => {
    const dir = path.join(tmp, 'plugin');
    fs.mkdirSync(dir);
    return dir;
  };
  const write = (file: string, content: string | Buffer): string => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  };

  test('names the file and the id of a key, never the key', () => {
    const dir = plugin();
    const file = write(path.join(dir, 'skills', 's.md'), key());
    const issues = rolePluginIssues(profileWith([dir]));
    expect(issues).toEqual([
      `${file}: the key check flags it (github-classic-pat); keep keys out of a role's plugin`,
    ]);
    expect(issues.join('\n')).not.toContain('a1a1a1');
  });
  test('passes a clean plugin', () => {
    const dir = plugin();
    write(path.join(dir, 'a.md'), 'nothing secret here');
    expect(rolePluginIssues(profileWith([dir]))).toEqual([]);
  });
  test('ignores .git and node_modules', () => {
    const dir = plugin();
    write(path.join(dir, '.git', 'config'), key());
    write(path.join(dir, 'node_modules', 'x', 'i.js'), key());
    expect(rolePluginIssues(profileWith([dir]))).toEqual([]);
  });
  test('skips a file over the cap', () => {
    const dir = plugin();
    write(path.join(dir, 'big.md'), key());
    expect(rolePluginIssues(profileWith([dir]))).toHaveLength(1);
    expect(rolePluginIssues(profileWith([dir]), 4)).toEqual([]);
  });
  test('skips a file with a NUL byte', () => {
    const dir = plugin();
    write(path.join(dir, 'bin.dat'), Buffer.from(`\0${key()}`));
    expect(rolePluginIssues(profileWith([dir]))).toEqual([]);
  });
  test('completes on a symlink loop and skips a linked folder', () => {
    const dir = plugin();
    fs.symlinkSync(dir, path.join(dir, 'loop'));
    write(path.join(tmp, 'outside', 'k.md'), key());
    fs.symlinkSync(path.join(tmp, 'outside'), path.join(dir, 'linked'));
    write(path.join(dir, 'ok.md'), 'fine');
    expect(rolePluginIssues(profileWith([dir]))).toEqual([]);
  });
  test('this test file holds no literal key', () => {
    expect(keyHits(fs.readFileSync(import.meta.path, 'utf8'))).toEqual([]);
  });
});
