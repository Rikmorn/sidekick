// What the name mod and `sidekick session --json --self <id>` share: the answer
// line and its parser, and the mod's run timeout, which the command's own
// listing stays under. This file imports nothing: `bin/` imports it under
// NodeNext, and the module loader allows relative files only.

export const SESSION_VERSION = 1;

/** How long the mod lets one `sidekick session --json` run take: past the command's own listing timeout, so a slow listing exits 1 with its reason. */
export const RUN_TIMEOUT_MS = 8_000;

/** The CLI's answer: the session's listed name, and whether its name holds (null when unknown). */
export interface SessionAnswer {
  version: 1;
  name: string | null;
  held: boolean | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The answer a run printed, or undefined when it is not one. */
export function parseSessionAnswer(stdout: string): SessionAnswer | undefined {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (!isRecord(json) || json.version !== SESSION_VERSION) return undefined;
  const { name, held } = json;
  if (name !== null && typeof name !== 'string') return undefined;
  if (held !== null && typeof held !== 'boolean') return undefined;
  return { version: SESSION_VERSION, name, held };
}
