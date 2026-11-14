/**
 * The cheap check of a loop: what refuses its launch and what warns, from its
 * folder, its repo, and its profile. It leaves out the inherited listing.
 */

import * as path from 'node:path';
import { keptLayers, type Layer, summariseLayer } from './loop-layers.js';
import {
  LOOP_FILE,
  type LoopManifest,
  readLoopManifest,
} from './loop-manifest.js';
import { type RuleList, ruleIssues } from './loop-rules.js';
import { loopsRoot, RUNTIME_ENTRIES } from './loop-store.js';
import { outsideRepo, revParseLine } from './outside-repo.js';
import type { Runner } from './pm-data.js';
import { isProfileName, PROFILE_NAME_RULE } from './profile-manifest.js';
import { oldStoreIssues } from './profile-old-store.js';
import { isFolder, keyIssues, rolePluginIssues } from './profile-role.js';
import { loadProfile, type Profile, storeRoots } from './profile-store.js';
import { configDir, realPathOf, sidekickHome } from './sidekick-home.js';

/** What the check reads beyond the loop's folder. */
export interface LoopDeps {
  env: NodeJS.ProcessEnv;
  cwd: string;
  home: string;
  /** Runs every git call. */
  runGit: Runner;
  /** The managed settings file; `keptLayers` gives the default. */
  managedFile?: string;
}

/**
 * A loop's check. `manifest` is set when `loop.json` parses, and `profile`
 * when the search finds a profile that loads, issues or not. Each issue and
 * warning reads `<path>: <why>`.
 */
export interface LoopCheck {
  dir: string;
  manifest: LoopManifest | undefined;
  profile: Profile | undefined;
  issues: string[];
  warnings: string[];
}

/** Why a host that reaches github.com warns. */
export const GITHUB_HOST_WARNING =
  "it lets workers reach GitHub, where a worker can push by a spelling the push block misses; keep GitHub out of the workers' network";

const LOOP_KEY_ADVICE = "keep keys out of a loop's folder";
const UNREAD_LAYER =
  'the check cannot read it, so it cannot see the hosts it lets workers reach';
const GITHUB = 'github.com';

/** Refuse what a launch must not run, and warn where the workers' network reaches github.com. Throws only when `runGit` does. */
export function checkLoop(name: string, deps: LoopDeps): LoopCheck {
  const dir = path.join(loopsRoot(deps.env, deps.cwd, deps.home), name);
  const refused = (issues: string[]): LoopCheck => ({
    dir,
    manifest: undefined,
    profile: undefined,
    issues,
    warnings: [],
  });
  if (!isProfileName(name)) {
    return refused([
      `${dir}: "${name}" is not a loop name: use ${PROFILE_NAME_RULE}`,
    ]);
  }
  const file = path.join(dir, LOOP_FILE);
  const keys = keyIssues(dir, LOOP_KEY_ADVICE, {
    skipAtTop: new Set(RUNTIME_ENTRIES),
  });
  const read = readLoopManifest(file);
  if (!read.ok) return refused([...read.issues, ...keys]);
  const { manifest } = read;
  const resolved = resolveProfile(file, manifest, deps);
  const layers =
    resolved.profile === undefined
      ? []
      : keptLayers(
          resolved.profile,
          manifest.repo,
          configDir(deps.env, deps.cwd, deps.home),
          deps.managedFile,
        );
  return {
    dir,
    manifest,
    profile: resolved.profile,
    issues: [
      ...mainCheckoutIssues(
        `${file}: repo: ${manifest.repo}`,
        manifest.repo,
        deps.runGit,
      ),
      ...resolved.issues,
      ...keys,
      ...mandateIssues(file, manifest),
    ],
    warnings: [
      ...githubWarnings(`${file}: hosts`, manifest.hosts),
      ...layers.flatMap(layerWarnings),
    ],
  };
}

