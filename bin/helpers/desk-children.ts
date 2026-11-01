/**
 * The desk's children: the repository holding `cwd`, resolved from a linked
 * worktree too, and each dispatched worker's facts from git, its brief's plan,
 * and its transcript. A failed git call or read leaves its fact out, or at its
 * default, and adds a warning naming the child.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ChildFacts, ListingRow } from './desk-snapshot.js';
import {
  firstPlace,
  type TranscriptFinder,
  tokensOf,
} from './desk-transcripts.js';
import type { Runner } from './pm-data.js';
import { readBrief } from './worker-brief.js';
import type { WorkerRecord } from './worker-record.js';
import {
  checkoutOf,
  headCommit,
  listWorktrees,
  physical,
  type WorktreeEntry,
} from './worker-repo.js';
import {
  type Candidate,
  type Found,
  findWorktree,
  type Launcher,
} from './worker-worktree.js';

/** The repository's main checkout top and its common git dir. */
export interface Repo {
  top: string;
  commonDir: string;
  /** What `git worktree list` gave, the main checkout first. */
  worktrees: WorktreeEntry[];
}

const firstLine = (text: string): string => text.trim().split('\n')[0];

/**
 * The repository holding `cwd`, from its main checkout or any linked
 * worktree. The main checkout's top is the first entry `git worktree list`
 * gives. Undefined outside a repository, and, with a warning, when
 * `git worktree list` fails inside one.
 */
export function findRepo(
  runGit: Runner,
  cwd: string,
): { repo?: Repo; warnings: string[] } {
  const common = runGit(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    cwd,
  );
  if (common.code !== 0) return { warnings: [] };
  const list = listWorktrees(runGit, cwd);
  if ('issue' in list) {
    return {
      warnings: [
        `git worktree list failed in ${cwd}, so no children show: ${firstLine(list.issue)}`,
      ],
    };
  }
  // Only the final newline goes, since a path may end in a space.
  const commonDir = common.stdout.replace(/\n$/, '');
  return {
    repo: {
      top: list.worktrees[0].path,
      commonDir,
      worktrees: list.worktrees,
    },
    warnings: [],
  };
}

type GitOutput = { stdout: string } | { warning: string };

// The subcommand a warning names; git-level options come before it.
const subcommandOf = (args: string[]): string =>
  args.find((arg) => !arg.startsWith('-')) ?? args.join(' ');

function gitIn(
  runGit: Runner,
  dir: string,
  args: string[],
  name: string,
): GitOutput {
  const result = runGit('git', args, dir);
  if (result.code === 0) return { stdout: result.stdout };
  return {
    warning: `${name}: git ${subcommandOf(args)} failed in ${dir}: ${firstLine(result.stderr)}`,
  };
}

// Status otherwise writes the refreshed index under a lock, which can fail the
// worker's own commit (`git help status` §BACKGROUND REFRESH).
const STATUS_ARGS = ['--no-optional-locks', 'status', '--porcelain'];

const COUNT = /^\d+$/;

type GitFacts = Omit<ChildFacts, 'tokens' | 'plan'> & { warnings: string[] };

// The place `find` knows the session started, then the listing's cwd, as the
// finder wants them: physical paths, in order.
function candidatesOf(
  find: TranscriptFinder,
  row: ListingRow | undefined,
): Candidate[] {
  const transcript =
    row?.sessionId === undefined ? undefined : find(row.sessionId);
  const place =
    transcript === undefined ? undefined : firstPlace(transcript.file);
  const fromTranscript: Candidate[] =
    place === undefined
      ? []
      : [
          {
            via: 'transcript',
            cwd: physical(place.cwd),
            gitBranch: place.gitBranch,
          },
        ];
  const fromListing: Candidate[] =
    row?.cwd === undefined ? [] : [{ via: 'listing', cwd: physical(row.cwd) }];
  return [...fromTranscript, ...fromListing];
}

type Read = ReturnType<typeof readBrief>;

// The top of the checkout holding the brief folder the record names, whether
// or not the brief is still there; undefined when the folder is in no checkout.
function briefTopOf(runGit: Runner, record: WorkerRecord): string | undefined {
  const found = checkoutOf(runGit, path.dirname(record.brief));
  return 'top' in found ? found.top : undefined;
}

// The checkout the worker's worktree cannot be, in finish's words: the brief's
// when it parses, else the one its dispatch record names, as under --name.
function launcherFor(
  top: string | undefined,
  read: Read,
): Launcher | undefined {
  if (top === undefined) return undefined;
  const role =
    'issues' in read
      ? 'the checkout that dispatched the worker'
      : "the brief's checkout";
  return { top: physical(top), role };
}

interface Base {
  /** A revision git takes whole. */
  rev: string;
  warnings: string[];
}

