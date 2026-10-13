/**
 * What a profile launches with: the settings composed from its manifest, the
 * pure merge behind them, and the arguments `claude` receives.
 */

import * as path from 'node:path';
import type { Profile } from './profile-store.js';

export type Settings = Record<string, unknown>;

const isPlainObject = (x: unknown): x is Settings =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const uniqueByValue = (items: unknown[]): unknown[] =>
  items.filter(
    (item, i) =>
      items.findIndex((o) => JSON.stringify(o) === JSON.stringify(item)) === i,
  );

function mergeValue(prev: unknown, next: unknown): unknown {
  if (isPlainObject(prev) && isPlainObject(next)) return mergeTwo(prev, next);
  if (Array.isArray(prev) && Array.isArray(next)) {
    return uniqueByValue([...prev, ...next]);
  }
  return next;
}

function mergeTwo(base: Settings, next: Settings): Settings {
  const carried = Object.entries(base).map(([key, prev]): [string, unknown] => [
    key,
    Object.hasOwn(next, key) ? mergeValue(prev, next[key]) : prev,
  ]);
  const added = Object.entries(next).filter(
    ([key]) => !Object.hasOwn(base, key),
  );
  return Object.fromEntries([...carried, ...added]);
}

/**
 * Merges settings layers left to right: objects merge key by key, arrays
 * concatenate without duplicates by value, and otherwise the later value wins.
 * Pure; the layers are left unchanged.
 */
export const mergeSettings = (...layers: Settings[]): Settings =>
  layers.reduce(mergeTwo, {});

const memoryVariable = 'CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD';

/** The keys launch owns: the profile's name, and the two that depend on its folder. */
function launchKeys(profile: Profile, home: string): Settings {
  const isCleanRoom =
    profile.manifest.settingSources !== undefined &&
    !profile.manifest.settingSources.includes('user');
  return {
    sidekick: { profile: profile.name },
    ...(profile.hasRules ? { env: { [memoryVariable]: '1' } } : {}),
    ...(isCleanRoom
      ? {
          claudeMdExcludes: [
            path.join(home, '.claude', 'CLAUDE.md'),
            path.join(home, '.claude', 'rules', '**'),
          ],
        }
      : {}),
  };
}

/**
 * Layers the profile's `settings`, then the overlay, then launch's own keys.
 * The excludes sit under `home`, where the user-level copies load, never under
 * `CLAUDE_CONFIG_DIR`.
 */
export function composeSettings(
  profile: Profile,
  opts: { home: string; overlay?: Settings },
): Settings {
  return mergeSettings(
    profile.manifest.settings ?? {},
    opts.overlay ?? {},
    launchKeys(profile, opts.home),
  );
}

/**
 * The arguments for `claude`: `--add-dir`, `--settings`, then
 * `--setting-sources` when the manifest sets it. `--add-dir` is never last, so
 * whatever follows cannot be read as a second folder.
 */
export function launchArgs(profile: Profile, settings: Settings): string[] {
  const sources = profile.manifest.settingSources;
  return [
    '--add-dir',
    profile.dir,
    '--settings',
    JSON.stringify(settings),
    ...(sources === undefined ? [] : ['--setting-sources', sources.join(',')]),
  ];
}
