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

/** Rules a project install delivers only where the repo enables the plugin: they govern its PM layer. */
export const PLUGIN_ONLY_RULES: readonly string[] = ['sk-pm-conventions.md'];

export type Enablement =
  | { state: 'enabled' }
  | { state: 'not-enabled' }
  | { state: 'unreadable'; path: string; reason: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const errorText = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/**
 * Whether `<root>/.claude/settings.json` enables sidekick. An absent or
 * blank file, or one with no `sidekick@` key set to `true`, reads
 * `not-enabled`. That state deletes a delivered copy, so any other
 * failure to read stays `unreadable`.
 */
export function pluginEnablement(root: string): Enablement {
  const file = path.join(root, '.claude', 'settings.json');
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf-8');
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
      return { state: 'not-enabled' };
    }
    return { state: 'unreadable', path: file, reason: errorText(e) };
  }
  if (text.trim() === '') return { state: 'not-enabled' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { state: 'unreadable', path: file, reason: errorText(e) };
  }
  if (!isRecord(parsed)) {
    return { state: 'unreadable', path: file, reason: 'not a JSON object' };
  }
  const plugins = parsed.enabledPlugins;
  const enabled =
    isRecord(plugins) &&
    Object.entries(plugins).some(
      ([key, on]) => key.startsWith('sidekick@') && on === true,
    );
  return { state: enabled ? 'enabled' : 'not-enabled' };
}

/** What a scope leaves out (and removes) and what it leaves exactly as it is. */
export interface ScopeSet {
  readonly leaveOut: readonly string[];
  readonly leaveAsIs: readonly string[];
}

export const EVERY_RULE: ScopeSet = { leaveOut: [], leaveAsIs: [] };

export function projectSet(e: Enablement): ScopeSet {
  switch (e.state) {
    case 'enabled':
      return EVERY_RULE;
    case 'not-enabled':
      return { leaveOut: PLUGIN_ONLY_RULES, leaveAsIs: [] };
    case 'unreadable':
      return { leaveOut: [], leaveAsIs: PLUGIN_ONLY_RULES };
    default: {
      const _exhaustive: never = e;
      throw new Error(`unhandled enablement: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// A name the source does not ship is a retired file, whatever the set says.
const shippedOnly = (set: ScopeSet, shipped: string[]): ScopeSet => ({
  leaveOut: set.leaveOut.filter((n) => shipped.includes(n)),
  leaveAsIs: set.leaveAsIs.filter((n) => shipped.includes(n)),
});

const expectedRules = (shipped: string[], set: ScopeSet): string[] =>
  shipped.filter(
    (n) => !set.leaveOut.includes(n) && !set.leaveAsIs.includes(n),
  );

/**
 * `dest` must be a directory or absent — a plain file there throws
 * EEXIST here; that case is guarded in `runRulesCli`, not this function.
 * `removed` is retired rules; `leftOut` is shipped copies on disk
 * that this scope removed because it does not deliver them.
 */
export function installRules(
  src: string,
  dest: string,
  scope: ScopeSet = EVERY_RULE,
): {
  installed: string[];
  removed: string[];
  leftOut: string[];
  skipped: Skipped[];
} {
  const shipped = ownedRulesIn(src);
  // An empty source is a broken install far more often than a full
  // retirement, so it installs nothing and prunes nothing.
  if (shipped.length === 0) {
    return { installed: [], removed: [], leftOut: [], skipped: [] };
  }
  const set = shippedOnly(scope, shipped);
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
  for (const name of expectedRules(shipped, set)) {
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
  const owned = ownedRulesIn(dest);
  const removed = owned.filter((n) => !keep.has(n));
  const leftOut = owned.filter((n) => set.leaveOut.includes(n));
  for (const name of [...removed, ...leftOut]) {
    fs.rmSync(path.join(dest, name));
  }
  return { installed, removed, leftOut, skipped };
}

export function checkRules(
  src: string,
  dest: string,
  scope: ScopeSet = EVERY_RULE,
): Drift[] {
  const shipped = ownedRulesIn(src);
  const set = shippedOnly(scope, shipped);
  const expected = expectedRules(shipped, set);
  const installed = ownedRulesIn(dest);
  const drift: Drift[] = [];
  for (const name of expected) {
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
  const known = new Set(expected);
  for (const name of installed) {
    if (!known.has(name) && !set.leaveAsIs.includes(name)) {
      drift.push({ kind: 'orphaned', name });
    }
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

function scopeSet(
  scope: Scope,
  root: string,
): { set: ScopeSet; notes: string[] } {
  if (scope === 'user') return { set: EVERY_RULE, notes: [] };
  const enablement = pluginEnablement(root);
  const set = projectSet(enablement);
  const notes: string[] = [];
  if (set.leaveOut.length > 0) {
    notes.push(
      `not delivered to this repo: ${set.leaveOut.join(', ')}; its .claude/settings.json does not enable sidekick, so it comes from user level only`,
    );
  }
  if (set.leaveAsIs.length > 0 && enablement.state === 'unreadable') {
    notes.push(
      `left ${set.leaveAsIs.join(', ')} as it is: could not read ${enablement.path} (${enablement.reason})`,
    );
  }
  return { set, notes };
}

function reportInstall(
  result: ReturnType<typeof installRules>,
  dest: string,
  out: (line: string) => void,
): void {
  out(
    `installed ${result.installed.length} rule(s) into ${dest}: ${result.installed.join(', ')}`,
  );
  if (result.removed.length > 0) {
    out(`removed retired: ${result.removed.join(', ')}`);
  }
  if (result.leftOut.length > 0) {
    out(`removed: ${result.leftOut.join(', ')} (not delivered to this repo)`);
  }
  for (const s of result.skipped) out(`[skipped:${s.why}] ${s.name}`);
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

  const { set, notes } = scopeSet(scope, root);
  let skipped: Skipped[] = [];
  if (verb === 'install') {
    const result = installRules(env.src, dest, set);
    skipped = result.skipped;
    reportInstall(result, dest, out);
  }
  for (const note of notes) out(note);

  const drift = checkRules(env.src, dest, set);
  const overlap = findOverlap(env.src, dest);
  if (drift.length === 0) {
    out(
      `${expectedRules(ownedRulesIn(env.src), set).length} rule(s) match the shipped copies at ${dest}`,
    );
  }
  for (const d of drift) out(`[${d.kind}] ${d.name}`);
  for (const l of formatOverlap(overlap)) out(l);
  const found = drift.length > 0 || skipped.length > 0;
  return strict && found ? 1 : 0;
}
