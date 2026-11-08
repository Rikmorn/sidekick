/**
 * The planning stage of `sidekick memory link`. The facts gathered from disk,
 * git, and the session listing go in. Out comes every refusal that applies,
 * or the actions in expand-and-contract order: fill the store folder, set the
 * key, then archive the default folder. Nothing here reads or writes disk, so
 * a refusal is settled before any write.
 */

import * as path from 'node:path';
import { expandHome } from './home-path.js';
import type {
  DefaultFile,
  LinkAction,
  LinkFacts,
  LinkPlan,
  OwnedPaths,
  PlanOptions,
  RepoFacts,
  SessionFacts,
  TargetFacts,
} from './memory-link-types.js';
import {
  SETTINGS_KEY,
  type SettingsState,
  supportRequest,
} from './memory-settings.js';
import { MARKER_FILE, refusesStore, type StoreState } from './memory-store.js';
import { shellArg } from './shell.js';
import { type Job, LISTING } from './worker-jobs.js';

/** Where `link` moves default folders, relative to the store. */
export const ARCHIVE_DIR = 'archive/default-folders';

type ReadySettings = Extract<SettingsState, { kind: 'ready' }>;

// The facts narrowed to a repo `link` can plan for.
interface Ready {
  repo: RepoFacts;
  settings: ReadySettings;
  target: TargetFacts;
  pending: string[];
  storePending: string[];
}

/** Turns the facts into every refusal that applies, or the actions to take. */
export function planLink(facts: LinkFacts, opts: PlanOptions): LinkPlan {
  const refusals = refusalsOf(facts, opts);
  const ready = readyOf(facts);
  if (refusals.length > 0 || ready === undefined) {
    return { kind: 'refused', refusals };
  }
  const actions = actionsOf(ready, facts);
  return {
    kind: 'ready',
    root: ready.repo.root,
    target: ready.target.folder,
    actions,
    notes: notesOf(ready, facts, actions),
  };
}

// Undefined exactly when `refusalsOf` reports the store, the checkout, the
// settings, a name, or either list of pending paths.
function readyOf(facts: LinkFacts): Ready | undefined {
  const { repo, storePending } = facts;
  if (refusesStore(facts.storeState) || repo.kind === 'refused') {
    return undefined;
  }
  const { settings, target } = repo;
  if (settings.kind !== 'ready' || target === undefined) return undefined;
  if ('issue' in target.pending || 'issue' in storePending) return undefined;
  return {
    repo,
    settings,
    target,
    pending: target.pending.paths,
    storePending: storePending.paths,
  };
}

/**
 * A command that runs `link` again on `root` with these names and extra flags,
 * safe to paste. It ends in `--dry-run` exactly when `dryRun` is set, so a
 * command copied from a dry run stays one.
 */
export function linkCommand(
  root: string,
  opts: {
    family: string | undefined;
    name: string | undefined;
    dryRun: boolean;
  },
  extra = '',
): string {
  const names = opts;
  const flags = [
    names.family === undefined ? '' : ` --family ${shellArg(names.family)}`,
    names.name === undefined ? '' : ` --name ${shellArg(names.name)}`,
    extra === '' ? '' : ` ${extra}`,
    opts.dryRun ? ' --dry-run' : '',
  ];
  return `sidekick memory link ${shellArg(root)}${flags.join('')}`;
}

// The folder a key names; Claude Code also takes a key written as `~/…`.
const keyFolder = (
  key: string | undefined,
  home: string,
): string | undefined =>
  key === undefined ? undefined : expandHome(key, home);

// A key in place means the first link is done: copies are over. The key is in
// place only when it names the folder and the folder's marker names this root,
// since only the marker proves link set the key. An unknown folder counts as a
// first link, so its refusals are all reported.
function isFirstLink(repo: RepoFacts): boolean {
  const { settings, target } = repo;
  const keyInPlace =
    settings.kind === 'ready' &&
    target !== undefined &&
    keyFolder(settings.key, repo.home) === target.folder &&
    target.state.kind === 'marked' &&
    target.state.root === repo.root;
  return !keyInPlace;
}

// A run strands open sessions when it sets the key or moves the default folder.
function strands(repo: RepoFacts): boolean {
  return isFirstLink(repo) || repo.defaultFolder.kind === 'present';
}

// Each refusal once: both pending lists come from one store, so a failed
// `git status` reads the same for each.
function refusalsOf(facts: LinkFacts, opts: PlanOptions): string[] {
  const { repo } = facts;
  const all = [
    ...storeRefusals(facts.storeState),
    ...('issue' in facts.storePending
      ? [pendingRefusal(facts.storePending.issue)]
      : []),
    ...(facts.overrideIssue === undefined ? [] : [facts.overrideIssue]),
    ...facts.nameIssues.map(
      (issue) => `${issue}; choose another with --family or --name.`,
    ),
    ...(repo.kind === 'refused' ? [repo.issue] : repoRefusals(repo, opts)),
  ];
  return [...new Set(all)];
}

