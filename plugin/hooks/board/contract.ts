// What the board's two halves share: the start hook's first line, by which the
// board mod finds sidekick's entry, and the pickup's timeout. This file imports
// nothing: `bin/` imports it under NodeNext, and the module loader allows
// relative files only.

/** The first line of the start hook's context, by which the board mod finds sidekick's entry. */
export const BRIEF_HEADER =
  "sidekick: this repo is tracked. The board's pickup follows; load the sk-orient skill to read it and pick up work.";

/** How long one pickup may take, the start hook's own timeout (`plugin/hooks/hooks.json`). */
export const PICKUP_TIMEOUT_MS = 20_000;

export const GLANCE_VERSION = 1;

export type GlanceLevel = 'good' | 'warning' | 'bad' | 'unknown';

export interface GlanceState {
  level: GlanceLevel;
  word: string;
  detail: string | null;
}

export interface BoardGlance {
  version: typeof GLANCE_VERSION;
  board: { owner: string; repo: string; number: number; url: string };
  /** The active milestone's title; null with none open, or several and none active. */
  milestone: string | null;
  state: GlanceState;
  /** The six lines `--brief` prints, for the pane. */
  brief: string;
}

export type ParsedGlance =
  | { ok: true; glance: BoardGlance }
  | { ok: false; reason: string };

const NOT_PARSED: ParsedGlance = {
  ok: false,
  reason: "the pickup's output did not parse",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLevel(value: unknown): value is GlanceLevel {
  return (
    value === 'good' ||
    value === 'warning' ||
    value === 'bad' ||
    value === 'unknown'
  );
}

function parseState(value: unknown): GlanceState | undefined {
  if (!isRecord(value)) return undefined;
  const { level, word, detail } = value;
  if (!isLevel(level) || typeof word !== 'string') return undefined;
  if (detail !== null && typeof detail !== 'string') return undefined;
  return { level, word, detail };
}

function parseBoard(value: unknown): BoardGlance['board'] | undefined {
  if (!isRecord(value)) return undefined;
  const { owner, repo, number, url } = value;
  if (
    typeof owner !== 'string' ||
    typeof repo !== 'string' ||
    typeof number !== 'number' ||
    typeof url !== 'string'
  ) {
    return undefined;
  }
  return { owner, repo, number, url };
}

/** Parses `pickup --glance`'s stdout; anything but a version-1 glance reads as not parsed. */
export function parseGlance(text: string): ParsedGlance {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return NOT_PARSED;
  }
  if (!isRecord(value) || value.version !== GLANCE_VERSION) return NOT_PARSED;
  const board = parseBoard(value.board);
  const state = parseState(value.state);
  const { milestone, brief } = value;
  if (board === undefined || state === undefined) return NOT_PARSED;
  if (milestone !== null && typeof milestone !== 'string') return NOT_PARSED;
  if (typeof brief !== 'string') return NOT_PARSED;
  return {
    ok: true,
    glance: { version: GLANCE_VERSION, board, milestone, state, brief },
  };
}
