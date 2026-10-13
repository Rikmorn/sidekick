/**
 * Where profiles live: the ordered store roots, name resolution, the layout
 * check that owns what a profile folder may hold, listing, and `new`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  isProfileName,
  PROFILE_NAME_RULE,
  type ProfileManifest,
  parseManifest,
  readManifest,
} from './profile-manifest.js';

export interface Profile {
  name: string;
  /** Absolute path of the profile's folder. */
  dir: string;
  root: string;
  manifest: ProfileManifest;
  /** Whether `.claude/rules/` holds a `.md` file at any depth. */
  hasRules: boolean;
}

export type LoadResult =
  | { ok: true; profile: Profile }
  | { ok: false; issues: string[] };

export interface ListedProfile {
  name: string;
  root: string;
  description: string | undefined;
  issues: string[];
}

export type NewResult =
  | { ok: true; dir: string }
  | { ok: false; issues: string[] };

const MANIFEST_FILE = 'profile.json';

const notAName = (name: string): string =>
  `"${name}" is not a profile name: use ${PROFILE_NAME_RULE}`;

const HIDES_AGENTS =
  "hides the repo's AGENTS.md in every profiled session; put the stance in .claude/rules/";
const ENABLES_PLUGINS =
  'can enable plugins outside the checked settings block; put settings in profile.json';
// From an `--add-dir` folder, Claude Code loads agents, skills, and commands
// only under the `project` setting source, so a profile could lose them silently.
const RULES_ONLY =
  'a profile holds only rules; agents, skills, and commands belong in a plugin the profile enables';

// Root files a profile folder may not hold, and why; the CLI owns the folder's layout.
const REFUSED_AT_ROOT: ReadonlyArray<{ path: string; why: string }> = [
  { path: 'CLAUDE.md', why: HIDES_AGENTS },
  { path: 'CLAUDE.local.md', why: HIDES_AGENTS },
];

// The one entry `.claude/` may hold; every other entry is refused.
const CLAUDE_DIR_ALLOWS = 'rules';

// Entries of `.claude/` refused for a reason of their own, not RULES_ONLY.
const CLAUDE_DIR_REASONS: ReadonlyMap<string, string> = new Map([
  ['CLAUDE.md', HIDES_AGENTS],
  ['settings.json', ENABLES_PLUGINS],
  ['settings.local.json', ENABLES_PLUGINS],
]);

/** The store's roots in search order; the first root holding a name wins. */
export function storeRoots(
  env: NodeJS.ProcessEnv,
  cwd: string,
  home: string,
): string[] {
  const override = env.SIDEKICK_PROFILES_DIR;
  if (override) return [path.resolve(cwd, override)];
  const configDir = env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  return [path.resolve(cwd, configDir, 'profiles')];
}

// A dangling symlink counts as present.
const isPresent = (file: string): boolean => {
  try {
    fs.lstatSync(file);
    return true;
  } catch {
    return false;
  }
};

const isDirectory = (dir: string): boolean => {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
};

// A missing or unreadable folder lists nothing.
const entriesOf = (dir: string): string[] => {
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
};

/**
 * One `<path>: <why>` message per refused path in the profile folder: a root
 * `CLAUDE.md` or `CLAUDE.local.md`, and any entry of `.claude/` but `rules`.
 */
export function checkLayout(dir: string): string[] {
  const atRoot = REFUSED_AT_ROOT.filter((r) =>
    isPresent(path.join(dir, r.path)),
  ).map((r) => `${path.join(dir, r.path)}: ${r.why}`);
  const claudeDir = path.join(dir, '.claude');
  const inClaudeDir = entriesOf(claudeDir)
    .filter((name) => name !== CLAUDE_DIR_ALLOWS)
    .map(
      (name) =>
        `${path.join(claudeDir, name)}: ${CLAUDE_DIR_REASONS.get(name) ?? RULES_ONLY}`,
    );
  return [...atRoot, ...inClaudeDir];
}

// Walks by hand: readdirSync's `recursive` option is missing from some Node 20s.
const holdsMarkdown = (dir: string): boolean => {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  return entries.some((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return holdsMarkdown(full);
    if (e.isSymbolicLink() && isDirectory(full)) return holdsMarkdown(full);
    return e.name.endsWith('.md');
  });
};

