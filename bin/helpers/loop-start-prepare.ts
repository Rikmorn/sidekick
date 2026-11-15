/**
 * The first half of `sidekick loop start`: for one loop, the check, the
 * compiled mandate, the `claude --bg` arguments and their hash, the runtime
 * state, and the reconcile's choice. It starts no session; `runStart` acts on
 * what it returns.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LoopEnv } from './loop.js';
import { armPrompt } from './loop-arm.js';
import { checkLoop, type LoopDeps } from './loop-check.js';
import { compileLoop, landActWarnings, overlapRules } from './loop-compile.js';
import {
  LOOP_FILE,
  type LoopManifest,
  parseLoopManifest,
  readLoopManifest,
} from './loop-manifest.js';
import { type Action, chooseAction } from './loop-reconcile.js';
import {
  currentArmed,
  type LoopState,
  launchHash,
  readArmed,
  readState,
  type StateRead,
} from './loop-state.js';
import { loopsRoot } from './loop-store.js';
import { checkComposed, type ProfileEnv } from './profile.js';
import { bgArgs, type Settings } from './profile-launch.js';
import { isProfileName, PROFILE_NAME_RULE } from './profile-manifest.js';
import type { Profile } from './profile-store.js';
import { workTreeRootOf } from './rules.js';
import type { Job } from './worker-jobs.js';

/** `start`'s flags: `--record` forces a trial, and `--now` acts on a session that is not between ticks. */
export interface StartFlags {
  record: boolean;
  now: boolean;
}

/**
 * One loop, prepared. `refused` holds the lines that say why. A paused loop
 * is never composed, so it carries no `args` or `hash`. `ready` holds the full
 * `claude` argument list for a fresh launch, its hash, the parsed `loop.json`
 * and the profile the arguments were compiled from, and every warning to
 * print. `repo` is where `claude` runs.
 */
export type Prepared =
  | { kind: 'refused'; name: string; lines: string[] }
  | {
      kind: 'paused';
      name: string;
      dir: string;
      repo: string;
      state: LoopState | undefined;
      action: Action;
    }
  | {
      kind: 'ready';
      name: string;
      dir: string;
      repo: string;
      manifest: LoopManifest;
      profile: Profile;
      args: string[];
      hash: string;
      state: LoopState | undefined;
      action: Action;
      warnings: string[];
    };

// A loop's authority is its compiled allow list, under `dontAsk` (ADR-0015).
const PERMISSION_MODE = 'dontAsk';

type Refused = Extract<Prepared, { kind: 'refused' }>;

// One loop as prepareLoop reads it, with its `state.json` read once.
interface Loop {
  name: string;
  dir: string;
  flags: StartFlags;
  state: StateRead<LoopState>;
  lenv: LoopEnv;
  rows: readonly Job[];
}

const refused = (name: string, lines: string[]): Refused => ({
  kind: 'refused',
  name,
  lines,
});

/** The loop's session name, which its launch passes as `-n` and `--worktree`. */
export const sessionOf = (name: string): string => `loop-${name}`;

const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/**
 * The refusal for a relative `CLAUDE_CONFIG_DIR`, or undefined when it is
 * absolute or unset. An empty value reads as unset, as Claude Code reads it.
 */
export function configDirIssue(env: NodeJS.ProcessEnv): string | undefined {
  const dir = env.CLAUDE_CONFIG_DIR;
  if (dir === undefined || dir === '' || path.isAbsolute(dir)) return undefined;
  return `CLAUDE_CONFIG_DIR is the relative path "${dir}". A loop's own record and arm resolve it against the loop's worktree, so they would read another store than start writes. Set it to an absolute path, then run start again.`;
}

/**
 * Prepares one loop for `start`. A paused loop skips the check and the
 * compose; it refuses only when `state.json` is broken. A `loop.json` that
 * does not parse cannot say it is paused, so the check refuses it. Any other
 * loop is checked, compiled, composed as if launched from its repo, hashed,
 * and judged by the reconcile against the listing's `rows`. Every line comes
 * back in the result, so `ctx.err` receives none, and `runStart` can name the
 * loop on each.
 */
export function prepareLoop(
  name: string,
  flags: StartFlags,
  ctx: { lenv: LoopEnv; rows: readonly Job[]; err: (line: string) => void },
): Prepared {
  const { lenv, rows } = ctx;
  const dir = path.join(loopsRoot(lenv.env, lenv.cwd, lenv.home), name);
  // Checked before any read, since the name is a path segment.
  if (!isProfileName(name)) {
    return refused(name, [
      `${dir}: "${name}" is not a loop name: use ${PROFILE_NAME_RULE}`,
    ]);
  }
  const loop: Loop = { name, dir, flags, state: readState(dir), lenv, rows };
  const read = readLoopManifest(path.join(dir, LOOP_FILE));
  return read.ok && read.manifest.paused === true
    ? preparePaused(loop, read.manifest)
    : prepareRunning(loop);
}

const stateOf = (read: StateRead<LoopState>): LoopState | undefined =>
  read.kind === 'ok' ? read.value : undefined;

function choose(
  loop: Loop,
  facts: { paused: boolean; state: LoopState | undefined; hash: string },
): Action {
  const { name, dir, flags, lenv, rows } = loop;
  const { state } = facts;
  return chooseAction({
    name,
    ...facts,
    armed:
      state === undefined ? undefined : currentArmed(state, readArmed(dir)),
    rows,
    now: lenv.now(),
    bootTime: lenv.bootTime(),
    stopNow: flags.now,
  });
}

