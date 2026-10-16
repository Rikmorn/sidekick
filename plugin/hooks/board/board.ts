// The board's adapter: draws the board's pickup as a band above the prompt. It
// observes and draws, ADR-0012's first rung, so no hook returns context,
// approves, or denies, and none has a `.catch`. The text is the start hook's
// brief, read from `classic.SessionStart`'s result, or the board's own pickup
// when that holds none; `/board` and a Bash board write rerun the pickup. The
// desk shares `session.start` and the `AbovePrompt` render under the same
// matchers, and the gauge shares `session.start` unmatched. A hook that fails
// in one mod skips the module's whole hook for that event, so each hook keeps
// its own failures and calls `next(e)` once. `/board` is the board's alone and
// answers its own command.

import type {
  ClassicEventOf,
  EngineInterface,
  On,
  ProcessRunResult,
  RenderElement,
  ThemeKey,
} from 'claude-code';
import { isPartHidden } from '../scope/logic';
import { PICKUP_TIMEOUT_MS } from './contract';
import {
  afterRun,
  type BandLine,
  type BandTone,
  type BoardView,
  bandLines,
  briefFrom,
  clockText,
  fromBrief,
  isBoardWrite,
  type RunOutcome,
} from './logic';

type Source = ClassicEventOf['classic.SessionStart']['source'];

const COMMAND = { name: 'board', description: 'Refresh the board band' };
const MS_PER_SECOND = 1_000;

const TONE_COLORS: Record<BandTone, ThemeKey> = {
  heading: 'claude',
  plain: 'text',
  failure: 'error',
};

// A call that rejected gives its reason instead of its value.
type Settled<T> = { value: T } | { reason: string };

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function firstLine(text: string): string | undefined {
  return text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '');
}

async function settle<T>(call: Promise<T>): Promise<Settled<T>> {
  try {
    return { value: await call };
  } catch (error) {
    return { reason: reasonOf(error) };
  }
}

// A run rejects when it cannot start, a plugin refuses it, or it outlasts its
// timeout. The declarations give no way to tell which, so the reason names both.
function outcomeOf(ran: Settled<ProcessRunResult>): RunOutcome {
  if ('reason' in ran) {
    const seconds = PICKUP_TIMEOUT_MS / MS_PER_SECOND;
    return {
      ok: false,
      reason: `the pickup did not start, or did not finish within ${seconds} s: ${ran.reason}`,
    };
  }
  const { exitCode, stdout, stderr } = ran.value;
  if (exitCode === 0) return { ok: true, stdout };
  const exited = `the pickup exited ${exitCode}`;
  const detail = firstLine(stderr);
  return {
    ok: false,
    reason: detail === undefined ? exited : `${exited}: ${detail}`,
  };
}

/** The `tool_input.command` of a Bash call, when it holds a string. */
function commandOf(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null || !('command' in input)) {
    return undefined;
  }
  const { command } = input;
  return typeof command === 'string' ? command : undefined;
}

function textOf(line: BandLine): RenderElement {
  return {
    type: 'Text',
    props: { color: TONE_COLORS[line.tone] },
    children: [line.text],
  };
}

// `cut` keeps most of a line for a negative width, so the width stops at 0.
function bandOver(
  view: BoardView,
  columns: number,
  below: RenderElement,
): RenderElement {
  const lines = bandLines(view, Math.max(0, columns));
  if (lines.length === 0) return below;
  return {
    type: 'Box',
    props: { flexDirection: 'column' },
    children: [...lines.map(textOf), below],
  };
}

// What the board keeps between its hooks. The engine follows `$` only into
// functions declared at the top of the file, so the functions that take it
// are declared here and handed this state.
interface BoardState {
  view: BoardView;
  isRunning: boolean;
  /** A refresh asked for while one ran: it runs once more when that one ends. */
  isDirty: boolean;
  /** Set by the interactive `session.start` hook; undefined until it runs. */
  isLive: boolean | undefined;
  /** What `classic.SessionStart` found; undefined until it resolves. */
  capture: 'found' | 'missing' | undefined;
}

function logFailure($: EngineInterface, what: string, error: unknown): void {
  $.ui.log(`sidekick board: ${what} failed: ${reasonOf(error)}`, {
    to: 'debug',
  });
}

