/**
 * The refusal that holds each profile verb that reads or writes a store, and
 * `worker dispatch`, while the old user store, `<config>/profiles`, still holds
 * a profile. The profile store moved to `<config>/sidekick/profiles`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import { shellQuote } from './shell.js';
import {
  configDir,
  realPathOf,
  sameFolder,
  sidekickHome,
} from './sidekick-home.js';

// Claude Code's own undocumented file: read leniently, so a new field never hides a job.
const JobState = v.looseObject({
  respawnFlags: v.array(v.string()),
  name: v.optional(v.string()),
});

const isFolder = (dir: string): boolean => {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
};

const readJob = (file: string): v.InferOutput<typeof JobState> | undefined => {
  try {
    const parsed = v.safeParse(
      JobState,
      JSON.parse(fs.readFileSync(file, 'utf-8')),
    );
    return parsed.success ? parsed.output : undefined;
  } catch {
    return undefined;
  }
};

const underOrEqual = (flag: string, dir: string): boolean =>
  flag === dir || flag.startsWith(dir + path.sep);

const jobIds = (jobsDir: string): string[] => {
  try {
    return fs.readdirSync(jobsDir).sort();
  } catch {
    return [];
  }
};

/**
 * The jobs under `<configFolder>/jobs` whose respawn flags name `oldStore` or
 * a path under it, as spelled or by real path, so a link on either side still
 * matches. A record that cannot be read or parsed is skipped.
 */
export function jobsFromStore(
  configFolder: string,
  oldStore: string,
): Array<{ id: string; name: string | undefined }> {
  const jobsDir = path.join(configFolder, 'jobs');
  const realStore = realPathOf(oldStore);
  const namesStore = (flag: string): boolean =>
    underOrEqual(flag, oldStore) ||
    (path.isAbsolute(flag) && underOrEqual(realPathOf(flag), realStore));
  return jobIds(jobsDir).flatMap((id) => {
    const job = readJob(path.join(jobsDir, id, 'state.json'));
    return job?.respawnFlags.some(namesStore) ? [{ id, name: job.name }] : [];
  });
}

const heldNames = (oldStore: string): string[] => {
  try {
    return fs
      .readdirSync(oldStore)
      .filter((n) => !n.startsWith('.') && isFolder(path.join(oldStore, n)))
      .sort();
  } catch {
    return [];
  }
};

const moveLines = (
  oldStore: string,
  newStore: string,
  names: string[],
): string[] => {
  if (!fs.existsSync(newStore)) {
    return [
      `mkdir -p ${shellQuote(path.dirname(newStore))} && mv ${shellQuote(oldStore)} ${shellQuote(newStore)}`,
    ];
  }
  return names.map((name) => {
    const from = path.join(oldStore, name);
    const to = path.join(newStore, name);
    return fs.existsSync(to)
      ? `${shellQuote(to)} already exists: merge ${shellQuote(from)} into it by hand`
      : `mv ${shellQuote(from)} ${shellQuote(to)}`;
  });
};

const linkTarget = (oldStore: string): string | undefined => {
  try {
    return fs.lstatSync(oldStore).isSymbolicLink()
      ? fs.realpathSync(oldStore)
      : undefined;
  } catch {
    return undefined;
  }
};

// A `mv` of a link moves the link, which a relative target then leaves
// dangling.
const relinkLines = (
  oldStore: string,
  newStore: string,
  target: string,
): string[] => {
  if (!fs.existsSync(newStore)) {
    return [
      `mkdir -p ${shellQuote(path.dirname(newStore))} && ln -s ${shellQuote(target)} ${shellQuote(newStore)} && rm ${shellQuote(oldStore)}`,
    ];
  }
  return [
    `${shellQuote(oldStore)} links to ${shellQuote(target)}, and ${shellQuote(newStore)} already exists: merge the profiles in ${shellQuote(target)} into it by hand, then rm ${shellQuote(oldStore)}`,
  ];
};

/**
 * The lines that refuse a profile verb while the old store holds a profile,
 * empty when nothing refuses. They give the move to run and name each job whose
 * respawn the move breaks.
 */
export function oldStoreIssues(
  env: NodeJS.ProcessEnv,
  cwd: string,
  home: string,
): string[] {
  if (env.SIDEKICK_PROFILES_DIR) return [];
  const config = configDir(env, cwd, home);
  const oldStore = path.join(config, 'profiles');
  const newStore = path.join(sidekickHome(env, cwd, home), 'profiles');
  if (!isFolder(oldStore) || sameFolder(oldStore, newStore)) return [];
  const names = heldNames(oldStore);
  if (names.length === 0) return [];
  const target = linkTarget(oldStore);
  return [
    `profiles still sit in the old store ${oldStore} (${names.join(', ')}); move them to ${newStore}, then run the command again`,
    ...(target === undefined
      ? moveLines(oldStore, newStore, names)
      : relinkLines(oldStore, newStore, target)),
    ...jobsFromStore(config, oldStore).map(
      ({ id, name }) =>
        `job ${id}${name === undefined ? '' : ` (${name})`} respawns from the old store: its respawn breaks after the move, so relaunch it once the store has moved`,
    ),
  ];
}
