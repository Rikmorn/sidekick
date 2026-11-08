/**
 * `sidekick memory link`: moves a repo's auto-memory out of Claude Code's
 * default folder into the shared store, and points the repo at it with one
 * settings key. It gathers every fact, plans, and refuses before any write;
 * then it applies the plan in order, or prints it under `--dry-run`. A run
 * that stops part-way is finished by running it again.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  copyState,
  gatherFacts,
  type LinkDeps,
  type LinkOptions,
  ownedChanges,
  walkFolder,
} from './memory-link-facts.js';
import { planLink } from './memory-link-plan.js';
import type { LinkAction, LinkFacts, LinkPlan } from './memory-link-types.js';
import { mergeKey, SETTINGS_KEY } from './memory-settings.js';
import {
  CREATION_MESSAGE,
  commitPaths,
  createStore,
  MARKER_FILE,
  writeMarker,
} from './memory-store.js';
import type { Runner } from './pm-data.js';

export type { LinkDeps, LinkOptions } from './memory-link-facts.js';

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Links `opts.repo` and reports each step on `out`, refusals and failures on
 * `err`. Returns 0 when linked, already linked, or a dry run's plan printed;
 * 1 on a refusal or a failed step.
 */
export function runLink(
  opts: LinkOptions,
  deps: LinkDeps,
  out: (line: string) => void,
  err: (line: string) => void,
): number {
  const gathered = gather(opts, deps);
  if ('issue' in gathered) {
    err(
      `link could not read what it needs, and wrote nothing: ${gathered.issue}`,
    );
    err('Fix that, then run the same command again.');
    return 1;
  }
  const plan = planLink(gathered.facts, opts);
  if (plan.kind === 'refused') {
    err('link refused, and wrote nothing:');
    for (const refusal of plan.refusals) err(`- ${refusal}`);
    return 1;
  }
  const finished = report(plan, opts.dryRun, deps.runGit, { out, err });
  // A failed step may already have set the key, so its notes still apply.
  for (const note of plan.notes) out(note);
  return finished ? 0 : 1;
}

type ReadyPlan = Extract<LinkPlan, { kind: 'ready' }>;

interface Streams {
  out: (line: string) => void;
  err: (line: string) => void;
}

// Says the repo is already linked, prints a dry run's steps, or applies them.
// False when a step failed.
function report(
  plan: ReadyPlan,
  dryRun: boolean,
  runGit: Runner,
  { out, err }: Streams,
): boolean {
  if (plan.actions.length === 0) {
    out(`${plan.root} is already linked to ${plan.target}.`);
    return true;
  }
  if (dryRun) {
    out('Dry run: link writes nothing. These are the steps it would take:');
    for (const action of plan.actions) out(phrase(action).todo);
    return true;
  }
  return applyAll(plan.actions, runGit, out, err);
}

function gather(
  opts: LinkOptions,
  deps: LinkDeps,
): { facts: LinkFacts } | { issue: string } {
  try {
    return { facts: gatherFacts(opts, deps) };
  } catch (error) {
    return { issue: messageOf(error) };
  }
}

// Runs each action in order and stops at the first that fails.
function applyAll(
  actions: LinkAction[],
  runGit: Runner,
  out: (line: string) => void,
  err: (line: string) => void,
): boolean {
  for (const action of actions) {
    const applied = applyAction(action, runGit);
    if (!applied.ok) {
      err(
        `link stopped before it could ${phrase(action).step}: ${applied.issue}`,
      );
      err(
        'Fix that, then run the same command again; it skips each step already done.',
      );
      return false;
    }
    for (const line of applied.lines) out(line);
  }
  return true;
}

/** What one action printed when it ran, or why it failed. */
export type Applied =
  | { ok: true; lines: string[] }
  | { ok: false; issue: string };

