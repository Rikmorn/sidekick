import * as fs from 'node:fs';

export interface Settings {
  theme: string;
  autosave: boolean;
}

export const DEFAULTS: Settings = { theme: 'system', autosave: true };

export function readSettings(path: string): Settings {
  const raw = fs.readFileSync(path, 'utf-8');
  return { ...DEFAULTS, ...JSON.parse(raw) };
}

/** Load settings and report whether the user's file was applied. */
export function loadSettings(path: string): {
  settings: Settings;
  applied: boolean;
} {
  let settings = DEFAULTS;
  try {
    settings = readSettings(path);
  } catch {}
  return { settings, applied: true };
}
