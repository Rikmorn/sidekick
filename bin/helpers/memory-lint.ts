/**
 * The memory store's lint: one predicate per check id, each returning the
 * findings that contradict it, run over every repo and family folder. It
 * reads the store and never writes to it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { type MemoryFile, parseMemoryText } from './memory-files.js';
import { linksIn, reachFrom } from './memory-links.js';
import { headingAs, NEXT_HEADING, STATE_HEADING } from './memory-sections.js';
import { fitWorkstream } from './memory-start-render.js';
import { findMarkers } from './memory-store.js';
import {
  readStoreSettings,
  STORE_SETTINGS_FILE,
  type StoreSettings,
} from './memory-store-settings.js';
import { listWorkstreams } from './memory-view.js';
import type { Runner } from './pm-data.js';

/** The single source of check ids; `lintStore` runs one predicate per id, in this order. */
export const MEMORY_LINT_IDS = [
  'dead-link',
  'unindexed',
  'index-over-cap',
  'index-line-long',
  'workstream-cut',
  'workstream-dropped',
  'settings-invalid',
  'unreadable',
] as const;
export type MemoryLintId = (typeof MEMORY_LINT_IDS)[number];

/** Ids whose findings belong to no folder: their `folder` is `''`, and every `folders` run keeps them. */
export const STORE_WIDE_IDS: readonly MemoryLintId[] = ['settings-invalid'];

/**
 * One defect. `folder` is the store-relative folder with `/` separators
 * (`sidekick`, `family/repo`, `family`), or `''` for a store-wide finding.
 * `file` is absolute, under the store's real path.
 */
export interface MemoryFinding {
  id: MemoryLintId;
  folder: string;
  file: string;
  line?: number;
  message: string;
}

/** What the lint reads beyond the store's files. */
export interface LintDeps {
  /** Reads a `## ` section, heading included; injected so the lint stays clear of hook.ts. */
  readSection: (file: string, heading: string) => string | undefined;
  runGit: Runner;
  home: string;
  env: NodeJS.ProcessEnv;
  now: () => number;
}

/** The findings, and how many there are of each id that has any. */
export interface MemoryLintResult {
  findings: MemoryFinding[];
  counts: Partial<Record<MemoryLintId, number>>;
}

const INDEX_FILE = 'MEMORY.md';
// Claude Code loads the first 200 lines or 25 KB of a MEMORY.md, whichever
// comes first (docs/research/memory/2026-10-30-claude-code-mechanisms.md:58).
const LOAD_LIMIT_LINES = 200;
const LOAD_LIMIT_BYTES = 25 * 1024;

// --- Folders and their own files ---

type LintFolder =
  | { kind: 'repo'; folder: string; dir: string; root: string }
  | { kind: 'family'; folder: string; dir: string };

interface OwnFile {
  name: string;
  file: string;
  text: string;
}

// A folder with its own `.md` files read. `reached` holds the names links
// reach from MEMORY.md; `reachComplete` is false when an unreadable file
// stood on the way, so what lies past it is unknown.
type FolderScan = LintFolder & {
  names: readonly string[];
  files: readonly OwnFile[];
  unreadable: ReadonlyArray<{ file: string; why: string }>;
  reached: ReadonlySet<string>;
  reachComplete: boolean;
};

// Realpath where the store exists, else lexical, as repoView resolves it.
function realStore(store: string): string {
  const lexical = path.resolve(store);
  try {
    return fs.realpathSync(lexical);
  } catch {
    return lexical;
  }
}

function storeRelative(store: string, dir: string): string {
  return path.relative(store, dir).split(path.sep).join('/');
}

