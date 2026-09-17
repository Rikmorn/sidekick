import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import {
  type GatesConfig,
  resolveGates,
  type SidekickConfig,
} from './config.js';
import { originHeadOrCascade } from './default-branch.js';
import { installHooks } from './hooks.js';

/**
 * Kept exported because `init.test.ts` and `init`'s own callers use it; the
 * resolution itself now lives in `default-branch.ts`.
 */
export function detectDefaultBranch(repoRoot: string): string {
  return originHeadOrCascade(repoRoot);
}

const LOCKFILE_RUNNERS: ReadonlyArray<{
  lockfile: string;
  run: (script: string) => string;
}> = [
  { lockfile: 'bun.lock', run: (s) => `bun run ${s}` },
  { lockfile: 'bun.lockb', run: (s) => `bun run ${s}` },
  { lockfile: 'pnpm-lock.yaml', run: (s) => `pnpm ${s}` },
  { lockfile: 'yarn.lock', run: (s) => `yarn ${s}` },
  { lockfile: 'package-lock.json', run: (s) => `npm run ${s}` },
];

/**
 * Detection is a suggestion, never a decision: what runs is always what
 * config says (gates are explicitly configured — no fallback runner). A
 * suggestion is only made when a lockfile identifies the runner AND the
 * script exists; anything else returns '' (unconfigured).
 */
/**
 * Test scripts in preference order. A narrower script is likelier to run
 * without Docker or a live database, which `init` cannot detect (#68).
 */
const TEST_SCRIPT_PREFERENCE = ['test:fast', 'test:unit', 'test'] as const;

export function detectGates(repoRoot: string): {
  typecheck: string;
  lint: string;
  test: string;
} {
  const none = { typecheck: '', lint: '', test: '' };
  const pkgPath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return none;
  let pkg: { scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      scripts?: Record<string, string>;
    };
  } catch {
    return none;
  }
  const runner = LOCKFILE_RUNNERS.find(({ lockfile }) =>
    fs.existsSync(path.join(repoRoot, lockfile)),
  );
  if (!runner) return none;
  const scripts = pkg.scripts ?? {};
  const testScript = TEST_SCRIPT_PREFERENCE.find((name) => scripts[name]);
  return {
    typecheck: scripts.typecheck ? runner.run('typecheck') : '',
    lint: scripts.lint ? runner.run('lint') : '',
    test: testScript ? runner.run(testScript) : '',
  };
}

export function writeConfig(repoRoot: string, config: SidekickConfig): void {
  const dir = path.join(repoRoot, '.sidekick');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    `${JSON.stringify(config, null, 2)}\n`,
  );
}

const GITIGNORE_HEADER =
  '# sidekick — local working state (managed by `sidekick init`)';
const GITIGNORE_ENTRIES = [
  '.sidekick/cache/',
  '.sidekick/state/',
  '.claude/settings.local.json',
] as const;

/**
 * Ensure the consumer repo's .gitignore covers sidekick's local working state
 * (`.sidekick/cache/`, `.sidekick/state/`). The committed artifacts
 * (`.sidekick/config.json`, `plans/`, `decisions/`, `backlog/`) are
 * deliberately NOT ignored. Idempotent: only missing entries are appended,
 * existing content is preserved.
 */
export function ensureGitignore(repoRoot: string): {
  changed: boolean;
  added: string[];
} {
  const gitignorePath = path.join(repoRoot, '.gitignore');
  const content = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf-8')
    : '';
  const lines = new Set(content.split('\n').map((l) => l.trim()));
  const missing = GITIGNORE_ENTRIES.filter((e) => !lines.has(e));
  if (missing.length === 0) return { changed: false, added: [] };

  let appendage = '';
  if (content.length > 0) appendage += content.endsWith('\n') ? '\n' : '\n\n';
  if (!lines.has(GITIGNORE_HEADER)) appendage += `${GITIGNORE_HEADER}\n`;
  appendage += `${missing.join('\n')}\n`;
  fs.appendFileSync(gitignorePath, appendage);
  return { changed: true, added: [...missing] };
}

/**
 * Copy the installed portable rules (~/.claude/sidekick/rules/sk-*.md) into
 * the consumer repo's .claude/rules/. sk-*-prefixed files are managed
 * (overwritten on re-init); anything else in the directory is left alone.
 */
export function installRules(
  repoRoot: string,
  claudeHome: string,
): { installed: string[] } {
  const src = path.join(claudeHome, 'sidekick', 'rules');
  if (!fs.existsSync(src)) return { installed: [] };
  const files = fs
    .readdirSync(src)
    .filter((f) => f.startsWith('sk-') && f.endsWith('.md'));
  if (files.length === 0) return { installed: [] };
  const dest = path.join(repoRoot, '.claude', 'rules');
  fs.mkdirSync(dest, { recursive: true });
  for (const f of files) {
    fs.copyFileSync(path.join(src, f), path.join(dest, f));
  }
  return { installed: files };
}

