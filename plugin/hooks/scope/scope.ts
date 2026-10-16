// The scope mod's adapter: keeps the agents a profile hides out of the model's
// listing and its dispatch. Every filter fails open, and no hook approves or
// denies a call. `agent.offer` has no other mod's hook beside it, so it takes
// no matcher; a hook that throws is skipped, and the agent stays offered.

import type { EngineInterface, On } from 'claude-code';
import { hiddenOf, isOffered } from './logic';

function logFailure($: EngineInterface, hook: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  $.ui.log(`sidekick scope: ${hook} failed: ${reason}`, { to: 'debug' });
}

/** Hooks the scope mod: a profile's hidden agents stay out of the listing. */
export function registerScope(on: On): void {
  on('agent.offer', async ($, e, next) => {
    try {
      const hidden = hiddenOf(await $.settings.read({ source: 'flag' }));
      if (!isOffered(hidden, e.agent)) return { isOffered: false };
    } catch (error) {
      logFailure($, 'agent.offer', error);
    }
    return next(e);
  });
}