const pendingRefusal = (issue: string): string =>
  `${issue}. Fix the store's git repo, then run link again.`;

// A refused store's issue carries its own way forward.
function storeRefusals(state: StoreState): string[] {
  return state.kind === 'cluttered' || state.kind === 'foreign'
    ? [state.issue]
    : [];
}

function repoRefusals(repo: RepoFacts, opts: PlanOptions): string[] {
  return [
    ...settingsRefusals(repo),
    ...keyMissedRefusals(repo),
    ...defaultFolderRefusals(repo),
    ...sessionRefusals(repo, opts),
    ...(repo.target === undefined
      ? []
      : targetRefusals(repo.target, repo.root, opts.dryRun)),
  ];
}

function settingsRefusals(repo: RepoFacts): string[] {
  const { settings, target } = repo;
  if (settings.kind === 'refused') return [settings.issue];
  const ownOrAbsent =
    settings.key === undefined ||
    keyFolder(settings.key, repo.home) === target?.folder;
  if (ownOrAbsent || target === undefined) return [];
  return [
    `${settings.file} already sets ${SETTINGS_KEY} to ${settings.key}, not ${target.folder}, and sidekick changes only a key it wrote. If that folder is in the store, run link with the --family and --name that name it. Otherwise remove the entry by hand, as the store's README says under Changes by hand.`,
  ];
}

// Only a first link needs the default folder's place; once the key is in
// place, the emptied project folder may be gone.
function keyMissedRefusals(repo: RepoFacts): string[] {
  if (repo.keyMissed === undefined || !isFirstLink(repo)) return [];
  const { claudeJson, projectFolder } = repo.keyMissed;
  return [
    `${claudeJson} lists ${repo.root}, but ${projectFolder} is absent, so Claude Code names its project folders by a rule link does not know. Its folder is somewhere under ${path.dirname(projectFolder)}. To ask for support, run: ${supportRequest(
      'memory link: a project folder named by a rule link does not know',
      'sidekick memory link found no project folder where it computes one, for a repo that .claude.json lists.',
    )}`,
  ];
}

function defaultFolderRefusals(repo: RepoFacts): string[] {
  const { defaultFolder } = repo;
  if (defaultFolder.kind === 'absent') return [];
  if (!isFirstLink(repo)) return defaultFolder.issues;
  const forged = defaultFolder.files.some((f) => f.rel === MARKER_FILE)
    ? [
        `${path.join(defaultFolder.folder, MARKER_FILE)} would become the repo folder's marker if copied. Move it out of the default folder by hand and run link again.`,
      ]
    : [];
  const into = repo.target?.folder;
  const conflicts =
    into === undefined
      ? []
      : defaultFolder.files.flatMap((f) =>
          copyRefusals(defaultFolder.folder, into, f),
        );
  return [...defaultFolder.issues, ...forged, ...conflicts];
}

function copyRefusals(from: string, into: string, file: DefaultFile): string[] {
  if (file.rel === MARKER_FILE) return [];
  const source = path.join(from, file.rel);
  const copy = path.join(into, file.rel);
  if (file.copy === 'differs') {
    return [
      `${source} differs from ${copy}, which is already in the store. Merge the two by hand into the store copy, then run link again.`,
    ];
  }
  if (file.copy === 'notFile') {
    return [
      `${copy} is in the way of ${source}, since it is not a file. Move it by hand and run link again.`,
    ];
  }
  return [];
}

const describeJob = (job: Job): string =>
  `${job.name ?? job.sessionId ?? job.id ?? 'a session'} in ${job.cwd ?? 'an unknown folder'}`;

function sessionRefusals(repo: RepoFacts, opts: PlanOptions): string[] {
  if (opts.force || !strands(repo)) return [];
  const retry = linkCommand(repo.root, opts, '--force');
  const { sessions } = repo;
  if (sessions.kind === 'failed') {
    return [
      `link cannot tell whether another session is open in the repo: ${sessions.issues.join(' ')} Fix the listing, or run again with --force: ${retry}`,
    ];
  }
  const open =
    sessions.others.length === 0
      ? []
      : [
          `Other sessions are open in the repo: ${sessions.others.map(describeJob).join('; ')}. Each keeps writing to ${repo.defaultFolder.folder} until it restarts. Close them and run link again, or run again with --force: ${retry}`,
        ];
  return [...open, ...unreadableRefusals(sessions.unreadable, retry)];
}

