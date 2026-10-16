import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FIXTURE_FLAG } from '../../plugin/hooks/gauge/contract.js';
import {
  bgArgs,
  type ClaudeResult,
  type ClaudeRunner,
  checkSettings,
  composeSettings,
  invalidSettingsLines,
  launchArgs,
  makeClaudeRunner,
  mergeSettings,
} from './profile-launch.js';
import { type ProfileManifest, parseManifest } from './profile-manifest.js';
import type { Profile } from './profile-store.js';

const profile = (
  manifest: Partial<ProfileManifest> = {},
  over: Partial<Profile> = {},
): Profile => ({
  name: 'work',
  dir: '/store/work',
  root: '/store',
  manifest: { description: 'd', ...manifest },
  hasRules: false,
  ...over,
});

const p = profile();

describe('mergeSettings', () => {
  test('objects merge key by key; a later scalar wins', () => {
    expect(
      mergeSettings({ a: { x: 1, y: 1 }, s: 'p' }, { a: { y: 2 }, s: 'o' }),
    ).toEqual({ a: { x: 1, y: 2 }, s: 'o' });
  });

  test('arrays concatenate, dropping duplicates by value and keeping order', () => {
    const hook = {
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'x' }],
    };
    expect(
      mergeSettings({ h: [hook, 1] }, { h: [structuredClone(hook), 2] }),
    ).toEqual({ h: [hook, 1, 2] });
  });

  test('a key that is an object in one layer only takes the later value whole', () => {
    expect(mergeSettings({ a: { x: 1 } }, { a: 'flat' })).toEqual({
      a: 'flat',
    });
    expect(mergeSettings({ a: 'flat' }, { a: { x: 1 } })).toEqual({
      a: { x: 1 },
    });
    expect(mergeSettings({ a: [1] }, { a: { x: 1 } })).toEqual({ a: { x: 1 } });
  });

  test('leaves its inputs unchanged', () => {
    const a = { o: { x: 1 }, l: [1] };
    const b = { o: { y: 2 }, l: [2] };
    const before = structuredClone([a, b]);
    mergeSettings(a, b);
    expect([a, b]).toEqual(before);
  });

  test('no layers give an empty object', () => {
    expect(mergeSettings()).toEqual({});
  });
});

describe('composeSettings', () => {
  test('sidekick.profile is always present', () => {
    expect(composeSettings(p, { home: '/h' }).sidekick).toEqual({
      profile: 'work',
    });
  });

  test('hide is copied to sidekick.hide beside the profile name', () => {
    const hide = { agents: ['Explore'], mods: ['desk' as const] };
    expect(composeSettings(profile({ hide }), { home: '/h' }).sidekick).toEqual(
      { profile: 'work', hide },
    );
  });

  test('without hide, sidekick holds the profile name alone', () => {
    const { sidekick } = composeSettings(p, { home: '/h' });
    expect(sidekick).toEqual({ profile: 'work' });
    expect(Object.keys(sidekick ?? {})).toEqual(['profile']);
  });

  test('a profile settings block cannot set sidekick.hide', () => {
    expect(
      parseManifest({
        description: 'd',
        settings: { sidekick: { hide: { mods: ['desk'] } } },
      }).ok,
    ).toBe(false);
  });

  test('a profile named fixture composes the gauge fixture flag', () => {
    expect(
      composeSettings(profile({}, { name: 'fixture' }), { home: '/h' })
        .sidekick,
    ).toEqual(FIXTURE_FLAG.sidekick);
  });

  test('the memory variable is set only when the folder has rules', () => {
    const with_ = composeSettings(profile({}, { hasRules: true }), {
      home: '/h',
    });
    expect(with_.env).toEqual({
      CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
    });
    expect(composeSettings(p, { home: '/h' }).env).toBeUndefined();
  });

  test('a clean room excludes the user instruction copies under HOME', () => {
    const s = composeSettings(
      profile({ settingSources: ['project', 'local'] }),
      {
        home: '/h',
      },
    );
    expect(s.claudeMdExcludes).toEqual([
      '/h/.claude/CLAUDE.md',
      '/h/.claude/rules/**',
    ]);
  });

  test('an empty settingSources is a clean room too', () => {
    expect(
      composeSettings(profile({ settingSources: [] }), { home: '/h' })
        .claudeMdExcludes,
    ).toHaveLength(2);
  });

  test('no excludes without settingSources, or when it includes user', () => {
    expect(composeSettings(p, { home: '/h' }).claudeMdExcludes).toBeUndefined();
    expect(
      composeSettings(profile({ settingSources: ['user', 'project'] }), {
        home: '/h',
      }).claudeMdExcludes,
    ).toBeUndefined();
  });

  test("the profile's own claudeMdExcludes concatenate with launch's", () => {
    const s = composeSettings(
      profile({
        settingSources: ['project'],
        settings: { claudeMdExcludes: ['/mine/**'] },
      }),
      { home: '/h' },
    );
    expect(s.claudeMdExcludes).toEqual([
      '/mine/**',
      '/h/.claude/CLAUDE.md',
      '/h/.claude/rules/**',
    ]);
  });

  test("the overlay sits between the profile and launch's keys", () => {
    const s = composeSettings(profile({ settings: { model: 'a', k: 1 } }), {
      home: '/h',
      overlay: { model: 'b', sidekick: { profile: 'x', more: 1 } },
    });
    expect(s.model).toBe('b');
    expect(s.k).toBe(1);
    expect(s.sidekick).toEqual({ profile: 'work', more: 1 });
  });
});

