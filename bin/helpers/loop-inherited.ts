/**
 * The inherited listing: what a loop and its workers inherit beyond the loop's
 * mandate. It blocks nothing; `sidekick loop show` prints it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import {
  keptLayers,
  type Layer,
  type LayerSummary,
  summariseLayer,
} from './loop-layers.js';
import type { LoopManifest } from './loop-manifest.js';
import {
  type ClaudeRunner,
  composeSettings,
  isPlainObject,
} from './profile-launch.js';
import type { Profile } from './profile-store.js';

/** Claude Code also loads built-in plugins, which `claude plugin list` does not show. */
export const BUILTIN_NOTE: readonly string[] = [
  'Claude Code also loads built-in plugins, which `claude plugin list` does not show.',
  'On Claude Code 2.1.322, two of them handled tool calls: `cc-plugin-plugin-authoring` and `cc-plugin-privacy` (R11 loop probes, U9).',
  'To see the current set, start a session with `--debug-file <file>` and search the log for `hooks module`.',
];

/** What the listing reads from and runs. `managedFile` overrides the managed settings path. */
export interface InheritedDeps {
  runClaude: ClaudeRunner;
  configDir: string;
  home: string;
  managedFile?: string;
}

/** The listing's lines, ready to print, and the warnings it raised. */
export interface Inherited {
  lines: string[];
  warnings: string[];
}

const PLUGIN_LIST_TIMEOUT_MS = 30_000;
const NONE = '  (none)';
const EXEMPT_SUFFIXES = ['@builtin', '@inline'];
// A bare file-write rule, alone or with `(*)`, allows every path.
const BARE_WRITE = /^(?:Edit|Write|MultiEdit|NotebookEdit)(?:\(\*\))?$/;
const isBareWrite = (rule: string): boolean => BARE_WRITE.test(rule);

const PluginListSchema = v.array(
  v.looseObject({ id: v.string(), installPath: v.nullish(v.string()) }),
);

const errorText = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const section = (title: string, entries: string[]): string[] => [
  title,
  ...(entries.length === 0 ? [NONE] : entries.map((entry) => `  ${entry}`)),
];

const hookLine = (
  source: string,
  hook: LayerSummary['hooks'][number],
): string =>
  `${source}: ${hook.event}${hook.matcher === undefined ? '' : ` [${hook.matcher}]`}: ${hook.command}`;

const layerSource = (layer: Layer): string => `${layer.name} (${layer.file})`;

type PluginList = { folders: Map<string, string> } | { problem: string };

// Id to installed folder from `plugin list --json`, or the reason it is unavailable.
function listPlugins(manifest: LoopManifest, deps: InheritedDeps): PluginList {
  const result = deps.runClaude(['plugin', 'list', '--json'], {
    cwd: manifest.repo,
    timeoutMs: PLUGIN_LIST_TIMEOUT_MS,
  });
  if (result.timedOut) {
    return { problem: 'claude plugin list timed out' };
  }
  if (result.code !== 0) {
    return { problem: `claude plugin list exited with code ${result.code}` };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(result.stdout);
  } catch (e) {
    return { problem: `claude plugin list printed no JSON: ${errorText(e)}` };
  }
  const parsed = v.safeParse(PluginListSchema, raw);
  if (!parsed.success) {
    return { problem: 'claude plugin list printed an unexpected shape' };
  }
  const folders = new Map<string, string>();
  for (const entry of parsed.output) {
    if (entry.installPath) folders.set(entry.id, entry.installPath);
  }
  return { folders };
}

// The ids that load: layers merged lowest first, a later value winning, then the final `true`s.
function loadedIds(
  layers: Layer[],
  composed: Record<string, unknown>,
): string[] {
  const merged = new Map<string, boolean>();
  const apply = (plugins: Record<string, boolean>): void => {
    for (const [id, on] of Object.entries(plugins)) merged.set(id, on);
  };
  const fileLayers = (names: string[]): Layer[] =>
    layers.filter((layer) => names.includes(layer.name));
  const summaryOf = (layer: Layer): LayerSummary | undefined =>
    'settings' in layer ? summariseLayer(layer.settings) : undefined;
  for (const layer of fileLayers(['user', 'project', 'local'])) {
    const summary = summaryOf(layer);
    if (summary) apply(summary.enabledPlugins);
  }
  apply(summariseLayer(composed).enabledPlugins);
  for (const layer of fileLayers(['managed'])) {
    const summary = summaryOf(layer);
    if (summary) apply(summary.enabledPlugins);
  }
  return [...merged].filter(([, on]) => on).map(([id]) => id);
}