// The listing ran, but a row's pid is not a number, so only --force gets past it.
function unreadableRefusals(rows: Job[], retry: string): string[] {
  if (rows.length === 0) return [];
  const one = rows.length === 1;
  const which = one ? 'that session is' : 'those sessions are';
  const close = one
    ? 'If it is open, close it.'
    : 'Close each one that is open.';
  return [
    `${LISTING} gives a pid that is not a number for ${rows.map(describeJob).join('; ')}, so link cannot tell whether ${which} open. ${close} Then run again with --force: ${retry}`,
  ];
}

function targetRefusals(
  target: TargetFacts,
  root: string,
  dryRun: boolean,
): string[] {
  return [
    ...targetStateRefusals(target, root),
    ...familyRefusals(target),
    ...target.elsewhere.map(
      (found) =>
        `${root} is already linked at ${found.folder}, as its marker says. Finish that link with: ${linkCommand(
          root,
          {
            family: found.family,
            name: path.basename(found.folder),
            dryRun,
          },
        )}`,
    ),
    ...('issue' in target.pending
      ? [pendingRefusal(target.pending.issue)]
      : []),
  ];
}

function targetStateRefusals(target: TargetFacts, root: string): string[] {
  const { folder, state } = target;
  switch (state.kind) {
    case 'absent':
    case 'empty':
      return [];
    case 'notFolder':
      return [
        `${folder} is a file, not a folder. Choose another folder name with --name.`,
      ];
    case 'unmarked':
      return [
        `${folder} holds files but no ${MARKER_FILE}, so link did not make it for this repo, and it may be a family folder. Choose another folder name with --name.`,
      ];
    case 'invalidMarker':
      return [`${state.issue}. Fix or remove it by hand, then run link again.`];
    case 'marked':
      return state.root === root
        ? []
        : [
            `${folder} belongs to ${state.root}, as its ${MARKER_FILE} says. Choose another folder name with --name.`,
          ];
    default: {
      const unhandled: never = state;
      throw new Error(`Unhandled target state: ${JSON.stringify(unhandled)}`);
    }
  }
}

// The family folder is the repo folder's parent whenever a family is given.
function familyRefusals(target: TargetFacts): string[] {
  const { family } = target;
  const folder = path.dirname(target.folder);
  if (family === 'marked') {
    return [
      `${folder} holds a ${MARKER_FILE}, so it is a repo folder, not a family. Choose another family with --family.`,
    ];
  }
  if (family === 'notFolder') {
    return [
      `${folder} is a file, not a family folder. Choose another family with --family.`,
    ];
  }
  return [];
}

// Store writes that the closing commit takes. `createStore` and `finishStore`
// commit their own.
const COMMITTED_KINDS: ReadonlySet<LinkAction['kind']> = new Set([
  'writeMarker',
  'copyFile',
  'archiveDefault',
]);

function actionsOf(ready: Ready, facts: LinkFacts): LinkAction[] {
  const first = isFirstLink(ready.repo);
  const steps: LinkAction[] = [
    ...storeActions(ready, facts),
    ...folderActions(ready),
    ...(first ? copyActions(ready) : []),
    ...(first && !keyNamesTarget(ready) ? [mergeAction(ready)] : []),
    ...archiveActions(ready, facts, first),
  ];
  const writesStore =
    steps.some((step) => COMMITTED_KINDS.has(step.kind)) ||
    ready.pending.length > 0;
  return writesStore ? [...steps, commitAction(ready, facts.store)] : steps;
}

// The store's own commit comes first, as the store's first commit would have.
// `createStore` also finishes a creation that stopped part-way.
function storeActions(ready: Ready, facts: LinkFacts): LinkAction[] {
  const { kind } = facts.storeState;
  if (kind === 'absent' || kind === 'empty' || kind === 'unfinished') {
    return [{ kind: 'createStore', store: facts.store }];
  }
  return ready.storePending.length > 0
    ? [{ kind: 'finishStore', store: facts.store, paths: ready.storePending }]
    : [];
}

function folderActions(ready: Ready): LinkAction[] {
  const { folder, state } = ready.target;
  const marker: LinkAction = {
    kind: 'writeMarker',
    folder,
    root: ready.repo.root,
  };
  if (state.kind === 'absent') {
    return [{ kind: 'createFolder', folder }, marker];
  }
  return state.kind === 'empty' ? [marker] : [];
}

function copyActions(ready: Ready): LinkAction[] {
  const { defaultFolder } = ready.repo;
  if (defaultFolder.kind === 'absent') return [];
  return defaultFolder.files
    .filter((f) => f.copy === 'absent' && f.rel !== MARKER_FILE)
    .map((f) => ({
      kind: 'copyFile',
      from: path.join(defaultFolder.folder, f.rel),
      to: path.join(ready.target.folder, f.rel),
    }));
}

// A key that already names the folder, `~/` form included, needs no write: `mergeKey` compares text.
const keyNamesTarget = (ready: Ready): boolean =>
  keyFolder(ready.settings.key, ready.repo.home) === ready.target.folder;

