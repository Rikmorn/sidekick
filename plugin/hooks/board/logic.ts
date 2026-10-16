// The board band's pure logic: reading the start hook's brief, spotting Bash
// writes to the board, and shaping the lines the band draws.
import { cut } from '../lines';
import { BRIEF_HEADER } from './contract';

export type BoardView =
  | { state: 'empty' }
  | { state: 'ok'; lines: string[]; takenAt: string }
  | { state: 'stale'; lines: string[]; takenAt: string; failedAt: string }
  | { state: 'failed'; reason: string };

export type RunOutcome =
  | { ok: true; stdout: string }
  | { ok: false; reason: string };

/** Whether the operator asked for a run with `/board`, or the band ran it itself: the start fallback, or a refresh after a board write. */
export type RunKind = 'asked' | 'unasked';

export type BandTone = 'heading' | 'plain' | 'failure';

export interface BandLine {
  tone: BandTone;
  text: string;
}

// Each row is one write that pickup reads, anchored on `gh` at a command part's start.
const BOARD_WRITES: readonly RegExp[] = [
  /^gh\s+project\s+item-(?:edit|add)\b/,
  /^gh\s+issue\s+(?:close|reopen|create|edit)\b/,
  /^gh\s+api\b(?=.*(?:-X\s*|--method[\s=]+)PATCH\b)(?=.*\bmilestones\b)/,
];

const COMMAND_SEPARATORS = /&&|\|\||[;|\n]/;

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function withoutTrailingBlanks(lines: string[]): string[] {
  const end = lines.findLastIndex((line) => line.trim() !== '');
  return lines.slice(0, end + 1);
}

/** The brief's lines from the start hook's entry among `additionalContext`, or undefined when no entry is sidekick's. */
export function briefFrom(
  contexts: readonly string[] | undefined,
): string[] | undefined {
  const entry = contexts?.find((context) => context.startsWith(BRIEF_HEADER));
  if (entry === undefined) return undefined;
  const [, ...rest] = splitLines(entry);
  const body = rest[0] === '' ? rest.slice(1) : rest;
  return withoutTrailingBlanks(body);
}

/** Whether a Bash command writes what pickup reads. */
export function isBoardWrite(command: string): boolean {
  return command
    .split(COMMAND_SEPARATORS)
    .map((part) => part.trim())
    .some((part) => BOARD_WRITES.some((write) => write.test(part)));
}

/** The view from the start hook's brief, taken at `at`. */
export function fromBrief(lines: string[], at: string): BoardView {
  return lines.length === 0
    ? { state: 'empty' }
    : { state: 'ok', lines, takenAt: at };
}

/**
 * The view after a pickup run that ended at `at` (HH:MM). A failure with no
 * good lines to keep draws only when asked: pickup also fails in an untracked
 * repo when `gh`, its scope, or the network is missing.
 */
export function afterRun(
  previous: BoardView,
  run: RunOutcome,
  at: string,
  kind: RunKind,
): BoardView {
  if (run.ok) {
    return fromBrief(withoutTrailingBlanks(splitLines(run.stdout)), at);
  }
  if (previous.state === 'ok' || previous.state === 'stale') {
    return {
      state: 'stale',
      lines: previous.lines,
      takenAt: previous.takenAt,
      failedAt: at,
    };
  }
  return kind === 'asked' ? { state: 'failed', reason: run.reason } : previous;
}

/** The run queued behind the one in flight, after one more request: asked once any request was. */
export function queuedWith(
  queued: RunKind | undefined,
  kind: RunKind,
): RunKind {
  return queued === 'asked' ? 'asked' : kind;
}

function stamped(lines: string[], stamp: string): BandLine[] {
  const [first = '', ...rest] = lines;
  return [
    { tone: 'heading', text: `${first} · ${stamp}` },
    ...rest.map((text): BandLine => ({ tone: 'plain', text })),
  ];
}

/** The band's lines for a view, each cut to `columns`. */
export function bandLines(view: BoardView, columns: number): BandLine[] {
  const lines = ((): BandLine[] => {
    switch (view.state) {
      case 'empty':
        return [];
      case 'ok':
        return stamped(view.lines, `as of ${view.takenAt}`);
      case 'stale':
        return stamped(view.lines, `refresh failed ${view.failedAt}`);
      case 'failed':
        return [{ tone: 'failure', text: `⚠ board: ${view.reason}` }];
      default: {
        const exhaustive: never = view;
        throw new Error(`Unhandled view: ${JSON.stringify(exhaustive)}`);
      }
    }
  })();
  return lines.map((line) => ({ ...line, text: cut(line.text, columns) }));
}

/** Local HH:MM for an epoch time in milliseconds. */
export function clockText(epochMs: number): string {
  const at = new Date(epochMs);
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${two(at.getHours())}:${two(at.getMinutes())}`;
}
