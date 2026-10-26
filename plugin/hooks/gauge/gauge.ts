// The gauge's adapter: reads the session through `$`, and hands the context
// limit to the post-tool-batch hook through the process environment. No hook
// approves or denies anything, and none has a `.catch`. The other mods share
// the module, and a hook that fails in one mod skips the module's whole hook
// for that event. So `session.start`, which each of them also hooks, and
// `PostToolBatch` keep their own failures and call `next(e)` once whatever
// happened. In every role the gauge also draws one identity row in
// `PromptHint` under what lies beneath: the session's name, its role, and its
// profile, read from the facts the publisher keeps in `$.state`. The board's
// hook is outer, so its line draws under that row. A failure while drawing
// leaves what lies beneath drawn. A failed read at session start leaves the
// limit unset, which the context monitor's canary reports; after a tool batch
// it leaves the last value. Each caught failure goes to the debug log, where
// the engine names a hook it skips.

import type { EngineInterface, On } from 'claude-code';
import { HINT_INSET } from '../lines';
import { type Role, settleRole } from '../role';
import type { SelfFacts } from '../state';
import { rowElement } from '../styled';
import { identityRuns, limitInputs, limitValue } from './logic';

// The ref's plugin and key must be literals, so the engine can list them.
const SELF = { plugin: 'sidekick', key: 'self' } as const;

function logFailure($: EngineInterface, hook: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  $.ui.log(`sidekick gauge: ${hook} failed: ${reason}`, { to: 'debug' });
}

// While `limitInputs` finds the limit unknown (no breakdown, or auto-compaction
// on with no threshold), the variable keeps its last value. Before any value is
// set, the monitor then falls back and its canary speaks, though the mods run;
// the declared types rule out both cases.
// `$.env.set` takes the name as a literal; it is `CONTEXT_LIMIT_VAR`.
async function refreshLimit($: EngineInterface): Promise<void> {
  const { context } = await $.session.usage({ breakdown: 'summary' });
  const inputs = limitInputs(context);
  if (inputs === undefined) return;
  const value = limitValue({
    session: await $.session.id(),
    model: await $.session.model(),
    ...inputs,
  });
  await $.env.set('SIDEKICK_CONTEXT_LIMIT', value);
}

/**
 * Hooks the gauge: the context-limit variable at session start and after each
 * tool batch, and the identity row under the prompt.
 */
export function registerGauge(on: On): void {
  // Undefined until this load's start hook settles it.
  const session: { role: Role | undefined } = { role: undefined };

  on('session.start', async ($, e, next) => {
    try {
      session.role = await settleRole($);
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
  // Until the publisher writes the facts, the settled role gives the row.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const below = await next(e);
    if (e.viewport === undefined) return below;
    try {
      const { value } = await $.state.get(SELF);
      const self = value ?? factsOf(session.role);
      const runs = identityRuns(self, e.viewport.columns - HINT_INSET);
      if (runs.length === 0) return below;
      return {
        type: 'Box',
        props: { flexDirection: 'column' },
        children: [below, rowElement(runs)],
      };
    } catch (error) {
      logFailure($, 'drawing the identity row', error);
      return below;
    }
  });
}

function factsOf(role: Role | undefined): SelfFacts | undefined {
  if (role === undefined) return undefined;
  return role.kind === 'worker' && role.main !== undefined
    ? { role: 'worker', main: role.main }
    : { role: role.kind };
}
