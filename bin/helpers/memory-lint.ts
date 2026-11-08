/**
 * The memory store's lint: one predicate per check id, each returning the
 * findings that contradict it, run over every repo and family folder. It
 * reads the store and never writes to it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { configDirOf } from './main-session.js';
import { defaultMemoryFolder } from './memory-default.js';
import { type MemoryFile, parseMemoryText } from './memory-files.js';
import { linkCommand } from './memory-link-plan.js';
import { linksIn, reachFrom } from './memory-links.js';
import {
  compareDefaultFolder,
  type DefaultFolderDiff,
  errorCode,
  invalidMarkers,
  keyInStore,
  type RootFact,
  resolvedPath,
  rootFact,
} from './memory-lint-repos.js';
import {
  type Check,
  GATE_CHECKS,
  gateHits,
  invisibleCharacters,
  KEY_CHECKS,
  keyHits,
  printedHits,
  withheldPath,
} from './memory-patterns.js';
import {
  headingAs,
  NEXT_HEADING,
  otherHeadings,
  STATE_HEADING,
} from './memory-sections.js';
import { SETTINGS_KEY } from './memory-settings.js';
import { DEADLINE_EXIT } from './memory-snapshot.js';
import { fitWorkstream, storeFolder } from './memory-start-render.js';
import { findMarkers, MARKER_FILE } from './memory-store.js';
import {
  readStoreSettings,
  STORE_SETTINGS_FILE,
  type StoreSettings,
} from './memory-store-settings.js';
import {
  listRecords,
  listWorkstreams,
  type SessionRecord,
  type Workstream,
} from './memory-view.js';
import type { Runner } from './pm-data.js';

/** The single source of check ids; `lintStore` runs one predicate per id, in this order. */
export const MEMORY_LINT_IDS = [
  'dead-link',
  'unindexed',
  'index-over-cap',
  'index-line-long',
  'workstream-cut',
  'workstream-dropped',
  'key-shaped',
  'injection-shaped',
  'settings-invalid',
  'unreadable',
  'dangling-marker',
  'default-folder-left',
  'stale-lock',
  'setting-missing',
] as const;
export type MemoryLintId = (typeof MEMORY_LINT_IDS)[number];

/** Ids whose findings belong to no folder: their `folder` is `''`, and every `folders` run keeps them. */
export const STORE_WIDE_IDS: readonly MemoryLintId[] = [
  'settings-invalid',
  'dangling-marker',
  'stale-lock',
];

/**
 * One defect. `folder` is the store-relative folder with `/` separators
 * (`sidekick`, `family/repo`, `family`), or `''` for a store-wide finding.
 * `file` is absolute, under the store's real path, except for
 * `default-folder-left`, whose `file` is Claude Code's default memory folder.
 */
export interface MemoryFinding {
  id: MemoryLintId;
  folder: string;
  file: string;
  line?: number;
  message: string;
}

/**
 * A git call that returned exit code 124, the deadline's. `lintStore` throws
 * it rather than read that result as a fact about a repo, so the caller can
 * drop the whole run.
 */
export class GitDeadlineError extends Error {
  readonly args: readonly string[];
  readonly cwd: string;

  constructor(args: readonly string[], cwd: string) {
    super(`git ${args.join(' ')} in ${cwd} passed its deadline`);
    this.name = 'GitDeadlineError';
    this.args = args;
    this.cwd = cwd;
  }
}

/**
 * The run reached the end time `lintStore` was given. Thrown between units
 * of work, so the caller drops the whole run.
 */
export class LintTimeLimitError extends Error {
  constructor() {
    super('the lint passed its time limit');
    this.name = 'LintTimeLimitError';
  }
}

