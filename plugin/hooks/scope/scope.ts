// The scope mod's adapter: keeps the agents a profile hides out of the model's
// listing and its dispatch, and draws `/profile`, which opens holding the keys
// and leads with how to scroll when its lines outrun the pane. Every filter
// fails open, and no hook approves or denies a call. The mod shares one module
// with the board, the gauge, and the desk, and a hook that throws skips the
// module's whole hook for that event. So each hook here keeps its own failures,
// and the ones on events another mod also hooks carry a matcher. `agent.offer`
// has no other hook beside it and takes none.

import type { EngineInterface, On, RenderElement, ThemeKey } from 'claude-code';
import { PANE_ROWS, registerOwned } from '../commands';
import { profileOf } from '../gauge/logic';
import { cut, scrollHint } from '../lines';
import {
  type Hidden,
  hiddenOf,
  isOffered,
  type PaneLine,
  type PaneTone,
  type Places,
  profilePaneLines,
  type UsageRead,
} from './logic';

const PANE = { id: 'profile', title: 'Profile' };
const COMMAND = {
  name: 'profile',
  description: 'Show or hide the profile pane',
};

const TONE_COLORS: Record<PaneTone, ThemeKey> = {
  heading: 'claude',
  plain: 'text',
  muted: 'inactive',
  failure: 'error',
};

interface Loaded {
  profile: string | undefined;
  hidden: Hidden;
  usage: UsageRead;
  places: Places;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function logFailure($: EngineInterface, hook: string, error: unknown): void {
  $.ui.log(`sidekick scope: ${hook} failed: ${reasonOf(error)}`, {
    to: 'debug',
  });
}

// Fails open: settings that cannot be read leave the pane showing no profile.
async function loadProfile(
  $: EngineInterface,
): Promise<Pick<Loaded, 'profile' | 'hidden'>> {
  try {
    const flag = await $.settings.read({ source: 'flag' });
    return { profile: profileOf(flag), hidden: hiddenOf(flag) };
  } catch (error) {
    logFailure($, 'reading the profile', error);
    return { profile: undefined, hidden: hiddenOf({}) };
  }
}

async function loadUsage($: EngineInterface): Promise<UsageRead> {
  try {
    const { context } = await $.session.usage({ breakdown: 'summary' });
    if (context.breakdown === undefined) {
      return { ok: false, reason: 'the session gave no breakdown' };
    }
    return { ok: true, breakdown: context.breakdown };
  } catch (error) {
    logFailure($, 'reading the usage', error);
    return { ok: false, reason: reasonOf(error) };
  }
}

// Fails open: folders that cannot be read leave the paths whole.
async function loadPlaces($: EngineInterface): Promise<Places> {
  try {
    return { session: await $.session.cwd(), home: await $.env.get('HOME') };
  } catch (error) {
    logFailure($, 'reading the folders', error);
    return { session: undefined, home: undefined };
  }
}

async function load($: EngineInterface): Promise<Loaded> {
  return {
    ...(await loadProfile($)),
    usage: await loadUsage($),
    places: await loadPlaces($),
  };
}

function textOf(line: PaneLine): RenderElement {
  return {
    type: 'Text',
    props: { color: TONE_COLORS[line.tone], wrap: 'truncate-end' },
    children: [line.text],
  };
}

function column(children: RenderElement[]): RenderElement {
  return { type: 'Box', props: { flexDirection: 'column' }, children };
}

/** Hooks the scope mod: a profile's hidden agents stay out of the listing and are refused at dispatch, and `/profile` shows what it hides and what loaded. */
export function registerScope(on: On): void {
  // One read per open: the open drops it, and the first render after reads it.
  // A promise, so two renders in flight share the one read.
  let loaded: Promise<Loaded> | undefined;
  // False until the engine accepts the name; a refused name belongs to another
  // owner, and its `command.run` hook still answers here.
  let isOwned = false;

  on('agent.offer', async ($, e, next) => {
    try {
      const hidden = hiddenOf(await $.settings.read({ source: 'flag' }));
      if (!isOffered(hidden, e.agent)) return { isOffered: false };
    } catch (error) {
      logFailure($, 'agent.offer', error);
    }
    return next(e);
  });

  // The matcher is the desk's and the board's. The gauge hooks `session.start`
  // without one, and the engine refuses a second unmatched hook on it. A
  // background session registers too.
  on('session.start', { isInteractive: true }, async ($, e, next) => {
    try {
      isOwned = await registerOwned($, COMMAND, 'scope');
    } catch (error) {
      logFailure($, 'session.start', error);
    }
    return next(e);
  });

  // A pane that is open but undrawn on a narrow terminal is shown, not closed.
  on('command.run', { command: COMMAND.name }, async ($, e, next) => {
    if (!isOwned) return next(e);
    try {
      const panes = await $.ui.panes();
      const isShown = panes.some(
        (pane) => pane.id === PANE.id && pane.isPlaced,
      );
      if (isShown) {
        await $.ui.close({ id: PANE.id });
      } else {
        loaded = undefined;
        await $.ui.open({
          ...PANE,
          focus: true,
          closeOnEscape: true,
          rows: PANE_ROWS,
        });
      }
    } catch (error) {
      logFailure($, 'command.run', error);
    }
    return {};
  });

  on(
    'ui.render',
    { component: 'Pane', requestId: PANE.id },
    async ($, e, next) => {
      try {
        loaded ??= load($);
        const lines = profilePaneLines(await loaded, e.props.bodyColumns);
        const hint = scrollHint(
          lines.length,
          e.props.scroll.bodyRows,
          e.props.isFocused,
        );
        const shown =
          hint === undefined
            ? lines
            : [
                {
                  tone: 'muted',
                  text: cut(hint, e.props.bodyColumns),
                } satisfies PaneLine,
                ...lines,
              ];
        return column(shown.map(textOf));
      } catch (error) {
        logFailure($, 'the profile pane', error);
        return next(e);
      }
    },
  );
}
