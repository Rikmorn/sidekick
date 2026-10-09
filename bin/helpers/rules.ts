/**
 * `sidekick rules install|check --project|--user` — the one thing a plugin
 * cannot do for itself: put path-scoped rule files where Claude Code reads
 * them. Ownership is the `sk-` prefix: this module writes and removes only
 * `sk-*.md`, and reports (never resolves) overlap with anything else.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ownedRulesIn, statusOf } from './rules-fs.js';
import { findOverlap, formatOverlap } from './rules-overlap.js';

export type Scope = 'project' | 'user';
export type DriftKind = 'stale' | 'missing' | 'orphaned';
export interface Drift {
  kind: DriftKind;
  name: string;
}
export type SkipWhy = 'not-a-regular-file' | 'case-collision';
export interface Skipped {
  name: string;
  why: SkipWhy;
}

export function resolveDest(
  scope: Scope,
  cwd: string,
  claudeHome: string,
): string {
  return scope === 'project'
    ? path.join(cwd, '.claude', 'rules')
    : path.join(claudeHome, 'rules');
}

/**
 * `--project` means the repo, not wherever the shell happens to be — a
 * monorepo subdirectory has its own writable `.claude/rules`, so a plain
 * cwd join silently scopes the install to that subtree. Falls back to
 * `cwd` outside a git work tree, so callers never need a second branch.
 */
export function repoRootOf(cwd: string): string {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return cwd;
  }
}

/**
 * `dest` must be a directory or absent — a plain file there throws
 * EEXIST here; that case is guarded in `runRulesCli`, not this function.
 */
export function installRules(
  src: string,
  dest: string,
): { installed: string[]; removed: string[]; skipped: Skipped[] } {
  const shipped = ownedRulesIn(src);
  // An empty source is a broken install far more often than a full
  // retirement, so it installs nothing and prunes nothing.
  if (shipped.length === 0) return { installed: [], removed: [], skipped: [] };
  fs.mkdirSync(dest, { recursive: true });

  // Snapshot the destination once. A shipped name is checked against this
  // snapshot rather than a fresh readdir per file, so writing an earlier
  // name in the loop cannot manufacture or mask a collision for a later
  // one.
  const byLowerCase = new Map<string, string>();
  for (const existing of fs.readdirSync(dest)) {
    byLowerCase.set(existing.toLowerCase(), existing);
  }

  const installed: string[] = [];
  const skipped: Skipped[] = [];
  for (const name of shipped) {
    const onDisk = byLowerCase.get(name.toLowerCase());
    if (onDisk !== undefined && onDisk !== name) {
      // A case-insensitive filesystem resolves `sk-a.md` and `SK-A.MD` to
      // the same inode, so a plain existence-and-type check on the write
      // path cannot see this: it would find "a regular file" and write.
      // Over-cautious on a case-sensitive filesystem, but harmless there
      // because it only reports.
      skipped.push({ name, why: 'case-collision' });
      continue;
    }
    if (statusOf(dest, name) === 'other') {
      // A directory or a symlink sits where the rule would go. Writing
      // through it would throw (EISDIR) or edit whatever the link
      // targets, so it is left alone and reported instead.
      skipped.push({ name, why: 'not-a-regular-file' });
      continue;
    }
    fs.copyFileSync(path.join(src, name), path.join(dest, name));
    installed.push(name);
  }

  const keep = new Set(shipped);
  const removed = ownedRulesIn(dest).filter((n) => !keep.has(n));
  for (const name of removed) fs.rmSync(path.join(dest, name));
  return { installed, removed, skipped };
}

export function checkRules(src: string, dest: string): Drift[] {
  const shipped = ownedRulesIn(src);
  const installed = ownedRulesIn(dest);
  const drift: Drift[] = [];
  for (const name of shipped) {
    const there = path.join(dest, name);
    if (!fs.existsSync(there)) {
      drift.push({ kind: 'missing', name });
      continue;
    }
    const same = fs
      .readFileSync(path.join(src, name))
      .equals(fs.readFileSync(there));
    if (!same) drift.push({ kind: 'stale', name });
  }
  const known = new Set(shipped);
  for (const name of installed) {
    if (!known.has(name)) drift.push({ kind: 'orphaned', name });
  }
  return drift;
}

const USAGE =
  'usage: sidekick rules <install|check> --project|--user [--strict]\n' +
  '  --project  the current repo\x27s .claude/rules/\n' +
  '  --user     the user-level rules directory under the Claude config dir\n' +
  '  --strict   exit 1 when drift or a skipped write is found\n' +
  'exit: 0 ran, whatever it found; 1 could not run, or --strict found drift';

function scopeOf(args: string[]): Scope | undefined {
  if (args.includes('--project')) return 'project';
  if (args.includes('--user')) return 'user';
  return undefined;
}

export function runRulesCli(
  args: string[],
  env: { src: string; cwd: string; claudeHome: string },
  out: (line: string) => void,
): number {
  const [verb] = args;
  const strict = args.includes('--strict');
  const scope = scopeOf(args.slice(1));
  if ((verb !== 'install' && verb !== 'check') || scope === undefined) {
    out(USAGE);
    return 1;
  }
  const root = scope === 'project' ? repoRootOf(env.cwd) : env.cwd;
  if (scope === 'project') out(`project root: ${root}`);
  const dest = resolveDest(scope, root, env.claudeHome);
  if (ownedRulesIn(env.src).length === 0) {
    out(`no sk-*.md rules found at ${env.src}; refusing to touch ${dest}`);
    return 1;
  }
  // A plain file (or anything else non-directory) at `dest` would make
  // `installRules`'s `mkdirSync` throw EEXIST, and `checkRules` /
  // `findOverlap`'s `readdirSync` throw ENOTDIR. Refuse before either
  // runs, so a bad `dest` is a reported exit code, not a stack trace.
  const destStat = fs.statSync(dest, { throwIfNoEntry: false });
  if (destStat && !destStat.isDirectory()) {
    out(`${dest} exists and is not a directory; refusing to write rules there`);
    return 1;
  }

  let skipped: Skipped[] = [];
  if (verb === 'install') {
    const result = installRules(env.src, dest);
    skipped = result.skipped;
    out(
      `installed ${result.installed.length} rule(s) into ${dest}: ${result.installed.join(', ')}`,
    );
    if (result.removed.length > 0) {
      out(`removed retired: ${result.removed.join(', ')}`);
    }
    for (const s of skipped) out(`[skipped:${s.why}] ${s.name}`);
  }

  const drift = checkRules(env.src, dest);
  const overlap = findOverlap(env.src, dest);
  if (drift.length === 0) {
    out(
      `${ownedRulesIn(env.src).length} rule(s) match the shipped copies at ${dest}`,
    );
  }
  for (const d of drift) out(`[${d.kind}] ${d.name}`);
  for (const l of formatOverlap(overlap)) out(l);
  const found = drift.length > 0 || skipped.length > 0;
  return strict && found ? 1 : 0;
}
