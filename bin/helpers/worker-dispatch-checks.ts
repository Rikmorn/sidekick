/**
 * The checks `sidekick worker dispatch` runs before it launches: the brief's
 * place and its `## Limits` section, the launching checkout, the worker's names, the permission mode, the
 * plugin folder, and the profile. Every check names each reason it refuses; a
 * pass hands the launch a `Ready`. A unit brief's profile check composes the
 * launch inside the fence, from the context a unit launch passes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { readSection } from './hook.js';
import { type ResolvedMain, resolveMain } from './main-session.js';
import { storeRoot } from './memory-store.js';
import type { Runner } from './pm-data.js';
import {
  checkComposed,
  type LaunchOptions,
  loadForLaunch,
  type ProfileEnv,
} from './profile.js';
import { isProfileName } from './profile-manifest.js';
import { oldStoreIssues } from './profile-old-store.js';
import { isFolder, pluginDirIssues } from './profile-role.js';
import { type Profile, storeRoots } from './profile-store.js';
import { sidekickHome } from './sidekick-home.js';
import { BRIEF_LIMITS_HEADING, readBriefLimits } from './subagent-limits.js';
import type { WorkerEnv } from './worker.js';
import {
  type Brief,
  briefFileIssues,
  type PlanBrief,
  type UnitBrief,
  unitBriefFileIssues,
} from './worker-brief.js';
import type { CheckOptions, SharedOptions } from './worker-dispatch-args.js';
import { type CheckoutFacts, checkoutFacts } from './worker-facts.js';
import { listJobs } from './worker-jobs.js';
import {
  FENCE_SAFE_KEYS,
  fenceSafeSettings,
  unitOverlay,
  unitSettingSources,
  workerOverlay,
} from './worker-overlay.js';
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
      ? [
          `name: the branch ${branch} already exists: once you have checked that its commits have landed, delete it with git branch -D ${branch}, or dispatch under another name`,
        ]
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

/**
 * What refuses `name` for a new worker of the repo whose main checkout is
 * `mainTop`: the worktree folder or the branch Claude Code would make for it
 * exists, or the listing names a session so. These are dispatch's own name
 * checks, for a caller that picks the name.
 */
export const workerNameIssues = (
  runGit: Runner,
  mainTop: string,
  listed: ReturnType<typeof listJobs>,
  name: string,
): string[] => [
  ...treeNameIssues(runGit, mainTop, name),
  ...listedNameIssues(listed, name),
];

/** Git ignores a pushInsteadOf rewrite for a remote with an explicit pushurl. */
const pushUrlIssues = (runGit: Runner, top: string): string[] =>
  remotesWithPushUrl(runGit, top).map(
    (remote) =>
      `remote "${remote}" sets pushurl, and git ignores the push rewrite for such a remote: remove the pushurl, or pass --allow-push on the operator's word`,
  );

