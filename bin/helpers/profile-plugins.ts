/**
 * The plugin dependency check: `claude --settings <file> plugin list --json`
 * run on the profile's composed settings. Claude Code puts an unmet plugin
 * dependency in an entry's `errorDetails`, and a launch does not report it, so
 * this check does. It reads only `id` and `errorDetails`: Claude Code computes
 * the other fields for the current folder on every entry, and `enabled`
 * ignores `--setting-sources`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import type { CheckResult, ClaudeRunner, Settings } from './profile-launch.js';
import type { ProfileManifest } from './profile-manifest.js';

/** Set to `1` to skip the plugin dependency check. */
export const PLUGIN_SKIP_VARIABLE = 'SIDEKICK_PROFILE_SKIP_PLUGIN_CHECK';

const SKIP_WARNING = `${PLUGIN_SKIP_VARIABLE}=1 is set, so the plugins were not checked with claude plugin list.`;

const UNSATISFIED = 'dependency-unsatisfied';
const EXEMPT_SUFFIXES = ['@builtin', '@inline'];

const DetailSchema = v.looseObject({
  type: v.string(),
  plugin: v.optional(v.string()),
  dependency: v.optional(v.string()),
});
const EntrySchema = v.looseObject({
  id: v.string(),
  errorDetails: v.nullish(v.array(DetailSchema)),
});
const ListSchema = v.array(EntrySchema);

const refuse = (...issues: string[]): CheckResult => ({ ok: false, issues });

/** Report whether the manifest changes which plugins load, so the check applies. */
export const needsPluginCheck = (manifest: ProfileManifest): boolean =>
  manifest.settingSources !== undefined ||
  (manifest.settings !== undefined &&
    Object.hasOwn(manifest.settings, 'enabledPlugins'));

const enabledPluginIds = (manifest: ProfileManifest): string[] => {
  const value = manifest.settings?.enabledPlugins;
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.keys(value)
    : [];
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * Judges `plugin list --json` output. `named` is the ids the profile's
 * `settings.enabledPlugins` sets; each must be listed or end `@builtin` or
 * `@inline`.
 */
export function judgePluginList(stdout: string, named: string[]): CheckResult {
  const parsed = v.safeParse(ListSchema, parseJson(stdout));
  if (!parsed.success) {
    return refuse(
      "claude plugin list's output no longer parses, so a broken plugin dependency could pass unseen.",
      `Set ${PLUGIN_SKIP_VARIABLE}=1 to skip the check until sidekick catches up.`,
    );
  }
  const entries = parsed.output;
  const issues: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    for (const detail of entry.errorDetails ?? []) {
      if (detail.type !== UNSATISFIED) {
        warnings.push(
          `${entry.id}: claude plugin list reports ${detail.type}.`,
        );
        continue;
      }
      const key = JSON.stringify([detail.plugin, detail.dependency]);
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push(
        `${entry.id} needs ${detail.dependency ?? '(unnamed)'}, which these settings do not enable. Enable it in the profile's settings.enabledPlugins, or set ${entry.id} to false too.`,
      );
    }
  }
  const listed = new Set(entries.map((entry) => entry.id));
  for (const id of named) {
    if (listed.has(id) || EXEMPT_SUFFIXES.some((s) => id.endsWith(s))) continue;
    issues.push(
      `"${id}": no plugin listed under this profile's settings has that id; a plugin from a settings source the profile leaves out is not listed.`,
    );
  }
  return issues.length > 0 ? refuse(...issues) : { ok: true, warnings };
}

const printed = (stdout: string, stderr: string): string =>
  [stdout, stderr]
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .join('\n');

/**
 * Runs `plugin list --json` on a copy of `settings` written to a fresh folder
 * under `tmpdir`, removed on every path, and judges the output.
 */
export function checkPlugins(
  settings: Settings,
  manifest: ProfileManifest,
  deps: { run: ClaudeRunner; cwd: string; tmpdir: string; skip: boolean },
  timeoutMs = 30_000,
): CheckResult {
  if (deps.skip) return { ok: true, warnings: [SKIP_WARNING] };
  const dir = fs.mkdtempSync(path.join(deps.tmpdir, 'sidekick-profile-'));
  try {
    const file = path.join(dir, 'settings.json');
    fs.writeFileSync(file, JSON.stringify(settings), { mode: 0o600 });
    const sources = manifest.settingSources;
    const result = deps.run(
      [
        '--settings',
        file,
        ...(sources === undefined
          ? []
          : ['--setting-sources', sources.join(',')]),
        'plugin',
        'list',
        '--json',
      ],
      { cwd: deps.cwd, timeoutMs },
    );
    if (result.timedOut) {
      return refuse(
        'claude plugin list timed out.',
        printed(result.stdout, result.stderr),
      );
    }
    if (result.code !== 0) {
      return refuse(
        `claude plugin list failed with exit code ${result.code}.`,
        printed(result.stdout, result.stderr),
      );
    }
    return judgePluginList(result.stdout, enabledPluginIds(manifest));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
