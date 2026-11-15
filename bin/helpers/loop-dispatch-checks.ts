/**
 * The checks `sidekick loop dispatch` runs before it writes anything in the
 * loop's folder: its environment, the loop as `start` launched it, the
 * record's caps, the unit's skill, and the profile its launch would load.
 * Each names every reason it refuses.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { localMinute } from './local-date.js';
import { checkLoop, type LoopDeps } from './loop-check.js';
import { LOOP_FILE, type LoopManifest } from './loop-manifest.js';
import { sessionOf } from './loop-start-prepare.js';
import { type LoopState, readState, STATE_FILE } from './loop-state.js';
import { loopsRoot } from './loop-store.js';
import { type Attempt, capIssues, inFlight, readLedger } from './loop-units.js';
import { loadForLaunch, type ProfileEnv } from './profile.js';
import { isFolder, pluginNameOf } from './profile-role.js';
import type { Profile } from './profile-store.js';
import { sameFolder } from './sidekick-home.js';

/** The loop a dispatch runs for, as its check and its launch's state give it. */
export interface DispatchLoop {
  dir: string;
  manifest: LoopManifest;
  profile: Profile;
  state: LoopState;
}

const isSet = (value: string | undefined): value is string =>
  value !== undefined && value !== '';

/**
 * What in the environment refuses unit verb `verb` for loop `name`: a
 * worker's marker, since a worker runs no unit verb, and another loop's name,
 * since a loop acts only on its own units. An empty value reads as unset, as
 * a loop's compiled env sets `SIDEKICK_WORKER`.
 */
export function envIssues(
  env: NodeJS.ProcessEnv,
  name: string,
  verb: string,
): string[] {
  const { SIDEKICK_WORKER: worker, SIDEKICK_LOOP: loop } = env;
  return [
    ...(isSet(worker)
      ? [
          `SIDEKICK_WORKER is set: a worker runs no unit verb, so only a loop or the operator runs loop ${verb}`,
        ]
      : []),
    ...(isSet(loop) && loop !== name
      ? [
          `SIDEKICK_LOOP is "${loop}", so this session cannot run loop ${verb} for "${name}": a loop acts only on its own units`,
        ]
      : []),
  ];
}

// The launch `start` made: its `state.json`, naming the loop's own session.
function launchedState(
  dir: string,
  name: string,
): { state: LoopState } | { issues: string[] } {
  const file = path.join(dir, STATE_FILE);
  const read = readState(dir);
  if (read.kind === 'broken') return { issues: [read.issue] };
  if (read.kind === 'absent') {
    return {
      issues: [
        `${file} does not exist: sidekick loop start writes it, so dispatch runs only for a loop that start launched`,
      ],
    };
  }
  const session = sessionOf(name);
  return read.value.session === session
    ? { state: read.value }
    : {
        issues: [
          `${file} names the session "${read.value.session}", not "${session}": run sidekick loop start ${name}, which launches the loop and writes its state`,
        ],
      };
}

/**
 * The loop `name` in the store the environment names: its folder, its check
 * as `start` runs it, and its launch's `state.json`. A store that holds no
 * such loop refuses, so a daemon whose config folder differs from `start`'s
 * never writes another store.
 */
export function loadLoop(
  name: string,
  deps: LoopDeps,
): DispatchLoop | { issues: string[] } {
  const root = loopsRoot(deps.env, deps.cwd, deps.home);
  const dir = path.join(root, name);
  if (!isFolder(dir)) {
    return {
      issues: [
        `the loop store ${root} holds no loop "${name}": if the loop exists, CLAUDE_CONFIG_DIR here names another store than the one sidekick loop start used`,
      ],
    };
  }
  const check = checkLoop(name, deps);
  const launched = launchedState(dir, name);
  const issues = [
    ...check.issues,
    ...('issues' in launched ? launched.issues : []),
  ];
  const { manifest, profile } = check;
  if (issues.length > 0 || 'issues' in launched) return { issues };
  if (manifest === undefined || profile === undefined) {
    return {
      issues: [
        `${path.join(dir, LOOP_FILE)}: the check found no issue but loaded no ${manifest === undefined ? LOOP_FILE : 'profile'}, which is a bug in sidekick`,
      ],
    };
  }
  return { dir, manifest, profile, state: launched.state };
}

