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
