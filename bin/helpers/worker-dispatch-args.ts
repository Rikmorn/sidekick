/**
 * `sidekick worker dispatch`'s arguments: the options a dispatch is asked for
 * and the parse that turns the command line into them.
 */

import * as path from 'node:path';
import { parseFlags } from './profile.js';

// The profile `dispatch` launches with when `--profile` is not given.
const DEFAULT_WORKER_PROFILE = 'worker';

/** What a dispatch and a `--check` are both asked for, its paths absolute. */
export interface SharedOptions {
  mode: string | undefined;
  profile: string;
  pluginDir: string | undefined;
  allowPush: boolean;
}

/** `dispatch --check`: the checks that need no brief. */
export type CheckOptions = SharedOptions & { check: true };

/** What `dispatch` was asked for: a launch with its brief, or a `--check`. */
export type DispatchOptions =
  | (SharedOptions & { check: false; brief: string })
  | CheckOptions;

const stringFlag = (
  values: Record<string, string | boolean | undefined>,
  key: string,
): string | undefined => {
  const value = values[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * Parses `dispatch`'s arguments, resolving the brief and `--plugin-dir`
 * against `cwd`, the folder the command was typed in. Undefined is a usage
 * error, and a brief given with `--check` is a refusal. A missing
 * `--permission-mode` is left to the checks, which name it.
 */
export function parseDispatchArgs(
  rest: string[],
  cwd: string,
): DispatchOptions | { usageErrors: string[] } | undefined {
  const parsed = parseFlags(rest, {
    'permission-mode': { type: 'string' },
    profile: { type: 'string' },
    'plugin-dir': { type: 'string' },
    'allow-push': { type: 'boolean' },
    check: { type: 'boolean' },
  });
  if (parsed === undefined) return undefined;
  const check = parsed.values.check === true;
  if (check && parsed.positionals.length > 0) {
    return { usageErrors: ['--check takes no brief'] };
  }
  if (!check && parsed.positionals.length !== 1) return undefined;
  const pluginDir = stringFlag(parsed.values, 'plugin-dir');
  // path.resolve would read an empty value as the current folder.
  if (pluginDir === '') return undefined;
  const shared: SharedOptions = {
    mode: stringFlag(parsed.values, 'permission-mode'),
    profile: stringFlag(parsed.values, 'profile') ?? DEFAULT_WORKER_PROFILE,
    pluginDir:
      pluginDir === undefined ? undefined : path.resolve(cwd, pluginDir),
    allowPush: parsed.values['allow-push'] === true,
  };
  return check
    ? { ...shared, check: true }
    : {
        ...shared,
        check: false,
        brief: path.resolve(cwd, parsed.positionals[0]),
      };
}
