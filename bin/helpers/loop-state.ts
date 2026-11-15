/**
 * A loop's runtime state: `state.json` (written by `start`), `armed.json`
 * (written by `arm --armed`), the launch hash, and the start lock. The schemas
 * are the one source of each file's fields; the types are inferred from them.
 */

import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import { CLASS_STATES } from './loop-manifest.js';

export const STATE_FILE = 'state.json';
export const ARMED_FILE = 'armed.json';
export const LOCK_FILE = 'start.lock';

const nonEmpty = v.pipe(v.string(), v.minLength(1, 'must not be empty'));
const time = v.pipe(v.string(), v.isoTimestamp('must be an ISO 8601 time'));

// `v.object` strips unknown keys, so a field a newer writer added still reads.
const StateSchema = v.object({
  v: v.literal(1),
  launch: nonEmpty,
  job: v.nullable(nonEmpty),
  session: nonEmpty,
  launchedAt: time,
  startedAt: time,
  hash: nonEmpty,
  record: v.boolean(),
  states: v.record(v.string(), v.picklist(CLASS_STATES)),
  schedule: nonEmpty,
  tick: nonEmpty,
  pausedAt: v.optional(time),
});

const ArmedSchema = v.object({
  v: v.literal(1),
  launch: nonEmpty,
  at: time,
  tick: nonEmpty,
  renewal: nonEmpty,
  renewalAt: time,
});

/**
 * The fields of `state.json`; `states` maps each class to its state as
 * launched. `pausedAt` is set once a paused run ends off, and only a fresh
 * launch, whose new file lacks it, clears it.
 */
export type LoopState = v.InferOutput<typeof StateSchema>;
export type Armed = v.InferOutput<typeof ArmedSchema>;

/** The result of reading a runtime file: missing, valid, or unusable with the reason. */
export type StateRead<T> =
  | { kind: 'absent' }
  | { kind: 'ok'; value: T }
  | { kind: 'broken'; issue: string };

const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const isMissing = (e: unknown): boolean =>
  e instanceof Error && 'code' in e && e.code === 'ENOENT';

const isExists = (e: unknown): boolean =>
  e instanceof Error && 'code' in e && e.code === 'EEXIST';

function readFileOf<S extends v.GenericSchema>(
  file: string,
  schema: S,
): StateRead<v.InferOutput<S>> {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf-8');
  } catch (e) {
    return isMissing(e)
      ? { kind: 'absent' }
      : {
          kind: 'broken',
          issue: `${file}: cannot read the file: ${messageOf(e)}`,
        };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return {
      kind: 'broken',
      issue: `${file}: not valid JSON: ${messageOf(e)}`,
    };
  }
  const parsed = v.safeParse(schema, json);
  if (parsed.success) return { kind: 'ok', value: parsed.output };
  const why = parsed.issues
    .map((i) => {
      const where = v.getDotPath(i);
      return where === null ? i.message : `${where}: ${i.message}`;
    })
    .join('; ');
  return { kind: 'broken', issue: `${file}: ${why}` };
}

/** Reads `<loopDir>/state.json`. */
export const readState = (loopDir: string): StateRead<LoopState> =>
  readFileOf(path.join(loopDir, STATE_FILE), StateSchema);

/** Reads `<loopDir>/armed.json`. */
export const readArmed = (loopDir: string): StateRead<Armed> =>
  readFileOf(path.join(loopDir, ARMED_FILE), ArmedSchema);

/** Writes `value` as JSON whole, through a temporary file and a rename; a crash between them leaves the temporary file. Returns issues, empty on success. */
export function writeWhole(file: string, value: unknown): string[] {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
    fs.renameSync(temp, file);
    return [];
  } catch (e) {
    fs.rmSync(temp, { force: true });
    return [`${file}: cannot write the file: ${messageOf(e)}`];
  }
}

/** Writes `state.json` whole, through a temporary file and a rename. Returns issues, empty on success. */
export const writeState = (loopDir: string, state: LoopState): string[] =>
  writeWhole(path.join(loopDir, STATE_FILE), state);

/** Writes `armed.json` whole, through a temporary file and a rename. Returns issues, empty on success. */
export const writeArmed = (loopDir: string, armed: Armed): string[] =>
  writeWhole(path.join(loopDir, ARMED_FILE), armed);

/** Removes `state.json`; a missing file is no issue. */
export function removeState(loopDir: string): string[] {
  const file = path.join(loopDir, STATE_FILE);
  try {
    fs.rmSync(file, { force: true });
    return [];
  } catch (e) {
    return [`${file}: cannot remove the file: ${messageOf(e)}`];
  }
}