/** Compared here, never passed to git: the schema allows a leading dash. */
function targetIssues(brief: PlanBrief, branch: string | undefined): string[] {
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

// The brief's limits reach every subagent but `web-fetch` through the subagent
// start hook, so a brief without them is refused.
function limitsIssues(briefPath: string): string[] {
  return readBriefLimits(briefPath, readSection) === undefined
    ? [
        `${briefPath}: the brief has no ${BRIEF_LIMITS_HEADING} section with text under it: add one holding where the worker may write, what it may read, and the commands it may not run`,
      ]
    : [];
}

function checkoutIssues(
  brief: Brief,
  briefPath: string,
  opts: SharedOptions,
  runGit: Runner,
  facts: CheckoutFacts,
): string[] {
  const { launchTop, mainTop } = facts;
  // A unit brief skips the plan's file bounds and the target check; its own
  // file check runs in `checkDispatch`, which needs no checkout facts.
  return [
    ...(brief.kind === 'plan'
      ? briefFileIssues(brief, { briefPath, launchTop, mainTop, runGit })
      : []),
    ...limitsIssues(briefPath),
    ...baselineIssues(runGit, launchTop, brief.baseline),
    ...cleanIssues(runGit, launchTop),
    ...(brief.kind === 'plan' ? targetIssues(brief, facts.branch) : []),
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
  if (oldStoreIssues(penv.env, penv.cwd, penv.home).length > 0) return [];
  const roots = storeRoots(
    'profiles',
    penv.env,
    penv.cwd,
    penv.home,
    penv.workTree,
  );
  const held = roots.some((root) => isFolder(path.join(root.dir, name)));
  return isProfileName(name) && !held
    ? [`create it with: sidekick profile new ${name} --description <text>`]
    : [];
}

type Prepared =
  | { ok: true; args: string[]; notes: string[] }
  | { ok: false; issues: string[] };

// The profile a launch composes, the options it composes with, and the lines
// to print before it, or why it cannot.
type Shaped =
  | { profile: Profile; launch: LaunchOptions; notes: string[] }
  | { issues: string[] };
type Shape = (profile: Profile) => Shaped;

// A plan worker: the profile as it is, the worker overlay, and dispatch's `--plugin-dir`.
const planShape =
  (
    opts: SharedOptions,
    briefPath: string,
    main: string | undefined,
    reads: readonly string[],
  ): Shape =>
  (profile) => {
    const overlay = workerOverlay(profile.manifest.settings, {
      briefPath,
      allowPush: opts.allowPush,
      main,
      reads,
    });
    if ('issues' in overlay) return overlay;
    const pluginDirs = opts.pluginDir === undefined ? [] : [opts.pluginDir];
    return {
      profile,
      launch: { overlay: overlay.overlay, pluginDirs },
      notes: [],
    };
  };

/** What a unit launch adds to dispatch's checks: the attempt's folder, which it adds, and the hosts its fence lets through. */
export interface UnitContext {
  attemptDir: string;
  hosts: readonly string[];
}

const leftOutNotes = (profile: string, dropped: readonly string[]): string[] =>
  dropped.length === 0
    ? []
    : [
        `the unit launch leaves out profile "${profile}"'s settings outside the keys it keeps (${FENCE_SAFE_KEYS.join(', ')}): ${dropped.join(', ')}`,
      ];

// A unit worker: the profile's fence-safe keys alone, the unit overlay, the
// attempt's folder added, and no `project` or `local` source.
const unitShape =
  (
    brief: UnitBrief,
    briefPath: string,
    unit: UnitContext,
    facts: CheckoutFacts,
    penv: ProfileEnv,
  ): Shape =>
  (profile) => {
    const overlay = unitOverlay(profile.manifest.settings, {
      briefPath,
      worktree: nativeFolder(facts.mainTop, brief.name),
      commonDir: facts.commonDir,
      sidekickHome: sidekickHome(penv.env, penv.cwd, penv.home),
      memoryStore: path.resolve(penv.cwd, storeRoot(penv.env, penv.home)),
      hosts: unit.hosts,
      reads: [briefPath, brief.unit, brief.rulings],
      addedDirs: [profile.dir, unit.attemptDir],
    });
    if ('issues' in overlay) return overlay;
    const { settings, dropped } = fenceSafeSettings(profile.manifest.settings);
    return {
      profile: { ...profile, manifest: { ...profile.manifest, settings } },
      launch: {
        overlay: overlay.overlay,
        addDirs: [unit.attemptDir],
        settingSources: unitSettingSources(profile),
      },
      notes: leftOutNotes(profile.name, dropped),
    };
  };

// The launch refuses for a reason the other checks name.
const named: Shape = () => ({ issues: [] });

/**
 * Checks the `--plugin-dir` folder, then loads the profile, shapes its launch,
 * and checks it. A folder the check refuses never reaches the `claude`
 * checks. The lines the profile helpers print are collected: issues on a
 * refusal, warnings to print before the launch.
 */
function prepareProfile(
  opts: SharedOptions,
  penv: ProfileEnv,
  shape: Shape,
): Prepared {
  const dirIssues = pluginDirIssues(opts.pluginDir);
  const lines: string[] = [];
  const collect: Out = (line) => {
    lines.push(line);
  };
  const refused = (issues: string[]): Prepared => ({
    ok: false,
    issues: [...dirIssues, ...lines, ...issues],
  });
  const profile = loadForLaunch(opts.profile, penv, collect);
  if (profile === undefined) {
    return refused(missingProfileHint(opts.profile, penv));
  }
  const bypass = bypassIssues(profile, opts.mode);
  const shaped = shape(profile);
  if ('issues' in shaped) return refused([...shaped.issues, ...bypass]);
  if (dirIssues.length > 0) return refused(bypass);
  const args = checkComposed(shaped.profile, penv, collect, shaped.launch);
  if (args === undefined || bypass.length > 0) return refused(bypass);
  return { ok: true, args, notes: [...shaped.notes, ...lines] };
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

// The length the pass line shortens a detached commit to.
const SHORT_SHA = 7;

// The marker's brief path under `--check`, which has no brief.
const CHECK_BRIEF = 'check-brief.md';

const insideWorkerIssue =
  'SIDEKICK_WORKER is set: a worker cannot dispatch workers of its own (#255)';

// An empty marker is absent, as every other reader of it holds: a loop's
// compiled env sets it empty.
const insideWorker = (env: NodeJS.ProcessEnv): boolean =>
  env.SIDEKICK_WORKER !== undefined && env.SIDEKICK_WORKER !== '';

// The fence needs the loop's hosts, which only a unit launch passes.
const loopOnlyIssue = (briefPath: string): string =>
  `${briefPath}: a unit brief starts only through sidekick loop dispatch, which launches it inside its fence`;

// The shape of a brief's launch. A unit brief without its launch's context,
// or without the checkout's facts, is refused by the issue each names.
function shapeFor(
  brief: Brief,
  briefPath: string,
  ctx: {
    opts: SharedOptions;
    main: string | undefined;
    unit: UnitContext | undefined;
    facts: CheckoutFacts | { issues: string[] };
    penv: ProfileEnv;
  },
): Shape {
  if (brief.kind === 'plan') {
    const reads = [briefPath, brief.plan, brief.spec, brief.rulings];
    return planShape(ctx.opts, briefPath, ctx.main, reads);
  }
  if (ctx.unit === undefined || 'issues' in ctx.facts) return named;
  return unitShape(brief, briefPath, ctx.unit, ctx.facts, ctx.penv);
}

/**
 * The checks run from the launching checkout, as the launch does; outside a
 * work tree, those that need no checkout still run from the current folder.
 * A unit brief needs `unit`, which only a unit launch passes; a plan brief
 * ignores it.
 */
export function checkDispatch(
  brief: Brief,
  briefPath: string,
  opts: SharedOptions,
  wenv: WorkerEnv,
  unit?: UnitContext,
): Ready | { issues: string[] } {
  if (insideWorker(wenv.env)) return { issues: [insideWorkerIssue] };
  const facts = checkoutFacts(wenv.runGit, wenv.cwd);
  const at = 'issues' in facts ? wenv.cwd : facts.launchTop;
  const listed = listJobs(wenv.runClaude, at);
  const main = resolveMain(
    wenv.env,
    'jobs' in listed ? listed.jobs : undefined,
  );
  const penv = { ...wenv, cwd: at };
  const prepared = prepareProfile(
    opts,
    penv,
    shapeFor(brief, briefPath, { opts, main: main?.value, unit, facts, penv }),
  );
  const issues = [
    ...(brief.kind === 'unit' && unit === undefined
      ? [loopOnlyIssue(briefPath)]
      : []),
    ...(brief.kind === 'unit' ? unitBriefFileIssues(brief, briefPath) : []),
    ...('issues' in facts
      ? facts.issues
      : checkoutIssues(brief, briefPath, opts, wenv.runGit, facts)),
    ...placeIssues(brief),
    ...listedNameIssues(listed, brief.name),
    ...modeIssues(opts.mode),
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

// What a passing `--check` reports.
interface CheckPass {
  line: string;
  notes: string[];
}

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
  if (insideWorker(wenv.env)) return { issues: [insideWorkerIssue] };
  const facts = checkoutFacts(wenv.runGit, wenv.cwd);
  const at = 'issues' in facts ? wenv.cwd : facts.launchTop;
  const head = 'issues' in facts ? undefined : headCommit(wenv.runGit, at);
  const prepared = prepareProfile(
    opts,
    { ...wenv, cwd: at },
    planShape(opts, path.join(at, CHECK_BRIEF), undefined, []),
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
