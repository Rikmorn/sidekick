/**
 * The checks `sidekick worker dispatch` runs before it launches: the brief's
 * place, the launching checkout, the worker's names, the permission mode, the
 * plugin folder, and the profile. Every check names each reason it refuses; a
 * pass hands the launch a `Ready`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { type ResolvedMain, resolveMain } from './main-session.js';
import type { Runner } from './pm-data.js';
import { checkComposed, loadForLaunch, type ProfileEnv } from './profile.js';
import { isProfileName } from './profile-manifest.js';
import { type Profile, storeRoots } from './profile-store.js';
import type { WorkerEnv } from './worker.js';
import { type Brief, briefFileIssues } from './worker-brief.js';
import type { CheckOptions, SharedOptions } from './worker-dispatch-args.js';
import { type CheckoutFacts, checkoutFacts } from './worker-facts.js';
import { listJobs } from './worker-jobs.js';
import { workerOverlay } from './worker-overlay.js';
import {
  branchExists,
  commitOf,
  headCommit,
  isTrackedClean,
  remotesWithPushUrl,
} from './worker-repo.js';
import { nativeBranch, nativeFolder } from './worker-worktree.js';

type Out = (line: string) => void;

// The values `claude --permission-mode` accepts.
const PERMISSION_MODES = [
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'dontAsk',
  'bypassPermissions',
  'manual',
] as const;

const MODE_LIST = PERMISSION_MODES.join(', ');

/** The permission mode that pre-approves every tool call. */
export const BYPASS = 'bypassPermissions';

const isFolder = (dir: string): boolean => {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
};

function modeIssues(mode: string | undefined): string[] {
  if (mode === undefined) {
    return [
      `--permission-mode is required: pass the orchestrating session's own mode, one of ${MODE_LIST}`,
    ];
  }
  const known = PERMISSION_MODES.some((m) => m === mode);
  return known
    ? []
    : [`--permission-mode "${mode}" is not one of ${MODE_LIST}`];
}

const pluginDirIssues = (dir: string | undefined): string[] =>
  dir === undefined || isFolder(dir)
    ? []
    : [`--plugin-dir: ${dir} is not a folder`];

const placeIssues = (brief: Brief): string[] =>
  brief.place === 'worktree'
    ? []
    : [
        `place: "${brief.place}" is not "worktree"; dispatch starts a worker only in a worktree of its own`,
      ];

const NO_COMMIT = "baseline: this checkout's HEAD has no commit yet";

function baselineIssues(
  runGit: Runner,
  top: string,
  baseline: string,
): string[] {
  const head = headCommit(runGit, top);
  if (head === undefined) return [NO_COMMIT];
  return commitOf(runGit, top, baseline) === head
    ? []
    : [
        `baseline: ${baseline} does not resolve to this checkout's HEAD (${head})`,
      ];
}

const cleanIssues = (runGit: Runner, top: string): string[] =>
  isTrackedClean(runGit, top)
    ? []
    : [
        "tracked files have uncommitted changes, which the worker's worktree would not carry: commit them first",
      ];

/** The worktree folder and branch `claude --worktree <name>` makes must both be free. */
function treeNameIssues(runGit: Runner, top: string, name: string): string[] {
  const folder = nativeFolder(top, name);
  const branch = nativeBranch(name);
  return [
    ...(fs.existsSync(folder) ? [`name: ${folder} already exists`] : []),
    ...(branchExists(runGit, top, branch)
      ? [`name: the branch ${branch} already exists`]
      : []),
  ];
}

/** Every listed session counts, interactive ones too: a clash breaks addressing by name. */
function listedNameIssues(
  listed: ReturnType<typeof listJobs>,
  name: string,
): string[] {
  if ('issues' in listed) return listed.issues;
  return listed.jobs.some((job) => job.name === name)
    ? [
        `name: claude agents --json --all already lists a session named "${name}"`,
      ]
    : [];
}

/** Git ignores a pushInsteadOf rewrite for a remote with an explicit pushurl. */
const pushUrlIssues = (runGit: Runner, top: string): string[] =>
  remotesWithPushUrl(runGit, top).map(
    (remote) =>
      `remote "${remote}" sets pushurl, and git ignores the push rewrite for such a remote: remove the pushurl, or pass --allow-push on the operator's word`,
  );

