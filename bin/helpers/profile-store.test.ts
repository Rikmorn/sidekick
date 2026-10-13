import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeSettings } from './profile-launch.js';
import { PROFILE_NAME_RULE } from './profile-manifest.js';
import {
  checkLayout,
  listProfiles,
  loadProfile,
  newProfile,
  storeRoots,
} from './profile-store.js';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-profile-store-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const write = (file: string, text = ''): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const profile = (
  root: string,
  name: string,
  description = 'A profile',
): string => {
  const dir = path.join(root, name);
  write(path.join(dir, 'profile.json'), JSON.stringify({ description }));
  return dir;
};

describe('storeRoots', () => {
  test('SIDEKICK_PROFILES_DIR replaces the default root, resolved against cwd', () => {
    expect(
      storeRoots({ SIDEKICK_PROFILES_DIR: 'store' }, '/work', '/home/u'),
    ).toEqual(['/work/store']);
  });
  test('an empty SIDEKICK_PROFILES_DIR counts as unset', () => {
    expect(
      storeRoots({ SIDEKICK_PROFILES_DIR: '' }, '/work', '/home/u'),
    ).toEqual(['/home/u/.claude/profiles']);
  });
  test('an empty CLAUDE_CONFIG_DIR counts as unset', () => {
    expect(storeRoots({ CLAUDE_CONFIG_DIR: '' }, '/work', '/home/u')).toEqual([
      '/home/u/.claude/profiles',
    ]);
  });
  test('CLAUDE_CONFIG_DIR moves the default root', () => {
    expect(
      storeRoots({ CLAUDE_CONFIG_DIR: '/cfg' }, '/work', '/home/u'),
    ).toEqual(['/cfg/profiles']);
  });
});

describe('loadProfile', () => {
  test('loads a valid profile with an absolute dir', () => {
    profile(path.join(tmp, 'store'), 'p', 'Clean room');
    const r = loadProfile('p', [path.join(tmp, 'store')]);
    expect(r).toEqual({
      ok: true,
      profile: {
        name: 'p',
        dir: path.join(tmp, 'store', 'p'),
        root: path.join(tmp, 'store'),
        manifest: { description: 'Clean room' },
        hasRules: false,
      },
    });
  });

  test('a relative SIDEKICK_PROFILES_DIR still gives an absolute dir', () => {
    profile(path.join(tmp, 'store'), 'p');
    const roots = storeRoots(
      { SIDEKICK_PROFILES_DIR: 'store' },
      tmp,
      '/home/u',
    );
    const r = loadProfile('p', roots);
    expect(r.ok).toBe(true);
    if (r.ok) expect(path.isAbsolute(r.profile.dir)).toBe(true);
  });

  test('the first root holding the name wins', () => {
    const a = path.join(tmp, 'a');
    const b = path.join(tmp, 'b');
    profile(a, 'p', 'from a');
    profile(b, 'p', 'from b');
    const r = loadProfile('p', [a, b]);
    expect(r.ok && r.profile.manifest.description).toBe('from a');
  });

  test('an unknown name lists every root searched', () => {
    const r = loadProfile('nope', [path.join(tmp, 'a'), path.join(tmp, 'b')]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const text = r.issues.join('\n');
      expect(text).toContain('nope');
      expect(text).toContain(path.join(tmp, 'a'));
      expect(text).toContain(path.join(tmp, 'b'));
    }
  });

  test('an invalid name gives the naming rule', () => {
    const r = loadProfile('../x', [tmp]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.join('\n')).toContain(PROFILE_NAME_RULE);
  });

  test('a folder without profile.json names the missing file', () => {
    fs.mkdirSync(path.join(tmp, 'p'));
    const r = loadProfile('p', [tmp]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.join('\n')).toContain('profile.json: missing');
  });

  test('a CLAUDE.md in the folder is refused, saying the stance belongs in .claude/rules/', () => {
    const dir = profile(tmp, 'p');
    write(path.join(dir, 'CLAUDE.md'));
    const r = loadProfile('p', [tmp]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.join('\n')).toMatch(/CLAUDE\.md.*AGENTS\.md/s);
  });

  test('a missing root is an unknown name, not a crash', () => {
    const r = loadProfile('p', [path.join(tmp, 'absent')]);
    expect(r.ok).toBe(false);
  });
});

describe('hasRules', () => {
  const has = (dir: string): boolean => {
    const r = loadProfile(path.basename(dir), [path.dirname(dir)]);
    if (!r.ok) throw new Error(r.issues.join('\n'));
    return r.profile.hasRules;
  };
  test('false with no .claude/rules/', () => {
    expect(has(profile(tmp, 'p'))).toBe(false);
  });
  test('false with only a .txt there', () => {
    const dir = profile(tmp, 'p');
    write(path.join(dir, '.claude', 'rules', 'x.txt'));
    expect(has(dir)).toBe(false);
  });
  test('true with .claude/rules/sub/x.md', () => {
    const dir = profile(tmp, 'p');
    write(path.join(dir, '.claude', 'rules', 'sub', 'x.md'));
    expect(has(dir)).toBe(true);
  });
  test('true with a symlinked .md file', () => {
    const dir = profile(tmp, 'p');
    write(path.join(tmp, 'target.md'));
    fs.mkdirSync(path.join(dir, '.claude', 'rules'), { recursive: true });
    fs.symlinkSync(
      path.join(tmp, 'target.md'),
      path.join(dir, '.claude', 'rules', 'l.md'),
    );
    expect(has(dir)).toBe(true);
  });
});

