// What the board's two halves share: the pickup's timeout, and the glance that
// `sidekick pm pickup --glance` prints and the board mod parses. This file
// imports nothing: `bin/` imports it under NodeNext, and the module loader
// allows relative files only.

/** How long one pickup may take, the start hook's own timeout (`plugin/hooks/hooks.json`). */
export const PICKUP_TIMEOUT_MS = 20_000;

export const GLANCE_VERSION = 1;

/** The word for a finished milestone, which the row marks with a tick. */
export const GLANCE_COMPLETE_WORD = 'complete';

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

/** Equals `PlanState` in `bin/helpers/pm-plans.ts`, declared here because this file imports nothing. */
export type PanePlanState = 'done' | 'running' | 'next' | 'later';
export type PaneMark = PanePlanState | 'group' | 'more';
export type PaneWeight = 'strong' | 'plain' | 'quiet';

export interface PaneNode {
  mark: PaneMark;
  ref: string | null;
  text: string;
  right: string | null;
  weight: PaneWeight;
  children: PaneNode[];
}

export type PaneRow =
  | { kind: 'prose'; mark: 'next' | 'drift' | 'outcome'; text: string }
  | { kind: 'cells'; plans: PanePlanState[]; label: string }
  | { kind: 'tree'; nodes: PaneNode[] };

export interface GlancePane {
  rows: PaneRow[];
}

const MAX_TREE_DEPTH = 4;

function isPlanState(value: unknown): value is PanePlanState {
  return (
    value === 'done' ||
    value === 'running' ||
    value === 'next' ||
    value === 'later'
  );
}

function isMark(value: unknown): value is PaneMark {
  return isPlanState(value) || value === 'group' || value === 'more';
}

function isWeight(value: unknown): value is PaneWeight {
  return value === 'strong' || value === 'plain' || value === 'quiet';
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function parseNode(value: unknown, depth: number): PaneNode | undefined {
  if (depth > MAX_TREE_DEPTH || !isRecord(value)) return undefined;
  const { mark, ref, text, right, weight, children } = value;
  if (!isMark(mark) || !isWeight(weight) || typeof text !== 'string') {
    return undefined;
  }
  if (!isStringOrNull(ref) || !isStringOrNull(right)) return undefined;
  const parsed = parseNodes(children, depth + 1);
  if (parsed === undefined) return undefined;
  return { mark, ref, text, right, weight, children: parsed };
}

function parseNodes(value: unknown, depth: number): PaneNode[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const nodes: PaneNode[] = [];
  for (const item of value) {
    const node = parseNode(item, depth);
    if (node === undefined) return undefined;
    nodes.push(node);
  }
  return nodes;
}

function parseProse(value: Record<string, unknown>): PaneRow | undefined {
  const { mark, text } = value;
  if (typeof text !== 'string') return undefined;
  if (mark !== 'next' && mark !== 'drift' && mark !== 'outcome') {
    return undefined;
  }
  return { kind: 'prose', mark, text };
}

function parseCells(value: Record<string, unknown>): PaneRow | undefined {
  const { plans, label } = value;
  if (!Array.isArray(plans) || typeof label !== 'string') return undefined;
  const states: PanePlanState[] = [];
  for (const state of plans) {
    if (!isPlanState(state)) return undefined;
    states.push(state);
  }
  return { kind: 'cells', plans: states, label };
}

function parseRow(value: unknown): PaneRow | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === 'prose') return parseProse(value);
  if (value.kind === 'cells') return parseCells(value);
  if (value.kind !== 'tree') return undefined;
  const nodes = parseNodes(value.nodes, 1);
  return nodes === undefined ? undefined : { kind: 'tree', nodes };
}

/** Parses a glance's `pane`; undefined for anything else, including a tree deeper than four levels. */
export function parsePane(value: unknown): GlancePane | undefined {
  if (!isRecord(value) || !Array.isArray(value.rows)) return undefined;
  const rows: PaneRow[] = [];
  for (const item of value.rows) {
    const row = parseRow(item);
    if (row === undefined) return undefined;
    rows.push(row);
  }
  return { rows };
}
