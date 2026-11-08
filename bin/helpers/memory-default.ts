/**
 * Claude Code's default memory folder for a repo: the folder `sidekick memory
 * link` copies existing auto-memory out of. It must match the folder Claude
 * Code uses exactly, so `overrideIssue` names the settings that move it and
 * `knownRoot` checks the computed key against the roots Claude Code has opened.
 *
 * Read in the Claude Code 2.1.316 binary (`strings` and a `python3` `mmap`
 * search for `.claude.json`, 2026-11-01). The global config file is
 * `getGlobalClaudeFile()`, built by:
 *
 *     function y_(){ if(X()) return zwr();
 *       let o = x(Ne(), ".config.json"), t = zwr();
 *       try { let _ = statSync(o);
 *         if (_.isFile() && (_.size>0 || (_.mode&146)!==0 && !existsSync(t))) return o } catch {}
 *       return t }
 *     function zwr(){ let o = `.claude${JU()}.json`;
 *       return x(process.env.CLAUDE_CONFIG_DIR || g_(), o) }
 *
 * `JU()` is `""` for the production backend, and `-custom-oauth`,
 * `-local-oauth`, or `-staging-oauth` for others; this module covers
 * production only. `g_()` is the home folder. A second site builds the legacy
 * file as `O(E, ".config.json")` with `E = CLAUDE_CONFIG_DIR ?? ~/.claude`, so
 * `Ne()` is read as that config folder (inferred from the second site; the
 * minified name `Ne` was not traced). `X()` is Claude Code's diskless mode,
 * which this module does not model.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import { configDirOf } from './main-session.js';

// Longest key Claude Code keeps whole; longer keys are cut and hash-suffixed.
const MAX_KEY_LENGTH = 200;
// Write-permission bits (0o222) the legacy-file check tests with `mode & 146`.
const WRITE_BITS = 0o222;

function hashOf(text: string): number {
  // Folds UTF-16 code units, as Claude Code's `charCodeAt` loop does.
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return h;
}

/** Claude Code's project key for `p`: non-alphanumerics become `-`, long keys get a hash suffix. */
export function projectKey(p: string): string {
  const key = p.replace(/[^a-zA-Z0-9]/g, '-');
  if (key.length <= MAX_KEY_LENGTH) return key;
  return `${key.slice(0, MAX_KEY_LENGTH)}-${Math.abs(hashOf(p)).toString(36)}`;
}

/** `<configDir>/projects/<key>/memory`, where Claude Code keeps `root`'s auto-memory. */
export function defaultMemoryFolder(root: string, configDir: string): string {
  return path.join(configDir, 'projects', projectKey(root), 'memory');
}

/** Why the default folder cannot be trusted in `env`, naming the variable to unset, or undefined when it can. */
export function overrideIssue(env: NodeJS.ProcessEnv): string | undefined {
  if (env.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE !== undefined) {
    return 'CLAUDE_COWORK_MEMORY_PATH_OVERRIDE is set, so Claude Code keeps memory elsewhere. Unset CLAUDE_COWORK_MEMORY_PATH_OVERRIDE and run link again.';
  }
  if (env.CLAUDE_CODE_REMOTE_MEMORY_DIR !== undefined) {
    return 'CLAUDE_CODE_REMOTE_MEMORY_DIR is set, so Claude Code keeps memory elsewhere. Unset CLAUDE_CODE_REMOTE_MEMORY_DIR and run link again.';
  }
  if (
    env.CLAUDE_CODE_PROJECT_DIR_NAME !== undefined &&
    env.CLAUDE_CONFIG_DIR !== undefined
  ) {
    return 'CLAUDE_CODE_PROJECT_DIR_NAME is set together with CLAUDE_CONFIG_DIR, so Claude Code names the project folder differently. Unset CLAUDE_CODE_PROJECT_DIR_NAME and run link again.';
  }
  return undefined;
}

const ClaudeJson = v.object({ projects: v.record(v.string(), v.unknown()) });

/** Whether `.projects` in the file at `claudeJson` has `root` as a key; any read or parse failure is false. */
export function knownRoot(root: string, claudeJson: string): boolean {
  try {
    const parsed = v.safeParse(
      ClaudeJson,
      JSON.parse(fs.readFileSync(claudeJson, 'utf-8')),
    );
    return parsed.success && Object.hasOwn(parsed.output.projects, root);
  } catch {
    return false;
  }
}

// Claude Code prefers the legacy file when it has content, or is writable
// while the new file does not exist.
function legacyPreferred(legacy: string, current: string): boolean {
  try {
    const stat = fs.statSync(legacy);
    if (!stat.isFile()) return false;
    return (
      stat.size > 0 ||
      ((stat.mode & WRITE_BITS) !== 0 && !fs.existsSync(current))
    );
  } catch {
    return false;
  }
}

/** The global config file Claude Code reads: `<CLAUDE_CONFIG_DIR or home>/.claude.json`, or the legacy `<config folder>/.config.json` when Claude Code prefers it. */
export function claudeJsonPath(env: NodeJS.ProcessEnv, home: string): string {
  const current = path.join(env.CLAUDE_CONFIG_DIR || home, '.claude.json');
  const legacy = path.join(configDirOf(env, home), '.config.json');
  return legacyPreferred(legacy, current) ? legacy : current;
}
