// The gauge's pure logic: no engine calls, so the tests reach it directly.

import type { SessionContextUsage } from 'claude-code';
import { wayBack } from '../role';
import type { ContextLimit, LimitKind } from './contract';

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

/** What resolving the limit takes from a usage reading: the window, and the compaction point when one came. */
export interface LimitInputs {
  window: number;
  threshold?: number;
}

/**
 * The limit's inputs from a usage reading, or undefined while the limit is
 * unknown. Only the breakdown says where compaction runs. When auto-compaction
 * is on but no threshold arrives, the window would overstate the limit.
 */
export function limitInputs(
  context: SessionContextUsage,
): LimitInputs | undefined {
  const { breakdown } = context;
  if (breakdown === undefined) return undefined;
  const { isAutoCompactEnabled, autoCompactThreshold } = breakdown;
  if (isAutoCompactEnabled && autoCompactThreshold === undefined) {
    return undefined;
  }
  return { window: context.window, threshold: autoCompactThreshold };
}

/**
 * The limit itself. A threshold means auto-compaction is on, so the limit is
 * the compaction point. Without one, the limit is the window itself.
 */
export function limitOf(input: LimitInputs): {
  kind: LimitKind;
  tokens: number;
} {
  return input.threshold === undefined
    ? { kind: 'window', tokens: input.window }
    : { kind: 'compaction', tokens: input.threshold };
}

/** The JSON the context-limit variable holds, as `limitOf` resolves it. */
export function limitValue(
  input: { session: string; model: string } & LimitInputs,
): string {
  const limit: ContextLimit = {
    session: input.session,
    model: input.model,
    ...limitOf(input),
  };
  return JSON.stringify(limit);
}

/** The row a worker draws under the prompt: its main and the way back, or the agent-view key when it has no main. */
export function signpostText(main: string | undefined): string {
  return main === undefined
    ? 'worker · ← opens agent view'
    : `worker of ${main} · to go back: ${wayBack(main)}`;
}