// One approving hook and the file it came from; no label means `hooks/hooks.json`.
interface FoundHook {
  from: string | undefined;
  hook: LayerSummary['hooks'][number];
}

interface PluginHooks {
  hooks: FoundHook[];
  mod: boolean;
  problems: string[];
}

type JsonRead =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; why: string };

function readJsonObject(file: string): JsonRead {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return isPlainObject(parsed)
      ? { ok: true, value: parsed }
      : { ok: false, why: 'it is not a JSON object' };
  } catch (e) {
    return { ok: false, why: errorText(e) };
  }
}

const foundIn = (
  from: string | undefined,
  layer: Record<string, unknown>,
): FoundHook[] => summariseLayer(layer).hooks.map((hook) => ({ from, hook }));

// The hooks one `plugin.json` `hooks` entry declares: an inline object, or a path to a file.
function manifestEntryHooks(
  folder: string,
  entry: unknown,
): { hooks: FoundHook[]; problems: string[] } {
  if (isPlainObject(entry)) {
    return { hooks: foundIn('plugin.json', { hooks: entry }), problems: [] };
  }
  if (typeof entry !== 'string') {
    return {
      hooks: [],
      problems: ['its plugin.json hooks entry is neither an object nor a path'],
    };
  }
  const file = path.resolve(folder, entry);
  const read: JsonRead = fs.existsSync(file)
    ? readJsonObject(file)
    : { ok: false, why: 'the file is missing' };
  return read.ok
    ? { hooks: foundIn(entry, read.value), problems: [] }
    : {
        hooks: [],
        problems: [`its hooks in ${entry} could not be read: ${read.why}`],
      };
}

// Hooks in `.claude-plugin/plugin.json`; a missing file or a missing `hooks` key adds nothing.
function readManifestHooks(folder: string): {
  hooks: FoundHook[];
  problems: string[];
} {
  const file = path.join(folder, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(file)) return { hooks: [], problems: [] };
  const manifest = readJsonObject(file);
  if (!manifest.ok) {
    return {
      hooks: [],
      problems: [`its plugin.json could not be read: ${manifest.why}`],
    };
  }
  const declared = manifest.value.hooks;
  if (declared === undefined) return { hooks: [], problems: [] };
  const parts = (Array.isArray(declared) ? declared : [declared]).map((entry) =>
    manifestEntryHooks(folder, entry),
  );
  return {
    hooks: parts.flatMap((part) => part.hooks),
    problems: parts.flatMap((part) => part.problems),
  };
}

// A plugin's approving hooks from `hooks/hooks.json` and `plugin.json`; only `hooks.json` sets the mod mark.
function readPluginHooks(folder: string): PluginHooks {
  if (!fs.existsSync(folder)) {
    return {
      hooks: [],
      mod: false,
      problems: ['its hooks could not be read: the folder is gone'],
    };
  }
  const manifest = readManifestHooks(folder);
  const file = path.join(folder, 'hooks', 'hooks.json');
  if (!fs.existsSync(file)) return { mod: false, ...manifest };
  const read = readJsonObject(file);
  if (!read.ok) {
    const why = read.why.replace(/^it is /, 'hooks.json is ');
    return {
      hooks: manifest.hooks,
      mod: false,
      problems: [`its hooks could not be read: ${why}`, ...manifest.problems],
    };
  }
  return {
    hooks: [...foundIn(undefined, read.value), ...manifest.hooks],
    mod: Array.isArray(read.value.modules) && read.value.modules.length > 0,
    problems: manifest.problems,
  };
}

const MOD_MARK =
  'ships a mod: on this subscription, a mod can approve a call past a deny rule';

interface PluginsPart {
  plugins: string[];
  hooks: string[];
  warnings: string[];
}

