/**
 * The memory store's settings: `settings.json` at the store's root, which
 * holds the limits the memory lint checks each `MEMORY.md` against. The file
 * is optional; a missing or failing one leaves the defaults in force.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';

/** The settings file's name, at the store's root. */
export const STORE_SETTINGS_FILE = 'settings.json';

const POSITIVE_INTEGER = 'must be a positive integer';
const NOT_AN_OBJECT = 'the file must hold a JSON object';

const positiveInteger = v.pipe(
  v.number(POSITIVE_INTEGER),
  v.integer(POSITIVE_INTEGER),
  v.minValue(1, POSITIVE_INTEGER),
);

/**
 * The settings' schema; unknown keys are ignored.
 * - `indexLineCap`: lines allowed in a `MEMORY.md`; unset, only Claude Code's load limit applies.
 * - `indexLineLength`: characters allowed in one index line; 300 is unbacked, chosen 2026-11-02.
 */
export const StoreSettingsSchema = v.object(
  {
    indexLineCap: v.optional(positiveInteger),
    indexLineLength: v.optional(positiveInteger, 300),
  },
  NOT_AN_OBJECT,
);
export type StoreSettings = v.InferOutput<typeof StoreSettingsSchema>;

/** What `readStoreSettings` found; `issue` says why the defaults replaced the file. */
export interface StoreSettingsRead {
  settings: StoreSettings;
  issue?: string;
}

// The schema's own defaults, so each default lives in one place.
function defaults(): StoreSettings {
  return v.parse(StoreSettingsSchema, {});
}

type RawRead =
  | { kind: 'missing' }
  | { kind: 'raw'; value: unknown }
  | { kind: 'failed'; issue: string };

function readRaw(file: string): RawRead {
  const read = ((): { text: string } | { error: unknown } => {
    try {
      return { text: fs.readFileSync(file, 'utf8') };
    } catch (error) {
      return { error };
    }
  })();
  if ('error' in read) {
    const code = errorCode(read.error);
    if (code === 'ENOENT') return { kind: 'missing' };
    return { kind: 'failed', issue: `cannot be read (${code})` };
  }
  try {
    return { kind: 'raw', value: JSON.parse(read.text) };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return { kind: 'failed', issue: `not valid JSON: ${why}` };
  }
}

function errorCode(error: unknown): string {
  if (error instanceof Error && 'code' in error) return String(error.code);
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reads `<store>/settings.json`. A missing file gives the defaults and no
 * issue; an unreadable file, one that is not JSON, or one that fails the
 * schema gives the defaults and an `issue`.
 */
export function readStoreSettings(store: string): StoreSettingsRead {
  const raw = readRaw(path.join(store, STORE_SETTINGS_FILE));
  if (raw.kind === 'missing') return { settings: defaults() };
  if (raw.kind === 'failed') return { settings: defaults(), issue: raw.issue };
  // Valibot's object schema passes an array, which has none of the keys to fail.
  if (Array.isArray(raw.value)) {
    return { settings: defaults(), issue: NOT_AN_OBJECT };
  }
  const parsed = v.safeParse(StoreSettingsSchema, raw.value, {
    abortPipeEarly: true,
  });
  if (parsed.success) return { settings: parsed.output };
  const issue = parsed.issues
    .map((i) => {
      const key = v.getDotPath(i);
      return key === null ? i.message : `${key} ${i.message}`;
    })
    .join('; ');
  return { settings: defaults(), issue };
}