// What the commit count measures against: the brief's target branch, else the
// HEAD of the brief's checkout, else the main checkout's HEAD.
function countBase(
  runGit: Runner,
  name: string,
  read: Read,
  briefTop: string | undefined,
): Base {
  const fallback = (why: string): Base => ({
    rev: 'HEAD',
    warnings: [
      `${name}: ${why}, so its commits count from the main checkout's HEAD`,
    ],
  });
  if ('issues' in read) return fallback('its brief cannot be read');
  const { target } = read.brief;
  // A target may start with `-`, so it never reaches git bare.
  if (target !== undefined) {
    return { rev: `refs/heads/${target}`, warnings: [] };
  }
  const head =
    briefTop === undefined ? undefined : headCommit(runGit, briefTop);
  return head === undefined
    ? fallback("its brief's checkout has no readable HEAD")
    : { rev: head, warnings: [] };
}

// A prunable worktree is missing as far as the desk goes: one warning, and
// the git calls in it are skipped. The count is tried still, since the branch remains.
function gitFacts(
  runGit: Runner,
  repo: Repo,
  name: string,
  found: Found,
  base: Base,
): GitFacts {
  if (found.kind === 'not found') {
    return {
      worktreeExists: false,
      unintegrated: 0,
      uncommitted: false,
      warnings: [...base.warnings, `${name}: no worktree was found for it`],
    };
  }
  const rev = gitIn(
    runGit,
    repo.top,
    ['rev-list', '--count', `${base.rev}..refs/heads/${found.branch}`, '--'],
    name,
  );
  const count = 'stdout' in rev ? rev.stdout.trim() : '';
  const unintegrated = COUNT.test(count) ? Number(count) : 0;
  const countWarnings = 'warning' in rev ? [rev.warning] : [];
  if (found.prunable !== undefined) {
    return {
      worktreeExists: false,
      unintegrated,
      uncommitted: false,
      warnings: [
        `${name}: its worktree ${found.path} is missing`,
        ...base.warnings,
        ...countWarnings,
      ],
    };
  }
  const log = gitIn(runGit, found.path, ['log', '-1', '--format=%s'], name);
  const status = gitIn(runGit, found.path, STATUS_ARGS, name);
  const subject = 'stdout' in log ? log.stdout.trim() : '';
  return {
    worktreeExists: true,
    ...(subject === '' ? {} : { lastCommit: subject }),
    unintegrated,
    uncommitted: 'stdout' in status && status.stdout.trim() !== '',
    warnings: [
      ...[log, status].flatMap((r) => ('warning' in r ? [r.warning] : [])),
      ...countWarnings,
      ...base.warnings,
    ],
  };
}

const H1 = /^# (.+)$/m;

const reason = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

// The first `# ` line of the brief's plan; a plan without one has no title.
function planTitle(
  name: string,
  read: Read,
): {
  plan?: string;
  warnings: string[];
} {
  const noTitle = (why: string) => ({
    warnings: [`${name}: no plan title: ${why}`],
  });
  if ('issues' in read) return noTitle(read.issues.join('; '));
  const { plan } = read.brief;
  try {
    const title = H1.exec(fs.readFileSync(plan, 'utf-8'))?.[1].trim();
    return title === undefined
      ? { warnings: [] }
      : { plan: title, warnings: [] };
  } catch (e) {
    return noTitle(`cannot read ${plan}: ${reason(e)}`);
  }
}

/** Where a child's facts come from: git in the repository, and the transcripts. */
export interface ChildSources {
  runGit: Runner;
  repo: Repo;
  find: TranscriptFinder;
}

/** One child's facts, and a warning for each that could not be read. */
export function childFacts(
  sources: ChildSources,
  record: WorkerRecord,
  row: ListingRow | undefined,
): { facts: ChildFacts; warnings: string[] } {
  const { runGit, repo, find } = sources;
  const { name } = record;
  const read = readBrief(record.brief);
  const briefTop = briefTopOf(runGit, record);
  const found = findWorktree({
    name,
    mainTop: physical(repo.top),
    launcher: launcherFor(briefTop, read),
    worktrees: repo.worktrees,
    candidates: candidatesOf(find, row),
  });
  const base = countBase(runGit, name, read, briefTop);
  const { warnings: gitWarnings, ...git } = gitFacts(
    runGit,
    repo,
    name,
    found,
    base,
  );
  const { warnings: planWarnings, ...plan } = planTitle(name, read);
  const { warnings: tokenWarnings, ...tokens } = tokensOf(
    name,
    row?.sessionId,
    find,
  );
  return {
    facts: { ...git, ...plan, ...tokens },
    warnings: [...gitWarnings, ...planWarnings, ...tokenWarnings],
  };
}
