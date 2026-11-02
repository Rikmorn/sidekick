/**
 * The memory store's view of one repo: which folder is its own, the
 * workstreams in that folder and its family folder, and the session records.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { expandHome } from './home-path.js';
import { type MemoryFile, readMemoryFile } from './memory-files.js';
import { mainCheckout, readKey } from './memory-settings.js';
import { findMarkers, storeRoot } from './memory-store.js';
import type { Runner } from './pm-data.js';

const INDEX_FILE = 'MEMORY.md';
const SESSIONS_DIR = 'sessions';
const RECORD_NAME = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/;
const TITLE_LINE = /^# +(.+?)\s*$/m;

export interface ViewDeps {
  env: NodeJS.ProcessEnv;
  home: string;
  runGit: Runner;
}

export type RepoView =
  | { kind: 'none' }
  | {
      kind: 'setting-missing';
      root: string;
      folder: string;
      family: string | undefined;
    }
  | {
      kind: 'linked';
      root: string;
      store: string;
      repoFolder: string;
      repoName: string;
      familyFolder: string | undefined;
    };

// Realpath where the path exists, else lexical; path.resolve drops a trailing slash.
function resolved(target: string): string {
  const lexical = path.resolve(target);
  try {
    return fs.realpathSync(lexical);
  } catch {
    return lexical;
  }
}

function isInside(folder: string, parent: string): boolean {
  const relative = path.relative(parent, folder);
  return (
    relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
  );
}

function linkedView(root: string, store: string, key: string): RepoView {
  const repoFolder = resolved(key);
  const parent = path.dirname(repoFolder);
  return {
    kind: 'linked',
    root,
    store,
    repoFolder,
    repoName: path.basename(repoFolder),
    familyFolder: parent === store ? undefined : parent,
  };
}

/**
 * The store's folder for the repo that holds `cwd`. `none` covers outside git,
 * an unlinked repo, and a key outside the store; `setting-missing` is a repo
 * the store knows by marker whose key does not point into the store.
 */
export function repoView(cwd: string, deps: ViewDeps): RepoView {
  const main = mainCheckout(cwd, deps.runGit, deps.home);
  if ('issue' in main) return { kind: 'none' };
  const store = resolved(storeRoot(deps.env, deps.home));
  const rawKey = readKey(cwd, deps.runGit);
  // Claude Code takes an absolute or `~/` path; a relative key never counts as inside the store.
  const key = rawKey === undefined ? undefined : expandHome(rawKey, deps.home);
  if (
    key !== undefined &&
    path.isAbsolute(key) &&
    isInside(resolved(key), store)
  ) {
    return linkedView(main.root, store, key);
  }
  const marker = findMarkers(store).find(
    (found) => resolved(found.root) === main.root,
  );
  return marker === undefined
    ? { kind: 'none' }
    : {
        kind: 'setting-missing',
        root: main.root,
        folder: marker.folder,
        family: marker.family,
      };
}

export interface Workstream {
  name: string;
  description: string;
  status: 'open' | 'closed';
  branches: ReadonlyArray<{ repo: string; branch: string }>;
  path: string;
}

function listDir(folder: string, suffix: string): string[] {
  try {
    return fs
      .readdirSync(folder)
      .filter((entry) => entry.endsWith(suffix))
      .sort();
  } catch {
    return [];
  }
}

function parseBranches(
  raw: string | undefined,
): Array<{ repo: string; branch: string }> {
  return (raw ?? '')
    .split(',')
    .map((pair) => pair.trim())
    .flatMap((pair) => {
      const colon = pair.indexOf(':');
      if (colon <= 0 || colon === pair.length - 1) return [];
      return [{ repo: pair.slice(0, colon), branch: pair.slice(colon + 1) }];
    });
}

function toWorkstream(
  file: string,
  memory: MemoryFile,
): Workstream | undefined {
  const status = memory.metadata.status;
  if (memory.metadata.kind !== 'workstream') return undefined;
  if (memory.name === undefined || memory.name === '') return undefined;
  if (status !== 'open' && status !== 'closed') return undefined;
  return {
    name: memory.name,
    description: memory.description ?? '',
    status,
    branches: parseBranches(memory.metadata.branches),
    path: file,
  };
}

function workstreamsIn(folder: string): Workstream[] {
  return listDir(folder, '.md')
    .filter((entry) => entry !== INDEX_FILE)
    .flatMap((entry) => {
      const file = path.join(folder, entry);
      const memory = readMemoryFile(file);
      const found = memory && toWorkstream(file, memory);
      return found ? [found] : [];
    });
}

/** The workstream files at the top of the repo folder and the family folder, closed ones included. */
export function listWorkstreams(
  repoFolder: string,
  familyFolder: string | undefined,
): Workstream[] {
  return [
    ...workstreamsIn(repoFolder),
    ...(familyFolder === undefined ? [] : workstreamsIn(familyFolder)),
  ];
}

export interface SessionRecord {
  path: string;
  date: string;
  session: string;
  workstream: string | undefined;
  title: string;
}

function modifiedAt(file: string): number {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function toRecord(file: string): SessionRecord | undefined {
  const named = RECORD_NAME.exec(path.basename(file));
  const memory = readMemoryFile(file);
  if (!named || !memory || memory.metadata.kind !== 'session') return undefined;
  const session = memory.metadata.session ?? named[2] ?? '';
  return {
    path: file,
    date: named[1] ?? '',
    session,
    workstream: memory.metadata.workstream,
    title: TITLE_LINE.exec(memory.body)?.[1] ?? session,
  };
}

/** The session records, newest first by the file name's date, then by modification time. */
export function listRecords(repoFolder: string): SessionRecord[] {
  const dir = path.join(repoFolder, SESSIONS_DIR);
  return listDir(dir, '.md')
    .flatMap((entry) => {
      const record = toRecord(path.join(dir, entry));
      return record ? [{ record, mtime: modifiedAt(record.path) }] : [];
    })
    .sort(
      (a, b) => b.record.date.localeCompare(a.record.date) || b.mtime - a.mtime,
    )
    .map((entry) => entry.record);
}

/** The session's existing record, or the path a new one takes when `today` writes it. */
export function recordPath(
  repoFolder: string,
  sessionId: string,
  today: string,
): { path: string; exists: boolean } {
  const dir = path.join(repoFolder, SESSIONS_DIR);
  const existing = listDir(dir, `-${sessionId}.md`).find((entry) =>
    RECORD_NAME.test(entry),
  );
  if (existing !== undefined) {
    return { path: path.join(dir, existing), exists: true };
  }
  return { path: path.join(dir, `${today}-${sessionId}.md`), exists: false };
}
