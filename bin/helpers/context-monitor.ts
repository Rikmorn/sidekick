/**
 * The context monitor: the figure and the model from a transcript's tail, the
 * limit from the gauge's variable or the environment, the latch, and the
 * words, as pure functions, and the
 * `post-tool-batch` handler that reads the transcript and keeps the latch file.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CONTEXT_LIMIT_VAR,
  type LimitKind,
  parseContextLimit,
} from '../../plugin/hooks/gauge/contract.js';

export type Level = 'warning' | 'critical';

// GSD's levels: it warns at 35% remaining and escalates at 25%. Highest first.
const LEVELS: ReadonlyArray<{ level: Level; at: number }> = [
  { level: 'critical', at: 0.75 },
  { level: 'warning', at: 0.65 },
];
const RANK: Record<Level, number> = { warning: 0, critical: 1 };
// Claude Code raises a smaller window to this.
const COMPACTION_FLOOR = 100_000;
// Claude Code compacts this far below its compaction window: measured on
// Haiku, Sonnet, and Opus 5.5 under 2.1.300
// (docs/research/control-centre/2026-10-15-mod-foundation-probes.md).
const COMPACTION_MARGIN = 33_000;
const USAGE_FIELDS = [
  'input_tokens',
  'cache_read_input_tokens',
  'cache_creation_input_tokens',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface TailEntry {
  tokens: number;
  model: string | undefined;
}

// The figure and model of one transcript line, or undefined when the line is
// not a usable main-thread assistant entry (including a sum of zero).
function mainThreadEntry(line: string): TailEntry | undefined {
  let entry: unknown;
  try {
    entry = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!isRecord(entry)) return undefined;
  if (entry.type !== 'assistant' || entry.isSidechain !== false) {
    return undefined;
  }
  if (!isRecord(entry.message) || !isRecord(entry.message.usage)) {
    return undefined;
  }
  const { usage } = entry.message;
  const counts = USAGE_FIELDS.flatMap((field) => {
    const n = usage[field];
    return typeof n === 'number' && Number.isFinite(n) ? [n] : [];
  });
  if (counts.length !== USAGE_FIELDS.length) return undefined;
  const sum = counts.reduce((total, n) => total + n, 0);
  if (sum <= 0) return undefined;
  const { model } = entry.message;
  return { tokens: sum, model: typeof model === 'string' ? model : undefined };
}

/** The newest main-thread assistant entry's token figure and model; undefined when the text has none. */
export function parseTail(text: string): TailEntry | undefined {
  const lines = text.split('\n');
  // Line 0 can be cut mid-way by a chunk boundary; it then fails to parse and is skipped.
  for (let i = lines.length - 1; i >= 0; i--) {
    const found = mainThreadEntry(lines[i] ?? '');
    if (found !== undefined) return found;
  }
  return undefined;
}

export interface Limit {
  tokens: number;
  kind: LimitKind;
}

const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

function positiveInteger(raw: string | undefined): number | undefined {
  return raw !== undefined && POSITIVE_INTEGER.test(raw)
    ? Number(raw)
    : undefined;
}

/**
 * Where the limit comes from, first match wins: the gauge's value, when it is
 * this session's and this model's; the auto-compact window, as a compaction
 * point (#225); the plugin option, as a window; else undefined.
 */
export function resolveLimit(
  env: Readonly<Record<string, string | undefined>>,
  sessionId: string,
  model: string | undefined,
): Limit | undefined {
  const gauge = parseContextLimit(env[CONTEXT_LIMIT_VAR]);
  if (
    gauge !== undefined &&
    gauge.session === sessionId &&
    model !== undefined &&
    gauge.model === model
  ) {
    return { tokens: gauge.tokens, kind: gauge.kind };
  }
  const compactWindow = positiveInteger(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW);
  if (compactWindow !== undefined) {
    return {
      tokens: Math.max(compactWindow, COMPACTION_FLOOR) - COMPACTION_MARGIN,
      kind: 'compaction',
    };
  }
  const option = positiveInteger(env.CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW);
  return option === undefined ? undefined : { tokens: option, kind: 'window' };
}

/** Each level speaks once; usage below the first level clears the latch. */
export function nextLatch(
  latched: Level | undefined,
  tokens: number,
  limit: number,
): { speak?: Level; latch: Level | undefined } {
  // A figure above the limit proves the limit wrong, whichever kind it is.
  if (tokens > limit) return { latch: latched };
  const reached = LEVELS.find((l) => tokens / limit >= l.at)?.level;
  if (reached === undefined) return { latch: undefined };
  if (latched !== undefined && RANK[latched] >= RANK[reached]) {
    return { latch: latched };
  }
  return { speak: reached, latch: reached };
}