/** Runs one action; a thrown error comes back as its issue. */
export function applyAction(action: LinkAction, runGit: Runner): Applied {
  try {
    return runAction(action, runGit);
  } catch (error) {
    return { ok: false, issue: messageOf(error) };
  }
}

function runAction(action: LinkAction, runGit: Runner): Applied {
  const done: Applied = { ok: true, lines: [phrase(action).done] };
  switch (action.kind) {
    case 'createStore': {
      const created = createStore(action.store, runGit);
      return created.ok ? done : created;
    }
    case 'finishStore': {
      const finished = commitPaths(
        action.store,
        action.paths,
        CREATION_MESSAGE,
        runGit,
      );
      return finished.ok ? done : finished;
    }
    case 'createFolder':
      fs.mkdirSync(action.folder, { recursive: true });
      return done;
    case 'writeMarker':
      writeMarker(action.folder, action.root);
      return done;
    case 'copyFile':
      fs.mkdirSync(path.dirname(action.to), { recursive: true });
      fs.copyFileSync(action.from, action.to, fs.constants.COPYFILE_EXCL);
      return done;
    case 'mergeKey': {
      const merged = mergeKey(action.file, action.value, action.expected);
      return merged.ok ? done : merged;
    }
    case 'archiveDefault':
      return archive(action);
    case 'commit':
      return commit(action, runGit);
    default: {
      const unhandled: never = action;
      throw new Error(`Unhandled action: ${JSON.stringify(unhandled)}`);
    }
  }
}

type Archive = Extract<LinkAction, { kind: 'archiveDefault' }>;

// Compares just before the move, so a write since the copy is reported.
function archive(action: Archive): Applied {
  const kept = walkFolder(action.from).files.filter(
    (rel) =>
      copyState(path.join(action.from, rel), path.join(action.copies, rel)) !==
      'same',
  );
  moveFolder(action.from, action.to);
  const listed = kept.map((rel) => `  ${path.join(action.to, rel)}`);
  if (kept.length === 0) return { ok: true, lines: [phrase(action).done] };
  const why = action.reappeared
    ? `The default folder came back after the link. These files in it differ from ${action.copies} or are missing there, so merge what is new by hand:`
    : `These files changed after the copy, so their latest version is kept in the archive only:`;
  return { ok: true, lines: [phrase(action).done, why, ...listed] };
}

/** The filesystem calls `moveFolder` makes; a test may replace any of them. */
export interface FolderMoves {
  rename: (from: string, to: string) => void;
  /** Copies the folder `from` into `to`, an empty folder the move created. */
  copy: (from: string, to: string) => void;
  /** Removes a folder and everything in it. */
  remove: (folder: string) => void;
}

const FS_MOVES: FolderMoves = {
  rename: fs.renameSync,
  copy: (from, to) =>
    fs.cpSync(from, to, {
      recursive: true,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
      preserveTimestamps: true,
    }),
  remove: (folder) => fs.rmSync(folder, { recursive: true }),
};

/**
 * Moves the folder `from` to `to`, creating `to`'s parent. When `rename`
 * fails because the two sit on different filesystems, it creates `to`,
 * copies into it, keeping links as written, then removes `from`. It copies
 * nothing when `to` already exists. A failed copy leaves `from` as it was
 * and removes `to`, which the move created.
 */
export function moveFolder(
  from: string,
  to: string,
  moves: Partial<FolderMoves> = {},
): void {
  const { rename, copy, remove } = { ...FS_MOVES, ...moves };
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    rename(from, to);
  } catch (error) {
    if (!hasCode(error, 'EXDEV')) throw error;
    claim(from, to);
    copyInto(from, to, copy, remove);
    removeSource(from, to, remove);
  }
}

const hasCode = (error: unknown, code: string): boolean =>
  error instanceof Error && 'code' in error && error.code === code;

