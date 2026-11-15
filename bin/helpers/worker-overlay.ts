/**
 * The settings overlays a dispatched worker launches with. A plan worker's
 * carries the worktree base, the brief marker, the recorded main, and the key
 * that turns off updates in its environment, the `Read` allow
 * rules that let it read the files dispatch names with no prompt, the `Skill`
 * allow rule that lets it run `sk-save` with no prompt, and, unless the brief
 * allows a push, the two blocks on `git push`. A unit worker's carries the
 * fence: the sandbox, one `Edit` allow rule for its worktree, the denies on
 * git's redirect files and the sidekick folder, the read block, and the push
 * block, which it always has. Its profile layer keeps only the keys that
 * cannot widen that fence.
 */

import * as path from 'node:path';
import {
  isPlainObject,
  NO_UPDATES_ENV,
  type Settings,
} from './profile-launch.js';
import { SETTING_SOURCES, type SettingSource } from './profile-manifest.js';
import type { Profile } from './profile-store.js';
import { physical } from './worker-repo.js';

// The recorded main and the key that turns off updates join the brief marker in the worker's environment.
const markers = (opts: { briefPath: string; main?: string }) => ({
  SIDEKICK_WORKER: opts.briefPath,
  ...(opts.main === undefined ? {} : { SIDEKICK_MAIN: opts.main }),
  ...NO_UPDATES_ENV,
});

// Claude Code's own `--worktree` creation branches from the launching checkout's HEAD.
const WORKTREE_BASE = { worktree: { baseRef: 'head' } };

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

// The push block's environment numbered after the profile's own
// `env.GIT_CONFIG_COUNT`, or the refusal of a count that is not digits.
function pushBlock(
  profileSettings: Settings | undefined,
): { env: Record<string, string> } | { issues: string[] } {
  const env = isPlainObject(profileSettings?.env) ? profileSettings.env : {};
  const raw = env.GIT_CONFIG_COUNT ?? '0';
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    return {
      issues: [
        `the profile's GIT_CONFIG_COUNT is ${JSON.stringify(raw)}, not a string of digits`,
      ],
    };
  }
  return { env: pushEnv(Number(raw)) };
}

/** The tools a path rule names. */
export type PathTool = 'Read' | 'Edit';

/**
 * A permission rule for one path, in the `//` form that anchors at the
 * filesystem root. The path is escaped, since rules follow gitignore syntax,
 * which Claude Code does not escape for you; `glob`, such as `/**`, follows
 * it unescaped. `absPath` must be absolute: a path without a leading `/` is a
 * programming error.
 */
export function pathRule(tool: PathTool, absPath: string, glob = ''): string {
  const escaped = absPath
    .slice(1)
    .replace(/[\\*?[\]]/g, '\\$&')
    .replace(/ +$/, (spaces) => '\\ '.repeat(spaces.length));
  return `${tool}(//${escaped}${glob})`;
}

/**
 * The allow rule that lets a session read one file with no prompt. `absPath`
 * must be absolute: a path without a leading `/` is a programming error.
 */
export function readRule(absPath: string): string {
  return pathRule('Read', absPath);
}

const unique = (rules: readonly string[]): string[] => [...new Set(rules)];

// The rule for a path, then the rule for its physical form, which is the same rule when nothing on the path is a link.
const bothForms = (tool: PathTool, absPath: string, glob = ''): string[] => [
  pathRule(tool, absPath, glob),
  pathRule(tool, physical(absPath), glob),
];

// One rule per path, plus a second when its physical form differs; each rule once.
function readRules(reads: readonly string[]): string[] {
  return unique(reads.flatMap((p) => bothForms('Read', p)));
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
  const allowRules = {
    allow: [...readRules(opts.reads ?? []), SAVE_SKILL_RULE],
  };
  if (opts.allowPush) {
    return {
      overlay: {
        ...WORKTREE_BASE,
        env: markers(opts),
        permissions: allowRules,
      },
    };
  }
  const push = pushBlock(profileSettings);
  if ('issues' in push) return push;
  return {
    overlay: {
      ...WORKTREE_BASE,
      env: { ...markers(opts), ...push.env },
      permissions: { ...allowRules, deny: [PUSH_DENY_RULE] },
    },
  };
}

