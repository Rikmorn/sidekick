/**
 * `sidekick worker dispatch`: checks a brief, the main checkout, and the
 * profile, then starts `sk-worker` as a background session in a worktree of
 * its own, with pushes blocked unless the operator allows them. A refusal
 * names every reason it finds, except that a brief that does not parse stops
 * the checks there.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { mainReport, type ResolvedMain, resolveMain } from './main-session.js';
import type { Runner } from './pm-data.js';
import {
  checkComposed,
  LAUNCH_TIMEOUT_MS,
  loadForLaunch,
  type ProfileEnv,
  parseFlags,
} from './profile.js';
import { bgArgs, type ClaudeResult } from './profile-launch.js';
import { isProfileName } from './profile-manifest.js';
import { type Profile, storeRoots } from './profile-store.js';
import type { WorkerEnv } from './worker.js';
import { type Brief, briefFileIssues, readBrief } from './worker-brief.js';
import { listJobs } from './worker-jobs.js';
import { workerOverlay } from './worker-overlay.js';
import { jobIdFrom, writeRecord } from './worker-record.js';
import {
  branchExists,
  commitOf,
  ensureWorktreesExcluded,
  headCommit,
  isTrackedClean,
  mainCheckout,
  remotesWithPushUrl,
  WORKTREES_FOLDER,
} from './worker-repo.js';

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
const BYPASS = 'bypassPermissions';

// The profile `dispatch` launches with when `--profile` is not given.
const DEFAULT_WORKER_PROFILE = 'worker';

/** What `dispatch` was asked for, its paths absolute. */
export interface DispatchOptions {
  brief: string;
  mode: string | undefined;
  profile: string;
  pluginDir: string | undefined;
  allowPush: boolean;
}

