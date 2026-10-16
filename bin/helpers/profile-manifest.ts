/**
 * A profile's manifest: the one schema for `profile.json`, parsed at the
 * boundary. Nothing else in the CLI reads that file's fields.
 */

import * as fs from 'node:fs';
import * as v from 'valibot';
import { MOD_PARTS } from '../../plugin/hooks/scope/contract.js';

export const SETTING_SOURCES = ['user', 'project', 'local'] as const;
export type SettingSource = (typeof SETTING_SOURCES)[number];

export const PROFILE_NAME_RULE =
  '1 to 64 lowercase letters, digits, and hyphens, starting with a letter or digit';
const PROFILE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Report whether `name` can be a profile's folder name and a shell alias. */
export const isProfileName = (name: string): boolean => PROFILE_NAME.test(name);

// launch writes this key into every composed settings object.
const RESERVED_SETTINGS_KEY = 'sidekick';

const uniqueList = <T>(item: v.GenericSchema<T>) =>
  v.pipe(
    v.array(item),
    v.check((a) => new Set(a).size === a.length, 'must not repeat an entry'),
  );

const HideSchema = v.strictObject({
  agents: v.optional(
    uniqueList(v.pipe(v.string(), v.minLength(1, 'must not be empty'))),
  ),
  mods: v.optional(uniqueList(v.picklist(MOD_PARTS))),
});

const ManifestSchema = v.strictObject({
  description: v.pipe(v.string(), v.minLength(1, 'must not be empty')),
  settingSources: v.optional(
    v.pipe(
      v.array(v.picklist(SETTING_SOURCES)),
      v.check((a) => new Set(a).size === a.length, 'must not repeat a source'),
    ),
  ),
  settings: v.optional(
    v.pipe(
      v.unknown(),
      // valibot's record accepts an array, and rebuilds it as a plain object,
      // so the array check runs on the raw value.
      v.check((s) => !Array.isArray(s), 'must be an object'),
      v.record(v.string(), v.unknown()),
      v.check(
        (s) => !Object.hasOwn(s, RESERVED_SETTINGS_KEY),
        `must not set "${RESERVED_SETTINGS_KEY}", which launch owns`,
      ),
    ),
  ),
  hide: v.optional(HideSchema),
});

export type ProfileManifest = v.InferOutput<typeof ManifestSchema>;

export type ManifestResult =
  | { ok: true; manifest: ProfileManifest }
  | { ok: false; issues: string[] };

/** Parse an already-decoded `profile.json`; each issue reads `<path>: <message>`. */
export function parseManifest(raw: unknown): ManifestResult {
  const result = v.safeParse(ManifestSchema, raw);
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

/** Read and parse a manifest file; every issue starts with the file's path. */
export function readManifest(file: string): ManifestResult {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    const why = isMissing(err)
      ? 'missing'
      : err instanceof Error
        ? err.message
        : String(err);
    return { ok: false, issues: [`${file}: ${why}`] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { ok: false, issues: [`${file}: invalid JSON: ${why}`] };
  }
  const parsed = parseManifest(raw);
  if (parsed.ok) return parsed;
  return { ok: false, issues: parsed.issues.map((i) => `${file}: ${i}`) };
}
