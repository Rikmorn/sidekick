import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { keptLayers, summariseLayer } from './loop-layers.js';
import type { Profile } from './profile-store.js';

let tmp: string;
let configDir: string;
let repo: string;
let managed: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-loop-layers-'));
  configDir = path.join(tmp, 'config');
  repo = path.join(tmp, 'repo');
  managed = path.join(tmp, 'managed-settings.json');
  fs.mkdirSync(configDir);
  fs.mkdirSync(path.join(repo, '.claude'), { recursive: true });
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const profileWith = (manifest: Partial<Profile['manifest']> = {}): Profile => ({
  name: 'p',
  dir: path.join(tmp, 'p'),
  root: tmp,
  store: 'user',
  shadows: undefined,
  manifest: { description: 'd', ...manifest },
  pluginDirs: [],
  hasRules: false,
});

const write = (file: string, content: string): string => {
  fs.writeFileSync(file, content);
  return file;
};
const userFile = (): string => path.join(configDir, 'settings.json');
const projectFile = (): string => path.join(repo, '.claude', 'settings.json');
const localFile = (): string =>
  path.join(repo, '.claude', 'settings.local.json');

describe('keptLayers', () => {
  test('keeps user, project, local, then the profile, when settingSources is absent', () => {
    write(userFile(), '{"a":1}');
    write(projectFile(), '{"b":2}');
    write(localFile(), '{"c":3}');
    const layers = keptLayers(
      profileWith({ settings: { d: 4 } }),
      repo,
      configDir,
      managed,
    );
    expect(layers).toEqual([
      { name: 'user', file: userFile(), settings: { a: 1 } },
      { name: 'project', file: projectFile(), settings: { b: 2 } },
      { name: 'local', file: localFile(), settings: { c: 3 } },
      {
        name: 'profile',
        file: path.join(tmp, 'p', 'profile.json'),
        settings: { d: 4 },
      },
    ]);
  });

  test('drops the user layer when settingSources omits it', () => {
    write(userFile(), '{"a":1}');
    write(projectFile(), '{"b":2}');
    write(localFile(), '{"c":3}');
    const layers = keptLayers(
      profileWith({ settingSources: ['project', 'local'] }),
      repo,
      configDir,
      managed,
    );
    expect(layers.map((l) => l.name)).toEqual(['project', 'local', 'profile']);
  });

  test('keeps no file layer for an empty settingSources, and an empty profile layer without settings', () => {
    write(userFile(), '{"a":1}');
    const layers = keptLayers(
      profileWith({ settingSources: [] }),
      repo,
      configDir,
      managed,
    );
    expect(layers).toEqual([
      {
        name: 'profile',
        file: path.join(tmp, 'p', 'profile.json'),
        settings: {},
      },
    ]);
  });

  test('reads the user layer from the config folder it is given', () => {
    const other = path.join(tmp, 'other');
    fs.mkdirSync(other);
    write(userFile(), '{"here":true}');
    write(path.join(other, 'settings.json'), '{"there":true}');
    const layers = keptLayers(profileWith(), repo, other, managed);
    expect(layers[0]).toEqual({
      name: 'user',
      file: path.join(other, 'settings.json'),
      settings: { there: true },
    });
  });

  test('yields an issue layer for a malformed file and still loads the others', () => {
    write(userFile(), '{"a":1}');
    write(localFile(), '{not json');
    const layers = keptLayers(profileWith(), repo, configDir, managed);
    expect(layers.map((l) => l.name)).toEqual(['user', 'local', 'profile']);
    const local = layers[1];
    expect(local && 'issue' in local).toBe(true);
    expect(local?.file).toBe(localFile());
    expect(layers[0]).toEqual({
      name: 'user',
      file: userFile(),
      settings: { a: 1 },
    });
  });

  test('yields an issue layer for JSON that is not a plain object', () => {
    write(userFile(), '[1]');
    write(projectFile(), 'null');
    const layers = keptLayers(profileWith(), repo, configDir, managed);
    expect(layers.slice(0, 2).every((l) => 'issue' in l)).toBe(true);
  });

  test('yields an issue layer for an unreadable file', () => {
    fs.mkdirSync(userFile());
    const layers = keptLayers(profileWith(), repo, configDir, managed);
    const user = layers[0];
    expect(user?.name).toBe('user');
    expect(user && 'issue' in user).toBe(true);
  });

  test('adds the managed file last when it exists at the path given', () => {
    write(managed, '{"m":1}');
    const layers = keptLayers(profileWith(), repo, configDir, managed);
    expect(layers.at(-1)).toEqual({
      name: 'managed',
      file: managed,
      settings: { m: 1 },
    });
  });

  test('adds no managed layer when the file is missing', () => {
    const layers = keptLayers(profileWith(), repo, configDir, managed);
    expect(layers.some((l) => l.name === 'managed')).toBe(false);
  });
});