/** The arm, only when its `launch` is the state's. A stale or unreadable arm gives none. */
export const currentArmed = (
  state: LoopState,
  armed: StateRead<Armed>,
): Armed | undefined =>
  armed.kind === 'ok' && armed.value.launch === state.launch
    ? armed.value
    : undefined;

/** The five inputs of a launch's identity. */
export interface HashInput {
  loopJson: string;
  record: boolean;
  args: readonly string[];
  profileDir: string;
  pluginDirs: readonly string[];
}

const sha256 = (data: string | Buffer): string =>
  createHash('sha256').update(data).digest('hex');

const SKIPPED_NAMES = new Set(['.git', 'node_modules', '.DS_Store']);
const TYPES_DIR = '.claude-plugin/types';
const MANIFEST = path.join('.claude-plugin', 'plugin.json');
const TSCONFIG = 'tsconfig.json';
// The one key of the `tsconfig.json` Claude Code writes into a `--plugin-dir` folder that has none (docs/research/control-centre/2026-10-15-mod-foundation-probes.md §Files the engine writes).
const ENGINE_EXTENDS = './.claude-plugin/types/tsconfig.json';
const UNREADABLE = 'unreadable';

// Whether a folder, by its absolute path, is a plugin folder whose root `tsconfig.json` the engine may have written.
type IsPluginFolder = (dir: string) => boolean;

// Links, `.git`, `node_modules`, `.DS_Store` (Finder writes it anywhere), and the types folder Claude Code rewrites, each at any depth.
const isSkipped = (child: string, name: string): boolean =>
  SKIPPED_NAMES.has(name) ||
  child === TYPES_DIR ||
  child.endsWith(`/${TYPES_DIR}`);

