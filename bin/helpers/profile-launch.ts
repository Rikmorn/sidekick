/**
 * What a profile launches with, and the launch: the settings composed from its
 * manifest and the pure merge behind them, the arguments `claude` receives for
 * an interactive or a background start, the settings check through
 * `claude doctor`, and the runner that starts `claude`.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { envWithoutRepoVars } from './git-env.js';
import { withoutMarkers } from './main-session.js';
import type { SettingSource } from './profile-manifest.js';
import type { Profile } from './profile-store.js';
import { SIDEKICK_DEPENDENCY_IDS, SIDEKICK_ID } from './sidekick-plugin.js';

export type Settings = Record<string, unknown>;

/** Whether `x` is a plain object: not null, not an array. */
export const isPlainObject = (x: unknown): x is Settings =>
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

/**
 * The env of a session sidekick launches unattended. Claude Code shows an
 * update's notice only in the session that ran it, so a session nobody
 * watches runs no update of Claude Code or of a plugin.
 */
export const NO_UPDATES_ENV = { DISABLE_AUTOUPDATER: '1' } as const;

const memoryVariable = 'CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD';

/** A repo's memory key and the store's absolute path; passed only when the repo has a key. */
export interface MemoryLaunch {
  key: string;
  store: string;
}

// What the sources would drop: the key when `local` is out, the store when `user` is out.
function memoryKeys(
  sources: readonly string[] | undefined,
  memory: MemoryLaunch | undefined,
): Settings {
  if (sources === undefined || memory === undefined) return {};
  return {
    ...(sources.includes('local') ? {} : { autoMemoryDirectory: memory.key }),
    ...(sources.includes('user')
      ? {}
      : { permissions: { additionalDirectories: [memory.store] } }),
  };
}

/** Whether the launch loads sidekick from an installed plugin or from a `--plugin-dir`. */
export type SidekickSource = 'installed' | 'inline';

// Whether the profile's own enabledPlugins has the key `id`, with any value.
function namesPlugin(profile: Profile, id: string): boolean {
  const enabled: unknown = profile.manifest.settings?.enabledPlugins;
  return isPlainObject(enabled) && Object.hasOwn(enabled, id);
}

// A clean room loads no user-scope plugin, so launch enables sidekick and
// its dependencies, each the profile does not name; naming sidekick opts out
// of all.
function pluginKeys(profile: Profile, source: SidekickSource): Settings {
  if (namesPlugin(profile, SIDEKICK_ID)) return {};
  const ids = [
    ...(source === 'installed' ? [SIDEKICK_ID] : []),
    ...SIDEKICK_DEPENDENCY_IDS,
  ].filter((id) => !namesPlugin(profile, id));
  return { enabledPlugins: Object.fromEntries(ids.map((id) => [id, true])) };
}