// Key shapes, from https://code.claude.com/docs/en/sandboxing (§Configure
// sandboxing: `sandbox.filesystem.allowWrite`, and §Network isolation's
// `sandbox.network.allowedDomains`), https://code.claude.com/docs/en/hooks
// (§Hook handler fields: five types, `command`, `http` with `url`, `mcp_tool`
// with `server` and `tool`, `prompt` and `agent` with `prompt`), and
// https://code.claude.com/docs/en/settings-reference (§enabledPlugins: an
// object mapping `plugin@marketplace` to a Boolean).
describe('summariseLayer', () => {
  const empty = {
    allow: [],
    hooks: [],
    addedDirectories: [],
    sandboxWrites: [],
    allowedDomains: [],
    editAllows: [],
    enabledPlugins: {},
  };
  const full = {
    permissions: {
      allow: ['Bash(ls *)', 'Edit(//tmp/x/**)', 7],
      additionalDirectories: ['/mem', 3],
    },
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            { type: 'command', command: 'check.sh' },
            { type: 'http', url: 'http://localhost:1/h' },
          ],
        },
        { hooks: [{ type: 'command', command: 'any.sh' }] },
      ],
      PermissionRequest: [
        {
          matcher: 'Edit',
          hooks: [
            { type: 'prompt', prompt: 'x'.repeat(80) },
            { type: 'agent', prompt: 'verify' },
            { type: 'mcp_tool', server: 's', tool: 't' },
          ],
        },
      ],
      PostToolUse: [{ hooks: [{ type: 'command', command: 'ignored' }] }],
    },
    sandbox: {
      filesystem: { allowWrite: ['~/.kube', 1], denyWrite: ['/no'] },
      network: { allowedDomains: ['github.com', false] },
    },
    enabledPlugins: { 'a@m': true, 'b@m': false, 'c@m': 'yes' },
  };

  test('returns each list from a fixture holding every key it reads', () => {
    expect(summariseLayer(full)).toEqual({
      allow: ['Bash(ls *)', 'Edit(//tmp/x/**)'],
      hooks: [
        { event: 'PreToolUse', matcher: 'Bash', command: 'check.sh' },
        {
          event: 'PreToolUse',
          matcher: 'Bash',
          command: 'http: http://localhost:1/h',
        },
        { event: 'PreToolUse', matcher: undefined, command: 'any.sh' },
        {
          event: 'PermissionRequest',
          matcher: 'Edit',
          command: `prompt: ${'x'.repeat(60)}`,
        },
        {
          event: 'PermissionRequest',
          matcher: 'Edit',
          command: 'agent: verify',
        },
        {
          event: 'PermissionRequest',
          matcher: 'Edit',
          command: 'mcp_tool: s/t',
        },
      ],
      addedDirectories: ['/mem'],
      sandboxWrites: ['~/.kube'],
      allowedDomains: ['github.com'],
      editAllows: ['Edit(//tmp/x/**)'],
      enabledPlugins: { 'a@m': true, 'b@m': false },
    });
  });

  test('reads a hooks value that is a string as no hooks', () => {
    expect(summariseLayer({ hooks: 'nope' }).hooks).toEqual([]);
  });

  test('shows a hook of a type it does not know by its type', () => {
    const s = summariseLayer({
      hooks: { PreToolUse: [{ hooks: [{ type: 'future' }] }] },
    });
    expect(s.hooks).toEqual([
      { event: 'PreToolUse', matcher: undefined, command: 'future' },
    ]);
  });

  test('reads every wrong shape as absent without throwing', () => {
    for (const bad of [
      { permissions: 'x', sandbox: 'x', enabledPlugins: 'x', hooks: 'x' },
      { permissions: [], sandbox: [], enabledPlugins: [], hooks: [] },
      {
        permissions: { allow: 'x', additionalDirectories: {} },
        sandbox: { filesystem: 'x', network: [] },
        hooks: {
          PreToolUse: 'x',
          PermissionRequest: [null, 1, { hooks: 'x' }],
        },
      },
      {
        sandbox: {
          filesystem: { allowWrite: 'x' },
          network: { allowedDomains: 1 },
        },
        hooks: { PreToolUse: [{ hooks: [null, 'x'] }] },
      },
      {},
    ]) {
      expect(summariseLayer(bad)).toEqual(empty);
    }
  });
});
