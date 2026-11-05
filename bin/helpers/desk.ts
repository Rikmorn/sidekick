/**
 * `sidekick desk --json [--self <id>]`: one snapshot of who waits on the
 * operator and what each dispatched worker does, which the desk mod draws. It
 * reads agent view's listing, the worker records of the repository holding
 * `cwd`, git, and transcript tails, and deletes the records that describe
 * nothing. A failed listing prints a failure snapshot; a failed git call or
 * transcript read leaves that field out and adds a warning.
 */

import * as path from 'node:path';
import {
  DESK_VERSION,
  type DeskSnapshot,
} from '../../plugin/hooks/desk/contract.js';
import { type ChildSources, childFacts, findRepo } from './desk-children.js';
import { readJobStates } from './desk-jobs.js';
import {
  buildSnapshot,
  type ChildFacts,
  joinRow,
  type ListingRow,
  parseListingRows,
  staleRecordNames,
} from './desk-snapshot.js';
import {
  askedOf,
  freshSessions,
  type TranscriptFinder,
  transcriptFinder,
} from './desk-transcripts.js';
import type { Runner } from './pm-data.js';
import { parseFlags } from './profile.js';
import {
  type ClaudeResult,
  type ClaudeRunner,
  printedStreams,
} from './profile-launch.js';
import { LISTING, LISTING_ARGS } from './worker-jobs.js';
import { listWorktrees } from './worker-listing.js';
import {
  readRecords,
  removeRecord,
  type WorkerRecord,
} from './worker-record.js';
import { leftBehind } from './worktree-state.js';

export const DESK_USAGE_LINE = 'sidekick desk --json [--self <session id>]';

export interface DeskEnv {
  cwd: string;
  /** `CLAUDE_CONFIG_DIR`, else `~/.claude`: its `projects/` holds the transcripts. */
  configDir: string;
  runClaude: ClaudeRunner;
  runGit: Runner;
  /** Whether a process id names a live process: a lock's pid decides if its worktree is held. */
  isAlive: (pid: number) => boolean;
  /** Epoch milliseconds. */
  now: () => number;
}

type Out = (line: string) => void;

// The flags, or undefined on a usage error: `--json` is required.
function parseDeskArgs(rest: string[]): { self?: string } | undefined {
  const parsed = parseFlags(rest, {
    json: { type: 'boolean' },
    self: { type: 'string' },
  });
  if (parsed === undefined || parsed.positionals.length > 0) return undefined;
  if (parsed.values.json !== true) return undefined;
  const { self } = parsed.values;
  return typeof self === 'string' ? { self } : {};
}

type ReadListing = { rows: ListingRow[]; warnings: string[] };
type Listing = ReadListing | { error: string };

function exitError(result: ClaudeResult): string {
  const failed = `${LISTING} failed with exit code ${result.code}`;
  const printed = printedStreams(result).at(0);
  return printed === undefined
    ? failed
    : `${failed}: ${printed.split('\n')[0]}`;
}

function parseJson(text: string): { value: unknown } | { error: string } {
  try {
    return { value: JSON.parse(text) };
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return { error: `${LISTING} printed a listing that is not JSON: ${why}` };
  }
}

// The timeout stays under the mod's 8-second run timeout, so a slow listing
// reports itself as a failure snapshot before the mod kills the run.
export function readListing(
  run: ClaudeRunner,
  cwd: string,
  timeoutMs = 5_000,
): Listing {
  const result = run(LISTING_ARGS, { cwd, timeoutMs });
  if (result.timedOut) return { error: `${LISTING} did not return in time` };
  if (result.code !== 0) return { error: exitError(result) };
  const json = parseJson(result.stdout);
  if ('error' in json) return json;
  if (!Array.isArray(json.value)) {
    return { error: `${LISTING} printed a listing that is not a JSON array` };
  }
  return parseListingRows(json.value);
}

interface Children {
  repo?: string;
  records: WorkerRecord[];
  facts: ReadonlyMap<string, ChildFacts>;
  /** Linked worktrees left behind in the repository; zero outside one. */
  leftBehind: number;
  warnings: string[];
}

const reason = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

// Deletes each named record; a failed delete is a warning, never a failure.
function pruneRecords(commonDir: string, names: string[]): string[] {
  return names.flatMap((name) => {
    try {
      removeRecord(commonDir, name);
      return [];
    } catch (e) {
      return [`${name}: its stale record was not deleted: ${reason(e)}`];
    }
  });
}

