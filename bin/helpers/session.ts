/**
 * `sidekick session --json --self <id>`: the name the listing gives a session
 * and whether it holds, which the name mod asks. Prints one line.
 */

import {
  SESSION_VERSION,
  type SessionAnswer,
} from '../../plugin/hooks/name/contract.js';
import { nameHeld } from './main-session.js';
import { parseFlags } from './profile.js';
import type { ClaudeRunner } from './profile-launch.js';
import { listJobs } from './worker-jobs.js';

export const SESSION_USAGE_LINE = 'sidekick session --json --self <session id>';

export interface SessionEnv {
  cwd: string;
  /** `CLAUDE_CONFIG_DIR`, else `~/.claude`: its `sessions/` holds the name sources. */
  configDir: string;
  runClaude: ClaudeRunner;
}

// The timeout stays under the mod's run timeout, as the desk's does.
const LISTING_TIMEOUT_MS = 5_000;

type Out = (line: string) => void;

// The session id, or undefined on a usage error: `--json` and `--self` are required.
function parseSessionArgs(rest: string[]): string | undefined {
  const parsed = parseFlags(rest, {
    json: { type: 'boolean' },
    self: { type: 'string' },
  });
  if (parsed === undefined || parsed.positionals.length > 0) return undefined;
  const { json, self } = parsed.values;
  return json === true && typeof self === 'string' && self !== ''
    ? self
    : undefined;
}

/** `sidekick session --json --self <id>`: 0 with one answer, 1 with the reason on stderr. */
export function runSessionCli(
  rest: string[],
  senv: SessionEnv,
  out: Out,
  err: Out,
  timeoutMs = LISTING_TIMEOUT_MS,
): number {
  const self = parseSessionArgs(rest);
  if (self === undefined) {
    err(`usage: ${SESSION_USAGE_LINE}`);
    return 1;
  }
  const listing = listJobs(senv.runClaude, senv.cwd, timeoutMs);
  if ('issues' in listing) {
    for (const issue of listing.issues) err(issue);
    return 1;
  }
  const name = listing.jobs.find((job) => job.sessionId === self)?.name;
  const answer: SessionAnswer = {
    version: SESSION_VERSION,
    name: name !== undefined && name !== '' ? name : null,
    held: nameHeld(senv.configDir, self),
  };
  out(JSON.stringify(answer));
  return 0;
}
