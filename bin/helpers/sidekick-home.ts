/**
 * The folder sidekick keeps its user files in, `<config>/sidekick/`, and the
 * git repo that folder is.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { configDirOf } from './main-session.js';
import { isWorkTreeTop } from './memory-store.js';
import type { Runner } from './pm-data.js';

/** Claude Code's config folder, resolved against `cwd` when `CLAUDE_CONFIG_DIR` is relative. */
export const configDir = (
  env: NodeJS.ProcessEnv,
  cwd: string,
  home: string,
): string => path.resolve(cwd, configDirOf(env, home));

/** `<config>/sidekick`. */
export const sidekickHome = (
  env: NodeJS.ProcessEnv,
  cwd: string,
  home: string,
): string => path.join(configDir(env, cwd, home), 'sidekick');

const IGNORED = ['loops/*/records/', 'loops/*/state.json'];

/**
 * The real path of `p`, or of its deepest existing ancestor with the rest of
 * `p` appended, so a missing path under a link resolves through the link.
 */
export function realPathOf(p: string): string {
  const resolved = path.resolve(p);
  try {
    return fs.realpathSync(resolved);
  } catch {
    const parent = path.dirname(resolved);
    return parent === resolved
      ? resolved
      : path.join(realPathOf(parent), path.basename(resolved));
  }
}

/** Whether `a` and `b` are one folder: equal by `realPathOf`. */
export const sameFolder = (a: string, b: string): boolean =>
  realPathOf(a) === realPathOf(b);

const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/**
 * Makes `dir` a git repo of its own when it is not a work tree's top, and
 * writes its `.gitignore` when absent. Returns `<path>: <why>` lines, empty on
 * success. Never commits.
 */
export function ensureSidekickRepo(dir: string, runGit: Runner): string[] {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    return [`${dir}: cannot make the folder: ${messageOf(e)}`];
  }
  if (!isWorkTreeTop(dir, runGit)) {
    const init = runGit('git', ['init'], dir);
    if (init.code !== 0) {
      return [`${dir}: git init failed: ${init.stderr.trim()}`];
    }
  }
  const ignore = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignore)) {
    try {
      fs.writeFileSync(ignore, `${IGNORED.join('\n')}\n`);
    } catch (e) {
      return [`${ignore}: cannot write the file: ${messageOf(e)}`];
    }
  }
  return [];
}
