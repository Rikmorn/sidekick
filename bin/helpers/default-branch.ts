/**
 * The one place git is asked which branch is the default — shared by `init`,
 * which records the answer in `.sidekick/config.json`, and `branch-precheck`,
 * which decides whether you are standing on it. Each used to walk
 * `origin/HEAD` and then the same five-name cascade in its own code, so #67's
 * origin/HEAD precedence fix had to be made twice and could drift apart again.
 *
 * The two callers differ at the ends, which is why this shares the middle
 * rather than the whole function. `branch-precheck` consults
 * `.sidekick/config.json` first and reports which source answered; `init` does
 * neither and treats `main` as the last resort. So `resolveFromGit` returns
 * the discriminated result and each caller applies its own terminal fallback.
 * `originHeadOrCascade` is the shape `init` needs.
 */

import { execSync } from 'node:child_process';

/** Local branch names tried, in order, when `origin/HEAD` gives no answer. */
export const BRANCH_CASCADE = [
  'main',
  'master',
  'dev',
  'trunk',
  'develop',
] as const;

/** Which step answered. `unknown` means git offered no candidate at all. */
export type DefaultBranchSource = 'origin_head' | 'cascade' | 'unknown';

export interface DefaultBranchResolution {
  /** Empty exactly when `source` is `unknown`. */
  branch: string;
  source: DefaultBranchSource;
}

function safeExec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
  } catch {
    return '';
  }
}

/**
 * Ask git alone: `origin/HEAD` first, then the cascade. The caller decides
 * what an `unknown` answer means, because the two callers disagree about it.
 */
export function resolveFromGit(repoRoot: string): DefaultBranchResolution {
  const originHead = safeExec(
    'git symbolic-ref --short refs/remotes/origin/HEAD',
    repoRoot,
  ).trim();
  if (originHead.startsWith('origin/')) {
    return {
      branch: originHead.slice('origin/'.length),
      source: 'origin_head',
    };
  }

  for (const candidate of BRANCH_CASCADE) {
    const out = safeExec(
      `git rev-parse --verify --quiet refs/heads/${candidate}`,
      repoRoot,
    );
    if (out !== '') return { branch: candidate, source: 'cascade' };
  }

  return { branch: '', source: 'unknown' };
}

/**
 * `origin/HEAD` → cascade → `'main'`. A name always comes back, because a
 * config file has nowhere to put "no answer".
 */
export function originHeadOrCascade(repoRoot: string): string {
  return resolveFromGit(repoRoot).branch || 'main';
}