/** What the lint reads beyond the store's files. */
export interface LintDeps {
  /** Reads a `## ` section, heading included; injected so the lint stays clear of hook.ts. */
  readSection: (file: string, heading: string) => string | undefined;
  /** A call that returns exit code 124 stops the run with `GitDeadlineError`. */
  runGit: Runner;
  home: string;
  env: NodeJS.ProcessEnv;
  /** The clock for lock ages and for `LintOptions.endsAt`. */
  now: () => number;
}

/** A run's scope and time limit. */
export interface LintOptions {
  /** Keep only these folders' findings, as `MemoryFinding.folder` names them, and the store-wide ids. */
  folders?: readonly string[];
  /** On `deps.now`'s clock, the time past which the run throws `LintTimeLimitError`; unset, no limit. */
  endsAt?: number;
}

/** The findings, and how many there are of each id that has any. */
export interface MemoryLintResult {
  findings: MemoryFinding[];
  counts: Partial<Record<MemoryLintId, number>>;
}

const INDEX_FILE = 'MEMORY.md';
const SESSIONS_DIR = 'sessions';
// Claude Code loads the first 200 lines or 25 KB of a MEMORY.md, whichever
// comes first (docs/research/memory/2026-10-30-claude-code-mechanisms.md:58).
const LOAD_LIMIT_LINES = 200;
const LOAD_LIMIT_BYTES = 25 * 1024;
// The age at which the memory hook calls the store's git lock stale (STALE_LOCK_MS, memory-start.ts).
const STALE_LOCK_MS = 10 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// --- Folders and their own files ---

type LintFolder =
  | {
      kind: 'repo';
      folder: string;
      dir: string;
      root: string;
      family: string | undefined;
    }
  | { kind: 'family'; folder: string; dir: string };

interface OwnFile {
  name: string;
  file: string;
  text: string;
}

interface Unreadable {
  file: string;
  why: string;
}

// A folder with its own `.md` files read, and a repo folder's session
// records. `reached` holds the names links reach from MEMORY.md;
// `reachComplete` is false when an unreadable file stood on the way, so what
// lies past it is unknown.
type FolderScan = LintFolder & {
  names: readonly string[];
  files: readonly OwnFile[];
  sessions: readonly OwnFile[];
  unreadable: readonly Unreadable[];
  reached: ReadonlySet<string>;
  reachComplete: boolean;
};

type RepoScan = Extract<FolderScan, { kind: 'repo' }>;

// Repo folders from their markers; a family folder is the parent of a two-level marker.
function lintFolders(store: string): LintFolder[] {
  const markers = findMarkers(store);
  const repos = markers.map(
    (found): LintFolder => ({
      kind: 'repo',
      folder: storeFolder(store, found.folder),
      dir: found.folder,
      root: found.root,
      family: found.family,
    }),
  );
  const familyNames = new Set(
    markers.flatMap((found) =>
      found.family === undefined ? [] : [found.family],
    ),
  );
  const families = [...familyNames].map(
    (name): LintFolder => ({
      kind: 'family',
      folder: name,
      dir: path.join(store, name),
    }),
  );
  return [...repos, ...families].sort((a, b) =>
    a.folder.localeCompare(b.folder),
  );
}

type Listing = { names: string[] } | { why: string };

function ownNames(dir: string): Listing {
  try {
    const names = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => !entry.isDirectory() && entry.name.endsWith('.md'))
      .map((entry) => entry.name)
      .sort();
    return { names };
  } catch (error) {
    return { why: errorCode(error) };
  }
}

type FileRead =
  | { kind: 'read'; own: OwnFile }
  | { kind: 'unreadable'; file: string; why: string };

function readOwn(dir: string, name: string): FileRead {
  const file = path.join(dir, name);
  try {
    return {
      kind: 'read',
      own: { name, file, text: fs.readFileSync(file, 'utf8') },
    };
  } catch (error) {
    return { kind: 'unreadable', file, why: errorCode(error) };
  }
}

