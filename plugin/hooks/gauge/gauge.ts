// The gauge's adapter: reads the session through `$`, and hands the context
// limit to the post-tool-batch hook through the process environment. No hook
// approves or denies anything, and none has a `.catch`. The board, the scope
// mod, and the desk share the module, and a hook that fails in one mod skips
// the module's whole hook for that event. So `session.start`, which all three
// also hook, and `PostToolBatch` keep their own failures and call `next(e)`
// once whatever happened. In a worker the gauge also draws one signpost row
// in `PromptHint` under what lies beneath, naming the worker's main and the
// way back; the board's hook passes it through. No other mod hooks a
// `SessionMode` render, so a failure there costs only the footer label. A
// failed read at session start
// leaves the limit unset, which the context monitor's canary reports; after a
// tool batch it leaves the last value. Each caught failure goes to the debug
// log, where the engine names a hook it skips.

import type { EngineInterface, On, ThemeKey } from 'claude-code';
import { cut, HINT_INSET } from '../lines';
import { type Role, settleRole } from '../role';
import {
  limitValue,
  modesWith,
  profileOf,
  signpostText,
  UNPROFILED,
} from './logic';

const SIGNPOST_COLOR: ThemeKey = 'inactive';

function logFailure($: EngineInterface, hook: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  $.ui.log(`sidekick gauge: ${hook} failed: ${reason}`, { to: 'debug' });
}

async function flagProfile($: EngineInterface): Promise<string | undefined> {
  return profileOf(await $.settings.read({ source: 'flag' }));
}

// Only the breakdown says where compaction runs, so without one the variable
// keeps its last value. The same holds when auto-compaction is on but no
// threshold arrives: the compaction point is unknown, and the window would
// overstate it. Before any value is set, the monitor then falls back and its
// canary speaks, though the mods run; the declared types rule out both cases.
// `$.env.set` takes the name as a literal; it is `CONTEXT_LIMIT_VAR`.
async function refreshLimit($: EngineInterface): Promise<void> {
  const { context } = await $.session.usage({ breakdown: 'summary' });
  const { breakdown } = context;
  if (breakdown === undefined) return;
  const { isAutoCompactEnabled, autoCompactThreshold } = breakdown;
  if (isAutoCompactEnabled && autoCompactThreshold === undefined) return;
  const value = limitValue({
    session: await $.session.id(),
    model: await $.session.model(),
    window: context.window,
    threshold: autoCompactThreshold,
  });
  await $.env.set('SIDEKICK_CONTEXT_LIMIT', value);
}

/**
 * Hooks the gauge: the context-limit variable at session start and after each
 * tool batch, the unprofiled status, the profile label in the footer, and a
 * worker's signpost row under the prompt.
 */
export function registerGauge(on: On): void {
  // Undefined until this load's start hook settles it.
  const session: { role: Role | undefined } = { role: undefined };

  // The status goes first, so a failed usage read cannot hide it.
  on('session.start', async ($, e, next) => {
    try {
      session.role = await settleRole($);
      if ((await flagProfile($)) === undefined) $.ui.status(UNPROFILED);
      await refreshLimit($);
    } catch (error) {
      // The limit stays unset, which the canary reports.
      logFailure($, 'session.start', error);
    }
    return next(e);
  });
  // A /clear starts a new session id with no `session.start` after it.
  on('classic.PostToolBatch', async ($, e, next) => {
    try {
      await refreshLimit($);
    } catch (error) {
      // The limit keeps its last value, or stays unset before the first.
      logFailure($, 'PostToolBatch', error);
    }
    return next(e);
  });
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const modes = modesWith(e.props.modes, await flagProfile($));
    return next({ ...e, props: { ...e.props, modes } });
  });
  // A failure while drawing leaves what lies beneath drawn.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const below = await next(e);
    const { role } = session;
    if (role?.kind !== 'worker' || e.viewport === undefined) return below;
    try {
      const columns = Math.max(0, e.viewport.columns - HINT_INSET);
      return {
        type: 'Box',
        props: { flexDirection: 'column' },
        children: [
          below,
          {
            type: 'Text',
            props: { color: SIGNPOST_COLOR },
            children: [cut(signpostText(role.main), columns)],
          },
        ],
      };
    } catch (error) {
      logFailure($, 'drawing the signpost', error);
      return below;
    }
  });
}
