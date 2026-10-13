/**
 * The context monitor's logic: the figure from a transcript's tail, the window
 * from the environment, the latch, and the words (#146). Pure; the handler
 * that reads files is added beside these.
 */

export type Level = 'warning' | 'critical';

// GSD's levels: it warns at 35% remaining and escalates at 25% (#146). Highest first.
const LEVELS: ReadonlyArray<{ level: Level; at: number }> = [
  { level: 'critical', at: 0.75 },
  { level: 'warning', at: 0.65 },
];
const RANK: Record<Level, number> = { warning: 0, critical: 1 };
const WINDOW_VARS = [
  'CLAUDE_CODE_AUTO_COMPACT_WINDOW',
  'CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW',
] as const;
const USAGE_FIELDS = [
  'input_tokens',
  'cache_read_input_tokens',
  'cache_creation_input_tokens',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The usage sum of one transcript line, or undefined when the line is not a
// usable main-thread assistant entry (including a sum of zero).
function mainThreadSum(line: string): number | undefined {
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
  return sum > 0 ? sum : undefined;
}

/** The newest main-thread assistant entry's token figure; undefined when the text has none. */
export function parseTail(text: string): number | undefined {
  const lines = text.split('\n');
  // Line 0 can be cut mid-way by a chunk boundary; it then fails to parse and is skipped.
  for (let i = lines.length - 1; i >= 0; i--) {
    const sum = mainThreadSum(lines[i] ?? '');
    if (sum !== undefined) return sum;
  }
  return undefined;
}

/** The first window variable holding a positive integer; undefined when none does. */
export function resolveWindow(
  env: Readonly<Record<string, string | undefined>>,
): number | undefined {
  for (const name of WINDOW_VARS) {
    const raw = env[name];
    if (raw !== undefined && /^[1-9][0-9]*$/.test(raw)) return Number(raw);
  }
  return undefined;
}

/** Each level speaks once; usage below the first level clears the latch. */
export function nextLatch(
  latched: Level | undefined,
  tokens: number,
  window: number,
): { speak?: Level; latch: Level | undefined } {
  // A figure above the window proves the window wrong.
  if (tokens > window) return { latch: latched };
  const reached = LEVELS.find((l) => tokens / window >= l.at)?.level;
  if (reached === undefined) return { latch: undefined };
  if (latched !== undefined && RANK[latched] >= RANK[reached]) {
    return { latch: latched };
  }
  return { speak: reached, latch: reached };
}

/** The advisory the model receives at a level. */
export function warningText(
  level: Level,
  tokens: number,
  window: number,
): string {
  // Integer arithmetic first: 0.57 * 100 is 56.99999999999999.
  const percent = Math.floor((tokens * 100) / window);
  const format = (n: number) => n.toLocaleString('en-US');
  const lead = `sidekick: context is ${percent}% full (${format(tokens)} of ${format(window)} tokens). There is no need to stop. Where it fits, finish the current step before starting a new one.`;
  return level === 'critical'
    ? `${lead} At the next natural pause, tell the user that context is running low.`
    : lead;
}