// The `.md` files directly in `dir`: `unlisted` holds the folder when it cannot be listed.
interface FolderRead {
  names: string[];
  files: OwnFile[];
  failed: Unreadable[];
  unlisted: Unreadable[];
}

function readFolder(dir: string): FolderRead {
  const listing = ownNames(dir);
  const names = 'names' in listing ? listing.names : [];
  const reads = names.map((name) => readOwn(dir, name));
  return {
    names,
    files: reads.flatMap((read) => (read.kind === 'read' ? [read.own] : [])),
    failed: reads.flatMap((read) =>
      read.kind === 'unreadable' ? [{ file: read.file, why: read.why }] : [],
    ),
    unlisted: 'why' in listing ? [{ file: dir, why: listing.why }] : [],
  };
}

const NO_FILES: FolderRead = { names: [], files: [], failed: [], unlisted: [] };

// A repo folder's session records; a folder with no sessions/ has none.
function readSessions(place: LintFolder): FolderRead {
  const dir = path.join(place.dir, SESSIONS_DIR);
  if (place.kind !== 'repo' || !fs.existsSync(dir)) return NO_FILES;
  return readFolder(dir);
}

function scanFolder(place: LintFolder): FolderScan {
  const own = readFolder(place.dir);
  const sessions = readSessions(place);
  const blocked = new Set(own.failed.map((read) => path.basename(read.file)));
  const starts = own.names.includes(INDEX_FILE) ? [INDEX_FILE] : [];
  const reached = reachFrom(place.dir, own.files, starts);
  return {
    ...place,
    names: own.names,
    files: own.files,
    sessions: sessions.files,
    unreadable: [
      ...own.unlisted,
      ...own.failed,
      ...sessions.unlisted,
      ...sessions.failed,
    ],
    reached,
    reachComplete: [...reached].every((name) => !blocked.has(name)),
  };
}

// --- Linked repos ---

// A repo folder with what git says about its marker's root.
interface LinkedRepo {
  scan: RepoScan;
  fact: RootFact;
}

// Every git call the lint makes goes through this, so a call the deadline cut never becomes a finding.
function stopAtDeadline(runGit: Runner): Runner {
  return (cmd, args, cwd) => {
    const result = runGit(cmd, args, cwd);
    if (result.code === DEADLINE_EXIT) throw new GitDeadlineError(args, cwd);
    return result;
  };
}

function linkedRepos(
  folders: readonly FolderScan[],
  runGit: Runner,
  home: string,
): LinkedRepo[] {
  return folders.flatMap((scan) =>
    scan.kind === 'repo'
      ? [{ scan, fact: rootFact(scan.root, runGit, home) }]
      : [],
  );
}

// --- Predicates ---

interface LintInput {
  store: string;
  folders: readonly FolderScan[];
  repos: readonly LinkedRepo[];
  settings: StoreSettings;
  settingsIssue: string | undefined;
  deps: LintDeps;
  /** Throws `LintTimeLimitError` once the run's end time has come. */
  inTime: () => void;
}

// Each predicate receives its own id, so the table names each id once.
type Predicate = (input: LintInput, id: MemoryLintId) => MemoryFinding[];

// What a folder check reports; perFolder adds the id and the folder.
interface Hit {
  file: string;
  line?: number;
  message: string;
}

type FolderCheck = (scan: FolderScan, input: LintInput) => Hit[];

function perFolder(check: FolderCheck): Predicate {
  return (input, id) =>
    input.folders.flatMap((scan) => {
      input.inTime();
      return check(scan, input).map((hit) => ({
        id,
        folder: scan.folder,
        ...hit,
      }));
    });
}

const count = (n: number) => n.toLocaleString('en-US');

// A message fragment from store text or a parse error, kept only when no pattern matches it, since `memory lint` prints its findings to a session.
function quoteOrWithhold(text: string): string {
  const ids = printedHits(text);
  return ids.length === 0 ? text : `(withheld: ${ids.join(', ')})`;
}

