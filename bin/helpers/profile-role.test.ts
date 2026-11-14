import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { isFolder, pluginDirIssues, rolePluginIssues } from './profile-role.js';
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
