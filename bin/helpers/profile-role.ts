/**
 * What a profile's role adds to a launch: the plugin folders its manifest and
 * the launch name, and the checks on them.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { keyHits } from './memory-patterns.js';
import type { Profile } from './profile-store.js';

/** Report whether `dir` is a folder, following links. */
export const isFolder = (dir: string): boolean => {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
};

/** Refuse a `--plugin-dir` value that is not a folder; undefined passes. */
export const pluginDirIssues = (dir: string | undefined): string[] =>
  dir === undefined || isFolder(dir)
    ? []
    : [`--plugin-dir: ${dir} is not a folder`];

const skippedFolders = new Set(['.git', 'node_modules']);
const nulProbeBytes = 8192;

// Files under `dir`, skipping .git, node_modules, and every link; an unreadable folder yields none.
function pluginFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isFile()) return [full];
      if (entry.isDirectory() && !skippedFolders.has(entry.name))
        return pluginFiles(full);
      return [];
    });
  } catch {
    return [];
  }
}

// The file's text, or undefined when it is too big, binary, or unreadable.
function scannableText(file: string, maxBytes: number): string | undefined {
  try {
    if (fs.statSync(file).size > maxBytes) return undefined;
    const bytes = fs.readFileSync(file);
    return bytes.subarray(0, nulProbeBytes).includes(0)
      ? undefined
      : bytes.toString('utf8');
  } catch {
    return undefined;
  }
}

const keyIssues = (dir: string, maxBytes: number): string[] =>
  pluginFiles(dir).flatMap((file) => {
    const text = scannableText(file, maxBytes);
    const ids = text === undefined ? [] : keyHits(text);
    return ids.length === 0
      ? []
      : [
          `${file}: the key check flags it (${ids.join(', ')}); keep keys out of a role's plugin`,
        ];
  });

/** The issues that make a profile's role unlaunchable: a missing folder, or a file the key check flags. */
export function rolePluginIssues(
  profile: Profile,
  maxBytes = 1_048_576,
): string[] {
  const manifestFile = path.join(profile.dir, 'profile.json');
  return profile.pluginDirs.flatMap((dir) =>
    isFolder(dir)
      ? keyIssues(dir, maxBytes)
      : [`${manifestFile}: pluginDirs: ${dir} is not a folder`],
  );
}