function indexOf(scan: FolderScan): OwnFile | undefined {
  return scan.files.find((own) => own.name === INDEX_FILE);
}

function deadLinks(scan: FolderScan): Hit[] {
  return scan.files
    .filter((own) => scan.reached.has(own.name))
    .flatMap((own) =>
      linksIn(own.text)
        .filter((link) => !fs.existsSync(path.resolve(scan.dir, link.target)))
        .map((link) => ({
          file: own.file,
          line: link.line,
          message: `links to ${quoteOrWithhold(link.target)}, which does not exist`,
        })),
    );
}

function unindexedFiles(scan: FolderScan): Hit[] {
  if (!scan.reachComplete) return [];
  const message = scan.names.includes(INDEX_FILE)
    ? 'no link from MEMORY.md reaches it, directly or through other files'
    : 'the folder has no MEMORY.md to link it';
  return scan.names
    .filter((name) => name !== INDEX_FILE && !scan.reached.has(name))
    .map((name) => ({ file: path.join(scan.dir, name), message }));
}

// Lines as an editor counts them: a final line break ends the last line, not a new one.
function lineCount(text: string): number {
  return text === '' ? 0 : text.replace(/\n$/, '').split('\n').length;
}

function indexOverCap(scan: FolderScan, input: LintInput): Hit[] {
  const index = indexOf(scan);
  if (index === undefined) return [];
  const lines = lineCount(index.text);
  const bytes = Buffer.byteLength(index.text, 'utf8');
  const cap = input.settings.indexLineCap;
  const loadLimit = "(Claude Code's load limit)";
  const clauses = [
    ...(cap !== undefined && lines > cap
      ? [`${count(lines)} of ${count(cap)} lines (indexLineCap)`]
      : []),
    ...(lines > LOAD_LIMIT_LINES
      ? [`${count(lines)} of ${count(LOAD_LIMIT_LINES)} lines ${loadLimit}`]
      : []),
    ...(bytes > LOAD_LIMIT_BYTES
      ? [`${count(bytes)} of ${count(LOAD_LIMIT_BYTES)} bytes ${loadLimit}`]
      : []),
  ];
  if (clauses.length === 0) return [];
  return [{ file: index.file, message: clauses.join('; ') }];
}

function longIndexLines(scan: FolderScan, input: LintInput): Hit[] {
  const index = indexOf(scan);
  if (index === undefined) return [];
  const limit = input.settings.indexLineLength;
  return index.text.split('\n').flatMap((raw, i) => {
    const length = raw.replace(/\r$/, '').length;
    if (length <= limit) return [];
    const message = `${count(length)} of ${count(limit)} characters`;
    return [{ file: index.file, line: i + 1, message }];
  });
}

// One clause per cut section, each size beside the budget the hook measured it against.
function cutClauses(fit: ReturnType<typeof fitWorkstream>): string[] {
  const { cut, sizes } = fit;
  const shownNext = fit.nextSteps?.length ?? 0;
  const together = `${count(sizes.state + shownNext)} of ${count(sizes.stateBudget + shownNext)}`;
  const next = `${count(sizes.nextSteps)} of ${count(sizes.nextBudget)}`;
  return [
    ...(cut.state ? [`State and Next steps: ${together}`] : []),
    ...(cut.nextSteps ? [`Next steps: ${next}`] : []),
  ];
}

// The two sections as the hook reads them, so what the lint checks is what the hook prints.
function hookSections(
  file: string,
  readSection: LintDeps['readSection'],
): { state: string | undefined; next: string | undefined } {
  return {
    state: readSection(file, headingAs(file, STATE_HEADING).trimEnd()),
    next: readSection(file, headingAs(file, NEXT_HEADING).trimEnd()),
  };
}

