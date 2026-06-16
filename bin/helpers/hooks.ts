import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
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

export const HOOK_MARKERS = {
  guard: 'hook guard-config',
  scan: 'hook scan-config',
} as const;

interface HookCommand {
  type: string;
  command: string;
}
interface HookEntry {
  matcher?: string;
  hooks?: HookCommand[];
}

export interface InstallHooksOptions {
  settingsLocalPath: string;
  launcherPath: string;
  enabled: boolean;
}
export interface InstallHooksResult {
  changed: boolean;
  action: 'installed' | 'removed' | 'noop';
}

function entryHasMarker(entry: HookEntry, marker: string): boolean {
  return (entry.hooks ?? []).some(
    (h) => typeof h.command === 'string' && h.command.includes(marker),
  );
}

/**
 * Reconcile sidekick's tier-0 hook entries in `.claude/settings.local.json`:
 * present when `enabled`, absent otherwise. Idempotent (re-running with the
 * same launcher is a no-op) and non-destructive (foreign hooks are preserved).
 * Throws on malformed existing settings rather than corrupting them.
 */
export function installHooks(opts: InstallHooksOptions): InstallHooksResult {
  const { settingsLocalPath, launcherPath, enabled } = opts;

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsLocalPath)) {
    const raw = fs.readFileSync(settingsLocalPath, 'utf-8');
    if (raw.trim().length > 0) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        throw new Error(
          `Cannot update ${settingsLocalPath}: invalid JSON (${err instanceof Error ? err.message : String(err)})`,
        );
      }
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error(
          `Cannot update ${settingsLocalPath}: root must be a JSON object`,
        );
      }
      settings = parsed as Record<string, unknown>;
    }
  }

  const before = JSON.stringify(settings);

  const hooks: Record<string, HookEntry[]> =
    typeof settings.hooks === 'object' &&
    settings.hooks !== null &&
    !Array.isArray(settings.hooks)
      ? (settings.hooks as Record<string, HookEntry[]>)
      : {};

  const inv = `"${launcherPath}"`;

  const pre = (Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : []).filter(
    (e) => !entryHasMarker(e, HOOK_MARKERS.guard),
  );
  if (enabled) {
    pre.push({
      matcher: 'Edit|Write|MultiEdit',
      hooks: [{ type: 'command', command: `${inv} ${HOOK_MARKERS.guard}` }],
    });
  }
  if (pre.length) hooks.PreToolUse = pre;
  else delete hooks.PreToolUse;

  const stop = (Array.isArray(hooks.Stop) ? hooks.Stop : []).filter(
    (e) => !entryHasMarker(e, HOOK_MARKERS.scan),
  );
  if (enabled) {
    stop.push({
      hooks: [{ type: 'command', command: `${inv} ${HOOK_MARKERS.scan}` }],
    });
  }
  if (stop.length) hooks.Stop = stop;
  else delete hooks.Stop;

  if (Object.keys(hooks).length) settings.hooks = hooks;
  else delete settings.hooks;

  const after = JSON.stringify(settings);
  if (after === before) return { changed: false, action: 'noop' };

  fs.mkdirSync(path.dirname(settingsLocalPath), { recursive: true });
  fs.writeFileSync(settingsLocalPath, `${JSON.stringify(settings, null, 2)}\n`);
  return { changed: true, action: enabled ? 'installed' : 'removed' };
}
