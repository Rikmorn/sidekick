/**
 * `sidekick rules install|check --project|--user` — the one thing a plugin
 * cannot do for itself: put path-scoped rule files where Claude Code reads
 * them. Ownership is the `sk-` prefix: this module writes and removes only
 * `sk-*.md`, and reports (never resolves) overlap with anything else.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export type Scope = 'project' | 'user';
export type DriftKind = 'stale' | 'missing' | 'orphaned';
export interface Drift {
  kind: DriftKind;
  name: string;
}
export interface Overlap {
  file: string;
  rule: string;
  on: 'heading' | 'opening';
  value: string;
}

const isOwnedRule = (name: string): boolean =>
  name.startsWith('sk-') && name.endsWith('.md');

const isRegularFile = (dir: string, name: string): boolean =>
  fs.statSync(path.join(dir, name)).isFile();

function ownedRulesIn(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => isOwnedRule(n) && isRegularFile(dir, n))
    .sort();
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

export function installRules(
  src: string,
  dest: string,
): { installed: string[]; removed: string[] } {
  const shipped = ownedRulesIn(src);
  // An empty source is a broken install far more often than a full
  // retirement, so it installs nothing and prunes nothing.
  if (shipped.length === 0) return { installed: [], removed: [] };
  fs.mkdirSync(dest, { recursive: true });
  for (const name of shipped) {
    fs.copyFileSync(path.join(src, name), path.join(dest, name));
  }
  const keep = new Set(shipped);
  const removed = ownedRulesIn(dest).filter((n) => !keep.has(n));
  for (const name of removed) fs.rmSync(path.join(dest, name));
  return { installed: shipped, removed };
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

const normalise = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[.:;!?]+$/, '')
    .trim();

function headingsOf(body: string): string[] {
  return body
    .split('\n')
    .filter((l) => l.startsWith('## '))
    .map((l) => normalise(l.slice(3)));
}

function openingOf(body: string): string | undefined {
  let lines = body.split('\n');
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    lines = end === -1 ? [] : lines.slice(end + 1);
  }
  const first = lines.find((l) => l.trim() !== '' && !l.startsWith('#'));
  if (!first) return undefined;
  const sentence = first.split(/\.\s|\.$/)[0];
  const value = normalise(sentence);
  return value === '' ? undefined : value;
}

export function findOverlap(src: string, dest: string): Overlap[] {
  if (!fs.existsSync(dest)) return [];
  const rules = ownedRulesIn(src).map((name) => {
    const body = fs.readFileSync(path.join(src, name), 'utf-8');
    return {
      name,
      headings: new Set(headingsOf(body)),
      opening: openingOf(body),
    };
  });
  const others = fs
    .readdirSync(dest)
    .filter(
      (n) => n.endsWith('.md') && !isOwnedRule(n) && isRegularFile(dest, n),
    )
    .sort();
  const found: Overlap[] = [];
  for (const file of others) {
    const body = fs.readFileSync(path.join(dest, file), 'utf-8');
    const headings = headingsOf(body);
    const opening = openingOf(body);
    for (const rule of rules) {
      const heading = headings.find((h) => rule.headings.has(h));
      if (heading !== undefined) {
        found.push({ file, rule: rule.name, on: 'heading', value: heading });
      }
      if (
        opening !== undefined &&
        rule.opening !== undefined &&
        opening === rule.opening
      ) {
        found.push({ file, rule: rule.name, on: 'opening', value: opening });
      }
    }
  }
  return found;
}

const USAGE =
  'usage: sidekick rules <install|check> --project|--user\n' +
  '  --project  the current repo\x27s .claude/rules/\n' +
  '  --user     the user-level rules directory under the Claude config dir';

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
  const scope = scopeOf(args.slice(1));
  if ((verb !== 'install' && verb !== 'check') || scope === undefined) {
    out(USAGE);
    return 1;
  }
  const dest = resolveDest(scope, env.cwd, env.claudeHome);
  if (ownedRulesIn(env.src).length === 0) {
    out(`no sk-*.md rules found at ${env.src}; refusing to touch ${dest}`);
    return 1;
  }
  if (verb === 'install') {
    const { installed, removed } = installRules(env.src, dest);
    out(
      `installed ${installed.length} rule(s) into ${dest}: ${installed.join(', ')}`,
    );
    if (removed.length > 0) out(`removed retired: ${removed.join(', ')}`);
  }
  const drift = checkRules(env.src, dest);
  const overlap = findOverlap(env.src, dest);
  if (drift.length === 0) {
    out(
      `${ownedRulesIn(env.src).length} rule(s) match the shipped copies at ${dest}`,
    );
  }
  for (const d of drift) out(`[${d.kind}] ${d.name}`);
  for (const o of overlap)
    out(`${o.file} overlaps ${o.rule} on ${o.on}: ${o.value}`);
  if (overlap.length > 0) {
    out('overlap is reported only; sidekick never edits files it does not own');
  }
  return drift.length === 0 ? 0 : 2;
}
