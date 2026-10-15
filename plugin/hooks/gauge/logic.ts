// The gauge's pure logic: no engine calls, so the tests reach it directly.

import type { ContextLimit } from './contract';

export const UNPROFILED = 'no profile settings in this session';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The profile name a session's flag settings carry, if any. */
export function profileOf(flag: Record<string, unknown>): string | undefined {
  const { sidekick } = flag;
  if (!isRecord(sidekick)) return undefined;
  const { profile } = sidekick;
  return typeof profile === 'string' && profile !== '' ? profile : undefined;
}

/** The footer's modes with the profile label appended, as a new array. */
export function modesWith(
  modes: readonly string[],
  profile: string | undefined,
): string[] {
  return profile === undefined ? [...modes] : [...modes, `profile: ${profile}`];
}

/**
 * The JSON the context-limit variable holds. A threshold means
 * auto-compaction is on, so the limit is the compaction point. Without one,
 * the limit is the window itself.
 */
export function limitValue(input: {
  session: string;
  model: string;
  window: number;
  threshold?: number;
}): string {
  const limit: ContextLimit =
    input.threshold === undefined
      ? {
          session: input.session,
          model: input.model,
          kind: 'window',
          tokens: input.window,
        }
      : {
          session: input.session,
          model: input.model,
          kind: 'compaction',
          tokens: input.threshold,
        };
  return JSON.stringify(limit);
}
