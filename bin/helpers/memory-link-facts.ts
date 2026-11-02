/**
 * The gathering stage of `sidekick memory link`: every fact the plan needs,
 * read from disk, git, and the session listing before anything is written.
 * Nothing here writes; `git status` runs without its optional index lock.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import { expandHome } from './home-path.js';
import {
  claudeJsonPath,
  defaultMemoryFolder,
  knownRoot,
  overrideIssue,
  projectKey,
} from './memory-default.js';
import { ARCHIVE_DIR } from './memory-link-plan.js';
import type {
  CopyState,
  DefaultFolder,
  FamilyState,
  LinkFacts,
  OwnedPaths,
  RepoFacts,
  SessionFacts,
  TargetFacts,
  TargetState,
} from './memory-link-types.js';
import { sessionsInRepo } from './memory-sessions.js';
import { mainCheckout, settingsState } from './memory-settings.js';
import {
  CREATION_PATHS,
  findMarkers,
  folderNameIssue,
  MARKER_FILE,
  readMarker,
  type StoreState,
  storeRoot,
  storeState,
} from './memory-store.js';
import type { Runner } from './pm-data.js';
import type { ClaudeRunner } from './profile-launch.js';
import { listJobs } from './worker-jobs.js';
import { physical } from './worker-repo.js';

/** The command line's choices for one link. */
export interface LinkOptions {
  repo: string;
  family: string | undefined;
  name: string | undefined;
  force: boolean;
  dryRun: boolean;
}

/** What `link` reads the world through. `today` gives `YYYY-MM-DD`. */
export interface LinkDeps {
  env: NodeJS.ProcessEnv;
  home: string;
  configDir: string;
  runGit: Runner;
  runClaude: ClaudeRunner;
  today: () => string;
}

/** Reads every fact `planLink` needs; writes nothing. */
export function gatherFacts(opts: LinkOptions, deps: LinkDeps): LinkFacts {
  const store = path.resolve(storeRoot(deps.env, deps.home));
  const state = storeState(store, deps.runGit);
  const found = mainCheckout(path.resolve(opts.repo), deps.runGit, deps.home);
  const name =
    opts.name ?? ('root' in found ? path.basename(found.root) : undefined);
  const nameIssues = [opts.family, name].flatMap((n) => {
    const issue = n === undefined ? undefined : folderNameIssue(n);
    return issue === undefined ? [] : [issue];
  });
  const repo =
    'issue' in found
      ? { kind: 'refused' as const, issue: found.issue }
      : repoFacts({
          ...found,
          store,
          state,
          family: opts.family,
          name: name ?? path.basename(found.root),
          namesOk: nameIssues.length === 0,
          deps,
        });
  return {
    store,
    storeState: state,
    storePending:
      state.kind === 'store'
        ? uncommittedCreation(store, deps.runGit)
        : { paths: [] },
    overrideIssue: overrideIssue(deps.env),
    nameIssues,
    repo,
    userSettings: userSettingsFacts(deps.configDir, store, deps.home),
    today: deps.today(),
  };
}

interface RepoInput {
  root: string;
  checkouts: string[];
  store: string;
  state: StoreState;
  family: string | undefined;
  name: string;
  namesOk: boolean;
  deps: LinkDeps;
}

function repoFacts(input: RepoInput): RepoFacts {
  const { root, deps } = input;
  const settings = settingsState(root, deps.runGit);
  const key = projectKey(root);
  const rel =
    input.family === undefined ? input.name : `${input.family}/${input.name}`;
  const folder = path.join(input.store, ...rel.split('/'));
  const knowsFolder = input.namesOk && input.state.kind !== 'foreign';
  const defaultFolder = readDefaultFolder(
    defaultMemoryFolder(root, deps.configDir),
    knowsFolder ? folder : undefined,
  );
  const target = knowsFolder
    ? targetFacts({ ...input, folder, rel, key, defaultFolder })
    : undefined;
  return {
    kind: 'found',
    root,
    settings,
    home: deps.home,
    projectKey: key,
    keyMissed: keyMissed(root, key, deps),
    defaultFolder,
    sessions: sessionFacts(input),
    target,
  };
}