const stringFlag = (
  values: Record<string, string | boolean | undefined>,
  key: string,
): string | undefined => {
  const value = values[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * Parses `dispatch`'s arguments, resolving the brief and `--plugin-dir`
 * against `cwd`, the folder the command was typed in. Undefined is a usage
 * error. A missing `--permission-mode` is left to the checks, which name it.
 */
export function parseDispatchArgs(
  rest: string[],
  cwd: string,
): DispatchOptions | undefined {
  const parsed = parseFlags(rest, {
    'permission-mode': { type: 'string' },
    profile: { type: 'string' },
    'plugin-dir': { type: 'string' },
    'allow-push': { type: 'boolean' },
  });
  if (parsed === undefined || parsed.positionals.length !== 1) return undefined;
  const pluginDir = stringFlag(parsed.values, 'plugin-dir');
  // path.resolve would read an empty value as the current folder.
  if (pluginDir === '') return undefined;
  return {
    brief: path.resolve(cwd, parsed.positionals[0]),
    mode: stringFlag(parsed.values, 'permission-mode'),
    profile: stringFlag(parsed.values, 'profile') ?? DEFAULT_WORKER_PROFILE,
    pluginDir:
      pluginDir === undefined ? undefined : path.resolve(cwd, pluginDir),
    allowPush: parsed.values['allow-push'] === true,
  };
}

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

function baselineIssues(
  runGit: Runner,
  top: string,
  baseline: string,
): string[] {
  const head = headCommit(runGit, top);
  if (head === undefined) {
    return ['baseline: the main checkout has no commit at HEAD yet'];
  }
  return commitOf(runGit, top, baseline) === head
    ? []
    : [
        `baseline: ${baseline} does not resolve to the main checkout's HEAD (${head})`,
      ];
}

const cleanIssues = (runGit: Runner, top: string): string[] =>
  isTrackedClean(runGit, top)
    ? []
    : [
        "tracked files have uncommitted changes, which the worker's worktree would not carry: commit them first",
      ];

// The worktree folder and branch `claude --worktree <name>` makes must both be free.
function treeNameIssues(runGit: Runner, top: string, name: string): string[] {
  const folder = path.join(top, WORKTREES_FOLDER, name);
  const branch = `worktree-${name}`;
  return [
    ...(fs.existsSync(folder) ? [`name: ${folder} already exists`] : []),
    ...(branchExists(runGit, top, branch)
      ? [`name: the branch ${branch} already exists`]
      : []),
  ];
}

// Every listed session counts, interactive ones too: a clash breaks addressing by name.
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

// Git ignores a pushInsteadOf rewrite for a remote with an explicit pushurl.
const pushUrlIssues = (runGit: Runner, top: string): string[] =>
  remotesWithPushUrl(runGit, top).map(
    (remote) =>
      `remote "${remote}" sets pushurl, and git ignores the push rewrite for such a remote: remove the pushurl, or pass --allow-push on the operator's word`,
  );

function checkoutIssues(
  brief: Brief,
  opts: DispatchOptions,
  runGit: Runner,
  top: string,
): string[] {
  return [
    ...briefFileIssues(brief, top),
    ...baselineIssues(runGit, top, brief.baseline),
    ...cleanIssues(runGit, top),
    ...treeNameIssues(runGit, top, brief.name),
    ...(opts.allowPush ? [] : pushUrlIssues(runGit, top)),
  ];
}

// A background session under bypassPermissions needs the acceptance the user source holds.
function bypassIssues(profile: Profile, mode: string | undefined): string[] {
  const sources = profile.manifest.settingSources;
  if (mode !== BYPASS || sources === undefined || sources.includes('user')) {
    return [];
  }
  return [
    `${BYPASS} needs the user setting source, which profile "${profile.name}" leaves out (settingSources: ${sources.join(', ')}); a background session without it drops the bypass acceptance`,
  ];
}

// The `profile new` hint, when no store root holds a folder of that name.
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

// Loads, overlays, and checks the profile. The lines the profile helpers print
// are collected: issues on a refusal, warnings to print before the launch.
function prepareProfile(
  opts: DispatchOptions,
  briefPath: string,
  penv: ProfileEnv,
  main: string | undefined,
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

// Everything the launch needs once the checks pass.
interface Ready {
  brief: Brief;
  briefPath: string;
  mode: string;
  pluginDir: string | undefined;
  allowPush: boolean;
  top: string;
  commonDir: string;
  args: string[];
  notes: string[];
  main: ResolvedMain | undefined;
}

// The checks run from the top, as the launch does; outside a main checkout,
// those that need no checkout still run from the current folder.
function checkDispatch(
  brief: Brief,
  briefPath: string,
  opts: DispatchOptions,
  wenv: WorkerEnv,
): Ready | { issues: string[] } {
  const checkout = mainCheckout(wenv.runGit, wenv.cwd);
  const at = 'issues' in checkout ? wenv.cwd : checkout.top;
  const listed = listJobs(wenv.runClaude, at);
  const main = resolveMain(
    wenv.env,
    'jobs' in listed ? listed.jobs : undefined,
  );
  const prepared = prepareProfile(
    opts,
    briefPath,
    { ...wenv, cwd: at },
    main?.value,
  );
  const issues = [
    ...('issues' in checkout
      ? checkout.issues
      : checkoutIssues(brief, opts, wenv.runGit, checkout.top)),
    ...placeIssues(brief),
    ...listedNameIssues(listed, brief.name),
    ...modeIssues(opts.mode),
    ...pluginDirIssues(opts.pluginDir),
    ...(prepared.ok ? [] : prepared.issues),
  ];
  const refused = issues.length > 0 || 'issues' in checkout || !prepared.ok;
  if (refused || opts.mode === undefined) return { issues };
  return {
    brief,
    briefPath,
    mode: opts.mode,
    pluginDir: opts.pluginDir,
    allowPush: opts.allowPush,
    top: checkout.top,
    commonDir: checkout.commonDir,
    args: prepared.args,
    notes: prepared.notes,
    main,
  };
}

const withoutTrailingNewline = (text: string): string =>
  text.replace(/\n$/, '');

function relay(result: ClaudeResult, out: Out, err: Out): void {
  if (result.stdout !== '') out(withoutTrailingNewline(result.stdout));
  if (result.stderr !== '') err(withoutTrailingNewline(result.stderr));
  if (result.timedOut) err('claude did not return in time.');
}

const mainLines = (ready: Ready, wenv: WorkerEnv): string[] =>
  ready.main === undefined ? [] : [mainReport(ready.main, wenv.env, wenv.home)];

function summary(ready: Ready): string[] {
  const { brief, mode } = ready;
  const pushes = ready.allowPush
    ? "pushes ALLOWED on the operator's word"
    : 'pushes blocked';
  return [
    `worker ${brief.name} dispatched · permission mode ${mode} · ${pushes}`,
    ...(mode === BYPASS
      ? ['every tool call the worker makes is pre-approved']
      : []),
    `steer: rulings in ${brief.rulings}, then message "${brief.name}" to point at them`,
    `finish: sidekick worker finish ${ready.briefPath}`,
  ];
}

const refuse = (err: Out, issues: string[]): number => {
  for (const issue of issues) err(issue);
  return 1;
};

// Leaves the record that `sidekick desk` lists the worker from. A failure only
// warns: the worker has started, so claude's exit code stands.
function keepRecord(ready: Ready, result: ClaudeResult, err: Out): void {
  const written = writeRecord(ready.commonDir, {
    version: 1,
    name: ready.brief.name,
    job: jobIdFrom(result.stdout, ready.brief.name),
    brief: ready.briefPath,
    dispatchedAt: new Date().toISOString(),
  });
  if ('issue' in written) err(written.issue);
}

// Excludes the worktrees folder, starts the worker from the top, and relays
// claude; the summary prints only once claude reports a start.
function launch(ready: Ready, wenv: WorkerEnv, out: Out, err: Out): number {
  for (const note of ready.notes) err(note);
  const excluded = ensureWorktreesExcluded(
    wenv.runGit,
    ready.top,
    ready.commonDir,
  );
  if ('issues' in excluded) return refuse(err, excluded.issues);
  if (excluded.line !== undefined) out(excluded.line);
  const args = bgArgs(ready.args, {
    pluginDir: ready.pluginDir,
    permissionMode: ready.mode,
    worktree: ready.brief.name,
    sessionName: ready.brief.name,
    prompt: `/sidekick:sk-worker ${ready.briefPath}`,
  });
  const result = wenv.runClaude(args, {
    cwd: ready.top,
    timeoutMs: wenv.launchTimeoutMs ?? LAUNCH_TIMEOUT_MS,
  });
  relay(result, out, err);
  if (result.code === 0) {
    for (const line of [...mainLines(ready, wenv), ...summary(ready)]) {
      out(line);
    }
    keepRecord(ready, result, err);
  }
  return result.code;
}

/** Runs `dispatch`; returns 1 on a refusal, else `claude`'s exit code. */
export function dispatch(
  opts: DispatchOptions,
  wenv: WorkerEnv,
  out: Out,
  err: Out,
): number {
  const read = readBrief(opts.brief);
  if ('issues' in read) return refuse(err, read.issues);
  const checked = checkDispatch(read.brief, read.path, opts, wenv);
  if ('issues' in checked) return refuse(err, checked.issues);
  return launch(checked, wenv, out, err);
}
