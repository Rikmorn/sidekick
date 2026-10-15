// The gauge's adapter: reads the session through `$`, and hands the context
// limit to the post-tool-batch hook through the process environment. No hook
// approves or denies anything, and none has a `.catch`, so a failing hook is
// skipped and the session goes on.

import type { EngineInterface, On } from 'claude-code';
import { limitValue, modesWith, profileOf, UNPROFILED } from './logic';

async function flagProfile($: EngineInterface): Promise<string | undefined> {
  return profileOf(await $.settings.read({ source: 'flag' }));
}

// Only the breakdown says where compaction runs, so without one the variable
// keeps its last value and the monitor falls back. The same holds when
// auto-compaction is on but no threshold arrives: the compaction point is
// unknown, and the window would overstate it. `$.env.set` takes the name as a
// literal; it is `CONTEXT_LIMIT_VAR`.
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
 * tool batch, the unprofiled status, and the profile label in the footer.
 */
export function registerGauge(on: On): void {
  on('session.start', async ($, e, next) => {
    await refreshLimit($);
    if ((await flagProfile($)) === undefined) $.ui.status(UNPROFILED);
    return next(e);
  });
  // A /clear starts a new session id with no `session.start` after it.
  on('classic.PostToolBatch', async ($, e, next) => {
    await refreshLimit($);
    return next(e);
  });
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const modes = modesWith(e.props.modes, await flagProfile($));
    return next({ ...e, props: { ...e.props, modes } });
  });
}
