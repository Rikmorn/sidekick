import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import type { SidekickConfig } from './config.js';

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

export function detectGates(repoRoot: string): {
  typecheck: string;
  lint: string;
  test: string;
} {
  const pkgPath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return { typecheck: '', lint: '', test: '' };
  let pkg: { scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      scripts?: Record<string, string>;
    };
  } catch {
    return { typecheck: '', lint: '', test: '' };
  }
  const scripts = pkg.scripts ?? {};
  return {
    typecheck: scripts.typecheck ? 'pnpm typecheck' : '',
    lint: scripts.lint ? 'pnpm lint' : '',
    test: scripts.test ? 'pnpm test' : '',
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
const GITIGNORE_ENTRIES = ['.sidekick/cache/', '.sidekick/state/'] as const;

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
  nonInteractive?: boolean;
}

export async function runInit(opts: RunInitOptions): Promise<number> {
  const { repoRoot, nonInteractive = false } = opts;
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
  if (nonInteractive) {
    config = {
      schemaVersion: 1,
      defaultBranch: detectedBranch,
      gates: {
        typecheck: detectedGates.typecheck || 'pnpm typecheck',
        lint: detectedGates.lint || 'pnpm lint',
        test: detectedGates.test || 'pnpm test',
      },
      waveSizeCap: 4,
      buildCheckpoints: 'deviations-only',
    };
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
      const typecheck = await ask(
        'Typecheck command',
        detectedGates.typecheck || 'pnpm typecheck',
      );
      const lint = await ask('Lint command', detectedGates.lint || 'pnpm lint');
      const test = await ask('Test command', detectedGates.test || 'pnpm test');
      config = {
        schemaVersion: 1,
        defaultBranch,
        gates: { typecheck, lint, test },
        waveSizeCap: 4,
        buildCheckpoints: 'deviations-only',
      };
    } finally {
      rl.close();
    }
  }

  writeConfig(repoRoot, config);
  console.log(
    `Wrote .sidekick/config.json (defaultBranch: ${config.defaultBranch})`,
  );

  const gitignore = ensureGitignore(repoRoot);
  if (gitignore.changed) {
    console.log(`Updated .gitignore (${gitignore.added.join(', ')})`);
  }
  return 0;
}
