#!/usr/bin/env node
/**
 * sidekick — the plugin's executable. Four command families: `rules`, `pm`,
 * `hook`, and `profile`.
 * Shipped as plugin/bin/sidekick (a Node bundle built from this file) and run
 * from source as `bun bin/cli.ts`; both resolve the shipped rules relative to
 * this file.
 */
import * as fs from 'node:fs';
import { realpathSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as v from 'valibot';
import { HOOK_USAGE_LINE, runHookCli } from './helpers/hook.js';
import { PM_USAGE_LINE, runPmCli } from './helpers/pm.js';
import { PROFILE_USAGE_LINE, runProfileCli } from './helpers/profile.js';
import { type ClaudeRunner, execClaude } from './helpers/profile-launch.js';
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

const ManifestVersion = v.object({ version: v.string() });

export function readVersion(pluginDir: string): string {
  const manifest = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  try {
    const parsed = v.safeParse(
      ManifestVersion,
      JSON.parse(fs.readFileSync(manifest, 'utf-8')),
    );
    return parsed.success ? parsed.output.version : 'unknown';
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

export const USAGE = `usage: sidekick rules <install|check> --project|--user [--strict]\n       ${PM_USAGE_LINE}\n       ${HOOK_USAGE_LINE}\n       ${PROFILE_USAGE_LINE}\n       sidekick --version`;

export interface MainContext {
  env: NodeJS.ProcessEnv;
  cwd: string;
  entryFileUrl: string;
  /** Reads the hook event; only the `hook` family calls it. */
  readStdin?: () => string;
  /** Where the context monitor keeps its latch files and the profile check its temp file; defaults to the OS temp folder. */
  tmpdir?: string;
  /** Runs `claude` for the `profile` family; defaults to the real one. */
  runClaude?: ClaudeRunner;
  /** Raw stdout for `profile argv`; defaults to a synchronous write to fd 1. */
  write?: (chunk: string) => void;
}

/** Writes every byte before returning; Node's stdout pipe is asynchronous on macOS and `process.exit` could cut it short. */
function writeStdout(chunk: string): void {
  const buffer = Buffer.from(chunk);
  for (let offset = 0; offset < buffer.length; ) {
    try {
      offset += fs.writeSync(1, buffer, offset);
    } catch (e) {
      // A full non-blocking pipe throws EAGAIN; retry until it drains.
      if (!(e instanceof Error && 'code' in e && e.code === 'EAGAIN')) throw e;
    }
  }
}

function readProcessStdin(): string {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
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
  if (sub === 'pm') return runPmCli(rest, { cwd: ctx.cwd }, out, err);
  if (sub === 'hook') {
    const readStdin = ctx.readStdin ?? readProcessStdin;
    return runHookCli(
      rest,
      { readStdin, pluginDir, env: ctx.env, tmpdir: ctx.tmpdir ?? os.tmpdir() },
      out,
      err,
    );
  }
  if (sub === 'profile') {
    return runProfileCli(
      rest,
      {
        env: ctx.env,
        cwd: ctx.cwd,
        home: ctx.env.HOME || os.homedir(),
        tmpdir: ctx.tmpdir ?? os.tmpdir(),
        runClaude: ctx.runClaude ?? execClaude,
        write: ctx.write ?? writeStdout,
      },
      out,
      err,
    );
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
