import * as fs from 'node:fs';
import * as path from 'node:path';
import { isPlainObject, type Settings } from './profile-launch.js';
import type { Profile } from './profile-store.js';

export type LayerName = 'managed' | 'user' | 'project' | 'local' | 'profile';

/** One settings layer: its parsed settings, or why the file could not be read. */
export type Layer =
  | { name: LayerName; file: string; settings: Settings }
  | { name: LayerName; file: string; issue: string };

// Where macOS keeps the managed settings file, measured in the operator-present U24 probe.
const DEFAULT_MANAGED_FILE =
  '/Library/Application Support/ClaudeCode/managed-settings.json';

const ALL_SOURCES = ['user', 'project', 'local'] as const;
const HOOK_EVENTS = ['PreToolUse', 'PermissionRequest'] as const;
const PROMPT_PREVIEW_LENGTH = 60;

const errorText = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

// Reads one settings file: no layer when it is missing, an issue layer when it cannot be used.
function readLayer(name: LayerName, file: string): Layer | undefined {
  if (!fs.existsSync(file)) return undefined;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!isPlainObject(parsed)) {
      return { name, file, issue: 'the file is not a JSON object' };
    }
    return { name, file, settings: parsed };
  } catch (e) {
    return { name, file, issue: errorText(e) };
  }
}

/**
 * The settings layers a loop's launch keeps, in precedence order: the file
 * layers the profile's `settingSources` keeps (all three when absent), the
 * profile's own `settings`, then the managed file when present.
 */
export function keptLayers(
  profile: Profile,
  repo: string,
  configDir: string,
  managedFile: string = DEFAULT_MANAGED_FILE,
): Layer[] {
  const kept = profile.manifest.settingSources ?? ALL_SOURCES;
  const files = {
    user: path.join(configDir, 'settings.json'),
    project: path.join(repo, '.claude', 'settings.json'),
    local: path.join(repo, '.claude', 'settings.local.json'),
  };
  const fileLayers = ALL_SOURCES.filter((name) => kept.includes(name)).map(
    (name) => readLayer(name, files[name]),
  );
  const profileLayer: Layer = {
    name: 'profile',
    file: path.join(profile.dir, 'profile.json'),
    settings: profile.manifest.settings ?? {},
  };
  return [
    ...fileLayers,
    profileLayer,
    readLayer('managed', managedFile),
  ].filter((layer) => layer !== undefined);
}

/** What one layer adds beyond a loop's mandate. */
export interface LayerSummary {
  allow: string[];
  hooks: {
    event: 'PreToolUse' | 'PermissionRequest';
    matcher: string | undefined;
    command: string;
  }[];
  addedDirectories: string[];
  sandboxWrites: string[];
  allowedDomains: string[];
  editAllows: string[];
  enabledPlugins: Record<string, boolean>;
}

const objectAt = (value: unknown, key: string): Settings =>
  isPlainObject(value) && isPlainObject(value[key]) ? value[key] : {};

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];

const stringOf = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const listOf = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

// A hook handler as one line: its command, or its type with the field that says what it runs.
function describeHandler(handler: unknown): string | undefined {
  if (!isPlainObject(handler)) return undefined;
  const type = stringOf(handler.type);
  if (type === undefined || type === 'command') {
    return stringOf(handler.command);
  }
  switch (type) {
    case 'http':
      return `http: ${stringOf(handler.url) ?? ''}`;
    case 'mcp_tool':
      return `mcp_tool: ${stringOf(handler.server) ?? ''}/${stringOf(handler.tool) ?? ''}`;
    case 'prompt':
    case 'agent':
      return `${type}: ${(stringOf(handler.prompt) ?? '').slice(0, PROMPT_PREVIEW_LENGTH)}`;
    default:
      return type;
  }
}

function hooksOf(settings: Settings): LayerSummary['hooks'] {
  const hooks = objectAt(settings, 'hooks');
  return HOOK_EVENTS.flatMap((event) =>
    listOf(hooks[event]).flatMap((entry) => {
      if (!isPlainObject(entry)) return [];
      const matcher = stringOf(entry.matcher);
      return listOf(entry.hooks).flatMap((handler) => {
        const command = describeHandler(handler);
        return command === undefined ? [] : [{ event, matcher, command }];
      });
    }),
  );
}

const booleanEntries = (value: unknown): Record<string, boolean> =>
  Object.fromEntries(
    Object.entries(isPlainObject(value) ? value : {}).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
    ),
  );

/** Reads the keys a loop lists as inherited; a key of the wrong shape counts as absent. Never throws. */
export function summariseLayer(settings: Settings): LayerSummary {
  const permissions = objectAt(settings, 'permissions');
  const sandbox = objectAt(settings, 'sandbox');
  const allow = stringsOf(permissions.allow);
  return {
    allow,
    hooks: hooksOf(settings),
    addedDirectories: stringsOf(permissions.additionalDirectories),
    sandboxWrites: stringsOf(objectAt(sandbox, 'filesystem').allowWrite),
    allowedDomains: stringsOf(objectAt(sandbox, 'network').allowedDomains),
    editAllows: allow.filter((rule) => rule.startsWith('Edit(')),
    enabledPlugins: booleanEntries(settings.enabledPlugins),
  };
}
