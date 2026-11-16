import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { composeSettings, type Settings } from './profile-launch.js';
import type { ProfileManifest } from './profile-manifest.js';
import type { Profile } from './profile-store.js';
import {
  FENCE_SAFE_KEYS,
  fenceSafeSettings,
  PUSH_DENY_RULE,
  PUSH_REWRITE_KEY,
  pathRule,
  readRule,
  SAVE_SKILL_RULE,
  unitOverlay,
  unitSettingSources,
  workerOverlay,
} from './worker-overlay.js';

const opts = { briefPath: '/abs/brief.md', allowPush: false };

function overlayOf(
  settings: Record<string, unknown> | undefined,
  o = opts,
): Record<string, unknown> {
  const built = workerOverlay(settings, o);
  if ('issues' in built) throw new Error(built.issues.join('; '));
  return built.overlay;
}

describe('workerOverlay', () => {
  test('no profile count gives index 0 and count 1', () => {
    expect(overlayOf(undefined)).toEqual({
      worktree: { baseRef: 'head' },
      env: {
        SIDEKICK_WORKER: '/abs/brief.md',
        DISABLE_AUTOUPDATER: '1',
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: PUSH_REWRITE_KEY,
        GIT_CONFIG_VALUE_0: '',
      },
      permissions: { allow: [SAVE_SKILL_RULE], deny: [PUSH_DENY_RULE] },
    });
  });

  test('a profile count of 2 gives index 2 and count 3', () => {
    const overlay = overlayOf({ env: { GIT_CONFIG_COUNT: '2' } });
    expect(overlay.env).toEqual({
      SIDEKICK_WORKER: '/abs/brief.md',
      DISABLE_AUTOUPDATER: '1',
      GIT_CONFIG_COUNT: '3',
      GIT_CONFIG_KEY_2: PUSH_REWRITE_KEY,
      GIT_CONFIG_VALUE_2: '',
    });
  });

  test.each(['x', '-1', '1.5', ''])('a count of %p refuses', (count) => {
    const built = workerOverlay({ env: { GIT_CONFIG_COUNT: count } }, opts);
    expect('issues' in built).toBe(true);
  });

  test('a non-string count refuses, saying it is not a string of digits', () => {
    const built = workerOverlay({ env: { GIT_CONFIG_COUNT: 2 } }, opts);
    expect(built).toEqual({
      issues: ["the profile's GIT_CONFIG_COUNT is 2, not a string of digits"],
    });
  });

  test('allowPush leaves out the git config keys and the deny rule', () => {
    expect(
      overlayOf(
        { env: { GIT_CONFIG_COUNT: 'x' } },
        { ...opts, allowPush: true },
      ),
    ).toEqual({
      worktree: { baseRef: 'head' },
      env: { SIDEKICK_WORKER: '/abs/brief.md', DISABLE_AUTOUPDATER: '1' },
      permissions: { allow: [SAVE_SKILL_RULE] },
    });
  });

  test('both branches keep the worker from running updates', () => {
    expect(overlayOf(undefined).env).toMatchObject({
      DISABLE_AUTOUPDATER: '1',
    });
    expect(
      overlayOf(undefined, { ...opts, allowPush: true }).env,
    ).toMatchObject({ DISABLE_AUTOUPDATER: '1' });
  });

  test("the overlay overrides a profile's own DISABLE_AUTOUPDATER", () => {
    const settings = { env: { DISABLE_AUTOUPDATER: '0' } };
    const profile: Profile = {
      name: 'p',
      dir: '/p',
      root: '/',
      store: 'user',
      shadows: undefined,
      pluginDirs: [],
      hasRules: false,
      manifest: { description: 'd', settings },
    };
    const overlay = overlayOf(settings);
    const composed = composeSettings(profile, { home: '/h', overlay });
    expect(composed.env).toMatchObject({ DISABLE_AUTOUPDATER: '1' });
  });

  test('a profile deny rule and the overlay rule both survive composition', () => {
    const profile: Profile = {
      name: 'p',
      dir: '/p',
      root: '/',
      store: 'user',
      shadows: undefined,
      pluginDirs: [],
      hasRules: false,
      manifest: {
        description: 'd',
        settings: { permissions: { deny: ['Bash(rm:*)'] } },
      },
    };
    const overlay = overlayOf(profile.manifest.settings);
    const composed = composeSettings(profile, { home: '/h', overlay });
    expect(composed.permissions).toEqual({
      allow: [SAVE_SKILL_RULE],
      deny: ['Bash(rm:*)', PUSH_DENY_RULE],
    });
  });

  test('a main joins the brief marker whole, with the push block and without', () => {
    const main = 'Single word reply';
    expect(overlayOf(undefined, { ...opts, main }).env).toMatchObject({
      SIDEKICK_WORKER: '/abs/brief.md',
      SIDEKICK_MAIN: main,
      GIT_CONFIG_COUNT: '1',
    });
    expect(overlayOf(undefined, { ...opts, allowPush: true, main })).toEqual({
      worktree: { baseRef: 'head' },
      env: {
        SIDEKICK_WORKER: '/abs/brief.md',
        SIDEKICK_MAIN: main,
        DISABLE_AUTOUPDATER: '1',
      },
      permissions: { allow: [SAVE_SKILL_RULE] },
    });
  });
  test('no main leaves SIDEKICK_MAIN out', () => {
    expect(overlayOf(undefined).env).not.toHaveProperty('SIDEKICK_MAIN');
    expect(
      overlayOf(undefined, { ...opts, allowPush: true }).env,
    ).not.toHaveProperty('SIDEKICK_MAIN');
  });
});