describe('checkLayout', () => {
  test('a clean folder has no refusals', () => {
    const dir = profile(tmp, 'p');
    write(path.join(dir, 'notes.txt'));
    write(path.join(dir, '.claude', 'agents', 'a.md'));
    expect(checkLayout(dir)).toEqual([]);
  });

  test.each([
    ['CLAUDE.md', /AGENTS\.md.*\.claude\/rules\//s],
    ['.claude/CLAUDE.md', /AGENTS\.md.*\.claude\/rules\//s],
    ['CLAUDE.local.md', /AGENTS\.md.*\.claude\/rules\//s],
    ['.claude/settings.json', /plugins.*profile\.json/s],
    ['.claude/settings.local.json', /plugins.*profile\.json/s],
  ])('%s is refused with its reason', (rel, why) => {
    const dir = profile(tmp, 'p');
    write(path.join(dir, rel));
    const issues = checkLayout(dir);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain(path.join(dir, rel));
    expect(issues[0]).toMatch(why);
  });

  test('a dangling symlink counts as present', () => {
    const dir = profile(tmp, 'p');
    fs.symlinkSync(path.join(tmp, 'nowhere'), path.join(dir, 'CLAUDE.md'));
    expect(checkLayout(dir)).toHaveLength(1);
  });

  test('every refused path present gets its own message', () => {
    const dir = profile(tmp, 'p');
    write(path.join(dir, 'CLAUDE.md'));
    write(path.join(dir, '.claude', 'settings.json'));
    expect(checkLayout(dir)).toHaveLength(2);
  });
});

describe('listProfiles', () => {
  test('lists a valid and an invalid profile, sorted, skipping non-folders', () => {
    profile(tmp, 'b', 'Second');
    fs.mkdirSync(path.join(tmp, 'a'));
    write(path.join(tmp, 'a', 'profile.json'), '{');
    write(path.join(tmp, 'file.txt'));
    const listed = listProfiles([tmp]);
    expect(listed.map((p) => p.name)).toEqual(['a', 'b']);
    expect(listed[0]?.description).toBeUndefined();
    expect(listed[0]?.issues.join('\n')).toContain('invalid JSON');
    expect(listed[1]).toEqual({
      name: 'b',
      root: tmp,
      description: 'Second',
      issues: [],
    });
  });

  test('skips dot-folders, which no profile name can match', () => {
    profile(tmp, 'b', 'Second');
    fs.mkdirSync(path.join(tmp, '.git'));
    fs.mkdirSync(path.join(tmp, '.cache'));
    expect(listProfiles([tmp]).map((p) => p.name)).toEqual(['b']);
  });

  test('a layout refusal lists the profile with its issue', () => {
    const dir = profile(tmp, 'p');
    write(path.join(dir, 'CLAUDE.md'));
    const [only] = listProfiles([tmp]);
    expect(only?.issues).toHaveLength(1);
  });

  test('a folder that fails the name rule is listed with that issue', () => {
    fs.mkdirSync(path.join(tmp, 'Bad Name'));
    const [only] = listProfiles([tmp]);
    expect(only?.name).toBe('Bad Name');
    expect(only?.issues.join('\n')).toContain(PROFILE_NAME_RULE);
  });

  test('a missing root is an empty list', () => {
    expect(listProfiles([path.join(tmp, 'absent')])).toEqual([]);
  });
});

describe('newProfile', () => {
  test('writes profile.json holding only the description', () => {
    const r = newProfile('p', 'Clean room', [tmp]);
    expect(r).toEqual({ ok: true, dir: path.join(tmp, 'p') });
    const text = fs.readFileSync(path.join(tmp, 'p', 'profile.json'), 'utf8');
    expect(JSON.parse(text)).toEqual({ description: 'Clean room' });
  });
  test('creates a missing root', () => {
    const root = path.join(tmp, 'deep', 'store');
    expect(newProfile('p', 'x', [root]).ok).toBe(true);
    expect(fs.existsSync(path.join(root, 'p', 'profile.json'))).toBe(true);
  });
  test('refuses an existing folder', () => {
    fs.mkdirSync(path.join(tmp, 'p'));
    const r = newProfile('p', 'x', [tmp]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.join('\n')).toContain(path.join(tmp, 'p'));
  });
  test('refuses an invalid name and writes nothing', () => {
    const r = newProfile('Bad/Name', 'x', [tmp]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.join('\n')).toContain(PROFILE_NAME_RULE);
    expect(fs.readdirSync(tmp)).toEqual([]);
  });
  test('refuses an empty description, which the manifest would reject', () => {
    const r = newProfile('p', '', [tmp]);
    expect(r.ok).toBe(false);
    expect(fs.readdirSync(tmp)).toEqual([]);
  });
});

describe('the bench fixtures', () => {
  const fixtures = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'fixtures',
    'profiles',
  );

  test('bench loads, keeps the user layer, and has a rule', () => {
    const r = loadProfile('bench', [fixtures]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.hasRules).toBe(true);
    expect(r.profile.manifest.settingSources).toBeUndefined();
  });

  test('bench-clean loads and composes the user-file excludes', () => {
    const r = loadProfile('bench-clean', [fixtures]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.hasRules).toBe(true);
    expect(r.profile.manifest.settingSources).toEqual(['project', 'local']);
    const settings = composeSettings(r.profile, { home: '/home/u' });
    expect(settings.claudeMdExcludes).toEqual([
      '/home/u/.claude/CLAUDE.md',
      '/home/u/.claude/rules/**',
    ]);
  });
});
