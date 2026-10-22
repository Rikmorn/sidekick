// The board's adapter: runs `sidekick pm pickup --glance`, draws the glance as
// one state row under the prompt, and draws its brief in the pane `/board`
// toggles. It observes and draws, ADR-0012's first rung, so no hook adds
// context, approves, or denies, and none has a `.catch`. A live start or
// `/clear`, an open of the pane, and a Bash board write each run the pickup.
// The desk and the scope mod share `session.start` under the same matcher, and
// the gauge shares it unmatched. No other mod draws `PromptHint`, and the desk
// and the scope mod draw panes of their own ids. A hook that fails in one mod
// skips the module's whole hook for that event, so each hook keeps its own
// failures and calls `next(e)` once. `/board` registers in every session the
// profile leaves the board on in, and answers in one line in a background
// session, where nobody sees a pane. A name the engine refuses belongs to
// another owner: the board still runs, and its `command.run` hook passes the
// command on. The board's pane is the board's alone, so its hook answers for
// itself.

import type {
  EngineInterface,
  On,
  ProcessRunResult,
  RenderElement,
  RenderNode,
  ThemeKey,
} from 'claude-code';
import { PANE_ROWS, registerOwned } from '../commands';
import { cut, scrollHint } from '../lines';
import { isPartHidden } from '../scope/logic';
import { type GlanceLevel, PICKUP_TIMEOUT_MS } from './contract';
import {
  clockText,
  isBoardWrite,
  queuedWith,
  type RunKind,
  type RunOutcome,
} from './logic';
import {
  afterRun,
  type BoardView,
  failureOf,
  type PaneLine,
  paneLines,
  readRun,
  rowSegments,
  SEPARATOR,
  type Segment,
} from './view';

const COMMAND = { name: 'board', description: 'Show or hide the board pane' };
const PANE = { id: 'board', title: 'Board' };
const MS_PER_SECOND = 1_000;

/** Cells the hint area keeps from the surface's width: 2 at the left and 2 at the right, read off the probe screens (docs/research/control-centre/2026-10-21-prompt-hint-probes.md): hint rows start 2 cells in, and the subagent panel's row ends at cell 108 of 110. */
export const HINT_INSET = 4;

const ROW_COLOR: ThemeKey = 'subtle';

const LEVEL_COLORS: Record<GlanceLevel, ThemeKey> = {
  good: 'success',
  warning: 'warning',
  bad: 'error',
  unknown: 'inactive',
};

const PANE_COLORS: Record<Exclude<PaneLine['tone'], 'gap'>, ThemeKey> = {
  plain: 'text',
  subtle: 'subtle',
  failure: 'error',
  link: 'text',
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
// timeout. The declarations give no way to tell which, so the reason covers all
// three: a refused run did not start either.
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

// The `tool_input.command` of a Bash call, when it holds a string.
function commandOf(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null || !('command' in input)) {
    return undefined;
  }
  const { command } = input;
  return typeof command === 'string' ? command : undefined;
}

function link(text: string, href: string): RenderElement {
  return { type: 'Link', props: { href }, children: [text] };
}

function fixedPiece(child: RenderNode, color: ThemeKey): RenderElement {
  return {
    type: 'Box',
    props: { flexShrink: 0 },
    children: [{ type: 'Text', props: { color }, children: [child] }],
  };
}

// The viewport can be narrower than the row: with a pane docked it gave the
// transcript column's width, so the layout cuts the milestone at the real one.
function milestonePiece(text: string): RenderElement {
  return {
    type: 'Box',
    props: { flexShrink: 1, minWidth: 0 },
    children: [
      {
        type: 'Text',
        props: { color: ROW_COLOR, wrap: 'truncate-end' },
        children: [text],
      },
    ],
  };
}

