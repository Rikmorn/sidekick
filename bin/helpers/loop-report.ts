/**
 * `sidekick loop report <name> --unit <id>`: the loop's only view of its
 * worker, since the loop cannot read the worker's worktree. It prints the
 * report of the unit's attempt, from the worker's worktree while it exists,
 * else from the attempt's `report.md`, which `finish` saved, each read as
 * `loop-report-read.ts` guards it. Then it prints the worker branch's head
 * commit, by hardened git after the chain check. A line of worker-written
 * text prints withheld when the key check flags it, and every line it
 * prints, on `out` or `err`, shows each control character but a newline or a
 * tab as `\xNN`. A report with no `## Proposals` section ends with a line
 * naming that gap. It reaps first, and a reap that cannot run is a warning,
 * so an overdue worker never hides its report.
 */

import * as path from 'node:path';
import type { LoopEnv } from './loop.js';
import { UNIT_REPORT } from './loop-dispatch-attempt.js';
import { envIssues } from './loop-dispatch-checks.js';
import { reapFirstOrWarn } from './loop-reap.js';
import { isControl } from './loop-record.js';
import { type Place, readPlain } from './loop-report-read.js';
import {
  loopNameIssues,
  type UnitContext,
  unitContextOf,
} from './loop-unit-context.js';
import {
  attemptDir,
  inFlight,
  readLedger,
  unitIdIssues,
} from './loop-units.js';
import { keyHits, PRIVATE_KEY_BLOCK } from './memory-patterns.js';
import { parseFlags } from './profile.js';
import { isFolder } from './profile-role.js';
import { realPathOf } from './sidekick-home.js';
import { ATTEMPT_REPORT } from './worker-brief.js';
import { chainOf, hardenedRunner } from './worker-git.js';
import { HEADS } from './worker-repo.js';
import { nativeBranch, nativeFolder } from './worker-worktree.js';

export const REPORT_USAGE_LINE = 'sidekick loop report <name> --unit <id>';

type Out = (line: string) => void;
type Io = { out: Out; err: Out };