export interface RunInitOptions {
  repoRoot: string;
  claudeHome: string;
  nonInteractive?: boolean;
  /** Explicit override: false = skip/remove the guard, true = force. Undefined = decide by mode/prompt. */
  hooks?: boolean;
}

export async function runInit(opts: RunInitOptions): Promise<number> {
  const { repoRoot, claudeHome, nonInteractive = false, hooks } = opts;
  // Validate: must be a git repo.
  try {
    execSync('git rev-parse --show-toplevel', {
      cwd: repoRoot,
      stdio: 'ignore',
    });
  } catch {
    console.error(`Not a git repository: ${repoRoot}`);
    return 1;
  }

  const detectedBranch = detectDefaultBranch(repoRoot);
  const detectedGates = detectGates(repoRoot);

  let config: SidekickConfig;
  let hooksEnabled = true;
  // '' means undetected/skipped — the gate stays unconfigured (never a guess).
  const toGates = (values: {
    typecheck: string;
    lint: string;
    test: string;
  }): GatesConfig => ({
    ...(values.typecheck ? { typecheck: values.typecheck } : {}),
    ...(values.lint ? { lint: values.lint } : {}),
    ...(values.test ? { test: values.test } : {}),
  });

  if (nonInteractive) {
    config = {
      schemaVersion: 1,
      defaultBranch: detectedBranch,
      gates: toGates(detectedGates),
      waveSizeCap: 4,
      buildCheckpoints: 'deviations-only',
      fanout: { backend: 'auto', budget: 'standard' },
      verifiers: [],
    };
    hooksEnabled = hooks ?? true;
  } else {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      const ask = async (q: string, def: string): Promise<string> => {
        const answer = (await rl.question(`${q} [${def}]: `)).trim();
        return answer.length > 0 ? answer : def;
      };
      const defaultBranch = await ask('Default branch', detectedBranch);
      // Detected values are suggestions; an empty answer with no suggestion
      // leaves that gate unconfigured rather than writing a runner guess.
      const typecheck = await ask(
        'Typecheck command (empty = unconfigured)',
        detectedGates.typecheck,
      );
      const lint = await ask(
        'Lint command (empty = unconfigured)',
        detectedGates.lint,
      );
      const test = await ask(
        'Test command (empty = unconfigured)',
        detectedGates.test,
      );
      if (hooks !== undefined) {
        hooksEnabled = hooks;
      } else {
        const guardAnswer = await ask(
          'Install tier-0 config guard (blocks agent edits to .sidekick/config.json)?',
          'Y',
        );
        hooksEnabled = !/^n/i.test(guardAnswer.trim());
      }
      config = {
        schemaVersion: 1,
        defaultBranch,
        gates: toGates({ typecheck, lint, test }),
        waveSizeCap: 4,
        buildCheckpoints: 'deviations-only',
        fanout: { backend: 'auto', budget: 'standard' },
        verifiers: [],
      };
    } finally {
      rl.close();
    }
  }

  writeConfig(repoRoot, config);
  if (config.defaultBranch !== 'main' && config.defaultBranch !== 'master') {
    console.warn(
      `⚠ defaultBranch detected as "${config.defaultBranch}", which is neither main nor master. If that is not your default branch, origin/HEAD may be unset — run \`git remote set-head origin -a\` and re-run \`sidekick init\`.`,
    );
  }
  console.log(
    `Wrote .sidekick/config.json (defaultBranch: ${config.defaultBranch})`,
  );

  const resolvedGates = resolveGates(config);
  if (!resolvedGates.configured) {
    console.warn(
      `⚠ gates unconfigured: ${resolvedGates.missing.join(', ')} — set gates.* in .sidekick/config.json. Verification gates surface this instead of guessing a runner.`,
    );
  }

  // `init` cannot tell whether a script needs Docker or a live service, so it
  // names what it picked and asks (#68).
  const chosenGates = (['typecheck', 'lint', 'test'] as const)
    .filter((gate) => config.gates[gate])
    .map((gate) => `${gate}: ${config.gates[gate]}`);
  if (chosenGates.length > 0) {
    console.log(
      `Gates chosen — ${chosenGates.join(', ')}. Confirm each runs without Docker or other external services; if not, set gates.* in .sidekick/config.json.`,
    );
  }

  const gitignore = ensureGitignore(repoRoot);
  if (gitignore.changed) {
    console.log(`Updated .gitignore (${gitignore.added.join(', ')})`);
  }

  const rules = installRules(repoRoot, claudeHome);
  if (rules.installed.length > 0) {
    console.log(
      `Installed ${rules.installed.length} rule(s) to .claude/rules/`,
    );
  }

  const result = installHooks({
    settingsLocalPath: path.join(repoRoot, '.claude', 'settings.local.json'),
    launcherPath: path.join(claudeHome, 'sidekick', 'bin', 'sidekick'),
    enabled: hooksEnabled,
  });
  if (result.changed) {
    console.log(
      result.action === 'installed'
        ? 'Installed tier-0 config guard (.claude/settings.local.json)'
        : 'Removed tier-0 config guard (.claude/settings.local.json)',
    );
  }
  return 0;
}
