/**
 * The settings overlay a dispatched worker launches with: the worktree base,
 * the brief marker and the recorded main in its environment, the `Read` allow
 * rules that let it read the files dispatch names with no prompt, the `Skill`
 * allow rule that lets it run `sk-save` with no prompt, and, unless the brief
 * allows a push, the two blocks on `git push`.
 */

import { isPlainObject, type Settings } from './profile-launch.js';
import { physical } from './worker-repo.js';

// The recorded main joins the brief marker in the worker's environment.
const markers = (opts: { briefPath: string; main?: string }) => ({
  SIDEKICK_WORKER: opts.briefPath,
  ...(opts.main === undefined ? {} : { SIDEKICK_MAIN: opts.main }),
});

/** The git config key that prefixes every push URL with `sidekick-push-blocked::`, a remote helper that does not exist. */
export const PUSH_REWRITE_KEY = 'url.sidekick-push-blocked::.pushInsteadOf';

/** The permission rule that lets the worker run `sk-save` with no prompt. */
export const SAVE_SKILL_RULE = 'Skill(sidekick:sk-save)';

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
 * The allow rule that lets a session read one file with no prompt. `absPath`
 * must be absolute: a path without a leading `/` is a programming error.
 */
export function readRule(absPath: string): string {
  // `//` anchors at the filesystem root, and rules follow gitignore syntax, which Claude Code does not escape for you.
  const escaped = absPath
    .slice(1)
    .replace(/[\\*?[\]]/g, '\\$&')
    .replace(/ +$/, (spaces) => '\\ '.repeat(spaces.length));
  return `Read(//${escaped})`;
}

// One rule per path, plus a second when its physical form differs; each rule once.
function readRules(reads: readonly string[]): string[] {
  const rules = reads.flatMap((p) => [readRule(p), readRule(physical(p))]);
  return [...new Set(rules)];
}

/**
 * Builds the overlay for a worker. The push block numbers its `GIT_CONFIG_*`
 * entry after the profile's own `env.GIT_CONFIG_COUNT`, or from 0 when it sets
 * none. A count that is not a string of digits refuses, unless `allowPush`
 * leaves the push block out. `reads` are absolute paths the worker may read
 * with no prompt.
 */
export function workerOverlay(
  profileSettings: Settings | undefined,
  opts: {
    briefPath: string;
    allowPush: boolean;
    main?: string;
    reads?: readonly string[];
  },
): { overlay: Settings } | { issues: string[] } {
  const base = { worktree: { baseRef: 'head' } };
  const allowRules = {
    allow: [...readRules(opts.reads ?? []), SAVE_SKILL_RULE],
  };
  if (opts.allowPush) {
    return {
      overlay: {
        ...base,
        env: markers(opts),
        permissions: allowRules,
      },
    };
  }
  const env = isPlainObject(profileSettings?.env) ? profileSettings.env : {};
  const raw = env.GIT_CONFIG_COUNT ?? '0';
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    return {
      issues: [
        `the profile's GIT_CONFIG_COUNT is ${JSON.stringify(raw)}, not a string of digits`,
      ],
    };
  }
  return {
    overlay: {
      ...base,
      env: { ...markers(opts), ...pushEnv(Number(raw)) },
      permissions: { ...allowRules, deny: [PUSH_DENY_RULE] },
    },
  };
}