// The keys launch owns: the profile's name, the two that depend on its folder, the memory ones, and a clean room's plugins and updates.
function launchKeys(
  profile: Profile,
  home: string,
  memory: MemoryLaunch | undefined,
  source: SidekickSource,
): Settings {
  const isCleanRoom =
    profile.manifest.settingSources !== undefined &&
    !profile.manifest.settingSources.includes('user');
  const env = {
    ...(profile.hasRules ? { [memoryVariable]: '1' } : {}),
    ...(isCleanRoom ? NO_UPDATES_ENV : {}),
  };
  return {
    ...memoryKeys(profile.manifest.settingSources, memory),
    sidekick: {
      profile: profile.name,
      ...(profile.manifest.hide === undefined
        ? {}
        : { hide: profile.manifest.hide }),
    },
    ...(Object.keys(env).length > 0 ? { env } : {}),
    ...(isCleanRoom
      ? {
          ...pluginKeys(profile, source),
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
 * `CLAUDE_CONFIG_DIR`. `memory` puts back the repo's key and the store when
 * the manifest's setting sources leave out the files that carry them.
 * `sidekick` says where a clean room gets sidekick: installed, or inline from
 * a plugin dir. Without it, a clean room is composed as for an install.
 */
export function composeSettings(
  profile: Profile,
  opts: {
    home: string;
    overlay?: Settings;
    memory?: MemoryLaunch;
    sidekick?: SidekickSource;
  },
): Settings {
  return mergeSettings(
    profile.manifest.settings ?? {},
    opts.overlay ?? {},
    launchKeys(profile, opts.home, opts.memory, opts.sidekick ?? 'installed'),
  );
}

/** What a launch adds to the profile's folders, and the setting sources it loads in place of the manifest's. */
export interface LaunchExtras {
  /** Folders passed as `--add-dir` after the profile's own. */
  addDirs?: readonly string[];
  settingSources?: readonly SettingSource[];
}

/**
 * The arguments for `claude`: `--add-dir` for the profile's folder and each
 * of `extras.addDirs`, one `--plugin-dir` per profile plugin dir,
 * `--settings`, then `--setting-sources` when `extras` or the manifest sets
 * it. `--add-dir` is never last, so whatever follows cannot be read as a
 * second folder.
 */
export function launchArgs(
  profile: Profile,
  settings: Settings,
  extras: LaunchExtras = {},
): string[] {
  const sources = extras.settingSources ?? profile.manifest.settingSources;
  return [
    ...[profile.dir, ...(extras.addDirs ?? [])].flatMap((dir) => [
      '--add-dir',
      dir,
    ]),
    ...profile.pluginDirs.flatMap((dir) => ['--plugin-dir', dir]),
    '--settings',
    JSON.stringify(settings),
    ...(sources === undefined ? [] : ['--setting-sources', sources.join(',')]),
  ];
}

// The shells' code for a command not found; the runner returns it for any spawn error.
const COULD_NOT_START = 127;

/** What a `claude` run returned. Code 127 means it could not start. */
export interface ClaudeResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Each stream a run printed, trimmed, stdout first; an empty one is left out. */
export const printedStreams = (result: {
  stdout: string;
  stderr: string;
}): string[] =>
  [result.stdout, result.stderr]
    .map((text) => text.trim())
    .filter((text) => text !== '');

/** Runs `claude` with these arguments, in `cwd`, giving up after `timeoutMs`. */
export type ClaudeRunner = (
  args: string[],
  opts: { cwd: string; timeoutMs: number },
) => ClaudeResult;

interface SpawnOutcome {
  status: number | null;
  stdout: string | null;
  stderr: string | null;
  error?: Error;
}

type SpawnFn = (
  command: string,
  args: string[],
  opts: {
    cwd: string;
    timeout: number;
    shell: false;
    env: NodeJS.ProcessEnv;
  },
) => SpawnOutcome;

const spawnClaude: SpawnFn = (command, args, opts) =>
  spawnSync(command, args, {
    ...opts,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const isTimeout = (error: Error): boolean =>
  'code' in error && error.code === 'ETIMEDOUT';

/**
 * Builds a runner over `spawn`, which defaults to `spawnSync`. The command runs
 * with no shell, so arguments reach `claude` unchanged. Stdin is closed, since
 * `doctor` can wait on a terminal otherwise.
 */
export const makeClaudeRunner =
  (spawn: SpawnFn = spawnClaude): ClaudeRunner =>
  (args, { cwd, timeoutMs }) => {
    const out = spawn('claude', args, {
      cwd,
      timeout: timeoutMs,
      shell: false,
      // The markers belong to the worker's settings, never to a launcher's own environment.
      // The repo variables would point `claude`'s own git calls at another repo.
      env: envWithoutRepoVars(withoutMarkers(process.env)),
    });
    const stdout = out.stdout ?? '';
    const stderr = out.stderr ?? '';
    if (out.error === undefined) {
      return { code: out.status ?? 1, stdout, stderr, timedOut: false };
    }
    if (isTimeout(out.error)) {
      return { code: out.status ?? 1, stdout, stderr, timedOut: true };
    }
    return {
      code: COULD_NOT_START,
      stdout,
      stderr: stderr || out.error.message,
      timedOut: false,
    };
  };

/** The real runner: `claude` through `spawnSync`. */
export const execClaude: ClaudeRunner = makeClaudeRunner();

/** Keys `doctor` reports when wrongly typed; the first one the settings leave unset carries the canary. */
export const CANARY_KEYS = ['feedbackSurveyRate', 'cleanupPeriodDays'] as const;

const CANARY_VALUE = 'sidekick-canary';
/** Set to `1` to skip the settings check. */
export const SKIP_VARIABLE = 'SIDEKICK_PROFILE_SKIP_CHECK';

const SKIP_WARNING = `${SKIP_VARIABLE}=1 is set, so the settings were not checked with claude doctor.`;

/** The check's verdict: `ok` with any warnings, or refused with the lines to print. */
export type CheckResult =
  | { ok: true; warnings: string[] }
  | { ok: false; issues: string[] };

const refuse = (...issues: string[]): CheckResult => ({ ok: false, issues });

/**
 * The entries under `Invalid settings` that name one of `paths`. The section
 * ends at a blank line; indented `Suggested fix:` lines are not entries.
 */
export function invalidSettingsLines(
  doctorOutput: string,
  paths: string[],
): string[] {
  const lines = doctorOutput.split('\n');
  const start = lines.findIndex((line) => line.trim() === 'Invalid settings');
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.trim() === '');
  const section = end === -1 ? rest : rest.slice(0, end);
  return section.filter(
    (line) =>
      line.startsWith('- ') && paths.some((p) => line.startsWith(`- ${p} `)),
  );
}

const printed = (result: ClaudeResult): string =>
  [result.stdout, result.stderr]
    .filter((text) => text.trim() !== '')
    .join('\n');

function judge(
  result: ClaudeResult,
  lines: string[],
  canary: string,
): CheckResult {
  if (result.timedOut) {
    return refuse('claude doctor timed out.', printed(result));
  }
  if (result.code === COULD_NOT_START) {
    return refuse(
      'The settings check could not start claude.',
      printed(result),
    );
  }
  if (result.code !== 0) {
    return refuse(
      `claude doctor failed with exit code ${result.code}.`,
      printed(result),
    );
  }
  const isCanaryLine = (line: string) => line.includes(` \u203a ${canary}:`);
  if (!lines.some(isCanaryLine)) {
    return refuse(
      "claude doctor's output no longer parses: its report for the canary key is missing, so a launch could drop settings silently.",
      `Set ${SKIP_VARIABLE}=1 to skip the check until sidekick catches up.`,
    );
  }
  const real = lines.filter((line) => !isCanaryLine(line));
  return real.length === 0 ? { ok: true, warnings: [] } : refuse(...real);
}

/**
 * Checks the settings with `claude --settings <file> doctor`. A copy of them
 * carries a wrongly typed canary key; `doctor` must report it, which proves its
 * output still parses, and must report nothing else. The copy lives in a fresh
 * folder under `tmpdir` that is removed on every path.
 */
export function checkSettings(
  settings: Settings,
  deps: { run: ClaudeRunner; cwd: string; tmpdir: string; skip: boolean },
  timeoutMs = 30_000,
): CheckResult {
  if (deps.skip) return { ok: true, warnings: [SKIP_WARNING] };
  const canary = CANARY_KEYS.find((key) => !Object.hasOwn(settings, key));
  if (canary === undefined) {
    return refuse(
      `The settings set both ${CANARY_KEYS.join(' and ')}, so the check has no canary key left.`,
    );
  }
  const dir = fs.mkdtempSync(path.join(deps.tmpdir, 'sidekick-profile-'));
  try {
    const file = path.join(dir, 'settings.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ ...settings, [canary]: CANARY_VALUE }),
      {
        mode: 0o600,
      },
    );
    const result = deps.run(['--settings', file, 'doctor'], {
      cwd: deps.cwd,
      timeoutMs,
    });
    const lines = invalidSettingsLines(result.stdout, [
      file,
      fs.realpathSync(file),
    ]);
    return judge(result, lines, canary);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The arguments for a background launch: the base, one `--plugin-dir` per
 * entry of `pluginDirs`, `--permission-mode` and `--worktree` when given,
 * `--bg`, `-n <name>` when given, then the prompt after `--` so a leading
 * dash cannot read as a flag.
 */
export const bgArgs = (
  base: string[],
  opts: {
    sessionName?: string;
    prompt?: string;
    pluginDirs?: readonly string[];
    permissionMode?: string;
    worktree?: string;
  },
): string[] => [
  ...base,
  ...(opts.pluginDirs ?? []).flatMap((dir) => ['--plugin-dir', dir]),
  ...(opts.permissionMode === undefined
    ? []
    : ['--permission-mode', opts.permissionMode]),
  ...(opts.worktree === undefined ? [] : ['--worktree', opts.worktree]),
  '--bg',
  ...(opts.sessionName === undefined ? [] : ['-n', opts.sessionName]),
  ...(opts.prompt === undefined ? [] : ['--', opts.prompt]),
];
