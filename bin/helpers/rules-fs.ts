import * as fs from 'node:fs';
import * as path from 'node:path';

export const isOwnedRule = (name: string): boolean =>
  name.startsWith('sk-') && name.endsWith('.md');

// lstat, not stat: a symlink is neither a regular file nor a directory
// here, so a linked or nested entry is reported, never written through
// or enumerated as owned.
export function statusOf(
  dir: string,
  name: string,
): 'absent' | 'file' | 'other' {
  const st = fs.lstatSync(path.join(dir, name), { throwIfNoEntry: false });
  if (!st) return 'absent';
  return st.isFile() ? 'file' : 'other';
}

export const isRegularFile = (dir: string, name: string): boolean =>
  statusOf(dir, name) === 'file';

export function ownedRulesIn(dir: string): string[] {
  // stat, not lstat: a symlinked directory is still usable as one. This
  // only needs to keep `readdirSync` from throwing when `dir` is a plain
  // file or missing.
  const dirStat = fs.statSync(dir, { throwIfNoEntry: false });
  if (!dirStat) return [];
  if (!dirStat.isDirectory()) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => isOwnedRule(n) && isRegularFile(dir, n))
    .sort();
}