function pieceOf(segment: Segment): RenderElement {
  switch (segment.kind) {
    case 'board':
      return fixedPiece(link(segment.text, segment.href), ROW_COLOR);
    case 'state':
      return fixedPiece(segment.text, LEVEL_COLORS[segment.level]);
    case 'failure':
      return fixedPiece(segment.text, 'error');
    case 'milestone':
      return milestonePiece(segment.text);
    case 'repo':
    case 'time':
    case 'detail':
      return fixedPiece(segment.text, ROW_COLOR);
    default: {
      const exhaustive: never = segment;
      throw new Error(`Unhandled segment: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function rowOf(segments: readonly Segment[]): RenderElement {
  const children = segments.flatMap((segment, index): RenderElement[] =>
    index === 0
      ? [pieceOf(segment)]
      : [fixedPiece(SEPARATOR, ROW_COLOR), pieceOf(segment)],
  );
  return { type: 'Box', props: { flexDirection: 'row' }, children };
}

// `cut` keeps most of a segment for a negative width, so a width below 0, as
// a surface narrower than the inset gives, stops at 0.
function rowUnder(
  view: BoardView,
  columns: number,
  below: RenderElement,
): RenderElement {
  const segments = rowSegments(view, Math.max(0, columns));
  if (segments.length === 0) return below;
  return {
    type: 'Box',
    props: { flexDirection: 'column' },
    children: [below, rowOf(segments)],
  };
}

// An empty Text takes no row, so the gap is a Box one row high. Each Text is
// one row: `paneLines` wrapped the lines already, so the rows counted are the
// rows drawn.
function paneLineOf(line: PaneLine): RenderElement {
  if (line.tone === 'gap') return { type: 'Box', props: { height: 1 } };
  const children =
    line.tone === 'link' ? [link(line.text, line.href)] : [line.text];
  return {
    type: 'Text',
    props: { color: PANE_COLORS[line.tone], wrap: 'truncate-end' },
    children,
  };
}

function paneOf(
  view: BoardView,
  columns: number,
  bodyRows: number,
  isFocused: boolean,
): RenderElement {
  const lines = paneLines(view, columns);
  const hint = scrollHint(lines.length, bodyRows, isFocused);
  const shown =
    hint === undefined
      ? lines
      : [
          { tone: 'subtle', text: cut(hint, columns) } satisfies PaneLine,
          ...lines,
        ];
  return {
    type: 'Box',
    props: { flexDirection: 'column' },
    children: shown.map(paneLineOf),
  };
}

// What the board keeps between its hooks. The engine follows `$` only into
// functions declared at the top of the file, so the functions that take it
// are declared here and handed this state.
interface BoardState {
  view: BoardView;
  isRunning: boolean;
  /** A run requested while one ran: it runs once when that one ends. */
  queued: RunKind | undefined;
  /** Set by the interactive `session.start` hook; undefined until it runs. */
  isLive: boolean | undefined;
  /** False until the engine accepts the name; a refused name belongs to another owner. */
  isOwned: boolean;
  /** Set at the start from `CLAUDE_JOB_DIR`, the one sign a background session gives. */
  isBackground: boolean;
  /** A classic start other than a compact whose pickup has not begun. */
  isStartPending: boolean;
}

function logFailure($: EngineInterface, what: string, error: unknown): void {
  $.ui.log(`sidekick board: ${what} failed: ${reasonOf(error)}`, {
    to: 'debug',
  });
}

async function runPickup(
  $: EngineInterface,
  board: BoardState,
  kind: RunKind,
): Promise<void> {
  const argv = [`${$.plugin.root}/bin/sidekick`, 'pm', 'pickup', '--glance'];
  const read = readRun(
    outcomeOf(
      await settle($.process.run(argv, { timeoutMs: PICKUP_TIMEOUT_MS })),
    ),
  );
  const failure = failureOf(read);
  if (failure !== undefined) {
    $.ui.log(`sidekick board: ${failure}`, { to: 'debug' });
  }
  const at = clockText(await $.clock.now());
  board.view = afterRun(board.view, read, at, kind);
  $.ui.invalidate('ui.render');
}

function takeQueued(board: BoardState): RunKind | undefined {
  const { queued } = board;
  board.queued = undefined;
  return queued;
}

// A run happens outside any hook, so the engine skips nothing for it: each
// throw is caught here. Requests during a run queue one more, which a `/board`
// among them makes asked.
async function refreshBoard(
  $: EngineInterface,
  board: BoardState,
  first: RunKind,
): Promise<void> {
  if (board.isRunning) {
    board.queued = queuedWith(board.queued, first);
    return;
  }
  board.isRunning = true;
  try {
    let kind: RunKind | undefined = first;
    while (kind !== undefined) {
      try {
        await runPickup($, board, kind);
      } catch (error) {
        logFailure($, 'a refresh', error);
      }
      kind = takeQueued(board);
    }
  } finally {
    board.isRunning = false;
  }
}

// Whichever start hook fires second finds both facts set and runs the
// pickup, so their order does not matter.
function maybeRunStart($: EngineInterface, board: BoardState): void {
  if (!board.isStartPending || board.isLive !== true) return;
  board.isStartPending = false;
  void refreshBoard($, board, 'unasked');
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

// The start pickup goes before the command, so a refused `/board` costs only
// the command. A background session registers the command and stops: nobody
// sees a row or a pane.
async function startBoard(
  $: EngineInterface,
  board: BoardState,
): Promise<void> {
  board.isBackground = (await $.env.get('CLAUDE_JOB_DIR')) !== undefined;
  const isHidden = await isBoardHidden($);
  board.isLive = !board.isBackground && !isHidden;
  if (board.isLive) maybeRunStart($, board);
  if (isHidden) return;
  board.isOwned = await registerOwned($, COMMAND, 'board');
}

// Only a placed pane closes: one held undrawn for a wider terminal opens
// again. The pickup starts before the open, so a refused open costs only the
// pane.
async function togglePane(
  $: EngineInterface,
  board: BoardState,
): Promise<void> {
  const panes = await $.ui.panes();
  const isShown = panes.some((pane) => pane.id === PANE.id && pane.isPlaced);
  if (isShown) {
    // A failure row has no other way off the screen, since rows under the prompt cannot collapse.
    if (board.view.state === 'failed') board.view = { state: 'empty' };
    $.ui.invalidate('ui.render');
    await $.ui.close({ id: PANE.id });
    return;
  }
  void refreshBoard($, board, 'asked');
  await $.ui.open({ ...PANE, rows: PANE_ROWS });
}

/**
 * Hooks the board: in every session, the classic start and, unless a profile
 * hides the board, `/board`; in a live one, the pickups, the state row under the prompt, and the board's pane.
 */
export function registerBoard(on: On): void {
  const board: BoardState = {
    view: { state: 'empty' },
    isRunning: false,
    queued: undefined,
    isLive: undefined,
    isOwned: false,
    isBackground: false,
    isStartPending: false,
  };

  // No other mod hooks the classic start, so it takes no matcher. The settings
  // hooks run inside `next(e)`, and noting the start first starts its pickup
  // beside them.
  on('classic.SessionStart', ($, e, next) => {
    try {
      if (e.source !== 'compact') {
        board.isStartPending = true;
        maybeRunStart($, board);
      }
    } catch (error) {
      logFailure($, 'classic.SessionStart', error);
    }
    return next(e);
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

  on('command.run', { command: COMMAND.name }, async ($, e, next) => {
    if (!board.isOwned) return next(e);
    if (board.isBackground) {
      return { text: '/board is off in background sessions.' };
    }
    try {
      await togglePane($, board);
    } catch (error) {
      logFailure($, 'command.run', error);
    }
    return {};
  });

  on('classic.PostToolUse', { tool_name: 'Bash' }, async ($, e, next) => {
    const result = await next(e);
    try {
      const command = commandOf(e.tool_input);
      const isWrite = command !== undefined && isBoardWrite(command);
      if (board.isLive === true && isWrite) {
        void refreshBoard($, board, 'unasked');
      }
    } catch (error) {
      logFailure($, 'classic.PostToolUse', error);
    }
    return result;
  });

  // A failure while drawing leaves what lies beneath drawn: the hint line.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const below = await next(e);
    if (board.isLive !== true || e.viewport === undefined) return below;
    try {
      return rowUnder(board.view, e.viewport.columns - HINT_INSET, below);
    } catch (error) {
      logFailure($, 'drawing the row', error);
      return below;
    }
  });

  on('ui.render', { component: 'Pane', requestId: PANE.id }, ($, e, next) => {
    try {
      return paneOf(
        board.view,
        e.props.bodyColumns,
        e.props.scroll.bodyRows,
        e.props.isFocused,
      );
    } catch (error) {
      logFailure($, 'drawing the pane', error);
      return next(e);
    }
  });
}
