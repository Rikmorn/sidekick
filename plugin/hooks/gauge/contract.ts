// What the gauge's two halves share: the variable that carries the context
// limit from the module (which can read the settings) to the post-tool-batch
// hook (which can read the transcript), and the flag the test fixtures use.
// This file imports nothing: `bin/` imports it under NodeNext, and the module
// loader allows relative files only.

export const CONTEXT_LIMIT_VAR = 'SIDEKICK_CONTEXT_LIMIT';

export type LimitKind = 'compaction' | 'window';

export interface ContextLimit {
  session: string;
  model: string;
  kind: LimitKind;
  tokens: number;
}

export const FIXTURE_FLAG = { sidekick: { profile: 'fixture' } } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKind(value: unknown): value is LimitKind {
  return value === 'compaction' || value === 'window';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isContextLimit(value: unknown): value is ContextLimit {
  return (
    isRecord(value) &&
    isNonEmptyString(value.session) &&
    isNonEmptyString(value.model) &&
    isKind(value.kind) &&
    isTokenCount(value.tokens)
  );
}

/** Parses the variable's value. Anything malformed reads as absent. */
export function parseContextLimit(
  raw: string | undefined,
): ContextLimit | undefined {
  if (raw === undefined || raw === '') return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isContextLimit(value)) return undefined;
    const { session, model, kind, tokens } = value;
    return { session, model, kind, tokens };
  } catch {
    return undefined;
  }
}