// The children of the repository holding `cwd`, with their facts; none
// outside a repository. Deletes the records that describe nothing, and drops
// their facts' warnings with them. A listing read in part counts no worktree
// left behind, since an unparsed session may sit in any.
function readAndPruneChildren(
  denv: DeskEnv,
  listing: ReadListing,
  find: TranscriptFinder,
): Children {
  const { rows } = listing;
  const found = findRepo(denv.runGit, denv.cwd);
  if (found.repo === undefined) {
    return {
      records: [],
      facts: new Map(),
      leftBehind: 0,
      warnings: found.warnings,
    };
  }
  const { repo } = found;
  const sources: ChildSources = { runGit: denv.runGit, repo, find };
  const read = readRecords(repo.commonDir);
  const gathered = read.records.map((record) => ({
    record,
    ...childFacts(sources, record, joinRow(record, rows)),
  }));
  const facts = new Map(gathered.map((g) => [g.record.name, g.facts]));
  const stale = staleRecordNames(rows, read.records, facts);
  const kept = gathered.filter((g) => !stale.includes(g.record.name));
  const records = kept.map((g) => g.record);
  return {
    repo: path.basename(repo.top),
    records,
    facts,
    leftBehind: leftBehind({
      repo,
      rows,
      listingWarnings: listing.warnings,
      records,
      unreadRecords: read.warnings,
      isAlive: denv.isAlive,
    }).length,
    warnings: [
      ...read.warnings,
      ...kept.flatMap((g) => g.warnings),
      ...pruneRecords(repo.commonDir, stale),
    ],
  };
}

const GIT_SUFFIX = '.git';

// The main checkout's folder name for the repository holding `cwd`: the
// folder holding a common dir that ends in `.git`, else the first worktree
// git lists. Undefined when git cannot read `cwd`.
function repoNameFor(runGit: Runner, cwd: string): string | undefined {
  const common = runGit(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    cwd,
  );
  if (common.code !== 0) return undefined;
  const commonDir = common.stdout.replace(/\n$/, '');
  if (path.basename(commonDir) === GIT_SUFFIX) {
    return path.basename(path.dirname(commonDir));
  }
  const list = listWorktrees(runGit, cwd);
  return 'issue' in list ? undefined : path.basename(list.worktrees[0].path);
}

// From each distinct row `cwd` to its repository's name; a `cwd` git cannot read is left out.
function repoNamesOf(
  runGit: Runner,
  rows: ListingRow[],
): ReadonlyMap<string, string> {
  const cwds = new Set(rows.flatMap(({ cwd }) => cwd ?? []));
  return new Map(
    [...cwds].flatMap((cwd): [string, string][] => {
      const name = repoNameFor(runGit, cwd);
      return name === undefined ? [] : [[cwd, name]];
    }),
  );
}

function takeSnapshot(denv: DeskEnv, self: string | undefined): DeskSnapshot {
  const listing = readListing(denv.runClaude, denv.cwd);
  if ('error' in listing) {
    return { version: DESK_VERSION, ok: false, error: listing.error };
  }
  const { rows } = listing;
  const transcripts = transcriptFinder(denv.configDir);
  const children = readAndPruneChildren(denv, listing, transcripts.find);
  return buildSnapshot({
    rows,
    readJobs: (drawn) => readJobStates(denv.configDir, drawn),
    readAsked: (sessionId) => askedOf(sessionId, transcripts.find),
    records: children.records,
    facts: children.facts,
    freshInteractive: freshSessions(rows, transcripts.find, denv.now()),
    self,
    repo: children.repo,
    leftBehind: children.leftBehind,
    repoNames: repoNamesOf(denv.runGit, rows),
    warnings: [
      ...listing.warnings,
      ...transcripts.warnings,
      ...children.warnings,
    ],
  });
}

/** `sidekick desk --json [--self <id>]`: prints one snapshot; 0, or 1 on a usage error. */
export function runDeskCli(
  rest: string[],
  denv: DeskEnv,
  out: Out,
  err: Out,
): number {
  const args = parseDeskArgs(rest);
  if (args === undefined) {
    err(`usage: ${DESK_USAGE_LINE}`);
    return 1;
  }
  out(JSON.stringify(takeSnapshot(denv, args.self)));
  return 0;
}
