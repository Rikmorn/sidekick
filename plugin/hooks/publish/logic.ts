// The publishing mod's pure logic: the self facts a session keeps, the
// activity line a tool call makes, and the key its facts publish. No engine
// calls, so the tests reach it directly.

import type { AgentInfo } from 'claude-code';
import { clockText } from '../board/logic';
import { firstLine } from '../failures';
import { cut, ELLIPSIS, width } from '../lines';
import type { Role } from '../role';
import type { SelfFacts } from '../state';
import {
  idleActivity,
  PUBLISH_VERSION,
  type PublishedSession,
} from './contract';

/** The most subagents a key lists; the desk nests them under the session's row. */
export const MAX_SUBAGENTS = 6;

/** The longest activity line a key carries; the desk cuts it again to its own width. */
export const ACTIVITY_COLUMNS = 60;

// A finished subagent stays listed as `completed` for about 30 s, so only these count.
const LIVE_STATUSES: ReadonlySet<string> = new Set([
  'running',
  'pending',
  'waiting',
]);

/** What a session knows of itself when it publishes. */
export interface SessionFacts {
  sessionId: string;
  self: SelfFacts;
  activity?: string;
  /** The live window's tokens, once a response reported them. */
  tokens?: number;
  /** The limit the gauge resolves, once known. */
  limit?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstLineOf(value: unknown): string | undefined {
  return typeof value === 'string' ? firstLine(value) : undefined;
}

/** The facts the identity row reads: no field is set to undefined, since state takes JSON data. */
export function selfFactsOf(input: {
  role: Role;
  profile: string | undefined;
  name: string | undefined;
}): SelfFacts {
  const { role, profile, name } = input;
  const main = role.kind === 'worker' ? role.main : undefined;
  return {
    ...(name === undefined ? {} : { name }),
    role: role.kind,
    ...(main === undefined ? {} : { main }),
    ...(profile === undefined ? {} : { profile }),
  };
}

/** The subagents a key lists: running, pending, or waiting ones, at most `MAX_SUBAGENTS`, in the listing's order. */
export function subagentsOf(
  agents: readonly AgentInfo[],
): PublishedSession['subagents'] {
  return agents
    .filter((agent) => LIVE_STATUSES.has(agent.status))
    .slice(0, MAX_SUBAGENTS)
    .map(({ type, description, status }) => ({ type, description, status }));
}

// A path keeps its end, where the file's name is; anything else keeps its start.
function fitted(text: string, columns: number, isPath: boolean): string {
  if (width(text) <= columns) return text;
  if (!isPath) return cut(text, columns);
  const kept = [...text].slice(-(columns - width(ELLIPSIS))).join('');
  return `${ELLIPSIS}${kept}`;
}

/** The activity line for a main-loop tool call: `<Tool>: <target>`, the target from `file_path`, else `command`'s first line, else `description`, else `pattern`; the tool's name alone without one. */
export function activityOf(tool: string, args: unknown): string {
  const fields = isRecord(args) ? args : {};
  const path = firstLineOf(fields.file_path);
  const target =
    path ??
    firstLineOf(fields.command) ??
    firstLineOf(fields.description) ??
    firstLineOf(fields.pattern);
  const lead = `${tool}: `;
  const room = ACTIVITY_COLUMNS - width(lead);
  if (target === undefined || room <= width(ELLIPSIS)) {
    return cut(tool, ACTIVITY_COLUMNS);
  }
  return `${lead}${fitted(target, room, path !== undefined)}`;
}

/** The activity line once the main loop's turn has ended, in the session's local time. */
export function idleText(endedAt: number): string {
  return idleActivity(clockText(endedAt));
}

/** The key a session's facts publish, its subagents read from `$.agent.list()`. */
export function buildKey(
  facts: SessionFacts,
  agents: readonly AgentInfo[],
  publishedAt: number,
): PublishedSession {
  const { sessionId, self, activity, tokens, limit } = facts;
  const hasContext = tokens !== undefined && limit !== undefined;
  return {
    version: PUBLISH_VERSION,
    sessionId,
    ...(self.name === undefined ? {} : { name: self.name }),
    role: self.role,
    ...(self.main === undefined ? {} : { main: self.main }),
    ...(self.profile === undefined ? {} : { profile: self.profile }),
    ...(activity === undefined ? {} : { activity }),
    subagents: subagentsOf(agents),
    ...(hasContext ? { context: { used: tokens, limit } } : {}),
    publishedAt,
  };
}

// The key as compared: everything but `publishedAt`, in the order `buildKey` sets it.
function comparedText(key: PublishedSession): string {
  const { publishedAt: _publishedAt, ...rest } = key;
  return JSON.stringify(rest);
}

/** Whether two keys say the same thing, whenever each was published. */
export function sameKey(a: PublishedSession, b: PublishedSession): boolean {
  return comparedText(a) === comparedText(b);
}

/** Whether two sets of self facts say the same thing. */
export function sameSelf(a: SelfFacts, b: SelfFacts): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