const readFolder = (name: string, root: string): LoadResult => {
  const dir = path.resolve(root, name);
  const layout = checkLayout(dir);
  if (layout.length > 0) return { ok: false, issues: layout };
  const read = readManifest(path.join(dir, MANIFEST_FILE));
  if (!read.ok) return read;
  return {
    ok: true,
    profile: {
      name,
      dir,
      root,
      manifest: read.manifest,
      hasRules: holdsMarkdown(path.join(dir, '.claude', 'rules')),
    },
  };
};

/** Resolve `name` against the roots, check the folder's layout, and parse its manifest. */
export function loadProfile(name: string, roots: string[]): LoadResult {
  if (!isProfileName(name)) return { ok: false, issues: [notAName(name)] };
  const root = roots.find((r) => isDirectory(path.resolve(r, name)));
  if (root === undefined) {
    return {
      ok: false,
      issues: [
        `no profile named "${name}"; searched: ${roots.map((r) => path.resolve(r)).join(', ')}`,
      ],
    };
  }
  return readFolder(name, path.resolve(root));
}

// A dot-folder, such as `.git`, is never a profile: no name starts with a dot.
const isHidden = (name: string): boolean => name.startsWith('.');

const listRoot = (root: string): ListedProfile[] => {
  let names: string[];
  try {
    names = fs.readdirSync(root).sort();
  } catch {
    return [];
  }
  return names
    .filter((name) => !isHidden(name) && isDirectory(path.join(root, name)))
    .map((name): ListedProfile => {
      if (!isProfileName(name)) {
        return {
          name,
          root,
          description: undefined,
          issues: [notAName(name)],
        };
      }
      const loaded = readFolder(name, root);
      return loaded.ok
        ? {
            name,
            root,
            description: loaded.profile.manifest.description,
            issues: [],
          }
        : { name, root, description: undefined, issues: loaded.issues };
    });
};

/** Every profile in every root, each parsed; an invalid one carries its issues. */
export function listProfiles(roots: string[]): ListedProfile[] {
  return roots.flatMap((r) => listRoot(path.resolve(r)));
}

const isExists = (err: unknown): boolean =>
  err instanceof Error && 'code' in err && err.code === 'EEXIST';

const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

// `mkdirSync` with `recursive` throws EEXIST only when the root is not a folder.
const makeRoot = (root: string): string[] => {
  try {
    fs.mkdirSync(root, { recursive: true });
    return [];
  } catch (err) {
    return [
      `${root}: ${isExists(err) ? 'exists and is not a folder' : messageOf(err)}`,
    ];
  }
};

// Removes the folder `newProfile` made and any partial manifest in it; rmdir
// refuses a folder that holds anything else.
const unmake = (dir: string): string[] => {
  try {
    const manifest = path.join(dir, MANIFEST_FILE);
    if (isPresent(manifest)) fs.rmSync(manifest);
    fs.rmdirSync(dir);
    return [];
  } catch (err) {
    return [`${dir}: could not remove it: ${messageOf(err)}`];
  }
};

/** Create `<first root>/<name>/profile.json` holding only the description. */
export function newProfile(
  name: string,
  description: string,
  roots: string[],
): NewResult {
  if (!isProfileName(name)) return { ok: false, issues: [notAName(name)] };
  const manifest = { description };
  const parsed = parseManifest(manifest);
  if (!parsed.ok) return parsed;
  const [first] = roots;
  if (first === undefined)
    return { ok: false, issues: ['no store root is set'] };
  const root = path.resolve(first);
  const rootIssues = makeRoot(root);
  if (rootIssues.length > 0) return { ok: false, issues: rootIssues };
  const dir = path.join(root, name);
  try {
    fs.mkdirSync(dir);
  } catch (err) {
    const why = isExists(err) ? 'already exists' : messageOf(err);
    return { ok: false, issues: [`${dir}: ${why}`] };
  }
  const file = path.join(dir, MANIFEST_FILE);
  try {
    fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (err) {
    return {
      ok: false,
      issues: [`${file}: ${messageOf(err)}`, ...unmake(dir)],
    };
  }
  return { ok: true, dir };
}
