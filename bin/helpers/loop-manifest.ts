/**
 * A loop's manifest: the one schema for `loop.json`, parsed at the boundary.
 * Later plans import its type and read no field of the file any other way.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import { parseCron } from './loop-cron.js';
import { isProfileName, PROFILE_NAME_RULE } from './profile-manifest.js';

export const LOOP_FILE = 'loop.json';

export const CLASS_STATES = ['record', 'ask', 'act'] as const;
export type ClassState = (typeof CLASS_STATES)[number];

const nonEmpty = v.pipe(v.string(), v.minLength(1, 'must not be empty'));

const profileName = v.pipe(
  v.string(),
  v.check(isProfileName, `must be ${PROFILE_NAME_RULE}`),
);

// A name is letters, digits, `-`, and `_`, starting with a letter or digit.
const TICK = /^\/(?:[A-Za-z0-9][\w-]*:)?[A-Za-z0-9][\w-]*(?: .*)?$/;

// Labels of letters, digits, and hyphens; at least one dot; a leading `*.` is allowed.
const HOST =
  /^(?:\*\.)?(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;

const schedule = v.pipe(
  v.string(),
  v.rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) return;
    const parsed = parseCron(dataset.value);
    if (!parsed.ok) addIssue({ message: parsed.issue });
  }),
);

const cap = v.pipe(
  v.number(),
  v.integer('must be a whole number'),
  v.minValue(1, 'must be at least 1'),
);

/**
 * The loop's limits. Each is a whole number of at least 1.
 *
 * - An attempt is one `dispatched` line for a unit.
 * - A dispatch under `start --record` writes `dispatched` with `record: true`.
 *   It counts toward `unitsPerDay` and `failedUnitsInARow`, not `attemptsPerUnit`.
 * - Working time runs from a unit's `dispatched` line, less its waits. A wait
 *   opens at a `request` line for the unit and closes at the next `answered`
 *   line for it, or runs to now. Waits count only up to `waitMinutesPerUnit`
 *   in total; past that, waiting counts as working.
 * - A day is the operator's local calendar day, the day that names each record file.
 */
const CapsSchema = v.strictObject({
  attemptsPerUnit: cap,
  workMinutesPerUnit: cap,
  waitMinutesPerUnit: cap,
  unitsPerDay: cap,
  failedUnitsInARow: cap,
});

const ClassSchema = v.strictObject({
  state: v.picklist(CLASS_STATES),
  allow: v.pipe(
    v.array(nonEmpty),
    v.minLength(1, 'must hold at least one rule'),
  ),
});

const MandateSchema = v.strictObject({
  reads: v.array(nonEmpty),
  classes: v.record(profileName, ClassSchema),
  never: v.array(nonEmpty),
});

const LoopSchema = v.strictObject({
  description: nonEmpty,
  repo: v.pipe(
    v.string(),
    v.check(path.isAbsolute, 'must be an absolute path'),
  ),
  profile: profileName,
  schedule,
  tick: v.pipe(
    v.string(),
    v.regex(
      TICK,
      'must start with / and a skill name, /<plugin>:<skill> or /<skill>',
    ),
  ),
  hosts: v.optional(
    v.array(
      v.pipe(
        v.string(),
        v.regex(HOST, 'must be a domain name, with an optional leading *.'),
      ),
    ),
    [],
  ),
  gates: v.array(nonEmpty),
  caps: CapsSchema,
  mandate: MandateSchema,
  // A paused loop stays off: `loop start` keeps it off and `list` ignores its issues.
  paused: v.optional(v.boolean()),
});

export type LoopManifest = v.InferOutput<typeof LoopSchema>;

export type ManifestRead =
  | { ok: true; manifest: LoopManifest }
  | { ok: false; issues: string[] };

/** Parse an already-decoded `loop.json`; each issue reads `<path>: <message>`. */
export function parseLoopManifest(raw: unknown): ManifestRead {
  const result = v.safeParse(LoopSchema, raw);
  if (result.success) return { ok: true, manifest: result.output };
  return {
    ok: false,
    issues: result.issues.map(
      (i) => `${v.getDotPath(i) ?? '(root)'}: ${i.message}`,
    ),
  };
}

const isMissing = (err: unknown): boolean =>
  err instanceof Error && 'code' in err && err.code === 'ENOENT';

const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

// The file's text, or why it could not be read.
function readText(file: string): { text: string } | { why: string } {
  try {
    return { text: fs.readFileSync(file, 'utf8') };
  } catch (err) {
    return { why: isMissing(err) ? 'missing' : messageOf(err) };
  }
}

// The decoded JSON, or the parser's message.
function decode(text: string): { raw: unknown } | { why: string } {
  try {
    return { raw: JSON.parse(text) };
  } catch (err) {
    return { why: `invalid JSON: ${messageOf(err)}` };
  }
}

/** Read and parse a `loop.json`; every issue starts with the file's path. */
export function readLoopManifest(file: string): ManifestRead {
  const read = readText(file);
  if ('why' in read) return { ok: false, issues: [`${file}: ${read.why}`] };
  const decoded = decode(read.text);
  if ('why' in decoded) {
    return { ok: false, issues: [`${file}: ${decoded.why}`] };
  }
  const parsed = parseLoopManifest(decoded.raw);
  if (parsed.ok) return parsed;
  return { ok: false, issues: parsed.issues.map((i) => `${file}: ${i}`) };
}