/**
 * The skills a unit worker may not run, as superpowers 7.0.2 and this plugin
 * read on 2026-11-15. Each superpowers skill here, `sk-execute`, and
 * `sk-design` stops for a person's answer, and a unit worker has no person
 * to answer. `sk-track`, `sk-milestone`, and `sk-worktree` file, release, or
 * land, which its loop and the operator own. `sk-save` writes the memory
 * store, and a unit's report is its record.
 */
export const UNIT_DENIED_SKILLS = [
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
] as const;

// `allowedDomains` binds neither tool, and an inherited layer may allow them.
const WEB_TOOLS = ['WebFetch', 'WebSearch'];

// Everything under a folder.
const UNDER = '/**';

/** What the unit overlay is built from. Every path is absolute. */
export interface UnitOverlayOptions {
  briefPath: string;
  /** The worker's worktree, which need not exist yet. */
  worktree: string;
  /** The repo's common git dir. */
  commonDir: string;
  /** The sidekick folder, `<config>/sidekick`. */
  sidekickHome: string;
  /** The memory store, denied for reads and writes; undefined leaves its rules out. */
  memoryStore: string | undefined;
  /** The only domains the sandbox lets a command reach. */
  hosts: readonly string[];
  /** Files the worker may read with no prompt. */
  reads: readonly string[];
  /** The folders the launch adds with `--add-dir`, which the worker may read and never write. */
  addedDirs: readonly string[];
}

// Git's files that would send git, the worker's and sidekick's alike, to
// another git dir or another config, then the two the sandbox already guards.
function gitDenies(commonDir: string, worktree: string): string[] {
  const worktrees = path.join(commonDir, 'worktrees');
  return [
    ...bothForms('Edit', path.join(commonDir, 'commondir')),
    ...bothForms('Edit', worktrees, '/*/commondir'),
    ...bothForms('Edit', worktrees, '/*/gitdir'),
    ...bothForms('Edit', worktrees, '/*/config.worktree'),
    ...bothForms('Edit', path.join(worktree, '.git')),
    ...bothForms('Edit', path.join(commonDir, 'config')),
    ...bothForms('Edit', path.join(commonDir, 'hooks'), UNDER),
  ];
}

// sidekick's own folders, which hold what it and the operator later run or
// trust, and the store, which the user layer may add as a working folder.
function folderDenies(opts: UnitOverlayOptions): string[] {
  const store = opts.memoryStore;
  return [
    ...bothForms('Edit', path.join(opts.commonDir, 'sidekick'), UNDER),
    ...bothForms('Edit', opts.sidekickHome, UNDER),
    ...opts.addedDirs.flatMap((dir) => bothForms('Edit', dir, UNDER)),
    ...(store === undefined
      ? []
      : [
          ...bothForms('Read', store, UNDER),
          ...bothForms('Edit', store, UNDER),
        ]),
  ];
}

const unitDenies = (opts: UnitOverlayOptions): string[] =>
  unique([
    ...gitDenies(opts.commonDir, opts.worktree),
    ...folderDenies(opts),
    ...UNIT_DENIED_SKILLS.map((skill) => `Skill(${skill})`),
    ...WEB_TOOLS,
    PUSH_DENY_RULE,
  ]);

/**
 * Builds the overlay a unit worker launches with: the sandbox fence with the
 * network open to `hosts` alone, `Edit` allowed in its worktree alone, the
 * denies spec §The unit overlay names, reads blocked outside its working
 * folders, Claude Code's auto memory off, and the push block. It carries no
 * recorded main and no `sk-save` allow rule. A profile count that is not a
 * string of digits refuses, as `workerOverlay` does.
 */
