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