// `where` opens each issue; `repo` must be a main checkout's root: a work tree's top whose git dir is its own `.git`.
function mainCheckoutIssues(
  where: string,
  repo: string,
  runGit: Runner,
): string[] {
  if (!isFolder(repo)) return [`${where} is not a folder`];
  const top = runGit('git', ['rev-parse', '--show-toplevel'], repo);
  if (top.code !== 0) {
    const line = revParseLine(top.stderr);
    return outsideRepo(line, repo)
      ? [`${where} is not in a git repo; name a main checkout's root`]
      : [`${where}: git rev-parse failed: ${line}`];
  }
  const realTop = realPathOf(top.stdout.trim());
  if (realTop !== realPathOf(repo)) {
    return [
      `${where} is inside the work tree ${realTop}; name its main checkout's root`,
    ];
  }
  const common = runGit('git', ['rev-parse', '--git-common-dir'], repo);
  if (common.code !== 0) {
    return [`${where}: git rev-parse failed: ${revParseLine(common.stderr)}`];
  }
  // git may print the common dir relative to the folder it ran in.
  const commonDir = realPathOf(path.resolve(repo, common.stdout.trim()));
  return commonDir === realPathOf(path.join(repo, '.git'))
    ? []
    : [
        `${where} keeps its git dir at ${commonDir}, as a linked worktree or a submodule does; name the main checkout's root`,
      ];
}

type Resolved = { profile: Profile | undefined; issues: string[] };

// The search a launch in the loop's repo makes; the old store's refusal holds it, as it holds every profile verb.
function resolveProfile(
  file: string,
  manifest: LoopManifest,
  deps: LoopDeps,
): Resolved {
  const { env, cwd, home } = deps;
  const old = oldStoreIssues(env, cwd, home);
  if (old.length > 0) return { profile: undefined, issues: old };
  const name = manifest.profile;
  const roots = storeRoots('profiles', env, cwd, home, {
    kind: 'inside',
    top: manifest.repo,
  });
  const loaded = loadProfile(name, roots);
  if (!loaded.ok) {
    // A held profile's issues name its own files; only a missing one is the loop's to fix.
    const held = roots.some((root) => isFolder(path.join(root.dir, name)));
    const issues = held
      ? loaded.issues
      : loaded.issues.map((issue) => `${file}: profile: ${issue}`);
    return { profile: undefined, issues };
  }
  const { profile } = loaded;
  const userStore = path.join(sidekickHome(env, cwd, home), 'profiles');
  const fromRepo =
    profile.store === 'repo'
      ? [
          `${file}: profile: "${name}" resolves to the repo store's ${profile.dir}, whose plugin code the repo's commits can change; keep the loop's profile in ${userStore}`,
        ]
      : [];
  return { profile, issues: [...fromRepo, ...rolePluginIssues(profile)] };
}

// One rule list of the mandate, at its dot path in `loop.json`.
type RulesAt = { at: string; list: RuleList; rules: string[] };

function mandateLists(manifest: LoopManifest): RulesAt[] {
  const { reads, classes, never } = manifest.mandate;
  return [
    { at: 'mandate.reads', list: 'reads', rules: reads },
    ...Object.entries(classes).map(
      ([name, cls]): RulesAt => ({
        at: `mandate.classes.${name}.allow`,
        list: 'allow',
        rules: cls.allow,
      }),
    ),
    { at: 'mandate.never', list: 'never', rules: never },
  ];
}

function mandateIssues(file: string, manifest: LoopManifest): string[] {
  return mandateLists(manifest).flatMap(({ at, list, rules }) =>
    rules.flatMap((rule, i) =>
      ruleIssues(rule, list, manifest.repo).map(
        (why) => `${file}: ${at}.${i}: ${why}`,
      ),
    ),
  );
}

const inGithub = (host: string): boolean =>
  host === GITHUB || host.endsWith(`.${GITHUB}`);

// Whether a host pattern matches github.com or a subdomain of it; `*.b` matches every host ending in `.b`.
function reachesGithub(pattern: string): boolean {
  const host = pattern.trim().toLowerCase().replace(/\.$/, '');
  if (host === '*') return true;
  if (!host.startsWith('*.')) return inGithub(host);
  const base = host.slice('*.'.length);
  return inGithub(base) || GITHUB.endsWith(`.${base}`);
}

const githubWarnings = (where: string, hosts: readonly string[]): string[] =>
  hosts
    .filter(reachesGithub)
    .map((host) => `${where}: ${host}: ${GITHUB_HOST_WARNING}`);

function layerWarnings(layer: Layer): string[] {
  if (!('settings' in layer)) {
    return [`${layer.file}: ${UNREAD_LAYER}: ${layer.issue}`];
  }
  const keyPath =
    layer.name === 'profile'
      ? 'settings.sandbox.network.allowedDomains'
      : 'sandbox.network.allowedDomains';
  return githubWarnings(
    `${layer.file}: ${keyPath}`,
    summariseLayer(layer.settings).allowedDomains,
  );
}