describe('launchArgs', () => {
  test('--add-dir comes first and is never last', () => {
    const args = launchArgs(p, composeSettings(p, { home: '/h' }));
    expect(args.slice(0, 3)).toEqual(['--add-dir', p.dir, '--settings']);
    expect(args.at(-2)).not.toBe('--add-dir');
    expect(args.at(-1)).not.toBe('--add-dir');
  });

  test('the settings argument is the compact JSON of the settings', () => {
    const settings = composeSettings(p, { home: '/h' });
    expect(launchArgs(p, settings)[3]).toBe(JSON.stringify(settings));
  });

  test('--setting-sources is comma-joined and follows --settings', () => {
    const q = profile({ settingSources: ['project', 'local'] });
    const args = launchArgs(q, composeSettings(q, { home: '/h' }));
    expect(args.slice(4)).toEqual(['--setting-sources', 'project,local']);
  });

  test('an empty settingSources gives an empty string', () => {
    const q = profile({ settingSources: [] });
    expect(launchArgs(q, composeSettings(q, { home: '/h' })).slice(4)).toEqual([
      '--setting-sources',
      '',
    ]);
  });

  test('no --setting-sources without settingSources', () => {
    expect(launchArgs(p, composeSettings(p, { home: '/h' }))).toHaveLength(4);
  });

  test('a NUL in a value comes out escaped, with no raw NUL in any argument', () => {
    const q = profile({ settings: { note: 'a\u0000b' } });
    const args = launchArgs(q, composeSettings(q, { home: '/h' }));
    expect(args.some((a) => a.includes('\u0000'))).toBe(false);
    expect(args[3]).toContain('\\u0000');
  });
});

const fileOf = (args: string[]): string => {
  const i = args.indexOf('--settings');
  return args[i + 1] ?? '';
};

const doctorOutput = (file: string, entries: string[]): string =>
  [
    'Claude Code doctor',
    '',
    'Invalid settings',
    ...entries.map((e) => `- ${file} \u203a ${e}`),
    '  Suggested fix: Use an array.',
    '',
    'Remote Control',
  ].join('\n');

const ok = (stdout: string): ClaudeResult => ({
  code: 0,
  stdout,
  stderr: '',
  timedOut: false,
});

const canaryLine = (key: string) =>
  `${key}: Expected number, but received string`;

// Reports the canary the way the real doctor does, plus any extra entries.
const fakeRunner =
  (
    extra: string[] = [],
    seen: { files: string[]; calls: number } = { files: [], calls: 0 },
  ): ClaudeRunner =>
  (args) => {
    seen.calls += 1;
    const file = fileOf(args);
    seen.files.push(file);
    const written: Record<string, unknown> = JSON.parse(
      fs.readFileSync(file, 'utf8'),
    );
    const canaries = Object.entries(written)
      .filter(([, v]) => v === 'sidekick-canary')
      .map(([k]) => canaryLine(k));
    return ok(doctorOutput(file, [...canaries, ...extra]));
  };

