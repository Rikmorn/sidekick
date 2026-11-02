/**
 * The data that passes between the three stages of `sidekick memory link`:
 * the facts gathering reads, the options planning takes, and the actions
 * applying runs.
 */

import type { SettingsState } from './memory-settings.js';
import type { StoreState } from './memory-store.js';
import type { Job } from './worker-jobs.js';

/** How one file of the default folder compares with the repo folder's copy. */
export type CopyState = 'absent' | 'same' | 'differs' | 'notFile';

/** One file of the default folder, by its slash-separated path inside it. */
export interface DefaultFile {
  rel: string;
  copy: CopyState;
}

/** Claude Code's default memory folder for the repo, as found. */
export type DefaultFolder =
  | { kind: 'absent'; folder: string }
  | {
      kind: 'present';
      folder: string;
      files: DefaultFile[];
      /** Entries `link` will not copy or move, each with its way forward. */
      issues: string[];
    };

/** What sits at the repo folder's path in the store. */
export type TargetState =
  | { kind: 'absent' }
  | { kind: 'notFolder' }
  | { kind: 'empty' }
  | { kind: 'unmarked' }
  | { kind: 'marked'; root: string }
  | { kind: 'invalidMarker'; issue: string };

/** What sits at `<store>/<family>`: no family given, nothing, a family folder, a repo folder, or a file. */
export type FamilyState = 'none' | 'absent' | 'folder' | 'marked' | 'notFolder';

/** The repo folder, and what the store holds around it. */
export interface TargetFacts {
  /** The folder's absolute path, which the key names. */
  folder: string;
  /** The folder relative to the store, slash-separated: `family/name` or `name`. */
  rel: string;
  state: TargetState;
  family: FamilyState;
  /** Other repo folders whose marker names this repo's root. */
  elsewhere: { folder: string; family: string | undefined }[];
  /** Names already taken in `ARCHIVE_DIR`. */
  archives: string[];
  /** Uncommitted store paths that `link` owns, left by an earlier run, or why git could not list them. */
  pending: { paths: string[] } | { issue: string };
}

/** The sessions listed in the repo, or why the listing failed. */
export type SessionFacts =
  | { kind: 'listed'; self: Job | undefined; others: Job[] }
  | { kind: 'failed'; issues: string[] };

/** The facts that need the repo's main checkout. */
export interface RepoFacts {
  kind: 'found';
  root: string;
  settings: SettingsState;
  projectKey: string;
  /** Set when `.claude.json` lists the root but its project folder is absent. */
  keyMissed: { claudeJson: string; projectFolder: string } | undefined;
  defaultFolder: DefaultFolder;
  sessions: SessionFacts;
  /** Undefined when the store or a family or folder name is refused, since the folder is then unknown. */
  target: TargetFacts | undefined;
}

/** Everything `link` reads before it plans. */
export interface LinkFacts {
  /** The store's absolute path. */
  store: string;
  storeState: StoreState;
  /** The store's own files its first commit never took, or why git could not list them. */
  storePending: { paths: string[] } | { issue: string };
  overrideIssue: string | undefined;
  nameIssues: string[];
  repo: RepoFacts | { kind: 'refused'; issue: string };
  /** The user settings file, and whether a `permissions.additionalDirectories` entry covers the store. */
  userSettings: { file: string; covered: boolean };
  /** `YYYY-MM-DD`, for the archive's name. */
  today: string;
}

/** The flags that shape the plan. */
export interface PlanOptions {
  family: string | undefined;
  name: string | undefined;
  force: boolean;
}

/** The store paths `link` owns, which its commit may take. */
export interface OwnedPaths {
  /** The repo folder relative to the store. Its marker is `link`'s. */
  folderRel: string;
  /** The archive folders named `<projectKey>-<date>[-n]` are this repo's, and so is every file in them. */
  projectKey: string;
  /**
   * The default folder. A repo-folder file is one of `link`'s copies when its
   * bytes equal the same path here or in one of this repo's archive folders;
   * a session's later write differs or has no counterpart.
   */
  defaultFolder: string;
}

/** One step of a link, in the order it runs. */
export type LinkAction =
  | { kind: 'createStore'; store: string }
  /** Commits the store's own files after its first commit failed. */
  | { kind: 'finishStore'; store: string; paths: string[] }
  | { kind: 'createFolder'; folder: string }
  | { kind: 'writeMarker'; folder: string; root: string }
  | { kind: 'copyFile'; from: string; to: string }
  | { kind: 'mergeKey'; file: string; value: string; expected: string }
  | {
      kind: 'archiveDefault';
      from: string;
      to: string;
      /** The repo folder, which the report compares the default folder with. */
      copies: string;
      /** The key was already in place, so the folder came back after a link. */
      reappeared: boolean;
    }
  | { kind: 'commit'; store: string; message: string; owned: OwnedPaths };

/** Every refusal that applies, or the actions and the report lines that follow them. */
export type LinkPlan =
  | { kind: 'refused'; refusals: string[] }
  | {
      kind: 'ready';
      root: string;
      target: string;
      actions: LinkAction[];
      notes: string[];
    };
