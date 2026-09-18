#!/usr/bin/env node
/**
 * sidekick — the plugin's executable. One command family: `rules`.
 * Shipped as plugin/bin/sidekick (a Node bundle built from this file) and run
 * from source as `bun bin/cli.ts`; both resolve the shipped rules relative to
 * this file.
 */
import * as fs from 'node:fs';
import { realpathSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRulesCli } from './helpers/rules.js';

/**
 * The plugin directory holds `rules/` and `.claude-plugin/plugin.json`.
 * Bundled: plugin/bin/sidekick → plugin. Source: bin/cli.ts → plugin.
 */
export function resolvePluginDir(entryFileUrl: string): string {
  const here = path.dirname(fileURLToPath(entryFileUrl));
  const candidates = [
    path.resolve(here, '..'),
    path.resolve(here, '..', 'plugin'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'rules'))) return c;
  }
  return candidates[0];
}

export function readVersion(pluginDir: string): string {
  const manifest = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(manifest, 'utf-8')) as {
      version?: unknown;
    };
    return typeof parsed.version === 'string' ? parsed.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function isMainEntrypoint(
  importMetaUrl: string,
  argv1: string | undefined,
): boolean {
  if (!argv1) return false;
  try {
    return realpathSync(fileURLToPath(importMetaUrl)) === realpathSync(argv1);
  } catch {
    return false;
  }
}

export const USAGE =
  'usage: sidekick rules <install|check> --project|--user\n       sidekick --version';

export interface MainContext {
  env: NodeJS.ProcessEnv;
  cwd: string;
  entryFileUrl: string;
}

export function main(
  argv: string[],
  ctx: MainContext,
  out: (line: string) => void,
  err: (line: string) => void,
): number {
  const [sub, ...rest] = argv;
  const pluginDir = resolvePluginDir(ctx.entryFileUrl);
  if (sub === '--version') {
    out(readVersion(pluginDir));
    return 0;
  }
  if (sub !== 'rules') {
    err(USAGE);
    return 1;
  }
  // An empty CLAUDE_CONFIG_DIR means unset.
  const claudeHome =
    ctx.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const src = ctx.env.SIDEKICK_RULES_DIR || path.join(pluginDir, 'rules');
  return runRulesCli(rest, { src, cwd: ctx.cwd, claudeHome }, out);
}

const _importMetaMain =
  'main' in import.meta && typeof import.meta.main === 'boolean'
    ? import.meta.main
    : undefined;
const _isEntry =
  _importMetaMain ?? isMainEntrypoint(import.meta.url, process.argv[1]);

if (_isEntry) {
  process.exit(
    main(
      process.argv.slice(2),
      { env: process.env, cwd: process.cwd(), entryFileUrl: import.meta.url },
      (l) => console.log(l),
      (l) => console.error(l),
    ),
  );
}