describe('checkSettings', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-check-test-'));
  const deps = (run: ClaudeRunner, skip = false) => ({
    run,
    cwd: tmp,
    tmpdir: tmp,
    skip,
  });
  const leftovers = () => fs.readdirSync(tmp);
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test('only the canary line: ok, no warnings, temp folder gone', () => {
    expect(checkSettings({ a: 1 }, deps(fakeRunner()))).toEqual({
      ok: true,
      warnings: [],
    });
    expect(leftovers()).toEqual([]);
  });

  test('passes --settings <file> doctor', () => {
    const seen = { files: [] as string[], calls: 0 };
    let args: string[] = [];
    const run: ClaudeRunner = (a, o) => {
      args = a;
      return fakeRunner([], seen)(a, o);
    };
    checkSettings({}, deps(run));
    expect(args[0]).toBe('--settings');
    expect(args[2]).toBe('doctor');
    expect(seen).toEqual({ files: [args[1] ?? ''], calls: 1 });
    expect(fs.existsSync(args[1] ?? '')).toBe(false);
  });

  test('a missing canary line is refused and names the skip variable', () => {
    const run: ClaudeRunner = () => ok('Claude Code doctor\n\nAll fine\n');
    const r = checkSettings({}, deps(run));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toHaveLength(2);
    expect(r.issues[0]).toContain('no longer parses');
    expect(r.issues[1]).toContain('SIDEKICK_PROFILE_SKIP_CHECK=1');
    expect(leftovers()).toEqual([]);
  });

  test('a real error beside the canary is refused with its line', () => {
    const r = checkSettings(
      {},
      deps(
        fakeRunner(['permissions.allow: Expected array, but received string']),
      ),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.join('\n')).toContain('permissions.allow');
    expect(r.issues.join('\n')).not.toContain('feedbackSurveyRate');
  });

  test('a line naming another file is ignored', () => {
    const run: ClaudeRunner = (args, o) => {
      const base = fakeRunner()(args, o);
      return ok(
        base.stdout.replace(
          '  Suggested fix',
          '- /elsewhere/other.json \u203a model: Bad value\n  Suggested fix',
        ),
      );
    };
    expect(checkSettings({}, deps(run))).toEqual({ ok: true, warnings: [] });
  });

  test('a timeout, a non-zero exit and a missing claude are each refused', () => {
    const cases: [ClaudeResult, string][] = [
      [
        { code: 0, stdout: 'partial', stderr: '', timedOut: true },
        'claude doctor timed out.',
      ],
      [
        { code: 2, stdout: '', stderr: 'boom', timedOut: false },
        'claude doctor failed with exit code 2.',
      ],
      [
        {
          code: 127,
          stdout: '',
          stderr: 'spawn claude ENOENT',
          timedOut: false,
        },
        'The settings check could not start claude.',
      ],
    ];
    cases.forEach(([c, first]) => {
      const r = checkSettings(
        {},
        deps(() => c),
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.issues[0]).toBe(first);
      expect(r.issues.join('\n')).toContain(c.stderr || c.stdout);
    });
    expect(leftovers()).toEqual([]);
  });

  test('a profile that sets feedbackSurveyRate moves the canary and keeps its value', () => {
    let written: Record<string, unknown> = {};
    const run: ClaudeRunner = (args, o) => {
      written = JSON.parse(fs.readFileSync(fileOf(args), 'utf8'));
      return fakeRunner()(args, o);
    };
    expect(checkSettings({ feedbackSurveyRate: 0.5 }, deps(run))).toEqual({
      ok: true,
      warnings: [],
    });
    expect(written).toEqual({
      feedbackSurveyRate: 0.5,
      cleanupPeriodDays: 'sidekick-canary',
    });
  });

  test('settings that set both canary keys are refused', () => {
    const seen = { files: [] as string[], calls: 0 };
    const r = checkSettings(
      { feedbackSurveyRate: 1, cleanupPeriodDays: 2 },
      deps(fakeRunner([], seen)),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.join('\n')).toContain('both');
    expect(seen.calls).toBe(0);
  });

  test('skip never calls the runner and warns once', () => {
    const seen = { files: [] as string[], calls: 0 };
    const r = checkSettings({}, deps(fakeRunner([], seen), true));
    expect(seen.calls).toBe(0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('SIDEKICK_PROFILE_SKIP_CHECK');
  });

  test('the temp folder is gone when the runner throws', () => {
    const run: ClaudeRunner = () => {
      throw new Error('runner blew up');
    };
    expect(() => checkSettings({}, deps(run))).toThrow('runner blew up');
    expect(leftovers()).toEqual([]);
  });

  test('the settings file is readable only by its owner', () => {
    let mode = 0;
    const run: ClaudeRunner = (args, o) => {
      mode = fs.statSync(fileOf(args)).mode & 0o777;
      return fakeRunner()(args, o);
    };
    checkSettings({}, deps(run));
    expect(mode).toBe(0o600);
  });
});

