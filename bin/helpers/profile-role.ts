/**
 * What a profile's role adds to a launch: the plugin folders its manifest and
 * the launch name, and the checks on them.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
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

/** The issues that make a profile's role unlaunchable, each naming `profile.json`. */
export function rolePluginIssues(profile: Profile): string[] {
  const manifestFile = path.join(profile.dir, 'profile.json');
  return profile.pluginDirs
    .filter((dir) => !isFolder(dir))
    .map((dir) => `${manifestFile}: pluginDirs: ${dir} is not a folder`);
}
