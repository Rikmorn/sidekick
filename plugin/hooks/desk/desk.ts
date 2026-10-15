// The desk's adapter: runs `sidekick desk --json` on a clock in interactive
// sessions, keeps the last snapshot, and draws the band and the pane from it.
// No hook returns context, approves, or denies, and none has a `.catch`, so a
// failing hook is skipped and the session goes on.

import type {
  EngineInterface,
  On,
  ProcessRunResult,
  RenderElement,
  ThemeKey,
} from 'claude-code';
import {
  DESK_VERSION,
  type DeskSnapshot,
  parseDeskSnapshot,
  RUN_TIMEOUT_MS,
} from './contract';
import {
  bandLines,
  hasChildren,
  type Line,
  paneLines,
  sameSnapshot,
  type Tone,
} from './logic';

/** The period of the desk's run. Why 10 s: the footer's own waiting count refreshes on the same cadence. */
export const TICK_MS = 10_000;

const PANE = { id: 'desk', title: 'Desk' };
const COMMAND = { name: 'desk', description: 'Show or hide the desk pane' };
const MS_PER_SECOND = 1_000;

const TONE_COLORS: Record<Tone, ThemeKey> = {
  waiting: 'warning',
  working: 'suggestion',
  done: 'success',
  mark: 'warning',
  muted: 'inactive',
  heading: 'claude',
  failure: 'error',
};

// A call that rejected gives its reason instead of its value.
type Settled<T> = { value: T } | { reason: string };

function failure(error: string): DeskSnapshot {
  return { version: DESK_VERSION, ok: false, error };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function firstLine(text: string): string | undefined {
  return text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '');
}

// A tick runs outside any hook, so the engine skips nothing for it: each call
// a tick makes that can reject is settled here.
async function settle<T>(call: Promise<T>): Promise<Settled<T>> {
  try {
    return { value: await call };
  } catch (error) {
    return { reason: reasonOf(error) };
  }
}

// A run rejects when it outlasts its timeout or cannot start.
function snapshotOf(ran: Settled<ProcessRunResult>): DeskSnapshot {
  if ('reason' in ran) {
    const seconds = RUN_TIMEOUT_MS / MS_PER_SECOND;
    return failure(
      `the desk command did not finish in ${seconds} s: ${ran.reason}`,
    );
  }
  const { exitCode, stdout, stderr } = ran.value;
  if (exitCode === 0) return parseDeskSnapshot(stdout);
  const exited = `the desk command exited ${exitCode}`;
  const detail = firstLine(stderr);
  return failure(detail === undefined ? exited : `${exited}: ${detail}`);
}

// The session id is read on every run: /clear starts a new one with no
// `session.start` after it.
async function fetchSnapshot($: EngineInterface): Promise<DeskSnapshot> {
  const self = await settle($.session.id());
  if ('reason' in self) {
    return failure(`the desk could not read the session id: ${self.reason}`);
  }
  const cli = `${$.plugin.root}/bin/sidekick`;
  const argv = [cli, 'desk', '--json', '--self', self.value];
  return snapshotOf(
    await settle($.process.run(argv, { timeoutMs: RUN_TIMEOUT_MS })),
  );
}

function textOf(line: Line): RenderElement {
  return {
    type: 'Text',
    props: { color: TONE_COLORS[line.tone] },
    children: [line.text],
  };
}

function column(children: RenderElement[]): RenderElement {
  return { type: 'Box', props: { flexDirection: 'column' }, children };
}

// What the desk keeps between its hooks. The engine follows `$` only into
// functions declared at the top of the file, so the functions that take it
// are declared here and handed this state.
interface DeskState {
  last: DeskSnapshot | undefined;
  /** As the last ok snapshot had it: a failed run leaves the children unknown, not gone. */
  hadChildren: boolean;
  isRunning: boolean;
  /** As the last band render reported it. */
  isFullscreen: boolean;
}

// Opens the pane unasked only as children first appear, and only where it
// docks. Placed, held for a wider terminal, or refused by a plugin above, the
// band names the children either way, so the open's outcome is not read.
async function keepSnapshotIn(
  $: EngineInterface,
  desk: DeskState,
  snapshot: DeskSnapshot,
): Promise<void> {
  const previous = desk.last;
  if (previous !== undefined && sameSnapshot(previous, snapshot)) return;
  desk.last = snapshot;
  $.ui.invalidate('ui.render');
  if (!snapshot.ok) return;
  const hasChildrenNow = hasChildren(snapshot);
  const childrenAppeared = !desk.hadChildren && hasChildrenNow;
  desk.hadChildren = hasChildrenNow;
  if (desk.isFullscreen && childrenAppeared) await settle($.ui.open(PANE));
}

async function refreshDesk($: EngineInterface, desk: DeskState): Promise<void> {
  if (desk.isRunning) return;
  desk.isRunning = true;
  try {
    await keepSnapshotIn($, desk, await fetchSnapshot($));
  } finally {
    desk.isRunning = false;
  }
}

/**
 * Hooks the desk: in an interactive session, `/desk` and a run of
 * `sidekick desk --json` every tick; in every session, the band above the
 * prompt and the desk's pane, drawn from the last snapshot.
 */
export function registerDesk(on: On): void {
  const desk: DeskState = {
    last: undefined,
    hadChildren: false,
    isRunning: false,
    isFullscreen: false,
  };

  // The matcher keeps a `-p` run from polling. A background session reads
  // `isInteractive` true as well, so only `CLAUDE_JOB_DIR` tells it apart.
  // The engine refuses a second `session.start` hook without a matcher, and
  // the gauge has one.
  on('session.start', { isInteractive: true }, async ($, e, next) => {
    if ((await $.env.get('CLAUDE_JOB_DIR')) !== undefined) return next(e);
    await $.command.register(COMMAND);
    void refreshDesk($, desk);
    $.clock.every(TICK_MS, () => void refreshDesk($, desk));
    return next(e);
  });

  // A pane opened unasked on a narrow terminal is open but undrawn: shown, not closed.
  on('command.run', { command: COMMAND.name }, async ($) => {
    const panes = await $.ui.panes();
    const isShown = panes.some((pane) => pane.id === PANE.id && pane.isPlaced);
    if (isShown) await $.ui.close({ id: PANE.id });
    else await $.ui.open(PANE);
    return {};
  });

  on('ui.render', { component: 'AbovePrompt' }, async (_$, e, next) => {
    desk.isFullscreen = e.viewport?.isFullscreen === true;
    if (e.props.hasSurvey) return next(e);
    const { last } = desk;
    const lines =
      last === undefined ? [] : bandLines(last, e.props.bodyColumns);
    if (lines.length === 0) return next(e);
    return column([...lines.map(textOf), await next(e)]);
  });

  on('ui.render', { component: 'Pane', requestId: PANE.id }, (_$, e) => {
    const { last } = desk;
    const lines =
      last === undefined ? [] : paneLines(last, e.props.bodyColumns);
    return column(lines.map(textOf));
  });
}
