/**
 * `sidekick memory <verb>`: parses the arguments and hands them to the verb.
 * `link` moves a repo's auto-memory into the memory store, `snapshot` commits
 * the store and caches a lint of it, and `lint` lists the store's defects.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { readSection } from './hook.js';
import { localToday } from './local-date.js';
import { configDirOf } from './main-session.js';
import { runLink } from './memory-link.js';
import {
  lintStore,
  type MemoryFinding,
  type MemoryLintResult,
} from './memory-lint.js';
import { cachePath, writeCache } from './memory-lint-cache.js';
import {
  type DeadlineRunner,
  deadlineRunner,
  SNAPSHOT_DEADLINE_MS,
  snapshotStore,
} from './memory-snapshot.js';
import { storeRoot } from './memory-store.js';
import { execRunner } from './pm-data.js';
import { parseFlags } from './profile.js';
import type { ClaudeRunner } from './profile-launch.js';

export const MEMORY_USAGE_LINE =
  'sidekick memory link <repo> [--family <name>] [--name <folder>] [--force] [--dry-run] | sidekick memory snapshot --store <path> --session <id> --source <source> | sidekick memory lint [--folder <name>]... [--json]';

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

interface SnapshotArgs {
  store: string;
  session: string;
  source: string;
}

function parseSnapshotArgs(rest: string[]): SnapshotArgs | undefined {
  const parsed = parseFlags(rest, {
    store: { type: 'string' },
    session: { type: 'string' },
    source: { type: 'string' },
  });
  const { store, session, source } = parsed?.values ?? {};
  // A relative or empty store would resolve against the caller's folder, and could commit the caller's repo.
  if (
    typeof store === 'string' &&
    path.isAbsolute(store) &&
    typeof session === 'string' &&
    typeof source === 'string'
  ) {
    return { store, session, source };
  }
  return undefined;
}

/** What the snapshot verb uses beyond git; a test replaces the lint or the clock. */
export interface SnapshotDeps {
  lint: typeof lintStore;
  now: () => number;
}

const SNAPSHOT_DEPS: SnapshotDeps = { lint: lintStore, now: Date.now };

// Writes the cache only when the lint returns, so a lint that throws leaves the old one.
function cacheLint(
  store: string,
  runGit: DeadlineRunner,
  ctx: MemoryContext,
  deps: SnapshotDeps,
): void {
  const file = cachePath(store, runGit);
  if (file === undefined) return;
  const ranAt = new Date(deps.now());
  const result = deps.lint(
    store,
    { readSection, runGit, home: ctx.home, env: ctx.env, now: deps.now },
    { endsAt: runGit.endsAt },
  );
  writeCache(file, result, ranAt);
}

/**
 * `sidekick memory snapshot`: commits the store, then lints the whole store
 * and caches the result. The commit and the lint share one deadline. A hook
 * starts this verb and no one reads its output, so every outcome exits 0
 * silently.
 */
export function runSnapshot(
  rest: string[],
  ctx: MemoryContext,
  deps: SnapshotDeps = SNAPSHOT_DEPS,
): number {
  const args = parseSnapshotArgs(rest);
  if (args === undefined) return 0;
  const runGit = deadlineRunner(SNAPSHOT_DEADLINE_MS, deps.now);
  try {
    snapshotStore(args.store, args.session, args.source, runGit);
  } catch {}
  try {
    cacheLint(args.store, runGit, ctx, deps);
  } catch {}
  return 0;
}

const STORE_WIDE_LABEL = '(store-wide)';

// Findings grouped by folder in first-seen order, then one count per id.
function lintLines(result: MemoryLintResult): string[] {
  if (result.findings.length === 0) return ['The store is clean.'];
  const groups = new Map<string, MemoryFinding[]>();
  for (const finding of result.findings) {
    const heading =
      finding.folder === '' ? STORE_WIDE_LABEL : `${finding.folder}/`;
    groups.set(heading, [...(groups.get(heading) ?? []), finding]);
  }
  const lines = [...groups].flatMap(([heading, findings]) => [
    heading,
    ...findings.map((f) => {
      const where = f.line === undefined ? f.file : `${f.file}:${f.line}`;
      return `${f.id}  ${where}  ${f.message}`;
    }),
    '',
  ]);
  const counts = Object.entries(result.counts).map(
    ([id, count]) => `${id}  ${count}`,
  );
  return [...lines, ...counts];
}

// A folder that exists and lists: `statSync` alone passes a mode-000 folder, which the lint would read as empty.
function isReadableDirectory(dir: string): boolean {
  try {
    if (!fs.statSync(dir).isDirectory()) return false;
    fs.readdirSync(dir);
    return true;
  } catch {
    return false;
  }
}

// Reports; the exit code is 0 with or without findings, and 1 only when the command cannot run.
function runLint(
  rest: string[],
  ctx: MemoryContext,
  out: Out,
  err: Out,
): number {
  const parsed = parseFlags(rest, {
    folder: { type: 'string', multiple: true },
    json: { type: 'boolean' },
  });
  if (parsed === undefined || parsed.positionals.length > 0) {
    err(`usage: ${MEMORY_USAGE_LINE}`);
    return 1;
  }
  const env = envWithAbsoluteStore(ctx.env, ctx.cwd);
  const store = storeRoot(env, ctx.home);
  if (!isReadableDirectory(store)) {
    err(`the memory store is not a readable folder: ${store}`);
    return 1;
  }
  const folders = (parsed.lists.folder ?? []).map((f) => f.replace(/\/$/, ''));
  try {
    const result = lintStore(
      store,
      { readSection, runGit: execRunner, home: ctx.home, env, now: Date.now },
      folders.length > 0 ? { folders } : {},
    );
    if (parsed.values.json === true) {
      out(JSON.stringify(result, null, 2));
    } else {
      for (const line of lintLines(result)) out(line);
    }
    return 0;
  } catch (e) {
    err(`memory lint failed: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

/** Runs the `memory` family; returns the exit code. */
export function runMemoryCli(
  argv: string[],
  ctx: MemoryContext,
  out: Out,
  err: Out,
): number {
  const [verb, ...rest] = argv;
  if (verb === 'snapshot') return runSnapshot(rest, ctx);
  if (verb === 'lint') return runLint(rest, ctx, out, err);
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