function keyMissed(
  root: string,
  key: string,
  deps: LinkDeps,
): RepoFacts['keyMissed'] {
  const claudeJson = claudeJsonPath(deps.env, deps.home);
  const projectFolder = path.join(deps.configDir, 'projects', key);
  const missed = knownRoot(root, claudeJson) && !fs.existsSync(projectFolder);
  return missed ? { claudeJson, projectFolder } : undefined;
}

function sessionFacts(input: RepoInput): SessionFacts {
  const listed = listJobs(input.deps.runClaude, input.root);
  if ('issues' in listed) return { kind: 'failed', issues: listed.issues };
  const selfId = input.deps.env.CLAUDE_CODE_SESSION_ID;
  return {
    kind: 'listed',
    ...sessionsInRepo(listed.jobs, input.checkouts, selfId),
  };
}

interface TargetInput extends RepoInput {
  folder: string;
  rel: string;
  key: string;
  defaultFolder: DefaultFolder;
}

function targetFacts(input: TargetInput): TargetFacts {
  const { store, folder, rel, key, defaultFolder } = input;
  const owned: OwnedPaths = {
    folderRel: rel,
    projectKey: key,
    defaultFolder: defaultFolder.folder,
  };
  return {
    folder,
    rel,
    state: targetState(folder),
    family:
      input.family === undefined
        ? 'none'
        : familyState(path.join(store, input.family)),
    elsewhere: findMarkers(store)
      .filter((m) => m.root === input.root && m.folder !== folder)
      .map((m) => ({ folder: m.folder, family: m.family })),
    archives: archiveNames(store),
    pending:
      input.state.kind === 'store'
        ? ownedChanges(store, owned, input.deps.runGit)
        : { paths: [] },
  };
}

function targetState(folder: string): TargetState {
  const stat = fs.statSync(folder, { throwIfNoEntry: false });
  if (stat === undefined) return { kind: 'absent' };
  if (!stat.isDirectory()) return { kind: 'notFolder' };
  const marker = readMarker(folder);
  if (marker.kind === 'marker') return { kind: 'marked', root: marker.root };
  if (marker.kind === 'invalid') {
    return { kind: 'invalidMarker', issue: marker.issue };
  }
  return fs.readdirSync(folder).length === 0
    ? { kind: 'empty' }
    : { kind: 'unmarked' };
}

function familyState(folder: string): FamilyState {
  const stat = fs.statSync(folder, { throwIfNoEntry: false });
  if (stat === undefined) return 'absent';
  if (!stat.isDirectory()) return 'notFolder';
  return readMarker(folder).kind === 'none' ? 'folder' : 'marked';
}

function archiveNames(store: string): string[] {
  const folder = path.join(store, ...ARCHIVE_DIR.split('/'));
  return fs.existsSync(folder) ? fs.readdirSync(folder) : [];
}

