import { describe, expect, test } from 'bun:test';
import {
  composeSettings,
  launchArgs,
  mergeSettings,
} from './profile-launch.js';
import type { ProfileManifest } from './profile-manifest.js';
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
