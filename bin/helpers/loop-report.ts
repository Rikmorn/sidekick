/**
 * `sidekick loop report <name> --unit <id>`: the loop's only view of its
 * worker, since the loop cannot read the worker's worktree. It prints the
 * report of the unit's attempt, from the worker's worktree while it exists,
 * else from the attempt's `report.md`, which `finish` saved. Then it prints
 * the worker branch's head commit, by hardened git after the chain check. A
 * line the key check flags prints withheld, and every control character but
 * a newline or a tab prints as `\xNN`. A report with no `## Proposals`
 * section ends with a line naming that gap. It reaps first, and a reap that
 * cannot run is a warning, so an overdue worker never hides its report.
 *
 * The worker writes its worktree, and `report` runs outside its fence, so it
 * prints only a plain file inside its folder: never a link, a file with
 * another link elsewhere, or anything but a regular file. It reads through
 * the descriptor it checked, so a swap after the check gains nothing.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LoopEnv } from './loop.js';
import { UNIT_REPORT } from './loop-dispatch-attempt.js';
import { envIssues } from './loop-dispatch-checks.js';
import { reapFirstOrWarn } from './loop-reap.js';
import { isControl } from './loop-record.js';
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
import { keyHits } from './memory-patterns.js';
import { parseFlags } from './profile.js';
import { isFolder } from './profile-role.js';
import { realPathOf } from './sidekick-home.js';
import { ATTEMPT_REPORT } from './worker-brief.js';
import { unitReportIssues } from './worker-finish-report.js';
import { chainOf, hardenedRunner } from './worker-git.js';
import { HEADS } from './worker-repo.js';
import { nativeBranch, nativeFolder } from './worker-worktree.js';

export const REPORT_USAGE_LINE = 'sidekick loop report <name> --unit <id>';

type Out = (line: string) => void;
type Io = { out: Out; err: Out };

const REFUSED = 1;
// O_NONBLOCK, so a FIFO swapped in after the check opens at once and is refused, never waited on.
const READ_NO_FOLLOW =
  fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;
const PROPOSALS = /^##\s+Proposals\s*$/i;
// The key check's id for a private key's header line; the key's body lines match nothing.
const KEY_BLOCK = 'private-key-block';
const KEY_BLOCK_END = /-----END[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----/i;
const GAP =
  'the report has no ## Proposals section, so it proposes no outward action: read that as a gap in the report, not as nothing to do';

const refuse = (err: Out, issues: string[]): number => {
  for (const issue of issues) err(issue);
  return REFUSED;
};

const print = (sink: Out, lines: string[]): void => {
  for (const line of lines) sink(line);
};

const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const codeOf = (e: unknown): string | undefined =>
  e instanceof Error && 'code' in e && typeof e.code === 'string'
    ? e.code
    : undefined;

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

/** One place a report may sit: the file, the folder it must lie inside, and that folder's name in a line. */
interface Place {
  file: string;
  folder: string;
  label: string;
}

type Read = { text: string } | { missing: true } | { issues: string[] };

const notPlain = (file: string): string =>
  `a unit report must be a plain file inside its folder, so report prints nothing from ${file}`;

function openNoFollow(
  file: string,
): { fd: number } | Exclude<Read, { text: string }> {
  try {
    return { fd: fs.openSync(file, READ_NO_FOLLOW) };
  } catch (e) {
    const code = codeOf(e);
    if (code === 'ENOENT') return { missing: true };
    if (code === 'ELOOP') {
      return { issues: [`${file} is a symbolic link`, notPlain(file)] };
    }
    return { issues: [`cannot read ${file}: ${messageOf(e)}`] };
  }
}

// Up to `limit` bytes from `fd`, fewer at the end of the file.
function readUpTo(fd: number, limit: number): Buffer {
  const buffer = Buffer.alloc(limit);
  let filled = 0;
  let last = -1;
  while (last !== 0 && filled < limit) {
    last = fs.readSync(fd, buffer, filled, limit - filled, null);
    filled += last;
  }
  return buffer.subarray(0, filled);
}

