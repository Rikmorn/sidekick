#!/usr/bin/env node
import * as fs from 'node:fs';
import { realpathSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Phase 10 D-02 manifest schema. schemaVersion allows future
 * migration (e.g., adding per-file checksums as schemaVersion: 2)
 * without breaking already-installed manifests.
 */
interface Manifest {
  schemaVersion: 1;
  packageVersion: string;
  installedAt: string; // ISO date
  files: Array<{ src: string; dest: string }>;
}

const MANAGED_DIRS = ['skills', 'agents', 'commands'] as const;
const STATE_DIR_NAME = 'sidekick';

export interface InstallOptions {
  /**
   * Absolute path to the engineering package root (the dir that
   * contains package.json, skills/, agents/, commands/). At runtime
   * this is resolved from import.meta.url; tests inject a fake.
   */
  packageDir: string;
  /**
   * Absolute path to the Claude home dir (~/.claude). Tests inject
   * a fake; runtime uses os.homedir() + '.claude'.
   */
  claudeHome: string;
}

export interface UninstallOptions {
  claudeHome: string;
}

export function install(opts: InstallOptions): void {
  const { packageDir, claudeHome } = opts;

  // D-04 / D-12 bootstrap check: package.json must have name + version.
  const pkgJsonPath = path.join(packageDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    throw new Error(
      `package.json not found at ${pkgJsonPath}; cannot install.`,
    );
  }
  let pkgJson: Record<string, unknown>;
  try {
    pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  } catch (err) {
    throw new Error(
      `Could not parse ${pkgJsonPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const name = pkgJson.name;
  const version = pkgJson.version;
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`${pkgJsonPath}: missing or non-string "name" field`);
  }
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(`${pkgJsonPath}: missing or non-string "version" field`);
  }

  const manifestEntries: Array<{ src: string; dest: string }> = [];

  for (const sub of MANAGED_DIRS) {
    const srcRoot = path.join(packageDir, sub);
    if (!fs.existsSync(srcRoot)) continue; // empty sources are fine (D-04)
    const destRoot = path.join(claudeHome, sub);
    copyTreeRecording(srcRoot, destRoot, packageDir, manifestEntries);
  }

  // D-03: state lives only at ~/.claude/sidekick/.
  const stateDir = path.join(claudeHome, STATE_DIR_NAME);
  fs.mkdirSync(stateDir, { recursive: true });

  // Rules subtree: copies packageDir/rules/* → claudeHome/sidekick/rules/
  const rulesSrc = path.join(packageDir, 'rules');
  if (fs.existsSync(rulesSrc)) {
    const rulesDest = path.join(claudeHome, STATE_DIR_NAME, 'rules');
    copyTreeRecording(rulesSrc, rulesDest, packageDir, manifestEntries);
  }

  const manifest: Manifest = {
    schemaVersion: 1,
    packageVersion: version,
    installedAt: new Date().toISOString(),
    files: manifestEntries,
  };
  const manifestPath = path.join(stateDir, 'manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    `Installed ${name}@${version} (${manifestEntries.length} file(s)). Manifest: ${manifestPath}`,
  );
}

export function uninstall(opts: UninstallOptions): void {
  const { claudeHome } = opts;
  const stateDir = path.join(claudeHome, STATE_DIR_NAME);
  const manifestPath = path.join(stateDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    // D-05: missing manifest → no-op with clear warning naming the path AND the rule.
    console.warn(
      `No manifest found at ${manifestPath}; nothing to remove. (Rule: uninstall is manifest-driven.)`,
    );
    return;
  }

  let manifest: Manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    throw new Error(
      `Could not parse manifest at ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!Array.isArray(manifest.files)) {
    throw new Error(
      `${manifestPath}: invalid manifest — "files" must be an array`,
    );
  }

  let removed = 0;
  let alreadyGone = 0;
  for (const entry of manifest.files) {
    if (fs.existsSync(entry.dest)) {
      fs.rmSync(entry.dest, { force: true });
      removed++;
    } else {
      alreadyGone++;
    }
  }

  // D-05 final step: remove the state dir entirely.
  fs.rmSync(stateDir, { recursive: true, force: true });

  console.log(
    `Uninstalled. Removed ${removed} file(s); ${alreadyGone} already gone. State dir cleared.`,
  );
}

/**
 * Recursive copy that records each leaf-file copy in the manifest.
 * D-04: silent overwrite — no conflict check, no --force flag.
 * Empty subdirs are skipped (npm strips them from tarballs anyway).
 *
 * `src` in manifest is relative to packageDir using POSIX separators
 * so the manifest is portable across host platforms (we author on
 * macOS/Linux per project scope).
 */
function copyTreeRecording(
  srcRoot: string,
  destRoot: string,
  packageDir: string,
  out: Array<{ src: string; dest: string }>,
): void {
  walk(srcRoot, (src) => {
    const rel = path.relative(srcRoot, src);
    const dest = path.join(destRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    out.push({
      src: path.relative(packageDir, src).split(path.sep).join('/'),
      dest,
    });
  });
}

function walk(dir: string, fn: (filePath: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, fn);
    } else if (entry.isFile()) {
      fn(full);
    }
  }
}

/**
 * Symlink-robust check: resolves both paths to their real (canonical) paths
 * before comparing, so npm/pnpm `.bin` symlinks and macOS /tmp→/private/tmp
 * redirects don't prevent main() from running.
 * Returns false if argv1 is falsy or if either path cannot be resolved.
 */
export function isMainEntrypoint(
  importMetaUrl: string,
  argv1: string | undefined,
): boolean {
  if (!argv1) return false;
  try {
    return realpathSync(fileURLToPath(importMetaUrl)) === realpathSync(argv1);
  } catch {
    return false;
  }
}

const _importMetaMain =
  'main' in import.meta && typeof import.meta.main === 'boolean'
    ? import.meta.main
    : undefined;
const _isEntry =
  _importMetaMain ?? isMainEntrypoint(import.meta.url, process.argv[1]);

// CLI entry — runs only when invoked directly. Mirrors validate-frontmatter.ts:259-268.
if (_isEntry) {
  await (async () => {
    const sub = process.argv[2];
    const VALID_SUBS = new Set([
      'install',
      'uninstall',
      'init',
      'branch-precheck',
      'check-drift',
      'reconcile-plan',
      'wave-plan',
    ]);
    if (!sub || !VALID_SUBS.has(sub)) {
      console.error(
        'Usage: sidekick <install|uninstall|init|branch-precheck|check-drift|reconcile-plan|wave-plan> [options]',
      );
      process.exit(1);
    }
    try {
      // packageDir is the repo root — one level up from the compiled entry
      // (dist/cli.js). It contains skills/, agents/, and rules/ to install.
      const packageDir = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
      );
      const claudeHome = path.join(os.homedir(), '.claude');
      if (sub === 'install') {
        install({ packageDir, claudeHome });
      } else if (sub === 'uninstall') {
        uninstall({ claudeHome });
      } else if (sub === 'init') {
        const { runInit } = await import('./helpers/init.js');
        const nonInteractive = process.argv.includes('--non-interactive');
        const exitCode = await runInit({
          repoRoot: process.cwd(),
          nonInteractive,
        });
        process.exit(exitCode);
      } else if (sub === 'branch-precheck') {
        const { runBranchPrecheckCli } = await import(
          './helpers/branch-precheck.js'
        );
        const args = process.argv.slice(3);
        const get = (flag: string): string | undefined => {
          const idx = args.indexOf(flag);
          return idx >= 0 ? args[idx + 1] : undefined;
        };
        const operation = get('--operation');
        if (!operation) {
          console.error(
            'Usage: sidekick branch-precheck --operation <design|build|decide|review|regen-plan> [--ticket-id <id>] [--ticket-title <title>] [--branch-type <type>] [--format=<json|kv>]',
          );
          process.exit(1);
        }
        const format: 'json' | 'kv' =
          args.find((a) => a.startsWith('--format='))?.split('=')[1] === 'kv'
            ? 'kv'
            : 'json';
        const stdout = runBranchPrecheckCli({
          repoRoot: process.cwd(),
          operation: operation as never,
          ticketId: get('--ticket-id'),
          ticketTitle: get('--ticket-title'),
          branchType: get('--branch-type') as never,
          format,
        });
        console.log(stdout);
        process.exit(0);
      } else if (sub === 'check-drift') {
        const { runCheckDriftCli } = await import('./helpers/check-drift.js');
        const slug = process.argv[3];
        if (!slug) {
          console.error(
            'Usage: sidekick check-drift <slug> [--format=<json|kv>]',
          );
          process.exit(1);
        }
        const format: 'json' | 'kv' =
          process.argv.find((a) => a.startsWith('--format='))?.split('=')[1] ===
          'kv'
            ? 'kv'
            : 'json';
        console.log(
          runCheckDriftCli({ repoRoot: process.cwd(), slug, format }),
        );
        process.exit(0);
      } else if (sub === 'reconcile-plan') {
        const { runReconcilePlanCli } = await import(
          './helpers/reconcile-plan.js'
        );
        const args = process.argv.slice(3);
        const slug = args.find((a) => !a.startsWith('--'));
        if (!slug) {
          console.error(
            'Usage: sidekick reconcile-plan <slug> [--default-branch <name>] [--apply T-01,T-03] [--format=<json|kv>]',
          );
          process.exit(1);
        }
        const getVal = (flag: string): string | undefined => {
          const idx = args.indexOf(flag);
          return idx >= 0 ? args[idx + 1] : undefined;
        };
        const applyRaw = getVal('--apply');
        const apply = applyRaw
          ? applyRaw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;
        const format: 'json' | 'kv' =
          args.find((a) => a.startsWith('--format='))?.split('=')[1] === 'kv'
            ? 'kv'
            : 'json';
        console.log(
          runReconcilePlanCli({
            repoRoot: process.cwd(),
            slug,
            defaultBranch: getVal('--default-branch') ?? 'main',
            apply,
            format,
          }),
        );
        process.exit(0);
      } else if (sub === 'wave-plan') {
        const { runWavePlanCli } = await import('./helpers/wave-plan.js');
        const args = process.argv.slice(3);
        const slug = args.find((a) => !a.startsWith('--'));
        if (!slug) {
          console.error(
            'Usage: sidekick wave-plan <slug> [--format=<json|kv>]',
          );
          process.exit(1);
        }
        const format: 'json' | 'kv' =
          args.find((a) => a.startsWith('--format='))?.split('=')[1] === 'kv'
            ? 'kv'
            : 'json';
        console.log(runWavePlanCli({ repoRoot: process.cwd(), slug, format }));
        process.exit(0);
      }
    } catch (err) {
      console.error(
        `sidekick ${sub} failed: ${err instanceof Error ? err.message : err}`,
      );
      process.exit(1);
    }
  })();
}
