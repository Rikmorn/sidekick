import { afterAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { composeSettings } from './profile-launch.js';
import type { Profile } from './profile-store.js';
import {
  PUSH_DENY_RULE,
  PUSH_REWRITE_KEY,
  readRule,
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
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: PUSH_REWRITE_KEY,
        GIT_CONFIG_VALUE_0: '',
      },
      permissions: { deny: [PUSH_DENY_RULE] },
    });
  });

  test('a profile count of 2 gives index 2 and count 3', () => {
    const overlay = overlayOf({ env: { GIT_CONFIG_COUNT: '2' } });
    expect(overlay.env).toEqual({
      SIDEKICK_WORKER: '/abs/brief.md',
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
      env: { SIDEKICK_WORKER: '/abs/brief.md' },
    });
  });

  test('a profile deny rule and the overlay rule both survive composition', () => {
    const profile: Profile = {
      name: 'p',
      dir: '/p',
      root: '/',
      store: 'user',
      shadows: undefined,
      hasRules: false,
      manifest: {
        description: 'd',
        settings: { permissions: { deny: ['Bash(rm:*)'] } },
      },
    };
    const overlay = overlayOf(profile.manifest.settings);
    const composed = composeSettings(profile, { home: '/h', overlay });
    expect(composed.permissions).toEqual({
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
      env: { SIDEKICK_WORKER: '/abs/brief.md', SIDEKICK_MAIN: main },
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
      allow: ['Read(//zz-nope/a.md)', 'Read(//zz-nope/b.md)'],
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
    expect(overlay.permissions).toEqual({ allow: ['Read(//zz-nope/a.md)'] });
  });

  test('no reads and allowPush leaves out permissions', () => {
    const overlay = overlayOf(undefined, {
      ...opts,
      allowPush: true,
      reads: [],
    });
    expect('permissions' in overlay).toBe(false);
  });
});