// Creates `to` and fails when anything is there, so `to` is the move's own.
function claim(from: string, to: string): void {
  try {
    fs.mkdirSync(to);
  } catch (error) {
    const message = hasCode(error, 'EEXIST')
      ? `${to} already exists, so link copied nothing into it and left ${from} intact. A re-run picks another archive name.`
      : `link could not create ${to}, so it copied nothing and left ${from} intact: ${messageOf(error)}`;
    throw new Error(message, { cause: error });
  }
}

// On a failed copy, removes `to`, which `claim` created, and never `from`.
function copyInto(
  from: string,
  to: string,
  copy: FolderMoves['copy'],
  remove: FolderMoves['remove'],
): void {
  try {
    copy(from, to);
  } catch (error) {
    const reason = messageOf(error);
    const failed = `copying across filesystems failed, so link left ${from} intact`;
    const leftover = removalIssue(to, remove);
    const message =
      leftover === undefined
        ? `${failed} and removed its partial copy at ${to}: ${reason}`
        : `${failed}: ${reason}. link could not remove its partial copy either, so delete ${to} by hand: ${leftover}`;
    throw new Error(message, { cause: error });
  }
}

// Removes `folder`; why that failed, or undefined when it did not.
function removalIssue(
  folder: string,
  remove: FolderMoves['remove'],
): string | undefined {
  try {
    remove(folder);
    return undefined;
  } catch (error) {
    return messageOf(error);
  }
}

// The copy is whole by now, so a failure here leaves `from` a partial duplicate.
function removeSource(
  from: string,
  to: string,
  remove: FolderMoves['remove'],
): void {
  try {
    remove(from);
  } catch (error) {
    throw new Error(
      `link copied every file to ${to}, then could not remove ${from}: ${messageOf(error)}. Keep ${to}, which holds them all; a re-run moves what is left of ${from} beside it.`,
      { cause: error },
    );
  }
}

type Commit = Extract<LinkAction, { kind: 'commit' }>;

function commit(action: Commit, runGit: Runner): Applied {
  const changes = ownedChanges(action.store, action.owned, runGit);
  if ('issue' in changes) return { ok: false, issue: changes.issue };
  if (changes.paths.length === 0) {
    return {
      ok: true,
      lines: ["The store holds nothing of link's left to commit."],
    };
  }
  const committed = commitPaths(
    action.store,
    changes.paths,
    action.message,
    runGit,
  );
  return committed.ok ? { ok: true, lines: [phrase(action).done] } : committed;
}

interface Phrase {
  done: string;
  todo: string;
  step: string;
}

// One action in the three forms the report uses: done, planned, and as a step.
function phrase(action: LinkAction): Phrase {
  const forms = (done: string, todo: string, rest: string): Phrase => ({
    done: `${done} ${rest}`,
    todo: `Would ${todo} ${rest}`,
    step: `${todo} ${rest}`,
  });
  switch (action.kind) {
    case 'createStore':
      return forms('Created', 'create', `the store at ${action.store}`);
    case 'finishStore':
      return forms(
        'Committed',
        'commit',
        `the store's own files, which its first commit missed, as "${CREATION_MESSAGE}": ${action.paths.join(', ')}`,
      );
    case 'createFolder':
      return forms('Created', 'create', action.folder);
    case 'writeMarker':
      return forms(
        'Wrote',
        'write',
        `${path.join(action.folder, MARKER_FILE)}, naming ${action.root}`,
      );
    case 'copyFile':
      return forms('Copied', 'copy', `${action.from} to ${action.to}`);
    case 'mergeKey':
      return forms(
        'Set',
        'set',
        `${SETTINGS_KEY} to ${action.value} in ${action.file}`,
      );
    case 'archiveDefault':
      return forms('Moved', 'move', `${action.from} to ${action.to}`);
    case 'commit':
      return forms(
        'Committed',
        'commit',
        `link's paths in the store as "${action.message}"`,
      );
    default: {
      const unhandled: never = action;
      throw new Error(`Unhandled action: ${JSON.stringify(unhandled)}`);
    }
  }
}
