import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * E19 (ADR-0002 §3): deterministic capability probe. Detects what it can
 * (CC version, the disableWorkflows hierarchy) and names what it cannot
 * (plan-level gating) so skills and humans get an honest availability
 * signal instead of a guess. Read-only; never throws on bad inputs.
 */

export const WORKFLOWS_MIN_CC_VERSION = '2.1.154';

export interface CapabilitiesOptions {
  repoRoot: string;
  claudeHome: string;
  /** Defaults to process.env; injectable for tests. */
  env?: Record<string, string | undefined>;
  /**
   * Managed-settings locations to probe; injectable for tests.
   * Defaults cover macOS and Linux (verify against the CC settings docs
   * if these ever stop matching: code.claude.com/docs/en/settings).
   */
  managedSettingsPaths?: string[];
  /** Returns `claude --version` stdout, or null when unavailable. Injectable. */
  readClaudeVersion?: () => string | null;
}

/** Where the installed agent, skill and rule roster came from (#81). */
export interface InstallProvenance {
  /** The Claude home this roster is read from. */
  root: string;
  /** From the install manifest; null when there is no readable manifest. */
  package_version: string | null;
  /** ISO date from the manifest; null when there is no readable manifest. */
  installed_at: string | null;
  /** Counted on disk under `root`, so hand-placed files are included too. */
  counts: { agents: number; skills: number; rules: number };
  /** Says why the version and date are null, when they are. */
  note: string | null;
}

export interface CapabilitiesReport {
  schemaVersion: 2;
  cc_version: string | null;
  install: InstallProvenance;
  workflows: {
    min_version: string;
    version_ok: boolean | 'unknown';
    /** 'env:CLAUDE_CODE_DISABLE_WORKFLOWS' or the settings-file path, else null. */
    disabled_by: string | null;
    /**
     * false   = definitively unavailable (disabled, or version below minimum)
     * 'likely' = version ok and nothing disables it — but plan-level gating
     *            (off-by-default on Pro) is NOT detectable, hence not `true`
     * 'unknown' = CC version could not be determined
     */
    available: false | 'likely' | 'unknown';
  };
  notes: string[];
}

const DEFAULT_MANAGED_SETTINGS_PATHS = [
  '/Library/Application Support/ClaudeCode/managed-settings.json',
  '/etc/claude-code/managed-settings.json',
];

function defaultReadClaudeVersion(): string | null {
  const res = spawnSync('claude', ['--version'], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  if (res.error || res.status !== 0 || typeof res.stdout !== 'string') {
    return null;
  }
  return res.stdout;
}

export function parseSemver(raw: string): string | null {
  const m = raw.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

/** Standard 3-part numeric compare: <0, 0, >0. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function disablesWorkflows(filePath: string): boolean {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as Record<string, unknown>).disableWorkflows === true
    );
  } catch {
    return false; // unreadable/unparseable settings never count as a disable
  }
}

function countMatching(dir: string, match: (name: string) => boolean): number {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(match).length;
}

function countSkillDirs(skillsDir: string): number {
  if (!fs.existsSync(skillsDir)) return 0;
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter(
      (e) =>
        e.isDirectory() &&
        fs.existsSync(path.join(skillsDir, e.name, 'SKILL.md')),
    ).length;
}

function readManifestFields(
  manifestPath: string,
): { version: string | null; installedAt: string | null } | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const rec = parsed as Record<string, unknown>;
    return {
      version:
        typeof rec.packageVersion === 'string' ? rec.packageVersion : null,
      installedAt: typeof rec.installedAt === 'string' ? rec.installedAt : null,
    };
  } catch {
    return null;
  }
}

/**
 * Answers "where did this roster come from" even when nothing was installed,
 * because that is exactly when the question gets asked.
 */
function readInstallProvenance(claudeHome: string): InstallProvenance {
  const counts = {
    agents: countMatching(path.join(claudeHome, 'agents'), (n) =>
      n.endsWith('.md'),
    ),
    skills: countSkillDirs(path.join(claudeHome, 'skills')),
    rules: countMatching(path.join(claudeHome, 'sidekick', 'rules'), (n) =>
      n.endsWith('.md'),
    ),
  };
  const base = { root: claudeHome, counts };
  const manifestPath = path.join(claudeHome, 'sidekick', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return {
      ...base,
      package_version: null,
      installed_at: null,
      note: `No install manifest at ${manifestPath}; anything counted above was not placed by \`sidekick install\`.`,
    };
  }
  const fields = readManifestFields(manifestPath);
  if (fields === null) {
    return {
      ...base,
      package_version: null,
      installed_at: null,
      note: `Install manifest at ${manifestPath} is unreadable, so the version and date are unknown.`,
    };
  }
  return {
    ...base,
    package_version: fields.version,
    installed_at: fields.installedAt,
    note: null,
  };
}

export function runCapabilities(opts: CapabilitiesOptions): CapabilitiesReport {
  const env = opts.env ?? process.env;
  const readVersion = opts.readClaudeVersion ?? defaultReadClaudeVersion;
  const managedPaths =
    opts.managedSettingsPaths ?? DEFAULT_MANAGED_SETTINGS_PATHS;

  const notes: string[] = [
    'Plan-level gating (dynamic workflows are off by default on Pro) is not detectable from settings. If workflow dispatch fails at runtime, fall back to the agents backend.',
  ];

  const rawVersion = readVersion();
  const ccVersion = rawVersion === null ? null : parseSemver(rawVersion);
  if (ccVersion === null) {
    notes.push(
      'Could not determine the Claude Code version (`claude --version` unavailable or unparseable).',
    );
  }

  let disabledBy: string | null = null;
  // CC kill-switch convention: the canonical truthy value is the string '1'.
  if (env.CLAUDE_CODE_DISABLE_WORKFLOWS === '1') {
    disabledBy = 'env:CLAUDE_CODE_DISABLE_WORKFLOWS';
  } else {
    const settingsPaths = [
      ...managedPaths,
      path.join(opts.claudeHome, 'settings.json'),
      path.join(opts.repoRoot, '.claude', 'settings.json'),
      path.join(opts.repoRoot, '.claude', 'settings.local.json'),
    ];
    for (const p of settingsPaths) {
      if (fs.existsSync(p) && disablesWorkflows(p)) {
        disabledBy = p;
        break;
      }
    }
  }

  const versionOk: boolean | 'unknown' =
    ccVersion === null
      ? 'unknown'
      : compareSemver(ccVersion, WORKFLOWS_MIN_CC_VERSION) >= 0;

  let available: false | 'likely' | 'unknown';
  if (disabledBy !== null || versionOk === false) {
    available = false;
  } else if (versionOk === 'unknown') {
    available = 'unknown';
  } else {
    available = 'likely';
  }

  return {
    schemaVersion: 2,
    cc_version: ccVersion,
    install: readInstallProvenance(opts.claudeHome),
    workflows: {
      min_version: WORKFLOWS_MIN_CC_VERSION,
      version_ok: versionOk,
      disabled_by: disabledBy,
      available,
    },
    notes,
  };
}

export function runCapabilitiesCli(opts: CapabilitiesOptions): string {
  return JSON.stringify(runCapabilities(opts), null, 2);
}
