// The desk's adapter: runs `sidekick desk --json` on a clock in interactive
// sessions, keeps the last snapshot, and draws the band and the pane from it.
// `/desk` registers in every session the profile leaves the desk on in. The
// desk runs in a main, which keeps it after `←`. A worker answers `/desk` with
// the way back to its main, and an `other` session answers in one line. A
// name the engine refuses belongs to another owner: the desk still runs, and
// its `command.run` hook passes the command on.
// No hook returns context, approves, or denies. The board, the gauge, and the
// scope mod share the module, and a hook that fails in one mod skips the
// module's whole hook for that event. So `session.start`, which all three also
// hook, keeps its own failures, which the band names, and calls `next(e)` once
// whatever happened. The render hooks fall back to what lies beneath; no other
// mod hooks `AbovePrompt`. The `/desk` toggle keeps its own failures too, and
// no other mod hooks `/desk`.

import type {
  EngineInterface,
  On,
  ProcessRunResult,
  RenderElement,
  ThemeKey,
} from 'claude-code';
import { PANE_ROWS, registerOwned } from '../commands';
import { cut, scrollHint } from '../lines';
import { type Role, settleRole, workerAnswer } from '../role';
import { isPartHidden } from '../scope/logic';
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

// A run rejects when it cannot start, a plugin refuses it, or it outlasts its
// timeout. The declarations give no way to tell which, so the line names both.
function snapshotOf(ran: Settled<ProcessRunResult>): DeskSnapshot {
  if ('reason' in ran) {
    const seconds = RUN_TIMEOUT_MS / MS_PER_SECOND;
    return failure(
      `the desk command did not start, or did not finish within ${seconds} s: ${ran.reason}`,
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
    props: { color: TONE_COLORS[line.tone], wrap: 'truncate-end' },
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
  /** False until the engine accepts the name; a refused name belongs to another owner. */
  isOwned: boolean;
  /** Settled at the start; undefined until the start hook runs. */
  role: Role | undefined;
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
  if (desk.isFullscreen && childrenAppeared)
    await settle($.ui.open({ ...PANE, rows: PANE_ROWS }));
}

// The engine drops a refused redraw and reports it rather than throwing, so
// keeping a failure does not fail in its turn. The debug log keeps the trace
// the engine would have written for a skipped hook.
function keepFailureIn(
  $: EngineInterface,
  desk: DeskState,
  error: string,
): void {
  desk.last = failure(error);
  $.ui.log(`sidekick desk: ${error}`, { to: 'debug' });
  $.ui.invalidate('ui.render');
}

function logDrawFailure(
  $: EngineInterface,
  site: string,
  error: unknown,
): void {
  $.ui.log(`sidekick desk: drawing the ${site} failed: ${reasonOf(error)}`, {
    to: 'debug',
  });
}

// A tick runs outside any hook, so a throw the settled calls did not cover is
// kept here as a failure rather than left unhandled. No surface means the
// session runs on without a screen, as the agent view's tab process does
// after `←`, so a tick then runs nothing.
async function refreshDesk($: EngineInterface, desk: DeskState): Promise<void> {
  if (desk.isRunning) return;
  desk.isRunning = true;
  try {
    if ((await $.session.surfaces()).length === 0) return;
    await keepSnapshotIn($, desk, await fetchSnapshot($));
  } catch (error) {
    keepFailureIn($, desk, `could not refresh: ${reasonOf(error)}`);
  } finally {
    desk.isRunning = false;
  }
}

// Fails open: a profile hides the desk only when its flag settings say so, and
// a read that fails leaves the desk on.
async function isDeskHidden($: EngineInterface): Promise<boolean> {
  try {
    return isPartHidden(await $.settings.read({ source: 'flag' }), 'desk');
  } catch (error) {
    $.ui.log(
      `sidekick desk: reading the profile's hidden parts failed: ${reasonOf(error)}`,
      { to: 'debug' },
    );
    return false;
  }
}

// A refused register leaves the desk running, since the band does not depend on
// the command. Only a main polls: a worker or an `other` session registers and stops.
async function startDesk($: EngineInterface, desk: DeskState): Promise<void> {
  if (await isDeskHidden($)) return;
  const role = await settleRole($);
  desk.role = role;
  desk.isOwned = await registerOwned($, COMMAND, 'desk');
  if (role.kind !== 'main') return;
  $.clock.every(TICK_MS, () => void refreshDesk($, desk));
  void refreshDesk($, desk);
}

function bandOver(
  last: DeskSnapshot | undefined,
  columns: number,
  below: RenderElement,
): RenderElement {
  const lines = last === undefined ? [] : bandLines(last, columns);
  return lines.length === 0 ? below : column([...lines.map(textOf), below]);
}

function paneOf(
  last: DeskSnapshot | undefined,
  columns: number,
  bodyRows: number,
  isFocused: boolean,
): RenderElement {
  const lines = last === undefined ? [] : paneLines(last, columns);
  const hint = scrollHint(lines.length, bodyRows, isFocused);
  const shown =
    hint === undefined
      ? lines
      : [{ tone: 'muted', text: cut(hint, columns) } satisfies Line, ...lines];
  return column(shown.map(textOf));
}

/**
 * Hooks the desk: `/desk` in an interactive session, whatever its role;
 * a run of `sidekick desk --json` every tick in a main; in
 * every session, the band above the prompt and the desk's pane, drawn from the
 * last snapshot.
 */
export function registerDesk(on: On): void {
  const desk: DeskState = {
    last: undefined,
    hadChildren: false,
    isRunning: false,
    isOwned: false,
    role: undefined,
    isFullscreen: false,
  };

  // The matcher keeps a `-p` run from polling. A background session reads
  // `isInteractive` true as well, so only the role tells it apart.
  // The engine refuses a second `session.start` hook without a matcher, and
  // the gauge has one.
  on('session.start', { isInteractive: true }, async ($, e, next) => {
    try {
      await startDesk($, desk);
    } catch (error) {
      keepFailureIn($, desk, `could not start: ${reasonOf(error)}`);
    }
    return next(e);
  });

  // A pane opened unasked on a narrow terminal is open but undrawn: shown, not closed.
  on('command.run', { command: COMMAND.name }, async ($, e, next) => {
    if (!desk.isOwned) return next(e);
    const { role } = desk;
    if (role !== undefined) {
      switch (role.kind) {
        case 'main':
          break;
        case 'worker':
          return { text: workerAnswer(COMMAND.name, role.main) };
        case 'other':
          return { text: '/desk is off in background sessions.' };
        default: {
          const unhandled: never = role;
          throw new Error(`Unhandled role: ${JSON.stringify(unhandled)}`);
        }
      }
    }
    try {
      const panes = await $.ui.panes();
      const isShown = panes.some(
        (pane) => pane.id === PANE.id && pane.isPlaced,
      );
      if (isShown) await $.ui.close({ id: PANE.id });
      else await $.ui.open({ ...PANE, rows: PANE_ROWS });
    } catch (error) {
      $.ui.log(`sidekick desk: command.run failed: ${reasonOf(error)}`, {
        to: 'debug',
      });
    }
    return {};
  });

  // A failure while drawing leaves what lies beneath drawn, in both hooks.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    desk.isFullscreen = e.viewport?.isFullscreen === true;
    const below = await next(e);
    if (e.props.hasSurvey) return below;
    try {
      return bandOver(desk.last, e.props.bodyColumns, below);
    } catch (error) {
      logDrawFailure($, 'band', error);
      return below;
    }
  });

  on('ui.render', { component: 'Pane', requestId: PANE.id }, ($, e, next) => {
    try {
      return paneOf(
        desk.last,
        e.props.bodyColumns,
        e.props.scroll.bodyRows,
        e.props.isFocused,
      );
    } catch (error) {
      logDrawFailure($, 'pane', error);
      return next(e);
    }
  });
}