describe('readRule', () => {
  test.each([
    ['/a/b.md', 'Read(//a/b.md)'],
    ['/a/b c.md', 'Read(//a/b c.md)'],
    ['/a/[1]/x', 'Read(//a/\\[1\\]/x)'],
    ['/a/*.md', 'Read(//a/\\*.md)'],
    ['/a/b ', 'Read(//a/b\\ )'],
    ['/a/b  ', 'Read(//a/b\\ \\ )'],
    ['/a/b?\\c', 'Read(//a/b\\?\\\\c)'],
  ])('%p becomes %p', (input, rule) => {
    expect(readRule(input)).toBe(rule);
  });
});

describe('workerOverlay reads', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-reads-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('the overlay allows exactly the rules for its reads', () => {
    const overlay = overlayOf(undefined, {
      ...opts,
      reads: ['/zz-nope/a.md', '/zz-nope/b.md', '/zz-nope/a.md'],
    });
    expect(overlay.permissions).toEqual({
      allow: ['Read(//zz-nope/a.md)', 'Read(//zz-nope/b.md)', SAVE_SKILL_RULE],
      deny: [PUSH_DENY_RULE],
    });
  });

  test('a path under a symlinked folder gets both forms', () => {
    const real = fs.realpathSync(dir);
    fs.mkdirSync(path.join(real, 'real'));
    fs.symlinkSync(path.join(real, 'real'), path.join(real, 'link'));
    const written = path.join(real, 'link', 'rulings.md');
    const overlay = overlayOf(undefined, { ...opts, reads: [written] });
    expect(overlay.permissions).toEqual({
      allow: [
        readRule(written),
        readRule(path.join(real, 'real', 'rulings.md')),
        SAVE_SKILL_RULE,
      ],
      deny: [PUSH_DENY_RULE],
    });
  });

  test('allowPush keeps the allow rules and has no deny rule', () => {
    const overlay = overlayOf(undefined, {
      ...opts,
      allowPush: true,
      reads: ['/zz-nope/a.md'],
    });
    expect(overlay.permissions).toEqual({
      allow: ['Read(//zz-nope/a.md)', SAVE_SKILL_RULE],
    });
  });

  test.each([
    true,
    false,
  ])('no reads still allows the Skill rule, with allowPush %p', (allowPush) => {
    const overlay = overlayOf(undefined, { ...opts, allowPush, reads: [] });
    expect(overlay.permissions).toEqual({
      allow: [SAVE_SKILL_RULE],
      ...(allowPush ? {} : { deny: [PUSH_DENY_RULE] }),
    });
  });

  test('the Skill rule names sk-save alone', () => {
    expect(SAVE_SKILL_RULE).toBe('Skill(sidekick:sk-save)');
  });
});

describe('pathRule', () => {
  test('escapes the path as readRule does, and appends the glob raw', () => {
    expect(pathRule('Edit', '/a/[1] b', '/*/gitdir')).toBe(
      'Edit(//a/\\[1\\] b/*/gitdir)',
    );
    expect(pathRule('Read', '/a/b.md')).toBe(readRule('/a/b.md'));
  });
});