describe('invalidSettingsLines', () => {
  const out = [
    'Invalid settings',
    '- /a/s.json \u203a x: bad',
    '  Suggested fix: do it',
    '- /b/o.json \u203a y: bad',
    '- /real/s.json \u203a z: bad',
    '',
    '- /a/s.json \u203a after: not in the section',
  ].join('\n');

  test('keeps entries naming a path, drops fixes, other files and text after the section', () => {
    expect(invalidSettingsLines(out, ['/a/s.json', '/real/s.json'])).toEqual([
      '- /a/s.json \u203a x: bad',
      '- /real/s.json \u203a z: bad',
    ]);
  });

  test('no section gives no lines', () => {
    expect(invalidSettingsLines('all good', ['/a/s.json'])).toEqual([]);
  });
});

describe('bgArgs', () => {
  test('--bg follows the base arguments', () => {
    expect(bgArgs(['--add-dir', '/d'], {})).toEqual([
      '--add-dir',
      '/d',
      '--bg',
    ]);
  });

  test('-n only when a name is given', () => {
    expect(bgArgs(['x'], { sessionName: 's' })).toEqual([
      'x',
      '--bg',
      '-n',
      's',
    ]);
  });

  test('plugin dir, permission mode, and worktree come before --bg', () => {
    expect(
      bgArgs(['x'], {
        pluginDir: '/pl',
        permissionMode: 'acceptEdits',
        worktree: 'w',
        sessionName: 's',
        prompt: 'go',
      }),
    ).toEqual([
      'x',
      '--plugin-dir',
      '/pl',
      '--permission-mode',
      'acceptEdits',
      '--worktree',
      'w',
      '--bg',
      '-n',
      's',
      '--',
      'go',
    ]);
  });

  test('a prompt goes after --, even one starting with a dash', () => {
    expect(bgArgs(['x'], { prompt: '-rf do things' })).toEqual([
      'x',
      '--bg',
      '--',
      '-rf do things',
    ]);
  });
});

describe('makeClaudeRunner', () => {
  const spawnReturning = (result: object) => () => result;

  test('passes args, cwd and timeout to spawn and maps the output', () => {
    let seen: unknown[] = [];
    const run = makeClaudeRunner((cmd, args, opts) => {
      seen = [cmd, args, opts.cwd, opts.timeout, opts.shell];
      return { status: 3, stdout: 'o', stderr: 'e' };
    });
    expect(run(['a'], { cwd: '/w', timeoutMs: 50 })).toEqual({
      code: 3,
      stdout: 'o',
      stderr: 'e',
      timedOut: false,
    });
    expect(seen).toEqual(['claude', ['a'], '/w', 50, false]);
  });

  test('a timeout error maps to timedOut', () => {
    const err = Object.assign(new Error('spawnSync claude ETIMEDOUT'), {
      code: 'ETIMEDOUT',
    });
    const run = makeClaudeRunner(
      spawnReturning({ status: null, stdout: 'p', stderr: '', error: err }),
    );
    const r = run([], { cwd: '/w', timeoutMs: 1 });
    expect(r.timedOut).toBe(true);
  });

  test('a spawn error maps to code 127 with its message', () => {
    const err = Object.assign(new Error('spawnSync claude ENOENT'), {
      code: 'ENOENT',
    });
    const run = makeClaudeRunner(
      spawnReturning({ status: null, stdout: '', stderr: '', error: err }),
    );
    const r = run([], { cwd: '/w', timeoutMs: 1 });
    expect(r.code).toBe(127);
    expect(r.timedOut).toBe(false);
    expect(r.stderr).toContain('ENOENT');
  });
});