function cutWorkstreams(scan: FolderScan, input: LintInput): Hit[] {
  return listWorkstreams(scan.dir, undefined).flatMap((stream) => {
    const file = stream.path;
    const { state, next } = hookSections(file, input.deps.readSection);
    // The hook's cut marker withholds a matching name, and its length moves State's budget.
    const readPath = withheldPath(file, input.store);
    const clauses = cutClauses(fitWorkstream(state, next, readPath));
    return clauses.length === 0 ? [] : [{ file, message: clauses.join('; ') }];
  });
}

// Why the workstream reader refuses a `kind: workstream` file; the decision itself is listWorkstreams'.
function workstreamFaults(memory: MemoryFile): string {
  const { status } = memory.metadata;
  const nameless = memory.name === undefined || memory.name === '';
  const statusFault =
    status === undefined
      ? 'it has no status'
      : `its status is ${quoteOrWithhold(`"${status}"`)}, not open or closed`;
  const faults = [
    ...(nameless ? ['it has no name'] : []),
    ...(status !== 'open' && status !== 'closed' ? [statusFault] : []),
  ];
  const why =
    faults.length > 0 ? faults.join(', and ') : 'its reader refuses it';
  return `the hook drops this workstream: ${why}`;
}

function dropReason(
  own: OwnFile,
  kept: ReadonlySet<string>,
): string | undefined {
  const memory = parseMemoryText(own.text);
  if (memory === undefined) {
    return 'its front matter does not parse: it needs a --- line at the top and another closing it';
  }
  const isDropped =
    memory.metadata.kind === 'workstream' && !kept.has(own.file);
  return isDropped ? workstreamFaults(memory) : undefined;
}

function droppedWorkstreams(scan: FolderScan): Hit[] {
  const listed = listWorkstreams(scan.dir, undefined);
  const kept = new Set(listed.map((stream) => stream.path));
  return scan.files
    .filter((own) => own.name !== INDEX_FILE)
    .flatMap((own) => {
      const message = dropReason(own, kept);
      return message === undefined ? [] : [{ file: own.file, message }];
    });
}

// The shared deciders and the checks they run, so a finding names the same ids the gate would.
const SHAPES = {
  key: { hits: keyHits, checks: KEY_CHECKS },
  injection: { hits: gateHits, checks: GATE_CHECKS },
} satisfies Record<
  string,
  { hits: (text: string) => string[]; checks: readonly Check[] }
>;
type Shape = keyof typeof SHAPES;

// Names the patterns and never quotes the text, since findings are printed and cached.
const shapedText = (shape: Shape, ids: readonly string[]): string =>
  `holds ${shape}-shaped text (${ids.join(', ')})`;

const invisibleText = (points: readonly string[]): string =>
  `holds invisible characters (${points.join(', ')})`;

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

// The lines matches start on, each with the ids that match there in list order; a match may span lines.
// Every reading keeps the text's line breaks, so a line in a reading is the same line in the file.
function matchLines(
  checks: readonly Check[],
  text: string,
): Array<{ line: number; ids: string[] }> {
  const hits = checks.flatMap(({ patterns, readings }) => {
    const read = readings.map((reading) => reading(text));
    return patterns.flatMap(({ id, re }) => {
      const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
      const every = new RegExp(re.source, flags);
      return read.flatMap((reading) =>
        [...reading.matchAll(every)].map((match) => ({
          line: lineOf(reading, match.index ?? 0),
          id,
        })),
      );
    });
  });
  const lines = [...new Set(hits.map((hit) => hit.line))].sort((a, b) => a - b);
  return lines.map((line) => ({
    line,
    ids: [
      ...new Set(hits.filter((hit) => hit.line === line).map((hit) => hit.id)),
    ],
  }));
}

function shapedLines(own: OwnFile, shape: Shape): Hit[] {
  const { hits, checks } = SHAPES[shape];
  if (hits(own.text).length === 0) return [];
  return matchLines(checks, own.text).map(({ line, ids }) => ({
    file: own.file,
    line,
    message: shapedText(shape, ids),
  }));
}