// Paths under a folder that does not exist, so each rule has one form.
const unitOpts = {
  briefPath: '/zz-unit/att/brief.md',
  worktree: '/zz-unit/repo/.claude/worktrees/w1',
  commonDir: '/zz-unit/repo/.git',
  sidekickHome: '/zz-unit/config/sidekick',
  memoryStore: '/zz-unit/store' as string | undefined,
  hosts: ['api.example.com', 'registry.npmjs.org'],
  reads: [
    '/zz-unit/att/brief.md',
    '/zz-unit/att/unit.md',
    '/zz-unit/att/rulings.md',
  ],
  addedDirs: ['/zz-unit/profile', '/zz-unit/att'],
};

function unitOf(
  settings: Settings | undefined,
  o: typeof unitOpts = unitOpts,
): Settings {
  const built = unitOverlay(settings, o);
  if ('issues' in built) throw new Error(built.issues.join('; '));
  return built.overlay;
}

interface Permissions {
  allow: string[];
  deny: string[];
  blockReadsOutsideWorkingDirectories?: boolean;
}

// A test reads back the shape the overlay builds.
const permissionsOf = (overlay: Settings): Permissions =>
  overlay.permissions as Permissions;

const PATH_DENIES = [
  'Edit(//zz-unit/repo/.git/commondir)',
  'Edit(//zz-unit/repo/.git/worktrees/*/commondir)',
  'Edit(//zz-unit/repo/.git/worktrees/*/gitdir)',
  'Edit(//zz-unit/repo/.git/worktrees/*/config.worktree)',
  'Edit(//zz-unit/repo/.claude/worktrees/w1/.git)',
  'Edit(//zz-unit/repo/.git/config)',
  'Edit(//zz-unit/repo/.git/hooks/**)',
  'Edit(//zz-unit/repo/.git/sidekick/**)',
  'Edit(//zz-unit/config/sidekick/**)',
  'Edit(//zz-unit/profile/**)',
  'Edit(//zz-unit/att/**)',
  'Read(//zz-unit/store/**)',
  'Edit(//zz-unit/store/**)',
];

const DENIED_SKILLS = [
  'superpowers:brainstorming',
  'superpowers:writing-plans',
  'superpowers:finishing-a-development-branch',
  'superpowers:diagnosing-superpowers',
  'sidekick:sk-execute',
  'sidekick:sk-design',
  'sidekick:sk-track',
  'sidekick:sk-milestone',
  'sidekick:sk-worktree',
  'sidekick:sk-save',
];

const TOOL_DENIES = [
  ...DENIED_SKILLS.flatMap((skill) => [`Skill(${skill})`, `Skill(${skill} *)`]),
  'WebFetch',
  'WebSearch',
  'EnterWorktree',
  'ExitWorktree',
];