// One plugin's line and hook lines; `head` names it on its line, and `source` on each hook line.
function describePlugin(
  head: string,
  source: string,
  folder: string,
): { line: string; hooks: string[] } {
  const read = readPluginHooks(folder);
  return {
    line: [head, ...(read.mod ? [MOD_MARK] : []), ...read.problems].join(': '),
    hooks: read.hooks.map(({ from, hook }) =>
      hookLine(from === undefined ? source : `${source} (${from})`, hook),
    ),
  };
}

// An id's plugin line and hooks, by its folder from the plugin list.
function describeId(
  id: string,
  listed: PluginList,
): { line: string; hooks: string[] } {
  if ('problem' in listed) {
    return {
      line: `${id}: loads, but its folder is unknown without the plugin list`,
      hooks: [],
    };
  }
  const folder = listed.folders.get(id);
  if (folder === undefined) {
    return { line: `${id}: enabled, but not installed`, hooks: [] };
  }
  return describePlugin(`${id} (${folder})`, `plugin ${id}`, folder);
}

function pluginsPart(
  manifest: LoopManifest,
  profile: Profile,
  layers: Layer[],
  deps: InheritedDeps,
): PluginsPart {
  const composed = composeSettings(profile, { home: deps.home });
  const ids = loadedIds(layers, composed).filter(
    (id) => !EXEMPT_SUFFIXES.some((suffix) => id.endsWith(suffix)),
  );
  const listed = listPlugins(manifest, deps);
  const found = [
    ...ids.map((id) => describeId(id, listed)),
    ...profile.pluginDirs.map((dir) =>
      describePlugin(`plugin dir ${dir}`, `plugin dir ${dir}`, dir),
    ),
  ];
  const problem = 'problem' in listed ? listed.problem : undefined;
  return {
    plugins: [
      ...(problem === undefined
        ? []
        : [
            `(incomplete: ${problem}, so installed plugins' folders and hooks are not shown)`,
          ]),
      ...found.map(({ line }) => line),
    ],
    hooks: found.flatMap(({ hooks }) => hooks),
    warnings:
      problem === undefined
        ? []
        : [`The plugin list is incomplete: ${problem}.`],
  };
}

/**
 * Lists what the loop and its workers inherit beyond the mandate: allow rules,
 * hooks that can approve a call, what widens the workers' fence, the plugins
 * loaded, and a fixed note on built-ins. Never throws.
 */
export function inheritedListing(
  manifest: LoopManifest,
  profile: Profile,
  deps: InheritedDeps,
): Inherited {
  const layers = keptLayers(
    profile,
    manifest.repo,
    deps.configDir,
    deps.managedFile,
  );
  const warnings: string[] = [];
  const allow: string[] = [];
  const hooks: string[] = [];
  const fence: string[] = [];
  for (const layer of layers) {
    const source = layerSource(layer);
    if ('issue' in layer) {
      allow.push(`${source}: could not be read: ${layer.issue}`);
      warnings.push(
        `The ${layer.name} settings (${layer.file}) could not be read: ${layer.issue}`,
      );
      continue;
    }
    const summary = summariseLayer(layer.settings);
    allow.push(...summary.allow.map((rule) => `${source}: ${rule}`));
    hooks.push(...summary.hooks.map((hook) => hookLine(source, hook)));
    // A bare write rule prints under its own kind alone, so `Edit(*)` prints once.
    const widenings: [string, string[]][] = [
      ['added directory', summary.addedDirectories],
      ['sandbox write', summary.sandboxWrites],
      ['allowed domain', summary.allowedDomains],
      ['Edit allow', summary.editAllows.filter((rule) => !isBareWrite(rule))],
      ['file-write allow for every path', summary.allow.filter(isBareWrite)],
      ...summary.sandboxLooseners.map(({ key, values }): [string, string[]] => [
        key,
        values,
      ]),
    ];
    for (const [kind, entries] of widenings) {
      fence.push(...entries.map((entry) => `${source}: ${kind}: ${entry}`));
    }
  }
  const part = pluginsPart(manifest, profile, layers, deps);
  warnings.push(...part.warnings);
  return {
    lines: [
      ...section('Allow rules', allow),
      ...section('Hooks that can approve a call', [...hooks, ...part.hooks]),
      ...section("What widens the workers' fence", fence),
      ...section('Plugins', part.plugins),
      'Built-ins',
      ...BUILTIN_NOTE.map((line) => `  ${line}`),
    ],
    warnings,
  };
}
