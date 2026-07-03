import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import {
  type GatesConfig,
  resolveGates,
  type SidekickConfig,
} from './config.js';
import { installHooks } from './hooks.js';

const BRANCH_CASCADE = ['main', 'master', 'dev', 'trunk', 'develop'] as const;

export function detectDefaultBranch(repoRoot: string): string {
  // Try origin/HEAD first.
  try {
    const out = execSync('git symbolic-ref --short refs/remotes/origin/HEAD', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (out.startsWith('origin/')) return out.slice('origin/'.length);
  } catch {
    /* fall through */
  }
  // Try the currently-checked-out branch.
  try {
    const out = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (out && out !== 'HEAD') return out;
  } catch {
    /* fall through */
  }
  // Cascade through common names that exist as local branches.
  for (const candidate of BRANCH_CASCADE) {
    try {
      execSync(`git rev-parse --verify --quiet refs/heads/${candidate}`, {
        cwd: repoRoot,
        stdio: 'ignore',
      });
      return candidate;
    } catch {
      /* not present */
    }
  }
  return 'main';
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
  return {
    typecheck: scripts.typecheck ? runner.run('typecheck') : '',
    lint: scripts.lint ? runner.run('lint') : '',
    test: scripts.test ? runner.run('test') : '',
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
  console.log(
    `Wrote .sidekick/config.json (defaultBranch: ${config.defaultBranch})`,
  );

  const resolvedGates = resolveGates(config);
  if (!resolvedGates.configured) {
    console.warn(
      `⚠ gates unconfigured: ${resolvedGates.missing.join(', ')} — set gates.* in .sidekick/config.json. Verification gates surface this instead of guessing a runner.`,
    );
  }

  const gitignore = ensureGitignore(repoRoot);
  if (gitignore.changed) {
    console.log(`Updated .gitignore (${gitignore.added.join(', ')})`);
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
