/**
 * The memory store's layout: where it lives, how a repo's folder is marked,
 * how the markers are found, and how the store is created and committed.
 * The store is a git repo that holds families, repo folders, `sources/`, and
 * `archive/`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import type { Runner } from './pm-data.js';

/** Top-level names the store keeps for itself; no family or repo folder takes one. */
export const RESERVED_NAMES: readonly string[] = ['sources', 'archive'];

/** The file that makes a folder a repo folder. */
export const MARKER_FILE = '.sidekick.json';

const README_FILE = 'README.md';
const KEEP_FILE = '.gitkeep';
const IGNORE_FILE = '.gitignore';
// The file Finder writes in each folder it opens, which the store ignores.
const FINDER_FILE = '.DS_Store';
const IGNORE_CONTENT = `${FINDER_FILE}\n`;
const GIT_FOLDER = '.git';

/** The store's own files, which its first commit takes. */
export const CREATION_PATHS: readonly string[] = [
  README_FILE,
  IGNORE_FILE,
  ...RESERVED_NAMES.map((name) => `${name}/${KEEP_FILE}`),
];

// The folders that hold a creation path, slash-separated.
const CREATION_FOLDERS: ReadonlySet<string> = new Set(
  CREATION_PATHS.filter((rel) => rel.includes('/')).map((rel) =>
    path.posix.dirname(rel),
  ),
);

/** The message of the store's first commit. */
export const CREATION_MESSAGE = 'chore: create the memory store';

/** The store folder: `SIDEKICK_MEMORY_STORE` when set and non-empty, else `<home>/sk-memory-store`. */
export function storeRoot(env: NodeJS.ProcessEnv, home: string): string {
  const override = env.SIDEKICK_MEMORY_STORE;
  return override !== undefined && override !== ''
    ? override
    : path.join(home, 'sk-memory-store');
}

/** Why `name` cannot be a family or repo folder, or `undefined` when it can. */
export function folderNameIssue(name: string): string | undefined {
  if (name === '') return 'a folder name cannot be empty';
  if (name.includes('/') || name.includes('\\')) {
    return `"${name}" holds a path separator`;
  }
  if (name.startsWith('.')) return `"${name}" cannot start with "."`;
  if (RESERVED_NAMES.includes(name)) {
    return `"${name}" is a reserved name (${RESERVED_NAMES.join(', ')})`;
  }
  return undefined;
}

/** The marker's content: the main checkout's real root. */
export const MarkerSchema = v.object({ root: v.string() });
export type Marker = v.InferOutput<typeof MarkerSchema>;

export type MarkerRead =
  | { kind: 'none' }
  | { kind: 'marker'; root: string }
  | { kind: 'invalid'; issue: string };

/** Reads `<folder>/.sidekick.json`; a file that is not JSON of the marker's shape is `invalid`. */
export function readMarker(folder: string): MarkerRead {
  const file = path.join(folder, MARKER_FILE);
  if (!fs.existsSync(file)) return { kind: 'none' };
  try {
    const parsed = v.safeParse(
      MarkerSchema,
      JSON.parse(fs.readFileSync(file, 'utf-8')),
    );
    if (parsed.success) return { kind: 'marker', root: parsed.output.root };
    return { kind: 'invalid', issue: `${file} must be {"root": "<path>"}` };
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return { kind: 'invalid', issue: `${file} is not readable JSON: ${why}` };
  }
}

/** Writes `<folder>/.sidekick.json` naming `root`. */
export function writeMarker(folder: string, root: string): void {
  const marker: Marker = { root };
  fs.writeFileSync(
    path.join(folder, MARKER_FILE),
    `${JSON.stringify(marker, null, 2)}\n`,
  );
}