// `throwIfNoEntry: false` still throws EACCES, and a throw here would hash the whole folder as missing.
const holdsManifest = (dir: string): boolean => {
  try {
    return (
      fs
        .statSync(path.join(dir, MANIFEST), { throwIfNoEntry: false })
        ?.isFile() === true
    );
  } catch {
    return false;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// The parsed value is compared, so spacing and a trailing newline cannot defeat the skip.
function isEngineTsconfig(bytes: Buffer): boolean {
  try {
    const parsed: unknown = JSON.parse(bytes.toString('utf-8'));
    return (
      isRecord(parsed) &&
      Object.keys(parsed).length === 1 &&
      parsed.extends === ENGINE_EXTENDS
    );
  } catch {
    return false;
  }
}

const readBytes = (file: string): Buffer | null => {
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
};

function fileEntry(
  root: string,
  child: string,
  mayBeEngine: boolean,
): [string, string][] {
  const bytes = readBytes(path.join(root, child));
  if (bytes === null) return [[child, UNREADABLE]];
  return mayBeEngine && isEngineTsconfig(bytes) ? [] : [[child, sha256(bytes)]];
}

// Regular files by relative path, past the skipped entries and a plugin folder's engine `tsconfig.json`.
// A subfolder that cannot be listed digests as one unreadable entry; the root's failure reaches the caller.
function filesUnder(
  root: string,
  rel: string,
  isPlugin: IsPluginFolder,
): [string, string][] {
  const dir = path.resolve(root, rel);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    if (rel === '') throw e;
    return [[`${rel}/`, UNREADABLE]];
  }
  const atPlugin = isPlugin(dir);
  return entries.flatMap((entry): [string, string][] => {
    const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (isSkipped(child, entry.name)) return [];
    if (entry.isDirectory()) return filesUnder(root, child, isPlugin);
    if (!entry.isFile()) return [];
    return fileEntry(root, child, atPlugin && entry.name === TSCONFIG);
  });
}

const byPath = (a: [string, string], b: [string, string]): number =>
  a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;

// A missing or unreadable folder is `null`, so it hashes as missing; an empty folder is `[]`.
function folderDigest(
  dir: string,
  isPlugin: IsPluginFolder,
): [string, string][] | null {
  try {
    return filesUnder(dir, '', isPlugin).sort(byPath);
  } catch {
    return null;
  }
}

/**
 * SHA-256 hex of the launch's five inputs, framed as one JSON value so no two
 * inputs share a byte stream. The plugin folders, whose root `tsconfig.json`
 * is skipped when it is the engine's, are each `pluginDirs` entry and each
 * folder in the profile's folder that holds `.claude-plugin/plugin.json`.
 */
export function launchHash(input: HashInput): string {
  const plugins = new Set(input.pluginDirs.map((dir) => path.resolve(dir)));
  const isPluginDir: IsPluginFolder = (dir) => plugins.has(dir);
  const inProfile: IsPluginFolder = (dir) =>
    isPluginDir(dir) || holdsManifest(dir);
  return sha256(
    JSON.stringify([
      input.loopJson,
      input.record,
      input.args,
      folderDigest(input.profileDir, inProfile),
      input.pluginDirs.map((dir) => folderDigest(dir, isPluginDir)),
    ]),
  );
}

/** A taken start lock, or the reason it was refused. */
export type Lock =
  | { kind: 'held'; release: () => void }
  | { kind: 'busy'; issue: string };

const TAKEOVER_ATTEMPTS = 3;

// Creates `file` with `text` or fails with EEXIST. The content lands first, in a temporary file, and a hard link publishes it, so the lock is never seen half written.
function createExclusive(file: string, text: string): void {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, text);
    fs.linkSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

const readText = (file: string): string | null => {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
};

const HolderSchema = v.object({
  pid: v.pipe(v.number(), v.integer(), v.minValue(1)),
  at: v.optional(v.unknown()),
});

// The holder's pid, and when it took the lock in ms; an `at` that is not a time reads as NaN.
function holderOf(text: string): { pid: number; takenAt: number } | null {
  try {
    const parsed = v.safeParse(HolderSchema, JSON.parse(text));
    if (!parsed.success) return null;
    const { pid, at } = parsed.output;
    return {
      pid,
      takenAt: typeof at === 'string' ? Date.parse(at) : Number.NaN,
    };
  } catch {
    return null;
  }
}

const holderWords = (file: string): { who: string; again: string } =>
  path.basename(file) === LOCK_FILE
    ? { who: 'start', again: 'start' }
    : { who: 'unit verb', again: 'the verb' };

type Seen =
  | { kind: 'free' }
  | { kind: 'busy'; issue: string }
  | { kind: 'dead'; text: string };

// A lock taken before the boot is dead whatever its pid, since a pid may be reused after a reboot; NaN compares false, so an unreadable time leaves the pid to judge.
function inspectLock(
  file: string,
  opts: { bootTime: Date; isAlive: (pid: number) => boolean },
): Seen {
  const text = readText(file);
  if (text === null) return { kind: 'free' };
  const holder = holderOf(text);
  const { who, again } = holderWords(file);
  if (holder === null) {
    return {
      kind: 'busy',
      issue: `${file}: the lock file is unreadable; check that no ${who} is running, then delete it`,
    };
  }
  const isDead =
    holder.takenAt < opts.bootTime.getTime() || !opts.isAlive(holder.pid);
  return isDead
    ? { kind: 'dead', text }
    : {
        kind: 'busy',
        issue: `${file}: another ${who} holds the lock (pid ${holder.pid}); if no ${who} is running, delete the file, then run ${again} again`,
      };
}

// Moves the dead lock aside by rename, which one taker wins. A rename that moved a different lock puts it back, so a taker never removes a live holder's lock.
function removeDead(file: string, dead: string): string | null {
  const grave = `${file}.${randomUUID()}.dead`;
  try {
    fs.renameSync(file, grave);
  } catch (e) {
    return isMissing(e)
      ? null
      : `${file}: cannot take over the lock: ${messageOf(e)}`;
  }
  const moved = readText(grave);
  if (moved === dead) {
    fs.rmSync(grave, { force: true });
    return null;
  }
  try {
    fs.linkSync(grave, file);
  } catch {
    // Another taker created a lock meanwhile; both now hold one.
  }
  fs.rmSync(grave, { force: true });
  return `${file}: another ${holderWords(file).who} took the lock first`;
}

/**
 * Takes `<loopDir>/<lockFile>` (default `start.lock`) with an exclusive create, recording `pid` and `now`.
 * A lock taken before `bootTime`, or whose pid is dead, is taken over; one taken
 * since the boot whose pid is alive, or one that does not parse, is refused.
 * `release` removes the file only while it still holds this taker's text.
 */
export function takeLock(
  loopDir: string,
  opts: {
    pid: number;
    now: Date;
    bootTime: Date;
    isAlive: (pid: number) => boolean;
  },
  lockFile: string = LOCK_FILE,
): Lock {
  const file = path.join(loopDir, lockFile);
  const mine = JSON.stringify({ pid: opts.pid, at: opts.now.toISOString() });
  const release = (): void => {
    if (readText(file) === mine) fs.rmSync(file, { force: true });
  };
  for (let attempt = 0; attempt < TAKEOVER_ATTEMPTS; attempt++) {
    try {
      createExclusive(file, mine);
      return { kind: 'held', release };
    } catch (e) {
      if (!isExists(e)) {
        return {
          kind: 'busy',
          issue: `${file}: cannot take the lock: ${messageOf(e)}`,
        };
      }
    }
    const seen = inspectLock(file, opts);
    if (seen.kind === 'busy') return seen;
    if (seen.kind === 'dead') {
      const issue = removeDead(file, seen.text);
      if (issue !== null) return { kind: 'busy', issue };
    }
  }
  return { kind: 'busy', issue: `${file}: the lock kept changing hands` };
}