describe('unitOverlay', () => {
  test("the unit overlay sets the fence's sandbox keys, and pins the keys that would loosen it off", () => {
    expect(unitOf(undefined).sandbox).toEqual({
      enabled: true,
      autoAllowBashIfSandboxed: true,
      allowUnsandboxedCommands: false,
      failIfUnavailable: true,
      allowAppleEvents: false,
      allowNestedUserNamespaces: false,
      enableWeakerNestedSandbox: false,
      enableWeakerNetworkIsolation: false,
      filesystem: { disabled: false },
      network: {
        allowedDomains: ['api.example.com', 'registry.npmjs.org'],
        allowAllUnixSockets: false,
      },
    });
  });

  test('no hosts lets no domain through', () => {
    const sandbox = unitOf(undefined, { ...unitOpts, hosts: [] }).sandbox;
    expect(sandbox).toMatchObject({ network: { allowedDomains: [] } });
  });

  test('it allows Edit only in the worktree', () => {
    const { allow } = permissionsOf(unitOf(undefined));
    expect(allow).toEqual([
      'Edit(//zz-unit/repo/.claude/worktrees/w1/**)',
      'Read(//zz-unit/att/brief.md)',
      'Read(//zz-unit/att/unit.md)',
      'Read(//zz-unit/att/rulings.md)',
    ]);
    expect(allow).not.toContain(SAVE_SKILL_RULE);
  });

  test("it denies git's redirect files, config, hooks, the common sidekick folder, the sidekick folder, and the memory store", () => {
    const { deny } = permissionsOf(unitOf(undefined));
    for (const rule of PATH_DENIES) expect(deny).toContain(rule);
  });

  test('it denies EnterWorktree and ExitWorktree, so the worker stays in the worktree it starts in', () => {
    const { deny } = permissionsOf(unitOf(undefined));
    expect(deny).toContain('EnterWorktree');
    expect(deny).toContain('ExitWorktree');
  });

  test('it denies WebFetch, WebSearch, brainstorming, and sk-save', () => {
    const { deny } = permissionsOf(unitOf(undefined));
    for (const rule of TOOL_DENIES) expect(deny).toContain(rule);
  });

  test('it denies each skill bare and with arguments', () => {
    const { deny } = permissionsOf(unitOf(undefined));
    expect(deny).toContain('Skill(superpowers:writing-plans)');
    expect(deny).toContain('Skill(superpowers:writing-plans *)');
    expect(deny).toContain('Skill(sidekick:sk-save)');
    expect(deny).toContain('Skill(sidekick:sk-save *)');
  });

  test('the deny list holds those rules and the push rule, and nothing else', () => {
    expect(permissionsOf(unitOf(undefined)).deny).toEqual([
      ...PATH_DENIES,
      ...TOOL_DENIES,
      PUSH_DENY_RULE,
    ]);
  });

  test('no memory store leaves out the store rules', () => {
    const { deny } = permissionsOf(
      unitOf(undefined, { ...unitOpts, memoryStore: undefined }),
    );
    expect(deny.filter((r) => r.includes('/zz-unit/store'))).toEqual([]);
  });

  test('it sets the read block and autoMemoryEnabled false', () => {
    const overlay = unitOf(undefined);
    expect(permissionsOf(overlay).blockReadsOutsideWorkingDirectories).toBe(
      true,
    );
    expect(overlay.autoMemoryEnabled).toBe(false);
  });

  test('it keeps the push block', () => {
    const overlay = unitOf({ env: { GIT_CONFIG_COUNT: '2' } });
    expect(overlay.env).toEqual({
      SIDEKICK_WORKER: '/zz-unit/att/brief.md',
      DISABLE_AUTOUPDATER: '1',
      GIT_CONFIG_COUNT: '3',
      GIT_CONFIG_KEY_2: PUSH_REWRITE_KEY,
      GIT_CONFIG_VALUE_2: '',
    });
    expect(permissionsOf(overlay).deny).toContain(PUSH_DENY_RULE);
  });

  test.each(['x', '-1', ''])('a profile count of %p refuses', (count) => {
    expect(unitOverlay({ env: { GIT_CONFIG_COUNT: count } }, unitOpts)).toEqual(
      {
        issues: [
          `the profile's GIT_CONFIG_COUNT is ${JSON.stringify(count)}, not a string of digits`,
        ],
      },
    );
  });

  test('it carries the brief marker and no main, and branches from HEAD', () => {
    const overlay = unitOf(undefined);
    expect(overlay.env).not.toHaveProperty('SIDEKICK_MAIN');
    expect(overlay.worktree).toEqual({ baseRef: 'head' });
  });

  test('its keys are the fence, the env, the worktree base, the permissions, and the memory switch', () => {
    expect(Object.keys(unitOf(undefined)).sort()).toEqual([
      'autoMemoryEnabled',
      'env',
      'permissions',
      'sandbox',
      'worktree',
    ]);
    expect(Object.keys(permissionsOf(unitOf(undefined))).sort()).toEqual([
      'allow',
      'blockReadsOutsideWorkingDirectories',
      'deny',
    ]);
  });
});

describe('unitOverlay paths', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unit-paths-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('a path with a space under a symlinked folder gets both forms, escaped', () => {
    const real = fs.realpathSync(dir);
    const spaced = path.join(real, 'a b');
    fs.mkdirSync(path.join(spaced, 'real'), { recursive: true });
    fs.symlinkSync(path.join(spaced, 'real'), path.join(spaced, 'link'));
    const worktree = path.join(spaced, 'link', 'wt');
    const physicalTree = path.join(spaced, 'real', 'wt');
    const { allow, deny } = permissionsOf(
      unitOf(undefined, { ...unitOpts, worktree, reads: [] }),
    );
    expect(allow).toEqual([
      `Edit(/${worktree}/**)`,
      `Edit(/${physicalTree}/**)`,
    ]);
    expect(deny).toContain(`Edit(/${worktree}/.git)`);
    expect(deny).toContain(`Edit(/${physicalTree}/.git)`);
  });

  test.if(fs.realpathSync('/var') !== '/var')(
    'a path under /var also gets its /private/var form',
    () => {
      const { deny } = permissionsOf(
        unitOf(undefined, { ...unitOpts, commonDir: '/var/zz-unit/.git' }),
      );
      expect(deny).toContain('Edit(//var/zz-unit/.git/hooks/**)');
      expect(deny).toContain('Edit(//private/var/zz-unit/.git/hooks/**)');
      expect(deny).toContain('Edit(//var/zz-unit/.git/worktrees/*/gitdir)');
      expect(deny).toContain(
        'Edit(//private/var/zz-unit/.git/worktrees/*/gitdir)',
      );
    },
  );

  test('a glob character in a folder name is escaped, and the glob after it is not', () => {
    const { deny } = permissionsOf(
      unitOf(undefined, { ...unitOpts, commonDir: '/zz-unit/[x]*/.git' }),
    );
    expect(deny).toContain(
      'Edit(//zz-unit/\\[x\\]\\*/.git/worktrees/*/gitdir)',
    );
  });
});