const inFlightLine = (name: string, open: Attempt): string =>
  `an attempt is in flight: unit ${open.unit}, worker ${open.worker === '' ? '(unnamed)' : open.worker}, dispatched ${localMinute(open.dispatchedAt)}. One worker runs at a time: read its report with sidekick loop report ${name} --unit ${open.unit}, or give up on it with sidekick loop discard ${name} --unit ${open.unit} --reason <text>`;

/**
 * What the record refuses: a day file it cannot read, since a count that
 * skips one undercounts, an attempt in flight, and each cap at its limit.
 */
export function ledgerIssues(
  loop: DispatchLoop,
  call: { name: string; unit: string },
  now: Date,
): string[] {
  const ledger = readLedger(loop.dir, now);
  if ('issues' in ledger) {
    return [
      ...ledger.issues,
      "dispatch cannot read the loop's record, so it cannot count the caps",
    ];
  }
  const open = inFlight(ledger.lines);
  return [
    ...(open === undefined ? [] : [inFlightLine(call.name, open)]),
    ...capIssues(ledger.lines, loop.manifest.caps, call.unit, now, call.name),
  ];
}

const isFile = (file: string): boolean => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

// Each plugin folder by the name its manifest gives, or why it gives none.
const namedPlugins = (profile: Profile) =>
  profile.pluginDirs.map((dir) => ({ dir, read: pluginNameOf(dir) }));

/**
 * Whether `<plugin>:<skill>` names a skill of the profile's role: the
 * `pluginDirs` entry whose `plugin.json` names `<plugin>` holds
 * `skills/<skill>/SKILL.md`. The caller has checked the spelling.
 */
export function skillIssues(profile: Profile, skill: string): string[] {
  const [plugin = '', name = ''] = skill.split(':');
  const plugins = namedPlugins(profile);
  const holder = plugins.find(
    (p) => 'name' in p.read && p.read.name === plugin,
  );
  if (holder === undefined) {
    const seen = plugins.map((p) =>
      'name' in p.read ? `${p.read.name} (${p.dir})` : p.read.issue,
    );
    const listed =
      seen.length === 0 ? ', which lists none' : `: ${seen.join('; ')}`;
    return [
      `--skill ${skill}: profile "${profile.name}" has no plugin named "${plugin}" among its pluginDirs${listed}`,
    ];
  }
  const file = path.join(holder.dir, 'skills', name, 'SKILL.md');
  return isFile(file)
    ? []
    : [
        `--skill ${skill}: ${file} does not exist, so the plugin "${plugin}" holds no skill "${name}"`,
      ];
}

/**
 * Whether the unit launch loads the profile folder the loop's check judged.
 * `penv` is the launch's own environment, so the lookup is the launch's. It
 * reads the profile store from the loop's worktree, where a repo store
 * would hide the user store's profile, and its plugins would run code from
 * origin's branch as the role's.
 */
export function launchProfileIssues(
  penv: ProfileEnv,
  profile: Profile,
): string[] {
  const lines: string[] = [];
  const loaded = loadForLaunch(profile.name, penv, (line) => lines.push(line));
  if (loaded === undefined) return lines;
  const { dir } = loaded;
  return sameFolder(dir, profile.dir)
    ? []
    : [
        `the unit launch would load profile "${profile.name}" from ${dir}, not ${profile.dir}, which the loop's check judged: a repo's own profile can run code from the repo's commits as the role's, so remove ${dir} from origin's default branch, or name another profile in loop.json`,
      ];
}