async function runPickup($: EngineInterface, board: BoardState): Promise<void> {
  const argv = [`${$.plugin.root}/bin/sidekick`, 'pm', 'pickup', '--brief'];
  const outcome = outcomeOf(
    await settle($.process.run(argv, { timeoutMs: PICKUP_TIMEOUT_MS })),
  );
  if (!outcome.ok) {
    $.ui.log(`sidekick board: ${outcome.reason}`, { to: 'debug' });
  }
  board.view = afterRun(board.view, outcome, clockText(await $.clock.now()));
  $.ui.invalidate('ui.render');
}

// A run happens outside any hook, so the engine skips nothing for it: each
// throw is caught here, and a request that came during a run reruns it once.
async function refreshBoard(
  $: EngineInterface,
  board: BoardState,
): Promise<void> {
  if (board.isRunning) {
    board.isDirty = true;
    return;
  }
  board.isRunning = true;
  try {
    do {
      board.isDirty = false;
      try {
        await runPickup($, board);
      } catch (error) {
        logFailure($, 'a refresh', error);
      }
    } while (board.isDirty);
  } finally {
    board.isRunning = false;
  }
}

// Whichever start hook resolves second finds both facts set and decides, so
// their order does not matter.
function maybeFallback($: EngineInterface, board: BoardState): void {
  if (board.capture === 'missing' && board.isLive === true) {
    void refreshBoard($, board);
  }
}

async function captureBrief(
  $: EngineInterface,
  board: BoardState,
  source: Source,
  contexts: readonly string[] | undefined,
): Promise<void> {
  const lines = briefFrom(contexts);
  if (lines !== undefined) {
    board.view = fromBrief(lines, clockText(await $.clock.now()));
    $.ui.invalidate('ui.render');
  }
  if (source === 'compact') return;
  board.capture = lines === undefined ? 'missing' : 'found';
  maybeFallback($, board);
}

// Fails open: a profile hides the board only when its flag settings say so,
// and a read that fails leaves the board on.
async function isBoardHidden($: EngineInterface): Promise<boolean> {
  try {
    return isPartHidden(await $.settings.read({ source: 'flag' }), 'board');
  } catch (error) {
    $.ui.log(
      `sidekick board: reading the profile's hidden parts failed: ${reasonOf(error)}`,
      { to: 'debug' },
    );
    return false;
  }
}

// The fallback goes before the command, so a refused `/board` costs only the
// command.
async function startBoard(
  $: EngineInterface,
  board: BoardState,
): Promise<void> {
  const isBackground = (await $.env.get('CLAUDE_JOB_DIR')) !== undefined;
  board.isLive = !isBackground && !(await isBoardHidden($));
  if (!board.isLive) return;
  maybeFallback($, board);
  await $.command.register(COMMAND);
}

/**
 * Hooks the board: in every session, the start hook's brief read from the
 * classic start; in a live one, `/board`, the pickups, and the band above the
 * prompt.
 */
export function registerBoard(on: On): void {
  const board: BoardState = {
    view: { state: 'empty' },
    isRunning: false,
    isDirty: false,
    isLive: undefined,
    capture: undefined,
  };

  // No other mod hooks the classic start, so it takes no matcher.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e);
    try {
      await captureBrief($, board, e.source, result.additionalContext);
    } catch (error) {
      logFailure($, 'classic.SessionStart', error);
    }
    return result;
  });

  // The desk's matcher: identical matchers load, and `board.test.ts` pins that
  // both hooks fire. A background session reads `isInteractive` true as well.
  on('session.start', { isInteractive: true }, async ($, e, next) => {
    try {
      await startBoard($, board);
    } catch (error) {
      logFailure($, 'session.start', error);
    }
    return next(e);
  });

  on('command.run', { command: COMMAND.name }, ($) => {
    if (board.isLive === true) void refreshBoard($, board);
    return {};
  });

  on('classic.PostToolUse', { tool_name: 'Bash' }, async ($, e, next) => {
    const result = await next(e);
    try {
      const command = commandOf(e.tool_input);
      const isWrite = command !== undefined && isBoardWrite(command);
      if (board.isLive === true && isWrite) void refreshBoard($, board);
    } catch (error) {
      logFailure($, 'classic.PostToolUse', error);
    }
    return result;
  });

  // A failure while drawing leaves what lies beneath drawn.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e);
    if (e.props.hasSurvey || board.isLive !== true) return below;
    try {
      return bandOver(board.view, e.props.bodyColumns, below);
    } catch (error) {
      logFailure($, 'drawing the band', error);
      return below;
    }
  });
}