// The opened file, judged again by its descriptor, then read up to the cap.
function readOpened(fd: number, file: string, maxBytes: number): Read {
  const stat = fs.fstatSync(fd);
  if (!stat.isFile()) {
    return { issues: [`${file} is not a regular file`, notPlain(file)] };
  }
  if (stat.nlink > 1) {
    return {
      issues: [
        `${file} has ${stat.nlink} links, so it may be a hard link to a file elsewhere`,
        notPlain(file),
      ],
    };
  }
  const tooBig = (size: string): Read => ({
    issues: [
      `${file} holds ${size} bytes, past the cap of ${maxBytes}, so report prints none of it`,
    ],
  });
  if (stat.size > maxBytes) return tooBig(String(stat.size));
  const data = readUpTo(fd, maxBytes + 1);
  if (data.length > maxBytes) return tooBig(`more than ${maxBytes}`);
  return { text: data.toString('utf8') };
}

// The report at `place`, when it is a plain file inside its folder, through
// the descriptor checked after the path's own check.
function readPlain(place: Place, maxBytes: number): Read {
  const { file, folder, label } = place;
  const unsafe = unitReportIssues(file, folder, label);
  if (unsafe.length > 0) return { issues: [...unsafe, notPlain(file)] };
  const opened = openNoFollow(file);
  if (!('fd' in opened)) return opened;
  try {
    return readOpened(opened.fd, file, maxBytes);
  } catch (e) {
    return { issues: [`cannot read ${file}: ${messageOf(e)}`] };
  } finally {
    fs.closeSync(opened.fd);
  }
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

const KEPT_CONTROLS = new Set(['\n', '\t']);
const HEX = 16;

// Worker text with each control character but a newline or a tab shown as
// `\xNN`, so none reaches a terminal as a command.
const visible = (text: string): string =>
  [...text]
    .map((ch) =>
      isControl(ch) && !KEPT_CONTROLS.has(ch)
        ? `\\x${ch.charCodeAt(0).toString(HEX).padStart(2, '0')}`
        : ch,
    )
    .join('');

// A line as printed: withheld when the key check flags it, else made visible.
const shownLine = (line: string): string => {
  const ids = keyHits(line);
  return ids.length === 0 ? visible(line) : withheld(ids);
};

// Each line as printed: one the key check flags is withheld, and so is every
// line of a private key's block through its END line, or to the end without
// one, since the check matches the block's header alone.
function shownLines(lines: string[]): string[] {
  const shown: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    const ids = keyHits(line);
    const blocked: boolean = inBlock || ids.includes(KEY_BLOCK);
    inBlock = blocked && !KEY_BLOCK_END.test(line);
    if (blocked) {
      shown.push(withheld(ids.includes(KEY_BLOCK) ? ids : [...ids, KEY_BLOCK]));
    } else {
      shown.push(shownLine(line));
    }
  }
  return shown;
}

const linesOf = (text: string): string[] => {
  const lines = text.split('\n');
  return text.endsWith('\n') ? lines.slice(0, -1) : lines;
};

// The worker branch's head commit, by hardened git once the worktree's link
// to the repo checks out, with the admin folder named for the worker.
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
  if ('issues' in chain) {
    return {
      issues: [
        `the worktree ${worktree} is not linked to its repo the way git links a worktree, so report runs no git there:`,
        ...chain.issues,
      ],
    };
  }
  const run = hardenedRunner(ctx.lenv.runGit, {
    worktree,
    gitDir: chain.gitDir,
  });
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
  const subject = space === -1 ? '' : text.slice(space + 1);
  const shown = shownLine(subject);
  const commit = shown === '' ? sha : `${sha} ${shown}`;
  return { lines: [`head of ${branch}: ${commit}`] };
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
  out: Out,
  err: Out,
  { maxBytes = 100_000 }: { maxBytes?: number } = {},
): number {
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