export function unitOverlay(
  profileSettings: Settings | undefined,
  opts: UnitOverlayOptions,
): { overlay: Settings } | { issues: string[] } {
  const push = pushBlock(profileSettings);
  if ('issues' in push) return push;
  return {
    overlay: {
      ...WORKTREE_BASE,
      env: { ...markers({ briefPath: opts.briefPath }), ...push.env },
      sandbox: {
        enabled: true,
        autoAllowBashIfSandboxed: true,
        allowUnsandboxedCommands: false,
        failIfUnavailable: true,
        network: { allowedDomains: [...opts.hosts] },
      },
      permissions: {
        allow: unique([
          ...bothForms('Edit', opts.worktree, UNDER),
          ...readRules(opts.reads),
        ]),
        deny: unitDenies(opts),
        blockReadsOutsideWorkingDirectories: true,
      },
      autoMemoryEnabled: false,
    },
  };
}

// Which keys a settings object keeps: `true` keeps the whole value, and a
// nested `Keep` keeps only its own keys of a value that is an object.
interface Keep {
  readonly [key: string]: true | Keep;
}

// The profile keys that cannot widen a unit's fence. The overlay owns every
// fence key, so the profile keeps only what narrows it or leaves it alone;
// a key added to Claude Code later stays out until it is listed here.
const FENCE_SAFE: Keep = {
  model: true,
  env: true,
  enabledPlugins: true,
  permissions: { deny: true },
  sandbox: { filesystem: { denyRead: true, denyWrite: true } },
};

const keyNames = (keep: Keep, at = ''): string[] =>
  Object.entries(keep).flatMap(([key, rule]) => {
    const name = at === '' ? key : `${at}.${key}`;
    return rule === true ? [name] : keyNames(rule, name);
  });

/** The dotted names of the profile keys a unit launch keeps. */
export const FENCE_SAFE_KEYS: readonly string[] = keyNames(FENCE_SAFE);

interface Kept {
  settings: Settings;
  /** The dotted name of each key left out, in the settings' own order. */
  dropped: string[];
}

function keepEntry(
  key: string,
  value: unknown,
  keep: Keep,
  at: string,
): { entries: [string, unknown][]; dropped: string[] } {
  const name = at === '' ? key : `${at}.${key}`;
  // An own-key lookup, so a key such as `constructor` is not read off the prototype.
  const rule = Object.hasOwn(keep, key) ? keep[key] : undefined;
  if (rule === true) return { entries: [[key, value]], dropped: [] };
  if (rule === undefined || !isPlainObject(value)) {
    return { entries: [], dropped: [name] };
  }
  const inner = keepOnly(value, rule, name);
  const held = Object.keys(inner.settings).length > 0;
  return {
    entries: held ? [[key, inner.settings]] : [],
    dropped: inner.dropped,
  };
}

function keepOnly(settings: Settings, keep: Keep, at: string): Kept {
  const parts = Object.entries(settings).map(([key, value]) =>
    keepEntry(key, value, keep, at),
  );
  return {
    settings: Object.fromEntries(parts.flatMap((part) => part.entries)),
    dropped: parts.flatMap((part) => part.dropped),
  };
}

/**
 * The profile settings a unit launch keeps, `FENCE_SAFE_KEYS`, and the
 * dotted names of the keys it leaves out. It keeps by an allow-list, so a key
 * nobody listed stays out. Pure: the settings are left unchanged.
 */
export const fenceSafeSettings = (settings: Settings | undefined): Kept =>
  keepOnly(settings ?? {}, FENCE_SAFE, '');

// The repo's hooks would run worktree code outside the sandbox, and its local
// settings would load what the repo's own sessions allow.
const UNIT_LEFT_OUT: readonly SettingSource[] = ['project', 'local'];

/**
 * The setting sources a unit worker loads: the manifest's, or all three when
 * it sets none, less `project` and `local`. An empty list loads none of the
 * three.
 */
export const unitSettingSources = (profile: Profile): SettingSource[] =>
  (profile.manifest.settingSources ?? SETTING_SOURCES).filter(
    (source) => !UNIT_LEFT_OUT.includes(source),
  );