// A repo folder's own files and session records, or a family folder's own files.
function keyShaped(scan: FolderScan): Hit[] {
  return [...scan.files, ...scan.sessions].flatMap((own) =>
    shapedLines(own, 'key'),
  );
}

// Each line's invisible characters, named by code point so the operator can find them.
function invisibleLines(own: OwnFile): Hit[] {
  return own.text.split('\n').flatMap((raw, i) => {
    const points = invisibleCharacters(raw);
    if (points.length === 0) return [];
    return [{ file: own.file, line: i + 1, message: invisibleText(points) }];
  });
}

// One text the hook prints, named by `place` (`its name`, `its title`).
function injectionAt(file: string, place: string, text: string): Hit[] {
  const ids = gateHits(text);
  const points = invisibleCharacters(text);
  return [
    ...(ids.length === 0
      ? []
      : [{ file, message: `${place} ${shapedText('injection', ids)}` }]),
    ...(points.length === 0
      ? []
      : [{ file, message: `${place} ${invisibleText(points)}` }]),
  ];
}

function workstreamInjection(
  stream: Workstream,
  readSection: LintDeps['readSection'],
): Hit[] {
  const { state, next } = hookSections(stream.path, readSection);
  const places: Array<[string, string]> = [
    ['its name', stream.name],
    ['its description', stream.description],
    ['its State section', state ?? ''],
    ['its Next steps section', next ?? ''],
    // Joined as the hook's Also in the file line joins them, so the lint tests the text the gate tests.
    ['its heading list', otherHeadings(stream.path).join(', ')],
  ];
  return places.flatMap(([place, text]) =>
    injectionAt(stream.path, place, text),
  );
}

function recordInjection(record: SessionRecord): Hit[] {
  return injectionAt(record.path, 'its title', record.title);
}

// The index's lines, in line order: a line with both kinds names its injection ids first.
function indexInjection(index: OwnFile | undefined): Hit[] {
  if (index === undefined) return [];
  return [...shapedLines(index, 'injection'), ...invisibleLines(index)].sort(
    (a, b) => (a.line ?? 0) - (b.line ?? 0),
  );
}

// The texts the hook or Claude Code prints: the index, kept workstreams' names, descriptions, two sections, and heading lists, and record titles.
function injectionShaped(scan: FolderScan, input: LintInput): Hit[] {
  const streams = listWorkstreams(scan.dir, undefined);
  const records = scan.kind === 'repo' ? listRecords(scan.dir) : [];
  return [
    ...indexInjection(indexOf(scan)),
    ...streams.flatMap((stream) =>
      workstreamInjection(stream, input.deps.readSection),
    ),
    ...records.flatMap(recordInjection),
  ];
}

function settingsInvalid(input: LintInput, id: MemoryLintId): MemoryFinding[] {
  if (input.settingsIssue === undefined) return [];
  return [
    {
      id,
      folder: '',
      file: path.join(input.store, STORE_SETTINGS_FILE),
      message: `${quoteOrWithhold(input.settingsIssue)}; defaults apply`,
    },
  ];
}

function unreadableFiles(scan: FolderScan): Hit[] {
  return scan.unreadable.map((entry) => ({
    file: entry.file,
    message: `cannot be read (${entry.why}), so the lint skipped it`,
  }));
}

const markerOf = (scan: RepoScan): string => path.join(scan.dir, MARKER_FILE);

// Why a root leaves its folder orphaned, or undefined when it does not.
function rootFault(fact: RootFact): string | undefined {
  switch (fact.kind) {
    case 'missing':
      return 'which does not exist';
    case 'outside-git':
      return 'which is not inside a git repository';
    case 'not-main':
      return `but the repository there has its main checkout at ${quoteOrWithhold(fact.top)}`;
    case 'undecided':
    case 'refused':
    case 'checkout':
      return undefined;
    default: {
      const unhandled: never = fact;
      throw new Error(`Unhandled root fact: ${JSON.stringify(unhandled)}`);
    }
  }
}

