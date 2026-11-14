import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BUILTIN_NOTE, inheritedListing } from './loop-inherited.js';
import type { LoopManifest } from './loop-manifest.js';
import type { ClaudeResult, ClaudeRunner } from './profile-launch.js';
import type { Profile } from './profile-store.js';
import { SIDEKICK_ID } from './sidekick-plugin.js';

let tmp: string;
let configDir: string;
let repo: string;
let managed: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-loop-inherited-'));
  configDir = path.join(tmp, 'config');
  repo = path.join(tmp, 'repo');
  managed = path.join(tmp, 'managed-settings.json');
  fs.mkdirSync(configDir);
  fs.mkdirSync(path.join(repo, '.claude'), { recursive: true });
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const loop = (): LoopManifest => ({ repo }) as unknown as LoopManifest;

const profileWith = (
  manifest: Partial<Profile['manifest']> = {},
  pluginDirs: string[] = [],
): Profile => ({
  name: 'p',
  dir: path.join(tmp, 'p'),
  root: tmp,
  store: 'user',
  shadows: undefined,
  manifest: { description: 'd', ...manifest },
  pluginDirs,
  hasRules: false,
});

const json = (file: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
};

const plugin = (name: string, hooksFile?: unknown): string => {
  const dir = path.join(tmp, 'plugins', name);
  fs.mkdirSync(dir, { recursive: true });
  if (hooksFile !== undefined)
    json(path.join(dir, 'hooks', 'hooks.json'), hooksFile);
  return dir;
};

const listed = (
  entries: { id: string; installPath?: string }[],
): ClaudeResult => ({
  code: 0,
  stdout: JSON.stringify(entries),
  stderr: '',
  timedOut: false,
});

const run = (
  profile: Profile,
  reply: ClaudeResult,
  calls: { args: string[]; cwd: string }[] = [],
) => {
  const runClaude: ClaudeRunner = (args, opts) => {
    calls.push({ args, cwd: opts.cwd });
    return reply;
  };
  return inheritedListing(loop(), profile, {
    runClaude,
    configDir,
    home: tmp,
    managedFile: managed,
  });
};

const text = (lines: string[]): string => lines.join('\n');
const hasLine = (lines: string[], ...parts: string[]): boolean =>
  lines.some((line) => parts.every((part) => line.includes(part)));