/** Compared here, never passed to git: the schema allows a leading dash. */
function targetIssues(brief: Brief, branch: string | undefined): string[] {
  if (branch === undefined) {
    return brief.target === undefined
      ? []
      : [
          "target: this checkout's HEAD is detached, so the worker would land on a branch it does not hold: check out the branch the worker lands in, or drop the target key",
        ];
  }
  if (brief.target === undefined) {
    return [
      `target: missing; this checkout holds the branch ${branch}: add the line "target: ${branch}" to the brief`,
    ];
  }
  return brief.target === branch
    ? []
    : [
        `target: "${brief.target}" is not the branch this checkout holds (${branch}); write the line "target: ${branch}"`,
      ];
}

function checkoutIssues(
  brief: Brief,
  briefPath: string,
  opts: SharedOptions,
  runGit: Runner,
  facts: CheckoutFacts,
): string[] {
  const { launchTop, mainTop } = facts;
  return [
    ...briefFileIssues(brief, { briefPath, launchTop, mainTop, runGit }),
    ...baselineIssues(runGit, launchTop, brief.baseline),
    ...cleanIssues(runGit, launchTop),
    ...targetIssues(brief, facts.branch),
    ...treeNameIssues(runGit, mainTop, brief.name),
    ...(opts.allowPush ? [] : pushUrlIssues(runGit, launchTop)),
  ];
}

/** A background session under bypassPermissions needs the acceptance the user source holds. */
function bypassIssues(profile: Profile, mode: string | undefined): string[] {
  const sources = profile.manifest.settingSources;
  if (mode !== BYPASS || sources === undefined || sources.includes('user')) {
    return [];
  }
  return [
    `${BYPASS} needs the user setting source, which profile "${profile.name}" leaves out (settingSources: ${sources.join(', ')}); a background session without it drops the bypass acceptance`,
  ];
}

/** The `profile new` hint, when no store root holds a folder of that name. */
function missingProfileHint(name: string, penv: ProfileEnv): string[] {
  const roots = storeRoots(penv.env, penv.cwd, penv.home, penv.workTree);
  const held = roots.some((root) => isFolder(path.join(root.dir, name)));
  return isProfileName(name) && !held
    ? [`create it with: sidekick profile new ${name} --description <text>`]
    : [];
}

type Prepared =
  | { ok: true; args: string[]; notes: string[] }
  | { ok: false; issues: string[] };

/**
 * Loads, overlays, and checks the profile. The lines the profile helpers print
 * are collected: issues on a refusal, warnings to print before the launch.
 */
function prepareProfile(
  opts: SharedOptions,
  briefPath: string,
  penv: ProfileEnv,
  main: string | undefined,
  reads: string[],
): Prepared {
  const lines: string[] = [];
  const collect: Out = (line) => {
    lines.push(line);
  };
  const profile = loadForLaunch(opts.profile, penv, collect);
  if (profile === undefined) {
    return {
      ok: false,
      issues: [...lines, ...missingProfileHint(opts.profile, penv)],
    };
  }
  const bypass = bypassIssues(profile, opts.mode);
  const overlay = workerOverlay(profile.manifest.settings, {
    briefPath,
    allowPush: opts.allowPush,
    main,
    reads,
  });
  if ('issues' in overlay) {
    return { ok: false, issues: [...lines, ...overlay.issues, ...bypass] };
  }
  const args = checkComposed(profile, penv, collect, overlay.overlay);
  if (args === undefined || bypass.length > 0) {
    return { ok: false, issues: [...lines, ...bypass] };
  }
  return { ok: true, args, notes: lines };
}

/** Everything the launch needs once the checks pass. */
export interface Ready {
  brief: Brief;
  briefPath: string;
  mode: string;
  pluginDir: string | undefined;
  allowPush: boolean;
  launchTop: string;
  mainTop: string;
  commonDir: string;
  args: string[];
  notes: string[];
  main: ResolvedMain | undefined;
}

