import { describe, expect, test } from 'bun:test';
import { composeSettings } from './profile-launch.js';
import type { Profile } from './profile-store.js';
import {
  PUSH_DENY_RULE,
  PUSH_REWRITE_KEY,
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

  test('a non-string count refuses', () => {
    const built = workerOverlay({ env: { GIT_CONFIG_COUNT: 2 } }, opts);
    expect('issues' in built).toBe(true);
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
});
