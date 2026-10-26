// The desk's adapter: runs `sidekick desk --json` on a clock in a main, keeps
// the last snapshot and the live session keys sidekick's store holds, and
// draws the band and the pane from them. After an ok run it deletes the keys
// of sessions gone from the listing.
// `/desk` registers in every session the profile leaves the desk on in. The
// desk runs in a main, which keeps it after `←`. A worker answers `/desk` with
// the way back to its main, and an `other` session answers in one line. A
// name the engine refuses belongs to another owner: the desk still runs, and
// its `command.run` hook passes the command on.
// No hook returns context, approves, or denies. The other mods share the
// module, and a hook that fails in one mod skips the module's whole hook for
// that event. So `session.start`, which each of them also hooks, keeps its own
// failures, which the band names, and calls `next(e)` once whatever happened.
// The render hooks fall back to what lies beneath; no other mod hooks
// `AbovePrompt`. The `/desk` toggle keeps its own failures too, and no other
// mod hooks `/desk`.

import type {
  EngineInterface,
  On,
  ProcessRunResult,
  RenderElement,
  ThemeKey,
} from 'claude-code';
import { PANE_ROWS, registerOwned } from '../commands';
import { firstLine, reasonOf, type Settled, settle } from '../failures';
import type { PublishedSession } from '../publish/contract';
import { type Role, settleRole, workerAnswer } from '../role';
import { isPartHidden } from '../scope/logic';
import { rowElement } from '../styled';
import {
  DESK_VERSION,
  type DeskSnapshot,
  parseDeskSnapshot,
  RUN_TIMEOUT_MS,
} from './contract';
import { keysToDelete, readKeys, sameKeys, sessionKeys } from './keys';
import {
  bandLines,
  failureRow,
  hasChildren,
  type Line,
  paneEntries,
  paneHint,
  sameSnapshot,
  type Tone,
} from './logic';
import type { PaneEntry } from './look';
import { liveKeys } from './tree';

/** The period of the desk's run. Why 10 s: the footer's own waiting count refreshes on the same cadence. */
export const TICK_MS = 10_000;

const PANE = { id: 'desk', title: 'Desk' };
// The stacked form's width. A width the operator kept wins (P3 in docs/research/control-centre/2026-10-25-desk-pane-probes.md).
const DOCK_COLUMNS = 40;
const OPEN = { ...PANE, rows: PANE_ROWS, columns: DOCK_COLUMNS };
const COMMAND = { name: 'desk', description: 'Show or hide the desk pane' };
const MS_PER_SECOND = 1_000;

const TONE_COLORS: Record<Tone, ThemeKey> = {
  waiting: 'warning',
  working: 'suggestion',
  muted: 'inactive',
  failure: 'error',
};

type OkSnapshot = Extract<DeskSnapshot, { ok: true }>;

// The live keys an ok run read, and the time it judged them at.
interface Published {
  keys: ReadonlyMap<string, PublishedSession>;
  now: number;
}

function failure(error: string): DeskSnapshot {
  return { version: DESK_VERSION, ok: false, error };
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

function logLine($: EngineInterface, text: string): void {
  $.ui.log(`sidekick desk: ${text}`, { to: 'debug' });
}

// A key the store cannot give reads as none.
async function readStored($: EngineInterface): Promise<Map<string, unknown>> {
  const listed = await settle($.store.keys());
  if ('reason' in listed) {
    logLine($, `reading the store's keys failed: ${listed.reason}`);
    return new Map();
  }
  const stored = new Map<string, unknown>();
  for (const storeKey of sessionKeys(listed.value)) {
    const got = await settle($.store.get(storeKey));
    if ('value' in got) stored.set(storeKey, got.value);
    else logLine($, `reading ${storeKey} failed: ${got.reason}`);
  }
  return stored;
}

// A delete that fails is tried again at the next tick.
async function pruneStored(
  $: EngineInterface,
  stored: ReadonlyMap<string, unknown>,
  snapshot: OkSnapshot,
  now: number,
): Promise<void> {
  for (const storeKey of keysToDelete(stored, snapshot.sessionIds, now)) {
    const deleted = await settle($.store.delete(storeKey));
    if ('reason' in deleted) {
      logLine($, `deleting ${storeKey} failed: ${deleted.reason}`);
    }
  }
}

// Only after an ok run: a failed one leaves the listing unknown, so it deletes nothing.
async function readPublished(
  $: EngineInterface,
  snapshot: OkSnapshot,
): Promise<Published | undefined> {
  const now = await settle($.clock.now());
  if ('reason' in now) {
    logLine($, `reading the time failed: ${now.reason}`);
    return undefined;
  }
  const stored = await readStored($);
  await pruneStored($, stored, snapshot, now.value);
  return {
    keys: liveKeys(snapshot, readKeys(stored), now.value),
    now: now.value,
  };
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
  /** The live keys and their time, as the last ok run read them. */
  published: Published;
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
  published: Published | undefined,
): Promise<void> {
  const previous = desk.last;
  const isSameSnapshot =
    previous !== undefined && sameSnapshot(previous, snapshot);
  const isSameKeys =
    published === undefined || sameKeys(desk.published.keys, published.keys);
  if (published !== undefined) desk.published = published;
  if (isSameSnapshot && isSameKeys) return;
  desk.last = snapshot;
  $.ui.invalidate('ui.render');
  if (!snapshot.ok) return;
  const hasChildrenNow = hasChildren(snapshot);
  const childrenAppeared = !desk.hadChildren && hasChildrenNow;
  desk.hadChildren = hasChildrenNow;
  if (desk.isFullscreen && childrenAppeared) await settle($.ui.open(OPEN));
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
    const snapshot = await fetchSnapshot($);
    const published = snapshot.ok
      ? await readPublished($, snapshot)
      : undefined;
    await keepSnapshotIn($, desk, snapshot, published);
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

function entriesOf(desk: DeskState, columns: number): PaneEntry[] {
  const { last } = desk;
  if (last === undefined || columns < 1) return [];
  if (!last.ok)
    return [{ row: failureRow(last.error, columns), needsYou: false }];
  const { keys, now } = desk.published;
  return paneEntries(last, keys, columns, now);
}

function paneOf(
  desk: DeskState,
  columns: number,
  bodyRows: number,
  isFocused: boolean,
): RenderElement {
  const entries = entriesOf(desk, columns);
  const rows = entries.map(({ row }) => row);
  const hint = paneHint(entries, bodyRows, isFocused, columns);
  const shown = hint === undefined ? rows : [hint, ...rows];
  return column(shown.map(rowElement));
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
    published: { keys: new Map(), now: 0 },
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
      else await $.ui.open(OPEN);
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
        desk,
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