// Equal to `parent`, or under it by whole path segments.
function isInside(dir: string, parent: string): boolean {
  const rel = path.relative(parent, dir);
  return (
    rel === '' ||
    !(rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
  );
}

type Entry = { file: string } | { issue: string };

/**
 * Every file under `root`, as slash-separated paths in sorted order, with an
 * issue for each entry `link` will not copy: a link to a folder or out of
 * `root`, a broken link, or anything that is neither a file nor a folder.
 */
export function walkFolder(root: string): {
  files: string[];
  issues: string[];
} {
  const entries = entriesOf(fs.realpathSync(root), root, '');
  return {
    files: entries.flatMap((e) => ('file' in e ? [e.file] : [])),
    issues: entries.flatMap((e) => ('issue' in e ? [e.issue] : [])),
  };
}

function entriesOf(real: string, root: string, rel: string): Entry[] {
  return fs
    .readdirSync(path.join(root, rel), { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((entry): Entry[] => {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) return entriesOf(real, root, child);
      if (entry.isFile()) return [{ file: child }];
      if (entry.isSymbolicLink()) return [linkEntry(real, root, child)];
      return [
        {
          issue: `${path.join(root, child)} is neither a file nor a folder. Move it out of the default folder by hand, then run link again.`,
        },
      ];
    });
}

// A link counts as the file it names only when that file is inside the folder.
function linkEntry(real: string, root: string, child: string): Entry {
  const full = path.join(root, child);
  const way =
    'Replace it with the file itself, or remove it, then run link again.';
  try {
    const named = fs.realpathSync(full);
    if (isInside(named, real) && fs.statSync(named).isFile()) {
      return { file: child };
    }
    return {
      issue: `${full} is a link to ${named}, which is not a file inside the default folder. ${way}`,
    };
  } catch {
    return { issue: `${full} is a broken link. ${way}` };
  }
}

function readDefaultFolder(
  folder: string,
  target: string | undefined,
): DefaultFolder {
  const stat = fs.lstatSync(folder, { throwIfNoEntry: false });
  if (stat === undefined) return { kind: 'absent', folder };
  if (!stat.isDirectory()) {
    const issue = `${folder} is not a folder, so link cannot copy it. Move it aside by hand, then run link again.`;
    return { kind: 'present', folder, files: [], issues: [issue] };
  }
  const walked = walkFolder(folder);
  const files = walked.files.map((rel) => ({
    rel,
    copy:
      target === undefined
        ? ('absent' as const)
        : copyState(path.join(folder, rel), path.join(target, rel)),
  }));
  return { kind: 'present', folder, files, issues: walked.issues };
}

/** How `from` compares with `to`, by bytes. */
export function copyState(from: string, to: string): CopyState {
  try {
    if (!fs.statSync(to).isFile()) return 'notFile';
  } catch (error) {
    const absent =
      error instanceof Error && 'code' in error && error.code === 'ENOENT';
    return absent ? 'absent' : 'notFile';
  }
  return fs.readFileSync(from).equals(fs.readFileSync(to)) ? 'same' : 'differs';
}

/**
 * The uncommitted or staged store files `link` owns: the repo folder's
 * marker, every file in this repo's archive folders, and each repo-folder
 * file whose bytes equal the same path in the default folder or in one of
 * those archives, which is what a copy is. A deleted path never counts.
 */
export function ownedChanges(
  store: string,
  owned: OwnedPaths,
  runGit: Runner,
): { paths: string[] } | { issue: string } {
  const listed = statusIn(store, [owned.folderRel, ARCHIVE_DIR], runGit);
  if ('issue' in listed) return listed;
  const sources = [
    owned.defaultFolder,
    ...ownArchives(store, owned.projectKey),
  ];
  const isOwned = (p: string): boolean =>
    fs.existsSync(path.join(store, p)) &&
    (isOwnArchivePath(p, owned.projectKey) ||
      isOwnCopy(store, owned.folderRel, sources, p));
  return { paths: listed.entries.map((e) => e.path).filter(isOwned) };
}

// `git status --porcelain` codes: untracked, and added to the index (its first column).
const UNTRACKED = '??';
const ADDED = 'A';

interface StatusEntry {
  status: string;
  path: string;
}

/**
 * The store's own files that its first commit never took, when that commit
 * failed: each of `CREATION_PATHS` on disk that git lists as untracked or
 * added. A committed file edited since is the operator's, so it never counts.
 */
export function uncommittedCreation(
  store: string,
  runGit: Runner,
): { paths: string[] } | { issue: string } {
  const listed = statusIn(store, [...CREATION_PATHS], runGit);
  if ('issue' in listed) return listed;
  const neverCommitted = (e: StatusEntry): boolean =>
    (e.status === UNTRACKED || e.status.startsWith(ADDED)) &&
    fs.existsSync(path.join(store, e.path));
  return { paths: listed.entries.filter(neverCommitted).map((e) => e.path) };
}

// The status of each path under `pathspecs`, read literally and without the index lock.
function statusIn(
  store: string,
  pathspecs: string[],
  runGit: Runner,
): { entries: StatusEntry[] } | { issue: string } {
  const args = [
    '--no-optional-locks',
    '--literal-pathspecs',
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
    '--',
    ...pathspecs,
  ];
  const r = runGit('git', args, store);
  if (r.code !== 0) {
    return { issue: `git status failed in ${store}: ${r.stderr.trim()}` };
  }
  return { entries: porcelainEntries(r.stdout) };
}

// The marker, or a file equal byte for byte to its counterpart in a source.
function isOwnCopy(
  store: string,
  folderRel: string,
  sources: string[],
  p: string,
): boolean {
  const prefix = `${folderRel}/`;
  if (!p.startsWith(prefix)) return false;
  const rel = p.slice(prefix.length);
  if (rel === MARKER_FILE) return true;
  const file = path.join(store, p);
  return sources.some((source) => sameBytes(path.join(source, rel), file));
}

function sameBytes(a: string, b: string): boolean {
  try {
    const bothFiles = fs.statSync(a).isFile() && fs.statSync(b).isFile();
    return bothFiles && fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch {
    // A missing counterpart, or a file where a folder should be: no match.
    return false;
  }
}

function ownArchives(store: string, key: string): string[] {
  const parent = path.join(store, ...ARCHIVE_DIR.split('/'));
  return archiveNames(store)
    .filter((name) => isOwnArchiveName(name, key))
    .map((name) => path.join(parent, name));
}

// `git status -z` gives `XY path` per entry, and a rename's old path as the next entry.
function porcelainEntries(output: string): StatusEntry[] {
  const fields = output.split('\0').filter((field) => field !== '');
  const entries: StatusEntry[] = [];
  for (let i = 0; i < fields.length; i++) {
    const status = fields[i].slice(0, 2);
    entries.push({ status, path: fields[i].slice(3) });
    if (status.includes('R') || status.includes('C')) i++;
  }
  return entries;
}

const ARCHIVE_DATE = /^\d{4}-\d{2}-\d{2}(-\d+)?$/;

const isOwnArchiveName = (entry: string, key: string): boolean =>
  entry.startsWith(`${key}-`) && ARCHIVE_DATE.test(entry.slice(key.length + 1));

function isOwnArchivePath(p: string, key: string): boolean {
  const prefix = `${ARCHIVE_DIR}/`;
  if (!p.startsWith(prefix)) return false;
  const [entry] = p.slice(prefix.length).split('/');
  return isOwnArchiveName(entry, key);
}

const UserSettingsSchema = v.object({
  permissions: v.optional(
    v.object({
      additionalDirectories: v.optional(v.array(v.string()), []),
    }),
    { additionalDirectories: [] },
  ),
});

function additionalDirectories(file: string): string[] {
  try {
    const parsed = v.safeParse(
      UserSettingsSchema,
      JSON.parse(fs.readFileSync(file, 'utf-8')),
    );
    return parsed.success
      ? parsed.output.permissions.additionalDirectories
      : [];
  } catch {
    return [];
  }
}

// A missing or unreadable file covers nothing, so the report asks for the entry.
function userSettingsFacts(
  configDir: string,
  store: string,
  home: string,
): LinkFacts['userSettings'] {
  const file = path.join(configDir, 'settings.json');
  const covered = additionalDirectories(file).some((entry) => {
    const dir = path.resolve(expandHome(entry, home));
    return isInside(store, dir) || isInside(physical(store), physical(dir));
  });
  return { file, covered };
}
