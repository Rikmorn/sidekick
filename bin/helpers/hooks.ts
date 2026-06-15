import { execSync } from 'node:child_process';
import * as path from 'node:path';

const CONFIG_DENY_REASON =
  'Edits to .sidekick/config.json are blocked: it defines the gate commands (test/lint/typecheck) for this project. Change it with `sidekick init`, not an agent edit.';

export interface PreToolUseDeny {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'deny';
    permissionDecisionReason: string;
  };
}

interface PreToolUseInput {
  tool_input?: { file_path?: string };
  cwd?: string;
}

/** True when `filePath` resolves to a `.sidekick/config.json` — i.e. its immediate parent directory is named `.sidekick`, at any depth. */
export function isSidekickConfigPath(filePath: string, cwd?: string): boolean {
  const resolved = path.isAbsolute(filePath)
    ? path.normalize(filePath)
    : path.resolve(cwd ?? process.cwd(), filePath);
  return (
    path.basename(resolved) === 'config.json' &&
    path.basename(path.dirname(resolved)) === '.sidekick'
  );
}

/**
 * PreToolUse decision. Returns a structured deny for edits to
 * `.sidekick/config.json`, else null (no-op — let normal permissions apply;
 * never emit `allow`, which would auto-approve every edit). Malformed or
 * incomplete input fails open-quiet: a broken payload never hard-blocks work.
 */
export function decideGuardConfig(stdin: string): PreToolUseDeny | null {
  let input: PreToolUseInput;
  try {
    input = JSON.parse(stdin) as PreToolUseInput;
  } catch {
    return null;
  }
  const filePath = input?.tool_input?.file_path;
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  if (!isSidekickConfigPath(filePath, input.cwd)) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: CONFIG_DENY_REASON,
    },
  };
}

const SCAN_ADVISORY =
  'sidekick: .sidekick/config.json was modified this session. It defines your gate commands — review the change before committing (it was not made through `sidekick init`).';

export interface StopAdvisory {
  systemMessage: string;
}

/** Stop decision over `git status --porcelain` output (pure). */
export function decideScanConfig(porcelain: string): StopAdvisory | null {
  const touched = porcelain
    .split('\n')
    .some((line) => line.includes('.sidekick/config.json'));
  return touched ? { systemMessage: SCAN_ADVISORY } : null;
}

export interface RunScanConfigOptions {
  cwd: string;
  /** Returns `git status --porcelain`; injectable for tests. */
  readPorcelain?: () => string;
}

export function runScanConfig(opts: RunScanConfigOptions): StopAdvisory | null {
  const read =
    opts.readPorcelain ??
    (() =>
      execSync('git status --porcelain', {
        cwd: opts.cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }));
  let porcelain: string;
  try {
    porcelain = read();
  } catch {
    return null; // not a git repo / git unavailable → silent
  }
  return decideScanConfig(porcelain);
}