// Store-wide: a marker whose root is not a checkout, and one the store skips as invalid.
function danglingMarkers(input: LintInput, id: MemoryLintId): MemoryFinding[] {
  const roots = input.repos.flatMap(({ scan, fact }) => {
    const fault = rootFault(fact);
    if (fault === undefined) return [];
    const message = `${quoteOrWithhold(scan.folder)}'s marker names ${quoteOrWithhold(scan.root)}, ${fault}`;
    return [{ folder: scan.folder, file: markerOf(scan), message }];
  });
  const invalid = invalidMarkers(input.store).map((marker) => ({
    folder: marker.folder,
    file: marker.file,
    message: `${quoteOrWithhold(marker.issue)}, so the store does not count ${quoteOrWithhold(marker.folder)} as a repo folder`,
  }));
  return [...roots, ...invalid]
    .sort((a, b) => a.folder.localeCompare(b.folder))
    .map(({ file, message }) => ({ id, folder: '', file, message }));
}

const STILL_EXISTS = "Claude Code's default memory folder still exists";

function leftMessage(diff: Exclude<DefaultFolderDiff, { kind: 'absent' }>) {
  if (diff.kind === 'unlisted') {
    return `${STILL_EXISTS}, but cannot be listed (${diff.why})`;
  }
  const clauses: Array<[string, readonly string[]]> = [
    ['differs from the store copy', diff.differs],
    ['only there', diff.onlyThere],
    ['only in the store', diff.onlyInStore],
  ];
  const named = clauses
    .filter(([, names]) => names.length > 0)
    .map(
      ([label, names]) => `${label}: ${names.map(quoteOrWithhold).join(', ')}`,
    );
  return named.length === 0
    ? `${STILL_EXISTS}, and its files match the store copies`
    : `${STILL_EXISTS}; ${named.join('; ')}`;
}

function defaultFolderLeft(scan: FolderScan, input: LintInput): Hit[] {
  if (scan.kind !== 'repo') return [];
  const configDir = configDirOf(input.deps.env, input.deps.home);
  const dir = defaultMemoryFolder(scan.root, configDir);
  const diff = compareDefaultFolder(dir, scan.dir, scan.names);
  return diff.kind === 'absent'
    ? []
    : [{ file: dir, message: leftMessage(diff) }];
}

function lockAge(lock: string, now: number): number | undefined {
  try {
    return now - fs.statSync(lock).mtimeMs;
  } catch {
    return undefined;
  }
}

// Store-wide, at the age staleLockWarning (memory-start.ts) warns at.
function staleLock(input: LintInput, id: MemoryLintId): MemoryFinding[] {
  const lock = path.join(input.store, '.git', 'index.lock');
  const age = lockAge(lock, input.deps.now());
  if (age === undefined || age <= STALE_LOCK_MS) return [];
  const minutes = count(Math.floor(age / MINUTE_MS));
  const limit = count(STALE_LOCK_MS / MINUTE_MS);
  const message = `${minutes} minutes old (stale past ${limit}); snapshots stop until it is removed`;
  return [{ id, folder: '', file: lock, message }];
}

// The hook's own command for relinking, with --name only when the folder's name differs from the root's.
function relinkCommand(scan: RepoScan): string {
  const folderName = path.basename(scan.dir);
  const name = folderName === path.basename(scan.root) ? undefined : folderName;
  return linkCommand(scan.root, { family: scan.family, name, dryRun: false });
}