// A dispatched worker has no one to tell, and compaction can drop its brief.
function workerTail(brief: string): string {
  return `This session is a worker that no one watches: do not stop to tell the user. Keep superpowers' ledger current, and after a compaction re-read the brief at \`${brief}\`.`;
}

/**
 * The advisory the model receives at a level. A worker's brief path swaps the
 * critical text's "tell the user" for the worker text.
 */
export function warningText(
  level: Level,
  tokens: number,
  limit: Limit,
  workerBrief?: string,
): string {
  // Integer arithmetic first: 0.57 * 100 is 56.99999999999999.
  const percent = Math.floor((tokens * 100) / limit.tokens);
  const format = (n: number) => n.toLocaleString('en-US');
  const where =
    limit.kind === 'compaction' ? 'of the way to compaction' : 'full';
  const lead = `sidekick: context is ${percent}% ${where} (${format(tokens)} of ${format(limit.tokens)} tokens). There is no need to stop. Where it fits, finish the current step before starting a new one.`;
  if (level !== 'critical') return lead;
  return workerBrief === undefined
    ? `${lead} At the next natural pause, tell the user that context is running low.`
    : `${lead} ${workerTail(workerBrief)}`;
}

export interface MonitorEnv {
  env: Readonly<Record<string, string | undefined>>;
  tmpdir: string;
}

// The session id becomes part of a file name in tmpdir.
const SESSION_ID = /^[A-Za-z0-9-]{1,128}$/;
// Tail sizes tried in turn; a transcript line can hold a large tool result.
const TAIL_BYTES = [256 * 1024, 512 * 1024, 1024 * 1024, 2 * 1024 * 1024];

function readTail(fd: number, size: number, bytes: number): string {
  const length = Math.min(size, bytes);
  const buffer = Buffer.alloc(length);
  fs.readSync(fd, buffer, 0, length, size - length);
  return buffer.toString('utf-8');
}

function readTailEntry(transcript: string): TailEntry | undefined {
  const fd = fs.openSync(transcript, 'r');
  try {
    const { size } = fs.fstatSync(fd);
    for (const bytes of TAIL_BYTES) {
      const found = parseTail(readTail(fd, size, bytes));
      if (found !== undefined || bytes >= size) return found;
    }
    return undefined;
  } finally {
    fs.closeSync(fd);
  }
}

function readLatch(file: string): Level | undefined {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!isRecord(parsed)) return undefined;
    const { level } = parsed;
    return level === 'warning' || level === 'critical' ? level : undefined;
  } catch {
    return undefined;
  }
}

// O_NOFOLLOW: on a shared temp folder, another user can plant a symlink at the
// latch path, and a plain write would overwrite its target.
const LATCH_FLAGS =
  fs.constants.O_WRONLY |
  fs.constants.O_CREAT |
  fs.constants.O_TRUNC |
  fs.constants.O_NOFOLLOW;

function writeLatch(file: string, latch: Level | undefined): void {
  if (latch === undefined) {
    fs.rmSync(file, { force: true });
    return;
  }
  const fd = fs.openSync(file, LATCH_FLAGS, 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify({ level: latch }));
  } finally {
    fs.closeSync(fd);
  }
}

/** The advisory to add after a tool batch; undefined when the monitor stays silent. */
export function postToolBatchContext(
  stdin: string,
  monitor: MonitorEnv,
): string | undefined {
  try {
    const event: unknown = JSON.parse(stdin);
    // A subagent's event carries the parent's session_id, so skip it: its limit is its own.
    if (!isRecord(event) || 'agent_id' in event) return undefined;
    const { session_id: sessionId, transcript_path: transcript } = event;
    if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) {
      return undefined;
    }
    if (typeof transcript !== 'string') return undefined;
    const found = readTailEntry(transcript);
    if (found === undefined) return undefined;
    const { tokens, model } = found;
    const limit = resolveLimit(monitor.env, sessionId, model);
    if (limit === undefined) return undefined;
    const latchFile = path.join(
      monitor.tmpdir,
      `sidekick-ctx-${sessionId}.json`,
    );
    const brief = monitor.env.SIDEKICK_WORKER;
    const latched = readLatch(latchFile);
    const next = nextLatch(latched, tokens, limit.tokens);
    if (next.latch !== latched) writeLatch(latchFile, next.latch);
    return next.speak === undefined
      ? undefined
      : warningText(
          next.speak,
          tokens,
          limit,
          brief === '' ? undefined : brief,
        );
  } catch {
    return undefined;
  }
}