const REFUSED = 1;
const PROPOSALS = /^##\s+Proposals\s*$/i;
// The key check matches a private key's header alone, so its body lines withhold until this line.
const KEY_BLOCK_END = /-----END[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----/i;
const GAP =
  'the report has no ## Proposals section, so it proposes no outward action: read that as a gap in the report, not as nothing to do';
const KEPT_CONTROLS = new Set(['\n', '\t']);
const HEX = 16;

const refuse = (err: Out, issues: string[]): number => {
  for (const issue of issues) err(issue);
  return REFUSED;
};

const print = (sink: Out, lines: string[]): void => {
  for (const line of lines) sink(line);
};

interface ReportCall {
  name: string;
  unit: string;
}

function parseReport(rest: string[]): ReportCall | undefined {
  const parsed = parseFlags(rest, { unit: { type: 'string' } });
  if (parsed === undefined || parsed.positionals.length !== 1) return undefined;
  const { unit } = parsed.values;
  if (typeof unit !== 'string') return undefined;
  return { name: parsed.positionals[0], unit };
}

// The worker of the unit's attempt in flight, else of its newest attempt by the record.
function reportedWorker(
  ctx: UnitContext,
  unit: string,
): { worker: string } | { issues: string[] } {
  const ledger = readLedger(ctx.loopDir, ctx.lenv.now());
  if ('issues' in ledger) {
    return {
      issues: [
        ...ledger.issues,
        "report cannot read the loop's record, so it cannot find the unit's attempt",
      ],
    };
  }
  const open = inFlight(ledger.lines);
  const isOpen = open !== undefined && open.unit === unit;
  const workers = ledger.lines.flatMap((line) =>
    line.kind === 'dispatched' && line.unit === unit ? [line.worker ?? ''] : [],
  );
  const worker = isOpen ? open.worker : workers.at(-1);
  if (worker === undefined) {
    return {
      issues: [
        `the record holds no attempt for unit ${unit}, so report has nothing to print`,
      ],
    };
  }
  if (worker === '') {
    return {
      issues: [
        `unit ${unit}'s attempt names no worker, so report has no report to read`,
      ],
    };
  }
  return { worker };
}

// The worktree's report while the worktree exists, else, or when it holds
// none, the attempt folder's. A refused report never falls through.
function readReport(
  worker: string,
  worktree: string,
  attempt: string,
  maxBytes: number,
): { file: string; text: string } | { issues: string[] } {
  const inTree: Place = {
    file: path.join(worktree, UNIT_REPORT),
    folder: worktree,
    label: 'the worktree',
  };
  const inAttempt: Place = {
    file: path.join(attempt, ATTEMPT_REPORT),
    folder: attempt,
    label: 'the attempt folder',
  };
  const hasTree = isFolder(worktree);
  for (const place of hasTree ? [inTree, inAttempt] : [inAttempt]) {
    const read = readPlain(place, maxBytes);
    if ('issues' in read) return read;
    if ('text' in read) return { file: place.file, text: read.text };
  }
  const tree = hasTree ? inTree.file : `${inTree.file} (the worktree is gone)`;
  return {
    issues: [
      `no report for worker ${worker}: none at ${tree}, and none at ${inAttempt.file}`,
    ],
  };
}

const withheld = (ids: readonly string[]): string =>
  `(withheld: ${ids.join(', ')})`;

// Text with each control character but a newline or a tab shown as `\xNN`,
// so none reaches a terminal as a command.
const visible = (text: string): string =>
  [...text]
    .map((ch) =>
      isControl(ch) && !KEPT_CONTROLS.has(ch)
        ? `\\x${ch.charCodeAt(0).toString(HEX).padStart(2, '0')}`
        : ch,
    )
    .join('');

// A sink that prints each line made visible. Worker-written text reaches
// both of report's sinks: the report, the commit subject, the chain's and
// git's lines, and the lines of a reap's discard, which quote the worktree.
const visibleSink =
  (sink: Out): Out =>
  (line) =>
    sink(visible(line));

// A line of worker-written text, given the key check's ids for it.
const shownWith = (line: string, ids: readonly string[]): string =>
  ids.length === 0 ? line : withheld(ids);

const shownLine = (line: string): string => shownWith(line, keyHits(line));

// A line inside a private key's block, which the block's id always names.
const blockLine = (ids: readonly string[]): string =>
  withheld(ids.includes(PRIVATE_KEY_BLOCK) ? ids : [...ids, PRIVATE_KEY_BLOCK]);

// Each report line as printed. A private key's block withholds every line
// from its header through its END line, or to the end without one.
function shownLines(lines: string[]): string[] {
  return lines.reduce<{ shown: string[]; inBlock: boolean }>(
    (acc, line) => {
      const ids = keyHits(line);
      const blocked = acc.inBlock || ids.includes(PRIVATE_KEY_BLOCK);
      acc.shown.push(blocked ? blockLine(ids) : shownWith(line, ids));
      return {
        shown: acc.shown,
        inBlock: blocked && !KEY_BLOCK_END.test(line),
      };
    },
    { shown: [], inBlock: false },
  ).shown;
}

const linesOf = (text: string): string[] => {
  const lines = text.split('\n');
  return text.endsWith('\n') ? lines.slice(0, -1) : lines;
};

// `git log -1` of the worker's branch, through the hardened runner, as the
// head line, or why git could not give it.
function headCommit(
  ctx: UnitContext,
  worktree: string,
  worker: string,
  gitDir: string,
): { lines: string[] } | { issues: string[] } {
  const run = hardenedRunner(ctx.lenv.runGit, { worktree, gitDir });
  const branch = nativeBranch(worker);
  // `--no-show-signature` keeps a planted `log.showSignature` from running gpg.
  const args = ['log', '-1', '--no-show-signature', '--format=%H %s'];
  const result = run('git', [...args, `${HEADS}${branch}`, '--'], worktree);
  if (result.code !== 0) {
    const why = result.stderr.trim();
    return {
      issues: [
        `git log ${branch} failed in ${worktree}: ${why === '' ? 'git printed nothing' : why}`,
      ],
    };
  }
  const text = result.stdout.replace(/\n$/, '');
  const space = text.indexOf(' ');
  const sha = space === -1 ? text : text.slice(0, space);
  const shown = space === -1 ? '' : shownLine(text.slice(space + 1));
  const commit = shown === '' ? sha : `${sha} ${shown}`;
  return { lines: [`head of ${branch}: ${commit}`] };
}

// The worker branch's head commit, once the worktree's link to the repo
// checks out, with the admin folder named for the worker. The chain's
// issues quote paths from the worker's own `.git` file, and git's stderr may
// quote what the worker wrote, so each issue line is checked for keys.
function headLines(
  ctx: UnitContext,
  worker: string,
): { lines: string[] } | { issues: string[] } {
  const { repo } = ctx.manifest;
  const worktree = nativeFolder(repo, worker);
  if (!isFolder(worktree)) {
    return {
      lines: [
        `the worktree of ${worker} is gone, so report reads no branch head`,
      ],
    };
  }
  const chain = chainOf(worktree, realPathOf(path.join(repo, '.git')), worker);
  const head =
    'issues' in chain
      ? {
          issues: [
            `the worktree ${worktree} is not linked to its repo the way git links a worktree, so report runs no git there:`,
            ...chain.issues,
          ],
        }
      : headCommit(ctx, worktree, worker, chain.gitDir);
  return 'issues' in head ? { issues: head.issues.map(shownLine) } : head;
}

// Under the units lock, once the reap has run or warned: the report, the
// branch head, then the gap line when the report proposes nothing.
function printReport(
  ctx: UnitContext,
  call: ReportCall,
  io: Io,
  maxBytes: number,
): number {
  const found = reportedWorker(ctx, call.unit);
  if ('issues' in found) return refuse(io.err, found.issues);
  const { worker } = found;
  const worktree = nativeFolder(ctx.manifest.repo, worker);
  const attempt = attemptDir(ctx.loopDir, call.unit, worker);
  const read = readReport(worker, worktree, attempt, maxBytes);
  if ('issues' in read) return refuse(io.err, read.issues);
  const lines = linesOf(read.text);
  io.out(`report of unit ${call.unit} · worker ${worker}, from ${read.file}:`);
  print(io.out, shownLines(lines));
  const head = headLines(ctx, worker);
  if ('lines' in head) print(io.out, head.lines);
  else print(io.err, head.issues);
  if (!lines.some((line) => PROPOSALS.test(line))) io.out(GAP);
  return 'issues' in head ? REFUSED : 0;
}

/**
 * Runs `report`; returns 0 once the report and the branch head print, else
 * 1. `maxBytes` caps the report it reads: a report runs to a few pages, and
 * one past the cap is no report for the loop to read whole.
 */
export function loopReport(
  rest: string[],
  lenv: LoopEnv,
  rawOut: Out,
  rawErr: Out,
  { maxBytes = 100_000 }: { maxBytes?: number } = {},
): number {
  const out = visibleSink(rawOut);
  const err = visibleSink(rawErr);
  const call = parseReport(rest);
  if (call === undefined) {
    err(`usage: ${REPORT_USAGE_LINE}`);
    return REFUSED;
  }
  const early = [
    ...loopNameIssues(call.name),
    ...unitIdIssues(call.unit),
    ...envIssues(lenv.env, call.name, 'report'),
  ];
  if (early.length > 0) return refuse(err, early);
  const ctx = unitContextOf(call.name, lenv);
  if ('issues' in ctx) return refuse(err, ctx.issues);
  const io = { out, err };
  return reapFirstOrWarn(ctx, io, () => printReport(ctx, call, io, maxBytes));
}
