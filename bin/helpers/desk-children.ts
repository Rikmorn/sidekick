/**
 * The desk's children: the repository holding `cwd`, resolved from a linked
 * worktree too, and each dispatched worker's facts from git, its brief's plan,
 * and its transcript. A failed git call or read leaves its fact out, or at its
 * default, and adds a warning naming the child.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ChildFacts, ListingRow } from './desk-snapshot.js';
import { type TranscriptFinder, tokensOf } from './desk-transcripts.js';
import type { Runner } from './pm-data.js';
import { readBrief } from './worker-brief.js';
import type { WorkerRecord } from './worker-record.js';
import { WORKTREES_FOLDER } from './worker-repo.js';

/** The repository's main checkout top and its common git dir. */
export interface Repo {
  top: string;
  commonDir: string;
}

const WORKTREE_LINE = 'worktree ';

const firstLine = (text: string): string => text.trim().split('\n')[0];

/**
 * The repository holding `cwd`, from its main checkout or any linked
 * worktree. Undefined outside a repository. The main checkout's top is the
 * first entry `git worktree list` gives.
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
  const list = runGit('git', ['worktree', 'list', '--porcelain'], cwd);
  const first = list.stdout.split('\n')[0];
  if (list.code !== 0 || !first.startsWith(WORKTREE_LINE)) {
    return {
      warnings: [
        `git worktree list failed in ${cwd}, so no children show: ${firstLine(list.stderr)}`,
      ],
    };
  }
  // Only the final newline goes, since a path may end in a space.
  const commonDir = common.stdout.replace(/\n$/, '');
  return {
    repo: { top: first.slice(WORKTREE_LINE.length), commonDir },
    warnings: [],
  };
}

type GitOutput = { stdout: string } | { warning: string };

function gitIn(
  runGit: Runner,
  dir: string,
  args: string[],
  name: string,
): GitOutput {
  const result = runGit('git', args, dir);
  if (result.code === 0) return { stdout: result.stdout };
  return {
    warning: `${name}: git ${args[0]} failed in ${dir}: ${firstLine(result.stderr)}`,
  };
}

const COUNT = /^\d+$/;

// `claude --worktree <name>` checks out this branch, as dispatch and finish name it.
const branchOf = (name: string): string => `worktree-${name}`;

type GitFacts = Omit<ChildFacts, 'tokens' | 'plan'> & { warnings: string[] };

// A missing worktree is one warning: the git calls in it are skipped, and the
// count, tried still since the branch may remain, adds none of its own.
function gitFacts(runGit: Runner, repo: Repo, name: string): GitFacts {
  const worktree = path.join(repo.top, WORKTREES_FOLDER, name);
  const range = `HEAD..refs/heads/${branchOf(name)}`;
  const rev = gitIn(
    runGit,
    repo.top,
    ['rev-list', '--count', range, '--'],
    name,
  );
  const count = 'stdout' in rev ? rev.stdout.trim() : '';
  const unintegrated = COUNT.test(count) ? Number(count) : 0;
  if (!fs.existsSync(worktree)) {
    return {
      worktreeExists: false,
      unintegrated,
      uncommitted: false,
      warnings: [`${name}: its worktree ${worktree} is missing`],
    };
  }
  const log = gitIn(runGit, worktree, ['log', '-1', '--format=%s'], name);
  const status = gitIn(runGit, worktree, ['status', '--porcelain'], name);
  const subject = 'stdout' in log ? log.stdout.trim() : '';
  return {
    worktreeExists: true,
    ...(subject === '' ? {} : { lastCommit: subject }),
    unintegrated,
    uncommitted: 'stdout' in status && status.stdout.trim() !== '',
    warnings: [log, status, rev].flatMap((r) =>
      'warning' in r ? [r.warning] : [],
    ),
  };
}

const H1 = /^# (.+)$/m;

const reason = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

// The first `# ` line of the brief's plan; a plan without one has no title.
function planTitle(record: WorkerRecord): {
  plan?: string;
  warnings: string[];
} {
  const noTitle = (why: string) => ({
    warnings: [`${record.name}: no plan title: ${why}`],
  });
  const read = readBrief(record.brief);
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
  const { warnings: gitWarnings, ...git } = gitFacts(runGit, repo, record.name);
  const { warnings: planWarnings, ...plan } = planTitle(record);
  const { warnings: tokenWarnings, ...tokens } = tokensOf(
    record.name,
    row?.sessionId,
    find,
  );
  return {
    facts: { ...git, ...plan, ...tokens },
    warnings: [...gitWarnings, ...planWarnings, ...tokenWarnings],
  };
}