// The 7 characters git prints for a short commit by default.
const SHORT_SHA = 7;

// The marker's brief path under `--check`, which has no brief.
const CHECK_BRIEF = 'check-brief.md';

const insideWorkerIssue =
  'SIDEKICK_WORKER is set: a worker cannot dispatch workers of its own (#255)';

/**
 * The checks run from the launching checkout, as the launch does; outside a
 * work tree, those that need no checkout still run from the current folder.
 */
export function checkDispatch(
  brief: Brief,
  briefPath: string,
  opts: SharedOptions,
  wenv: WorkerEnv,
): Ready | { issues: string[] } {
  if (wenv.env.SIDEKICK_WORKER !== undefined) {
    return { issues: [insideWorkerIssue] };
  }
  const facts = checkoutFacts(wenv.runGit, wenv.cwd);
  const at = 'issues' in facts ? wenv.cwd : facts.launchTop;
  const listed = listJobs(wenv.runClaude, at);
  const main = resolveMain(
    wenv.env,
    'jobs' in listed ? listed.jobs : undefined,
  );
  const reads = [briefPath, brief.plan, brief.spec, brief.rulings];
  const prepared = prepareProfile(
    opts,
    briefPath,
    { ...wenv, cwd: at },
    main?.value,
    reads,
  );
  const issues = [
    ...('issues' in facts
      ? facts.issues
      : checkoutIssues(brief, briefPath, opts, wenv.runGit, facts)),
    ...placeIssues(brief),
    ...listedNameIssues(listed, brief.name),
    ...modeIssues(opts.mode),
    ...pluginDirIssues(opts.pluginDir),
    ...(prepared.ok ? [] : prepared.issues),
  ];
  const refused = issues.length > 0 || 'issues' in facts || !prepared.ok;
  if (refused || opts.mode === undefined) return { issues };
  return {
    brief,
    briefPath,
    mode: opts.mode,
    pluginDir: opts.pluginDir,
    allowPush: opts.allowPush,
    launchTop: facts.launchTop,
    mainTop: facts.mainTop,
    commonDir: facts.commonDir,
    args: prepared.args,
    notes: prepared.notes,
    main,
  };
}

/** What a passing `--check` reports. */
export interface CheckPass {
  line: string;
  notes: string[];
}

// The branch the launching checkout holds, or its detached commit.
const whereLine = (branch: string | undefined, head: string): string =>
  branch ?? `detached HEAD at ${head.slice(0, SHORT_SHA)}`;

/**
 * The checks that need no brief, from the launching checkout as `checkDispatch`
 * runs them. The overlay's marker needs a brief path, so it gets a placeholder
 * in that checkout; the profile check never reads it.
 */
export function checkOnly(
  opts: CheckOptions,
  wenv: WorkerEnv,
): CheckPass | { issues: string[] } {
  if (wenv.env.SIDEKICK_WORKER !== undefined) {
    return { issues: [insideWorkerIssue] };
  }
  const facts = checkoutFacts(wenv.runGit, wenv.cwd);
  const at = 'issues' in facts ? wenv.cwd : facts.launchTop;
  const head = 'issues' in facts ? undefined : headCommit(wenv.runGit, at);
  const prepared = prepareProfile(
    opts,
    path.join(at, CHECK_BRIEF),
    { ...wenv, cwd: at },
    undefined,
    [],
  );
  const issues = [
    ...('issues' in facts
      ? facts.issues
      : [
          ...(head === undefined ? [NO_COMMIT] : []),
          ...cleanIssues(wenv.runGit, at),
          ...(opts.allowPush ? [] : pushUrlIssues(wenv.runGit, at)),
        ]),
    ...modeIssues(opts.mode),
    ...pluginDirIssues(opts.pluginDir),
    ...(prepared.ok ? [] : prepared.issues),
  ];
  if ('issues' in facts || head === undefined) return { issues };
  if (issues.length > 0 || opts.mode === undefined || !prepared.ok) {
    return { issues };
  }
  return {
    line: `dispatch can run here: ${whereLine(facts.branch, head)}, profile ${opts.profile}, mode ${opts.mode}`,
    notes: prepared.notes,
  };
}