describe('inheritedListing', () => {
  test('names each layer with its allow rules', () => {
    json(path.join(configDir, 'settings.json'), {
      permissions: { allow: ['Bash(ls *)'] },
    });
    json(path.join(repo, '.claude', 'settings.json'), {
      permissions: { allow: ['Read(//x/**)'] },
    });
    const out = run(profileWith(), listed([]));
    expect(hasLine(out.lines, 'user', 'settings.json', 'Bash(ls *)')).toBe(
      true,
    );
    expect(hasLine(out.lines, 'project', 'Read(//x/**)')).toBe(true);
  });

  test('lists a PreToolUse hook from a layer and a PermissionRequest hook from a plugin', () => {
    json(path.join(configDir, 'settings.json'), {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: 'guard.sh' }],
          },
        ],
      },
    });
    const dir = plugin('a', {
      hooks: {
        PermissionRequest: [
          { hooks: [{ type: 'command', command: 'ask.sh' }] },
        ],
      },
    });
    const out = run(
      profileWith({ settings: { enabledPlugins: { 'a@m': true } } }),
      listed([{ id: 'a@m', installPath: dir }]),
    );
    expect(hasLine(out.lines, 'user', 'PreToolUse', 'Bash', 'guard.sh')).toBe(
      true,
    );
    expect(
      hasLine(out.lines, 'plugin a@m', 'PermissionRequest', 'ask.sh'),
    ).toBe(true);
  });

  test('lists each fence widening, including a bare Edit', () => {
    json(path.join(configDir, 'settings.json'), {
      permissions: {
        additionalDirectories: ['/store'],
        allow: ['Edit(//w/**)', 'Edit'],
      },
      sandbox: {
        filesystem: { allowWrite: ['/sbx'] },
        network: { allowedDomains: ['example.org'] },
      },
    });
    const out = run(profileWith(), listed([]));
    expect(hasLine(out.lines, 'added directory', '/store')).toBe(true);
    expect(hasLine(out.lines, 'sandbox write', '/sbx')).toBe(true);
    expect(hasLine(out.lines, 'allowed domain', 'example.org')).toBe(true);
    expect(hasLine(out.lines, 'Edit allow', 'Edit(//w/**)')).toBe(true);
    expect(hasLine(out.lines, 'every path', ': Edit')).toBe(true);
  });

  test('marks a plugin that ships a mod, and only that one', () => {
    const modded = plugin('modded', { hooks: {}, modules: ['mods.ts'] });
    const plain = plugin('plain', { hooks: {}, modules: [] });
    const out = run(
      profileWith({
        settings: { enabledPlugins: { 'modded@m': true, 'plain@m': true } },
      }),
      listed([
        { id: 'modded@m', installPath: modded },
        { id: 'plain@m', installPath: plain },
      ]),
    );
    expect(hasLine(out.lines, 'modded@m', 'ships a mod')).toBe(true);
    expect(hasLine(out.lines, 'plain@m', 'ships a mod')).toBe(false);
    expect(hasLine(out.lines, 'plain@m')).toBe(true);
  });

  test('lists a plugin that only a clean room launch enables', () => {
    const dir = plugin('sk');
    const out = run(
      profileWith({ settingSources: ['project'] }),
      listed([{ id: SIDEKICK_ID, installPath: dir }]),
    );
    expect(hasLine(out.lines, SIDEKICK_ID, dir)).toBe(true);
  });

  test('a later layer overrides an earlier one, and a false value does not load', () => {
    json(path.join(configDir, 'settings.json'), {
      enabledPlugins: { 'off@m': true, 'on@m': false },
    });
    json(path.join(repo, '.claude', 'settings.json'), {
      enabledPlugins: { 'on@m': true },
    });
    json(managed, { enabledPlugins: { 'off@m': false } });
    const a = plugin('on');
    const b = plugin('off');
    const out = run(
      profileWith(),
      listed([
        { id: 'on@m', installPath: a },
        { id: 'off@m', installPath: b },
      ]),
    );
    expect(hasLine(out.lines, 'on@m', a)).toBe(true);
    expect(hasLine(out.lines, 'off@m')).toBe(false);
  });

  test('lists the profile plugin dirs by folder, with their hooks', () => {
    const dir = plugin('dirp', {
      hooks: {
        PreToolUse: [{ hooks: [{ type: 'command', command: 'dir-hook.sh' }] }],
      },
      modules: ['m.ts'],
    });
    const out = run(profileWith({}, [dir]), listed([]));
    expect(hasLine(out.lines, dir, 'ships a mod')).toBe(true);
    expect(hasLine(out.lines, 'dir-hook.sh')).toBe(true);
  });

  test('says an enabled plugin with no install path is not installed', () => {
    const out = run(
      profileWith({ settings: { enabledPlugins: { 'ghost@m': true } } }),
      listed([{ id: 'ghost@m' }]),
    );
    expect(hasLine(out.lines, 'ghost@m', 'not installed')).toBe(true);
  });

  test('does not look up builtin or inline ids', () => {
    const out = run(
      profileWith({
        settings: {
          enabledPlugins: { 'x@builtin': true, 'y@inline': true },
        },
      }),
      listed([]),
    );
    expect(text(out.lines)).not.toContain('x@builtin');
    expect(text(out.lines)).not.toContain('y@inline');
  });

  test('says hooks could not be read for a gone folder and a malformed file', () => {
    const bad = plugin('bad');
    fs.mkdirSync(path.join(bad, 'hooks'));
    fs.writeFileSync(path.join(bad, 'hooks', 'hooks.json'), '{nope');
    const out = run(
      profileWith({
        settings: { enabledPlugins: { 'gone@m': true, 'bad@m': true } },
      }),
      listed([
        { id: 'gone@m', installPath: path.join(tmp, 'missing') },
        { id: 'bad@m', installPath: bad },
      ]),
    );
    expect(hasLine(out.lines, 'gone@m', 'hooks could not be read')).toBe(true);
    expect(hasLine(out.lines, 'bad@m', 'hooks could not be read')).toBe(true);
  });

  test('warns and marks the plugin part incomplete when the runner fails, keeping other sections', () => {
    json(path.join(configDir, 'settings.json'), {
      permissions: { allow: ['Bash(ls *)'] },
    });
    for (const reply of [
      { code: 1, stdout: '', stderr: 'x', timedOut: false },
      { code: 0, stdout: '', stderr: '', timedOut: true },
      { code: 0, stdout: 'not json', stderr: '', timedOut: false },
      { code: 0, stdout: '{"a":1}', stderr: '', timedOut: false },
    ]) {
      const out = run(profileWith(), reply);
      expect(out.warnings.length).toBe(1);
      expect(hasLine(out.lines, 'incomplete')).toBe(true);
      expect(hasLine(out.lines, 'Bash(ls *)')).toBe(true);
    }
  });

  test('runs plugin list in the loop repo', () => {
    const calls: { args: string[]; cwd: string }[] = [];
    run(profileWith(), listed([]), calls);
    expect(calls).toEqual([{ args: ['plugin', 'list', '--json'], cwd: repo }]);
  });

  test('reports a malformed settings layer by file, warns, and goes on', () => {
    const file = path.join(configDir, 'settings.json');
    fs.writeFileSync(file, '{bad');
    const out = run(profileWith(), listed([]));
    expect(hasLine(out.lines, file, 'could not be read')).toBe(true);
    expect(out.warnings.length).toBe(1);
    expect(out.lines).toContain('Built-ins');
  });

  test('prints (none) for an empty section', () => {
    const out = run(profileWith(), listed([]));
    expect(out.lines.filter((line) => line === '  (none)').length).toBe(4);
  });

  test('BUILTIN_NOTE closes every listing', () => {
    const out = run(profileWith(), listed([]));
    expect(out.lines.slice(-BUILTIN_NOTE.length)).toEqual(
      BUILTIN_NOTE.map((line) => `  ${line}`),
    );
    expect(BUILTIN_NOTE.join(' ')).toContain('cc-plugin-privacy');
  });
});
