/**
 * ops-2/3/4 — the `sidekick graph` subcommand family.
 *
 * This module is the single entry point for every graph command, and it is
 * loaded through a runtime dynamic import in `bin/cli.ts` rather than a static
 * one. That is deliberate and load-bearing:
 *
 * - The graph store needs `bun:sqlite`. `bun build --target node` hoists that
 *   import to the top of the bundle, so a static import would break the shipped
 *   Node CLI on every code path, not just the graph one.
 * - The graph helpers are repo-internal by contract (the productization seam).
 *   A specifier the bundler cannot resolve statically keeps them out of the
 *   bundle entirely, so the exclusion is structural rather than a promise.
 *
 * Consequence: `sidekick graph` works from source (`bun bin/cli.ts graph ...`)
 * and reports a clear, actionable message from an installed consumer copy.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_DB_PATH, runGraphBuildCli } from './graph-build.js';
import { runGraphDiff } from './graph-diff.js';
import {
  MAP_PATH,
  normalizeForDrift,
  renderSurfaces,
  runGenerateCli,
  STATE_PATH,
} from './graph-generate.js';
import { runGraphLint } from './graph-lint.js';
import { runApplies, runCoverage, runGaps, runQuery } from './graph-query.js';
import { type GraphDb, openGraphDb } from './graph-store.js';

export const GRAPH_SUBCOMMANDS = [
  'build',
  'query',
  'coverage',
  'gaps',
  'applies',
  'diff',
  'lint',
  'state',
  'map',
] as const;

export type GraphSubcommand = (typeof GRAPH_SUBCOMMANDS)[number];

export interface GraphCliResult {
  stdout: string;
  exitCode: number;
}

export interface GraphCliOptions {
  repoRoot: string;
  argv: string[];
}

/** Flag readers shared by every graph subcommand. */
export function flagValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

export function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

export function positionals(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      // Value-taking flags consume the next token.
      if (['--budget', '--db', '--kind'].includes(arg)) i++;
      continue;
    }
    out.push(arg);
  }
  return out;
}

const USAGE = `Usage: sidekick graph <${GRAPH_SUBCOMMANDS.join('|')}> [options]

  build                      rebuild .kb/graph.db from the live tree
  query <term|id>            an entity and its typed neighbours
  coverage                   subject x suite matrix from measures edges
  gaps                       typed unmatched-edge findings
  applies <id|path...>       open backlog items that apply to the argument
  diff <ref> [ref]           entity/edge/status delta between two commits
  lint                       vocabulary, refs, taxonomy, drift, size cap
  state                      regenerate docs/STATE.md
  map                        regenerate MAP.md

Common flags: --json (machine output), --budget <tokens> (query), --force (build)`;

/** Dispatch one graph subcommand. Unknown input fails loudly with usage. */
export async function runGraphCli(
  opts: GraphCliOptions,
): Promise<GraphCliResult> {
  const [sub, ...rest] = opts.argv;
  const json = hasFlag(rest, '--json');

  if (
    sub === undefined ||
    !GRAPH_SUBCOMMANDS.includes(sub as GraphSubcommand)
  ) {
    return { stdout: USAGE, exitCode: 1 };
  }

  if (sub === 'build') {
    return runGraphBuildCli({
      repoRoot: opts.repoRoot,
      dbPath: flagValue(rest, '--db'),
      force: hasFlag(rest, '--force'),
      json,
    });
  }

  // diff and lint parse the tree themselves, so neither needs a built store —
  // and lint must not be able to pass against a stale one.
  if (sub === 'diff') {
    const args = positionals(rest);
    if (args[0] === undefined) {
      return {
        stdout: 'Usage: sidekick graph diff <ref> [ref] [--json]',
        exitCode: 1,
      };
    }
    return runGraphDiff({
      repoRoot: opts.repoRoot,
      fromRef: args[0],
      toRef: args[1],
      json,
    });
  }

  if (sub === 'state' || sub === 'map') {
    return runGenerateCli(opts.repoRoot, sub, json);
  }

  if (sub === 'lint') {
    // The generators are handed in here so lint stays free of a dependency on
    // them: one place decides which derived surfaces are drift-checked.
    return runGraphLint({
      repoRoot: opts.repoRoot,
      json,
      statePath: STATE_PATH,
      generated: [
        {
          path: STATE_PATH,
          regenerate: () => renderSurfaces(opts.repoRoot).state,
          normalize: normalizeForDrift,
        },
        {
          path: MAP_PATH,
          regenerate: () => renderSurfaces(opts.repoRoot).map,
          normalize: normalizeForDrift,
        },
      ],
    });
  }

  // Everything below reads the store, so it must exist first. Building
  // implicitly would hide staleness behind a command that looks like a read.
  const dbPath = path.join(
    opts.repoRoot,
    flagValue(rest, '--db') ?? DEFAULT_DB_PATH,
  );
  if (!fs.existsSync(dbPath)) {
    return {
      stdout: `no graph at ${path.relative(opts.repoRoot, dbPath)} — run \`sidekick graph build\` first.`,
      exitCode: 1,
    };
  }

  const handle: GraphDb = openGraphDb(dbPath);
  try {
    const args = positionals(rest);
    if (sub === 'query') {
      const term = args[0];
      if (term === undefined) {
        return {
          stdout: 'Usage: sidekick graph query <term|id> [--budget N] [--json]',
          exitCode: 1,
        };
      }
      const budgetRaw = flagValue(rest, '--budget');
      return runQuery(handle, {
        term,
        budget: budgetRaw !== undefined ? Number(budgetRaw) : undefined,
        json,
      });
    }
    if (sub === 'coverage') return runCoverage(handle, opts.repoRoot, json);
    if (sub === 'gaps') return runGaps(handle, opts.repoRoot, json);
    if (sub === 'applies') return runApplies(handle, opts.repoRoot, args, json);

    return {
      stdout: `sidekick graph ${sub} is not implemented yet.`,
      exitCode: 1,
    };
  } finally {
    handle.close();
  }
}