// Folders that can be a repo or family folder: not dot folders, not reserved names.
function children(folder: string): string[] {
  try {
    return fs
      .readdirSync(folder, { withFileTypes: true })
      .filter((e) => e.isDirectory() && folderNameIssue(e.name) === undefined)
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function markerRoot(folder: string): string | undefined {
  const read = readMarker(folder);
  return read.kind === 'marker' ? read.root : undefined;
}

export interface FoundMarker {
  folder: string;
  root: string;
  family: string | undefined;
}

/**
 * Every valid marker one level down (a repo with no family) and two levels
 * down (the parent is the family). A folder with a marker is a repo folder,
 * so the scan does not look inside it.
 */
export function findMarkers(store: string): FoundMarker[] {
  return children(store).flatMap((first): FoundMarker[] => {
    const firstFolder = path.join(store, first);
    const own = markerRoot(firstFolder);
    if (own !== undefined) {
      return [{ folder: firstFolder, root: own, family: undefined }];
    }
    return children(firstFolder).flatMap((second): FoundMarker[] => {
      const folder = path.join(firstFolder, second);
      const root = markerRoot(folder);
      return root === undefined ? [] : [{ folder, root, family: first }];
    });
  });
}

export type StoreState =
  | { kind: 'absent' }
  | { kind: 'empty' }
  /** What `createStore` leaves when it stops part-way, which it can finish. */
  | { kind: 'unfinished' }
  /** A stopped creation beside paths `createStore` did not write; `issue` names them and the way forward. */
  | { kind: 'cluttered'; issue: string }
  | { kind: 'store' }
  | { kind: 'foreign'; issue: string };

/** Whether `link` refuses the store folder as it stands. */
export const refusesStore = (state: StoreState): boolean =>
  state.kind === 'foreign' || state.kind === 'cluttered';

function realPath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

// True when `store` is itself a git work tree's top.
export function isWorkTreeTop(store: string, runGit: Runner): boolean {
  const top = runGit('git', ['rev-parse', '--show-toplevel'], store);
  return top.code === 0 && realPath(top.stdout.trim()) === realPath(store);
}

/**
 * What `store` is: absent, an empty folder, unfinished, cluttered, a store (a
 * git work tree whose top is `store` and which holds `README.md`), or foreign
 * (a file, or a non-empty folder that is none of these). Unfinished and
 * cluttered are a `git init` that nothing has committed to, as `createStore`
 * leaves it when it stops part-way.
 */
export function storeState(store: string, runGit: Runner): StoreState {
  if (!fs.existsSync(store)) return { kind: 'absent' };
  if (!fs.statSync(store).isDirectory()) {
    return { kind: 'foreign', issue: `${store} is a file, not a store folder` };
  }
  if (fs.readdirSync(store).length === 0) return { kind: 'empty' };
  const top = isWorkTreeTop(store, runGit);
  const stopped = top ? stoppedCreation(store, runGit) : undefined;
  if (stopped !== undefined) return stopped;
  return top && hasReadme(store) ? { kind: 'store' } : notAStore(store);
}

const hasReadme = (store: string): boolean =>
  fs.existsSync(path.join(store, README_FILE));

const notAStore = (store: string): StoreState => ({
  kind: 'foreign',
  issue: `${store} holds files but is not a sidekick store (a git repo with a ${README_FILE})`,
});

// A repo with no commit whose `.git` is a plain folder, as `createStore`
// leaves it when it stops part-way: unfinished when nothing but its paths
// sits beside `.git`, cluttered when the README sits there with other paths,
// and foreign otherwise. Undefined for any other repo.
function stoppedCreation(
  store: string,
  runGit: Runner,
): StoreState | undefined {
  const dotGit = fs.lstatSync(path.join(store, GIT_FOLDER), {
    throwIfNoEntry: false,
  });
  if (dotGit?.isDirectory() !== true) return undefined;
  const index = uncommittedIndex(store, runGit);
  if (index === undefined) return undefined;
  const staged = index.filter((rel) => !CREATION_PATHS.includes(rel));
  if (staged.length > 0) {
    return {
      kind: 'foreign',
      issue: `${store} is a git repo with no commit, and its index holds ${staged.join(', ')}, which link did not stage`,
    };
  }
  const others = othersIn(store, '');
  if (others.length === 0) return { kind: 'unfinished' };
  if (!hasReadme(store)) return notAStore(store);
  return {
    kind: 'cluttered',
    issue: `${store} is a store whose creation stopped part-way, and it also holds ${others.join(', ')}, which link did not write. Move them out of ${store}, then run link again to finish the store.`,
  };
}

// Each path under `store` that `createStore` did not write, sorted, with a
// folder as `name/`. Neither `.git`, `CREATION_PATHS`, the plain folders that
// hold them, nor a `.DS_Store` file counts. A link is neither file nor folder.
function othersIn(store: string, rel: string): string[] {
  return fs
    .readdirSync(path.join(store, rel), { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((entry) => {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
      const ownFile =
        entry.name === FINDER_FILE || CREATION_PATHS.includes(child);
      if (entry.isFile() && ownFile) return [];
      if (!entry.isDirectory()) return [child];
      if (child === GIT_FOLDER) return [];
      return CREATION_FOLDERS.has(child)
        ? othersIn(store, child)
        : [`${child}/`];
    });
}

// `git rev-parse --verify --quiet` exits 1 when the name is no commit.
const NOT_A_COMMIT = 1;

// The paths in the index of a repo that no ref or HEAD gives a commit, as
// `git init` and a failed first commit leave it. Undefined when one does, or
// when git fails.
function uncommittedIndex(store: string, runGit: Runner): string[] | undefined {
  const git = (...args: string[]) =>
    runGit('git', ['--no-optional-locks', ...args], store);
  const head = git('rev-parse', '--verify', '--quiet', 'HEAD');
  if (head.code !== NOT_A_COMMIT) return undefined;
  const refs = git('for-each-ref', '--count=1');
  if (refs.code !== 0 || refs.stdout !== '') return undefined;
  const index = git('ls-files', '-z');
  if (index.code !== 0) return undefined;
  return index.stdout.split('\0').filter((rel) => rel !== '');
}

export type Outcome = { ok: true } | { ok: false; issue: string };

function gitIssue(
  args: string[],
  r: { stderr: string; stdout: string },
): string {
  const detail = r.stderr.trim() || r.stdout.trim() || 'no output';
  return `git ${args[0]} failed: ${detail}`;
}

/**
 * Commits only `paths`, so another session's uncommitted writes stay
 * uncommitted: `git add -- paths`, then `git commit -m message -- paths`.
 * Each path is literal, never a glob, so `a[1].md` does not take `a1.md`.
 */
export function commitPaths(
  store: string,
  paths: string[],
  message: string,
  runGit: Runner,
): Outcome {
  const steps = [
    ['add', '--', ...paths],
    ['commit', '-m', message, '--', ...paths],
  ];
  for (const args of steps) {
    const r = runGit('git', ['--literal-pathspecs', ...args], store);
    if (r.code !== 0) return { ok: false, issue: gitIssue(args, r) };
  }
  return { ok: true };
}

/**
 * Creates the store in an absent or empty folder: `git init`, the README,
 * `.gitignore`, `sources/.gitkeep`, `archive/.gitkeep`, then one commit of
 * exactly those paths. In an unfinished folder, which an earlier call left
 * when it stopped part-way, it writes only the paths still missing, keeps
 * each one there as it is, and makes that commit. Any other folder, or a
 * file, refuses and is left as it was.
 */
export function createStore(
  store: string,
  runGit: Runner,
): { ok: true; paths: string[] } | { ok: false; issue: string } {
  const state = storeState(store, runGit);
  if (state.kind === 'foreign' || state.kind === 'cluttered') {
    return { ok: false, issue: state.issue };
  }
  if (state.kind === 'store') {
    return { ok: false, issue: `${store} is already a store` };
  }
  if (state.kind !== 'unfinished') {
    fs.mkdirSync(store, { recursive: true });
    const init = runGit('git', ['init'], store);
    if (init.code !== 0) return { ok: false, issue: gitIssue(['init'], init) };
  }
  const paths = [...CREATION_PATHS];
  for (const rel of paths) writeIfAbsent(store, rel);
  const committed = commitPaths(store, paths, CREATION_MESSAGE, runGit);
  return committed.ok ? { ok: true, paths } : committed;
}

// What `createStore` writes at each of `CREATION_PATHS`.
function creationContent(rel: string): string {
  if (rel === README_FILE) return STORE_README;
  if (rel === IGNORE_FILE) return IGNORE_CONTENT;
  return '';
}

// A plain file already at `rel` stays; anything else there fails the write.
function writeIfAbsent(store: string, rel: string): void {
  const file = path.join(store, ...rel.split('/'));
  if (fs.lstatSync(file, { throwIfNoEntry: false })?.isFile() === true) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, creationContent(rel), { flag: 'wx' });
}

/** The README written once, when the store is created. */
export const STORE_README = `# Memory store

This folder is a git repo that holds the auto-memory of several repos. A repo's \`.claude/settings.local.json\` points Claude Code at one folder here through its \`autoMemoryDirectory\` key.

## Layout

- A family folder groups related repos. It holds the repo folders and the family's own files: \`MEMORY.md\` (the family index), the workstreams that span repos, the support file, and the script catalogue.
- A repo folder holds one repo's memory. A repo with no family sits at the top level.
- \`sessions/\` inside a repo folder holds one record per session. Claude Code's auto-dream reviews that folder.
- A session record is \`sessions/<YYYY-MM-DD>-<session id>.md\`. Its front matter keeps \`metadata.kind\` (\`session\`), \`metadata.session\` (the session id), and \`metadata.workstream\` (the workstream's name, absent when the session served none).
- A session record's sections are \`## Done, ## Decisions, ## Findings, ## Next steps, ## Where each item went\`.
- A workstream file is \`<name>.md\` in a repo folder, or in the family folder when it spans repos. Its front matter keeps \`metadata.kind\` (\`workstream\`), \`metadata.status\` (\`open\` or \`closed\`), and \`metadata.branches\`.
- A workstream file's sections are \`## State, ## Next steps, ## Key files, ## Context\`.
- \`metadata.branches\` is one string of \`<repo>:<branch>\` pairs joined by \`, \`, with the repo folder's name as \`<repo>\`.
- Each session start commits the store's changes as "memory: snapshot at <source> of session <id>", with a \`Session:\` trailer.
- \`.gitignore\` keeps \`.DS_Store\` out of those commits.
- \`settings.json\` is optional. Its keys are \`indexLineCap\` (the lines a \`MEMORY.md\` may hold, unset by default) and \`indexLineLength\` (the characters an index line may hold, 300 by default), both positive integers that \`sidekick memory lint\` checks.
- \`sources/\` holds reference material that is not memory.
- \`archive/\` holds retired memory, such as a repo's old default memory folder after it moved here.

## The marker

A repo folder holds \`.sidekick.json\`, which names the repo's main checkout as \`{"root": "<path>"}\`. A folder with a marker is a repo folder. A top-level folder without one is a family, or a reserved area.

## Reserved names

\`sources\` and \`archive\` belong to the store. No family or repo folder takes either name, a name that starts with ".", or a name with a path separator.

## Changes by hand

- **Unlink a repo.** Remove the \`autoMemoryDirectory\` entry from the repo's \`.claude/settings.local.json\`, in its main checkout. Claude Code then uses its default memory folder again. The repo folder here stays until you delete it.
- **Move a repo between families.** Move its folder to the new family folder with \`mv\`, then set \`autoMemoryDirectory\` in the repo's \`.claude/settings.local.json\` to the new path. Close the repo's sessions first, since a running session keeps writing to the old path.
- **Move the store.** Move this folder, then update \`autoMemoryDirectory\` in every linked repo's \`.claude/settings.local.json\`. Each marker holds the repo's root rather than the store's path, so markers stay as they are. Set \`SIDEKICK_MEMORY_STORE\` to the new path if you keep the store anywhere other than \`~/sk-memory-store\`.

## Settings that affect auto-memory

With \`blockReadsOutsideWorkingDirectories\` turned on, Claude Code may switch auto-memory off in a linked repo when it judges the local settings file tracked. Leave the setting off in \`~/.claude/settings.json\`.

## Searches

Leave \`archive/\` out of searches. It holds retired memory that no longer describes the repos.

## Rules for sessions

The user-level rule \`sk-memory.md\` says what a session writes here and what it only reads.
`;