describe('fenceSafeSettings', () => {
  const kept = {
    model: 'sonnet',
    env: { A: '1' },
    enabledPlugins: { 'role@local': true },
    permissions: { deny: ['Bash(rm:*)'], ask: ['Y'] },
    sandbox: { filesystem: { denyRead: ['/r'], denyWrite: ['/w'] } },
  };

  test('it keeps model, env, enabledPlugins, permissions.deny and ask, and the sandbox read and write denies', () => {
    expect(fenceSafeSettings(kept)).toEqual({ settings: kept, dropped: [] });
  });

  test('it drops every other key, naming each', () => {
    const settings = {
      ...kept,
      hooks: { PreToolUse: [] },
      enableAllProjectMcpServers: true,
      enabledMcpjsonServers: ['x'],
      statusLine: { type: 'command', command: 'x' },
      permissions: {
        deny: ['Bash(rm:*)'],
        allow: ['Bash(*)'],
        ask: ['Y'],
        additionalDirectories: ['/elsewhere'],
      },
      sandbox: {
        enabled: false,
        excludedCommands: ['docker'],
        network: { allowedDomains: ['evil.example'] },
        filesystem: {
          denyRead: ['/r'],
          denyWrite: ['/w'],
          allowWrite: ['/'],
        },
      },
    };
    expect(fenceSafeSettings(settings)).toEqual({
      settings: kept,
      dropped: [
        'permissions.allow',
        'permissions.additionalDirectories',
        'sandbox.enabled',
        'sandbox.excludedCommands',
        'sandbox.network',
        'sandbox.filesystem.allowWrite',
        'hooks',
        'enableAllProjectMcpServers',
        'enabledMcpjsonServers',
        'statusLine',
      ],
    });
    expect(settings.permissions.allow).toEqual(['Bash(*)']);
  });

  test('a kept parent that is not an object, or holds nothing kept, goes whole', () => {
    expect(
      fenceSafeSettings({ permissions: ['x'], sandbox: { network: {} } }),
    ).toEqual({ settings: {}, dropped: ['permissions', 'sandbox.network'] });
  });

  test('a key named as an Object property is dropped like any other', () => {
    const settings = JSON.parse('{"constructor":{"x":1},"__proto__":{"y":2}}');
    expect(fenceSafeSettings(settings)).toEqual({
      settings: {},
      dropped: ['constructor', '__proto__'],
    });
  });

  test('no settings keep nothing and drop nothing', () => {
    expect(fenceSafeSettings(undefined)).toEqual({ settings: {}, dropped: [] });
  });

  test('the kept names read as the keys it keeps', () => {
    expect(FENCE_SAFE_KEYS).toEqual([
      'model',
      'env',
      'enabledPlugins',
      'permissions.deny',
      'permissions.ask',
      'sandbox.filesystem.denyRead',
      'sandbox.filesystem.denyWrite',
    ]);
  });
});

describe('unitSettingSources', () => {
  const withSources = (
    settingSources: ProfileManifest['settingSources'],
  ): Profile => ({
    name: 'p',
    dir: '/p',
    root: '/',
    store: 'user',
    shadows: undefined,
    pluginDirs: [],
    hasRules: false,
    manifest: { description: 'd', settingSources },
  });

  const cases: [ProfileManifest['settingSources'], string[]][] = [
    [undefined, ['user']],
    [['user', 'project', 'local'], ['user']],
    [['local', 'user'], ['user']],
    [['user'], ['user']],
    [['project', 'local'], []],
    [[], []],
  ];

  test.each(
    cases,
  )('unit setting sources leave out project and local: %p gives %p', (sources, expected) => {
    expect(unitSettingSources(withSources(sources))).toEqual(expected);
  });
});
