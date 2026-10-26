// When the board runs, as pure logic: the Bash writes that refresh it, the run
// queued behind the one in flight, and the HH:MM a run is stamped with.

export type { RunOutcome } from '../failures';

/** Whether the operator asked for a run by opening the pane with `/board`, or the board ran it itself: at start, or after a board write. */
export type RunKind = 'asked' | 'unasked';

// Each row is one write that pickup reads or the line shows (a commit, a push), anchored on `gh` or `git` at a command part's start.
const BOARD_WRITES: readonly RegExp[] = [
  /^gh\s+project\s+item-(?:edit|add)\b/,
  /^gh\s+issue\s+(?:close|reopen|create|edit)\b/,
  /^gh\s+api\b(?=.*(?:-X\s*|--method[\s=]+)PATCH\b)(?=.*\bmilestones\b)/,
  /^git\s+(?:commit|push)(?=\s|$)/,
  /^gh\s+api\s+graphql\b(?=.*\bcreateProjectV2StatusUpdate\b)/,
];

const COMMAND_SEPARATORS = /&&|\|\||[;|\n]/;

/** Whether a Bash command writes what pickup reads. */
export function isBoardWrite(command: string): boolean {
  return command
    .split(COMMAND_SEPARATORS)
    .map((part) => part.trim())
    .some((part) => BOARD_WRITES.some((write) => write.test(part)));
}

/** The run queued behind the one in flight, after one more request: asked once any request was. */
export function queuedWith(
  queued: RunKind | undefined,
  kind: RunKind,
): RunKind {
  return queued === 'asked' ? 'asked' : kind;
}

/** Local HH:MM for an epoch time in milliseconds. */
export function clockText(epochMs: number): string {
  const at = new Date(epochMs);
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${two(at.getHours())}:${two(at.getMinutes())}`;
}
