/**
 * `sidekick memory link <repo>`: parses the arguments and hands them to
 * `runLink`, which moves a repo's auto-memory into the memory store.
 */

import * as path from 'node:path';
import { localToday } from './local-date.js';
import { configDirOf } from './main-session.js';
import { runLink } from './memory-link.js';
import { execRunner } from './pm-data.js';
import { parseFlags } from './profile.js';
import type { ClaudeRunner } from './profile-launch.js';

export const MEMORY_USAGE_LINE =
  'sidekick memory link <repo> [--family <name>] [--name <folder>] [--force] [--dry-run]';

export interface MemoryContext {
  env: NodeJS.ProcessEnv;
  /** The folder a relative `<repo>` and a relative `SIDEKICK_MEMORY_STORE` resolve against. */
  cwd: string;
  home: string;
  runClaude: ClaudeRunner;
}

type Out = (line: string) => void;

interface Parsed {
  repo: string;
  family: string | undefined;
  name: string | undefined;
  force: boolean;
  dryRun: boolean;
}

// The arguments, or undefined on a usage error.
function parseLinkArgs(rest: string[]): Parsed | undefined {
  const parsed = parseFlags(rest, {
    family: { type: 'string' },
    name: { type: 'string' },
    force: { type: 'boolean' },
    'dry-run': { type: 'boolean' },
  });
  if (parsed === undefined || parsed.positionals.length !== 1) return undefined;
  const [repo] = parsed.positionals;
  if (repo === undefined) return undefined;
  const { family, name, force, 'dry-run': dryRun } = parsed.values;
  return {
    repo,
    family: typeof family === 'string' ? family : undefined,
    name: typeof name === 'string' ? name : undefined,
    force: force === true,
    dryRun: dryRun === true,
  };
}

// A relative store path means relative to the caller's folder, not the process's.
function envWithAbsoluteStore(
  env: NodeJS.ProcessEnv,
  cwd: string,
): NodeJS.ProcessEnv {
  const store = env.SIDEKICK_MEMORY_STORE;
  if (store === undefined || store === '') return env;
  return { ...env, SIDEKICK_MEMORY_STORE: path.resolve(cwd, store) };
}

/** Runs the `memory` family; returns the exit code. */
export function runMemoryCli(
  argv: string[],
  ctx: MemoryContext,
  out: Out,
  err: Out,
): number {
  const [verb, ...rest] = argv;
  const parsed = verb === 'link' ? parseLinkArgs(rest) : undefined;
  if (parsed === undefined) {
    err(`usage: ${MEMORY_USAGE_LINE}`);
    return 1;
  }
  const env = envWithAbsoluteStore(ctx.env, ctx.cwd);
  return runLink(
    { ...parsed, repo: path.resolve(ctx.cwd, parsed.repo) },
    {
      env,
      home: ctx.home,
      configDir: configDirOf(env, ctx.home),
      runGit: execRunner,
      runClaude: ctx.runClaude,
      today: localToday,
    },
    out,
    err,
  );
}