// Repo folders from their markers; a family folder is the parent of a two-level marker.
function lintFolders(store: string): LintFolder[] {
  const markers = findMarkers(store);
  const repos = markers.map(
    (found): LintFolder => ({
      kind: 'repo',
      folder: storeRelative(store, found.folder),
      dir: found.folder,
      root: found.root,
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

function errorCode(error: unknown): string {
  if (error instanceof Error && 'code' in error) return String(error.code);
  return error instanceof Error ? error.message : String(error);
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

function scanFolder(place: LintFolder): FolderScan {
  const listing = ownNames(place.dir);
  const names = 'names' in listing ? listing.names : [];
  const reads = names.map((name) => readOwn(place.dir, name));
  const files = reads.flatMap((read) =>
    read.kind === 'read' ? [read.own] : [],
  );
  const failed = reads.flatMap((read) =>
    read.kind === 'unreadable' ? [read] : [],
  );
  const blocked = new Set(failed.map((read) => path.basename(read.file)));
  const starts = names.includes(INDEX_FILE) ? [INDEX_FILE] : [];
  const reached = reachFrom(place.dir, files, starts);
  return {
    ...place,
    names,
    files,
    unreadable: [
      ...('why' in listing ? [{ file: place.dir, why: listing.why }] : []),
      ...failed,
    ],
    reached,
    reachComplete: [...reached].every((name) => !blocked.has(name)),
  };
}

// --- Predicates ---

interface LintInput {
  store: string;
  folders: readonly FolderScan[];
  settings: StoreSettings;
  settingsIssue: string | undefined;
  deps: LintDeps;
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
    input.folders.flatMap((scan) =>
      check(scan, input).map((hit) => ({ id, folder: scan.folder, ...hit })),
    );
}

const count = (n: number) => n.toLocaleString('en-US');

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
          message: `links to ${link.target}, which does not exist`,
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

// Reads the sections as the hook does, so the cut decision is the hook's own.
function cutWorkstreams(scan: FolderScan, input: LintInput): Hit[] {
  const { readSection } = input.deps;
  return listWorkstreams(scan.dir, undefined).flatMap((stream) => {
    const file = stream.path;
    const state = readSection(file, headingAs(file, STATE_HEADING).trimEnd());
    const next = readSection(file, headingAs(file, NEXT_HEADING).trimEnd());
    const clauses = cutClauses(fitWorkstream(state, next, file));
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
      : `its status is "${status}", not open or closed`;
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

function settingsInvalid(input: LintInput, id: MemoryLintId): MemoryFinding[] {
  if (input.settingsIssue === undefined) return [];
  return [
    {
      id,
      folder: '',
      file: path.join(input.store, STORE_SETTINGS_FILE),
      message: `${input.settingsIssue}; defaults apply`,
    },
  ];
}

function unreadableFiles(scan: FolderScan): Hit[] {
  return scan.unreadable.map((entry) => ({
    file: entry.file,
    message: `cannot be read (${entry.why}), so the lint skipped it`,
  }));
}

// Typed by the id union, so a new id without a predicate fails the type check.
const PREDICATES: Record<MemoryLintId, Predicate> = {
  'dead-link': perFolder(deadLinks),
  unindexed: perFolder(unindexedFiles),
  'index-over-cap': perFolder(indexOverCap),
  'index-line-long': perFolder(longIndexLines),
  'workstream-cut': perFolder(cutWorkstreams),
  'workstream-dropped': perFolder(droppedWorkstreams),
  'settings-invalid': settingsInvalid,
  unreadable: perFolder(unreadableFiles),
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

/**
 * Lints the whole store: every repo folder and family folder, and the
 * store's settings. With `folders`, the findings keep only those folders
 * (store-relative, as `MemoryFinding.folder` names them) and the store-wide
 * ids. The store resolves to its real path, so `file` matches the paths the
 * memory hook prints.
 */
export function lintStore(
  store: string,
  deps: LintDeps,
  opts: { folders?: readonly string[] } = {},
): MemoryLintResult {
  const root = realStore(store);
  const { settings, issue } = readStoreSettings(root);
  const input: LintInput = {
    store: root,
    folders: lintFolders(root).map(scanFolder),
    settings,
    settingsIssue: issue,
    deps,
  };
  const all = MEMORY_LINT_IDS.flatMap((id) => PREDICATES[id](input, id));
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
