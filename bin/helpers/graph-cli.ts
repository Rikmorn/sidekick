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

import { runGraphBuildCli } from './graph-build.js';

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

  return {
    stdout: `sidekick graph ${sub} is not implemented yet.`,
    exitCode: 1,
  };
}