function preparePaused(loop: Loop, manifest: LoopManifest): Prepared {
  if (loop.state.kind === 'broken') {
    return refused(loop.name, [loop.state.issue]);
  }
  const state = stateOf(loop.state);
  // The pause rows never read the hash; with no state.json, the empty string matches no launch's.
  const action = choose(loop, {
    paused: true,
    state,
    hash: state?.hash ?? '',
  });
  return {
    kind: 'paused',
    name: loop.name,
    dir: loop.dir,
    repo: manifest.repo,
    state,
    action,
  };
}

// The check reads the loop store from where `start` runs; only the compose runs as if from the repo.
const depsOf = (lenv: LoopEnv): LoopDeps => ({
  env: lenv.env,
  cwd: lenv.cwd,
  home: lenv.home,
  runGit: lenv.runGit,
  managedFile: lenv.managedFile,
});

function prepareRunning(loop: Loop): Prepared {
  const { name } = loop;
  const check = checkLoop(name, depsOf(loop.lenv));
  const stateIssues = loop.state.kind === 'broken' ? [loop.state.issue] : [];
  // The issues alone gate: the check keeps `profile` set when it refuses a repo store's profile.
  const issues = [...check.issues, ...stateIssues];
  if (issues.length > 0) return refused(name, issues);
  const { manifest, profile } = check;
  if (manifest === undefined || profile === undefined) {
    return refused(name, [
      `${check.dir}: the check found no issue but loaded no ${manifest === undefined ? LOOP_FILE : 'profile'}, which is a bug in sidekick`,
    ]);
  }
  return prepareLaunch(loop, { manifest, profile, warnings: check.warnings });
}

// What a check with no issue found.
interface Checked {
  manifest: LoopManifest;
  profile: Profile;
  warnings: string[];
}

function prepareLaunch(loop: Loop, checked: Checked): Prepared {
  const { name, dir, flags, lenv } = loop;
  const { manifest, profile } = checked;
  const file = path.join(dir, LOOP_FILE);
  const text = checkedText(file, manifest);
  if ('issue' in text) return refused(name, [text.issue]);
  const overlay = compileLoop({
    name,
    manifest,
    loopDir: dir,
    profileDir: profile.dir,
    record: flags.record,
  });
  const composed = compose(profile, overlay, manifest.repo, lenv);
  if (!composed.ok) return refused(name, composed.lines);
  const args = bgArgs(composed.base, {
    permissionMode: PERMISSION_MODE,
    worktree: sessionOf(name),
    sessionName: sessionOf(name),
    prompt: armPrompt(name),
  });
  const hash = launchHash({
    loopJson: text.text,
    record: flags.record,
    args,
    profileDir: profile.dir,
    pluginDirs: profile.pluginDirs,
  });
  const state = stateOf(loop.state);
  return {
    kind: 'ready',
    name,
    dir,
    repo: manifest.repo,
    manifest,
    profile,
    args,
    hash,
    state,
    action: choose(loop, { paused: false, state, hash }),
    warnings: [
      ...checked.warnings,
      ...composed.warnings,
      ...mandateWarnings(file, overlay, manifest, flags.record),
    ],
  };
}

const manifestOfText = (text: string): LoopManifest | undefined => {
  try {
    const read = parseLoopManifest(JSON.parse(text));
    return read.ok ? read.manifest : undefined;
  } catch {
    return undefined;
  }
};

type Text = { text: string } | { issue: string };

function readText(file: string): Text {
  try {
    return { text: fs.readFileSync(file, 'utf-8') };
  } catch (e) {
    return { issue: `${file}: cannot read the file: ${messageOf(e)}` };
  }
}

// `loop.json`'s text for the hash, read after the check. It must parse to the manifest the check judged, or the hash would cover bytes the compile never saw.
function checkedText(file: string, manifest: LoopManifest): Text {
  const read = readText(file);
  if ('issue' in read) return read;
  const reread = manifestOfText(read.text);
  const isSame =
    reread !== undefined && JSON.stringify(reread) === JSON.stringify(manifest);
  return isSame
    ? read
    : {
        issue: `${file}: the file changed while start read it; run start again`,
      };
}

type Composed =
  | { ok: true; base: string[]; warnings: string[] }
  | { ok: false; lines: string[] };

// `checkComposed` as if launched from the repo, so `doctor`, the plugin check, and the memory keys read it; its lines come back instead of printing.
function compose(
  profile: Profile,
  overlay: Settings,
  repo: string,
  lenv: LoopEnv,
): Composed {
  const penv: ProfileEnv = {
    ...lenv,
    cwd: repo,
    workTree: workTreeRootOf(repo, lenv.runGit),
  };
  const lines: string[] = [];
  const base = checkComposed(profile, penv, (line) => lines.push(line), {
    overlay,
  });
  return base === undefined
    ? { ok: false, lines }
    : { ok: true, base, warnings: lines };
}

// The compiled mandate's warnings: a rule both allowed and denied, and an act class that may land.
const mandateWarnings = (
  file: string,
  overlay: Settings,
  manifest: LoopManifest,
  record: boolean,
): string[] => [
  ...overlapRules(overlay).map(
    (rule) =>
      `${file}: ${rule} compiles into both permissions.allow and permissions.deny, and a deny wins, so the loop never runs it`,
  ),
  ...landActWarnings(manifest, record).map((line) => `${file}: ${line}`),
];
