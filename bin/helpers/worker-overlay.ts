/**
 * The settings overlay a dispatched worker launches with: the worktree base,
 * the brief marker in its environment, and, unless the brief allows a push,
 * the two blocks on `git push`.
 */

import { isPlainObject, type Settings } from './profile-launch.js';

/** The git config key that rewrites every push URL to an empty, unusable one. */
export const PUSH_REWRITE_KEY = 'url.sidekick-push-blocked::.pushInsteadOf';

/** The permission rule that denies the worker's `git push` commands. */
export const PUSH_DENY_RULE = 'Bash(git push:*)';

// The push block's environment: one more `GIT_CONFIG_*` entry after the profile's own.
function pushEnv(count: number): Record<string, string> {
  return {
    GIT_CONFIG_COUNT: String(count + 1),
    [`GIT_CONFIG_KEY_${count}`]: PUSH_REWRITE_KEY,
    [`GIT_CONFIG_VALUE_${count}`]: '',
  };
}

/**
 * Builds the overlay for a worker. The push block numbers its `GIT_CONFIG_*`
 * entry after the profile's own `env.GIT_CONFIG_COUNT`, or from 0 when it sets
 * none. A count that is not a non-negative integer string refuses, unless
 * `allowPush` leaves the push block out.
 */
export function workerOverlay(
  profileSettings: Settings | undefined,
  opts: { briefPath: string; allowPush: boolean },
): { overlay: Settings } | { issues: string[] } {
  const base = { worktree: { baseRef: 'head' } };
  if (opts.allowPush) {
    return {
      overlay: { ...base, env: { SIDEKICK_WORKER: opts.briefPath } },
    };
  }
  const env = isPlainObject(profileSettings?.env) ? profileSettings.env : {};
  const raw = env.GIT_CONFIG_COUNT ?? '0';
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    return {
      issues: [
        `the profile's GIT_CONFIG_COUNT is ${JSON.stringify(raw)}, not a non-negative integer`,
      ],
    };
  }
  return {
    overlay: {
      ...base,
      env: { SIDEKICK_WORKER: opts.briefPath, ...pushEnv(Number(raw)) },
      permissions: { deny: [PUSH_DENY_RULE] },
    },
  };
}