function mergeAction(ready: Ready): LinkAction {
  return {
    kind: 'mergeKey',
    file: ready.settings.file,
    value: ready.target.folder,
    expected: ready.settings.text,
  };
}

function archiveActions(
  ready: Ready,
  facts: LinkFacts,
  first: boolean,
): LinkAction[] {
  const { defaultFolder, projectKey } = ready.repo;
  if (defaultFolder.kind === 'absent') return [];
  const name = archiveName(projectKey, facts.today, ready.target.archives);
  return [
    {
      kind: 'archiveDefault',
      from: defaultFolder.folder,
      to: path.join(facts.store, ...ARCHIVE_DIR.split('/'), name),
      copies: ready.target.folder,
      reappeared: !first,
    },
  ];
}

// `<key>-<today>`, or the first `-2`, `-3`, … suffix not yet taken.
function archiveName(key: string, today: string, taken: string[]): string {
  const base = `${key}-${today}`;
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function commitAction(ready: Ready, store: string): LinkAction {
  const { defaultFolder, projectKey } = ready.repo;
  const owned: OwnedPaths = {
    folderRel: ready.target.rel,
    projectKey,
    defaultFolder: defaultFolder.folder,
  };
  return {
    kind: 'commit',
    store,
    message: `link ${ready.target.rel}`,
    owned,
  };
}

function notesOf(
  ready: Ready,
  facts: LinkFacts,
  actions: LinkAction[],
): string[] {
  const { defaultFolder } = ready.repo;
  const moves = actions.some(
    (a) => a.kind === 'mergeKey' || a.kind === 'archiveDefault',
  );
  // A plan that only commits, such as the re-run after a failed commit.
  const commitsOnly =
    actions.length > 0 && actions.every((a) => a.kind === 'commit');
  const noDefault =
    isFirstLink(ready.repo) && defaultFolder.kind === 'absent'
      ? [
          `No default memory folder at ${defaultFolder.folder}: nothing to copy or archive.`,
        ]
      : [];
  const sessions = ready.repo.sessions;
  const folder = defaultFolder.folder;
  return [
    ...noDefault,
    ...(moves ? sessionNotes(sessions, folder) : []),
    ...(commitsOnly ? rerunSessionNotes(sessions, folder) : []),
    ...userSettingsNotes(facts),
  ];
}

function sessionNotes(sessions: SessionFacts, folder: string): string[] {
  if (sessions.kind === 'failed') {
    return [
      `The check for other open sessions did not run: ${sessions.issues.join(' ')} Any session open in the repo keeps writing to ${folder} until it restarts.`,
    ];
  }
  const forced = sessions.others.map(
    (job) =>
      `Passed over with --force: ${describeJob(job)}. It keeps writing to ${folder} until it restarts; run link again afterwards to archive what it wrote.`,
  );
  const unread = sessions.unreadable.map(
    (job) =>
      `Passed over with --force: ${describeJob(job)}, whose pid is not a number. If it is open, it keeps writing to ${folder} until it restarts; run link again afterwards to archive what it wrote.`,
  );
  const self =
    sessions.self === undefined
      ? []
      : [
          `This session (${describeJob(sessions.self)}) keeps reading and writing ${folder} until it restarts. Restart it once the link is done.`,
        ];
  return [...forced, ...unread, ...self];
}

// A commit-only plan never refuses over sessions, so `--force` says nothing about them here, and a session may have started after the key was set.
function rerunSessionNotes(sessions: SessionFacts, folder: string): string[] {
  if (sessions.kind === 'failed') {
    return [
      `The check for other open sessions did not run: ${sessions.issues.join(' ')} A session open in the repo since before the key was set keeps writing to ${folder} until it restarts.`,
    ];
  }
  const others = sessions.others.map(
    (job) =>
      `Open in the repo: ${describeJob(job)}. If it started before the key was set, it keeps writing to ${folder} until it restarts. Run link again afterwards to archive what it wrote.`,
  );
  const unread = sessions.unreadable.map(
    (job) =>
      `${LISTING} gives a pid that is not a number for ${describeJob(job)}. If it is open and started before the key was set, it keeps writing to ${folder} until it restarts. Run link again afterwards to archive what it wrote.`,
  );
  const self =
    sessions.self === undefined
      ? []
      : [
          `If this session (${describeJob(sessions.self)}) started before the key was set, it keeps reading and writing ${folder} until it restarts. Restart it once the link is done.`,
        ];
  return [...others, ...unread, ...self];
}

function userSettingsNotes(facts: LinkFacts): string[] {
  const { file, covered } = facts.userSettings;
  if (covered) return [];
  return [
    `No permissions.additionalDirectories entry in ${file} covers the store. link never writes that file, so add this entry to that list by hand: ${JSON.stringify(facts.store)}`,
  ];
}