function settingMissing(input: LintInput, id: MemoryLintId): MemoryFinding[] {
  const { store, deps } = input;
  return input.repos.flatMap(({ scan, fact }) => {
    if (fact.kind !== 'checkout') return [];
    if (keyInStore(fact.key, store, deps.home)) return [];
    const root = quoteOrWithhold(scan.root);
    const where =
      fact.key === undefined
        ? `${root} has no ${SETTINGS_KEY} setting`
        : `${root}'s ${SETTINGS_KEY} setting names ${quoteOrWithhold(fact.key)}, outside the store`;
    // The command quotes the root, the family, and the folder's name, so a match in any withholds it whole.
    const message = `${where}, so Claude Code keeps its memory elsewhere. Run: ${quoteOrWithhold(relinkCommand(scan))}`;
    return [{ id, folder: scan.folder, file: markerOf(scan), message }];
  });
}

// Typed by the id union, so a new id without a predicate fails the type check.
const PREDICATES: Record<MemoryLintId, Predicate> = {
  'dead-link': perFolder(deadLinks),
  unindexed: perFolder(unindexedFiles),
  'index-over-cap': perFolder(indexOverCap),
  'index-line-long': perFolder(longIndexLines),
  'workstream-cut': perFolder(cutWorkstreams),
  'workstream-dropped': perFolder(droppedWorkstreams),
  'key-shaped': perFolder(keyShaped),
  'injection-shaped': perFolder(injectionShaped),
  'settings-invalid': settingsInvalid,
  unreadable: perFolder(unreadableFiles),
  'dangling-marker': danglingMarkers,
  'default-folder-left': perFolder(defaultFolderLeft),
  'stale-lock': staleLock,
  'setting-missing': settingMissing,
};

// --- The run ---

function countById(
  findings: readonly MemoryFinding[],
): Partial<Record<MemoryLintId, number>> {
  return Object.fromEntries(
    MEMORY_LINT_IDS.flatMap((id): Array<[MemoryLintId, number]> => {
      const found = findings.filter((finding) => finding.id === id).length;
      return found === 0 ? [] : [[id, found]];
    }),
  );
}

// The time check: it throws once `now` reaches `endsAt`, and never without one.
function timeCheck(now: () => number, endsAt: number | undefined) {
  return (): void => {
    if (endsAt !== undefined && now() >= endsAt) {
      throw new LintTimeLimitError();
    }
  };
}

/**
 * Lints the whole store: every repo folder and family folder, the store's
 * settings and git lock, and each linked repo's checkout, key, and default
 * memory folder. With `folders`, the findings keep only those folders
 * (store-relative, as `MemoryFinding.folder` names them) and the store-wide
 * ids. The store resolves to its real path, so `file` matches the paths the
 * memory hook prints. Throws `GitDeadlineError` when a git call returns exit
 * code 124, so no finding rests on a call the deadline cut. A call that fails
 * any other way is read as its result. With `endsAt`, throws
 * `LintTimeLimitError` at the first check past it: before each folder's scan,
 * each predicate, and each folder a folder predicate visits.
 */
export function lintStore(
  store: string,
  deps: LintDeps,
  opts: LintOptions = {},
): MemoryLintResult {
  const inTime = timeCheck(deps.now, opts.endsAt);
  const root = resolvedPath(store);
  const runGit = stopAtDeadline(deps.runGit);
  const { settings, issue } = readStoreSettings(root);
  const scans = lintFolders(root).map((place) => {
    inTime();
    return scanFolder(place);
  });
  const input: LintInput = {
    store: root,
    folders: scans,
    repos: linkedRepos(scans, runGit, deps.home),
    settings,
    settingsIssue: issue,
    deps: { ...deps, runGit },
    inTime,
  };
  const all = MEMORY_LINT_IDS.flatMap((id) => {
    inTime();
    return PREDICATES[id](input, id);
  });
  const { folders } = opts;
  const findings =
    folders === undefined
      ? all
      : all.filter(
          (finding) =>
            STORE_WIDE_IDS.includes(finding.id) ||
            folders.includes(finding.folder),
        );
  return { findings, counts: countById(findings) };
}
