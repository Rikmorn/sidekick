// The gauge's pure logic: no engine calls, so the tests reach it directly.

import type { SessionContextUsage } from 'claude-code';
import { wayBack } from '../role';
import type { SelfFacts } from '../state';
import { cutRow, type StyledRun } from '../styled';
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

const ICONS = { main: '▣', worker: '◐', other: '–' } as const;
const TONES = {
  main: 'claude',
  worker: 'suggestion',
  other: 'inactive',
} as const;

// The words after the name; a main or worker without a name leads with them.
function roleWords(self: SelfFacts): string {
  if (self.role === 'main') return 'your main';
  if (self.role === 'other') return 'session';
  return self.main === undefined
    ? 'worker · ← opens agent view'
    : `worker of ${self.main} · back: ${wayBack(self.main)}`;
}

/**
 * The identity row, cut from its end to `columns`: the role's icon and the
 * session's name, its role in words, and its profile. Before a name is known it
 * shows the role alone, as the desk spec's identity row rule says. Undefined
 * facts give no row.
 */
export function identityRuns(
  self: SelfFacts | undefined,
  columns: number,
): StyledRun[] {
  if (self === undefined) return [];
  const icon = ICONS[self.role];
  const tone = TONES[self.role];
  if (self.name === undefined) {
    return cutRow(
      [
        { text: icon, tone, bold: true },
        { text: ` ${roleWords(self)}`, tone: 'inactive' },
      ],
      columns,
    );
  }
  const head: StyledRun = { text: `${icon} ${self.name}`, tone, bold: true };
  const words = self.role === 'other' ? '' : ` · ${roleWords(self)}`;
  const profile: StyledRun[] =
    self.profile === undefined
      ? [{ text: `${words} · no profile`, tone: 'inactive' }]
      : [
          { text: `${words} · profile `, tone: 'inactive' },
          { text: self.profile, tone: 'text' },
        ];
  return cutRow([head, ...profile], columns);
}
