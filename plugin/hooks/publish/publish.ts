// The publishing mod's adapter: every sidekick session publishes one `$.store`
// key about itself, which the desk reads, and keeps its own facts in `$.state`,
// which the gauge's identity row reads. It runs in every role, whatever the
// profile hides. It publishes at the interactive start, on each event that can
// change its facts, and on a heartbeat. It writes only a changed key, but the
// heartbeat always writes, so `publishedAt` stays fresh. `session.end`, which
// also fires on /clear, deletes the ending session's key.
// No hook returns context, approves, or denies. The other mods share the
// module, and a hook that fails in one mod skips the module's whole hook for
// that event. So each hook keeps its own failures, which go to the debug log.
// A hook starts its publish unawaited, so no tool call or turn waits on the
// store, and calls `next(e)` once. Only `session.end` awaits its delete, within
// the bound the engine sets on the session's end.

import type { EngineInterface, On } from 'claude-code';
import { reasonOf, settle } from '../failures';
import { limitInputs, limitOf, profileOf } from '../gauge/logic';
import { sessionCheckOf } from '../name/check';
import { RUN_TIMEOUT_MS } from '../name/contract';
import { type Role, settleRole } from '../role';
import type { SelfFacts } from '../state';
import { HEARTBEAT_MS, keyOf, type PublishedSession } from './contract';
import {
  activityOf,
  buildKey,
  idleText,
  type SessionFacts,
  sameKey,
  sameSelf,
  selfFactsOf,
} from './logic';

const SELF = { plugin: 'sidekick', key: 'self' } as const;

// A publish asked for while one runs: `force` writes the key even unchanged.
type PublishKind = 'change' | 'force';

// What the publisher keeps between its hooks. The engine follows `$` only into
// functions declared at the top of the file, so the functions that take it
// are declared here and handed this state.
interface PublishState {
  // True once this load's interactive start ran: a `-p` run publishes nothing.
  isStarted: boolean;
  // Settled at the start; undefined until the start hook runs.
  role: Role | undefined;
  profile: string | undefined;
  // The listing's name and the session it names, since /clear starts a session the listing names afresh.
  name: { sessionId: string; name: string } | undefined;
  // The latest session id a publish asked a name check for; /clear moves it on.
  nameAskedFor: string | undefined;
  isCheckingName: boolean;
  limit: number | undefined;
  // The main loop's activity line; undefined before any turn, and in a turn before its first tool call.
  activity: string | undefined;
  // Bumped at each main-loop turn start and each session end, so a turn's late end cannot set what follows it.
  turns: number;
  isPublishing: boolean;
  queued: PublishKind | undefined;
  written: PublishedSession | undefined;
  self: SelfFacts | undefined;
  // The session the latest end closed. A return to an earlier one follows another end, which moves this on.
  lastEnded: string | undefined;
}

function logLine($: EngineInterface, text: string): void {
  $.ui.log(`sidekick publish: ${text}`, { to: 'debug' });
}

// No surface means the process runs on as agent view's tab after `←`, no
// longer the session it started as: it publishes nothing and asks nothing,
// and its key is the desk's to prune.
async function isShown($: EngineInterface): Promise<boolean> {
  return (await $.session.surfaces()).length > 0;
}

// One check runs at a time: a check asked for while another runs is skipped,
// and the heartbeat asks again.
async function refreshName(
  $: EngineInterface,
  state: PublishState,
): Promise<void> {
  if (state.isCheckingName) return;
  state.isCheckingName = true;
  try {
    await checkName($, state);
  } finally {
    state.isCheckingName = false;
  }
}

// The session id is read at each check: /clear starts a new one with no
// `session.start` after it. A failed or nameless answer keeps the name the
// last good one gave.
async function checkName(
  $: EngineInterface,
  state: PublishState,
): Promise<void> {
  const id = await settle($.session.id());
  if ('reason' in id) {
    logLine($, `reading the session id failed: ${id.reason}`);
    return;
  }
  const sessionId = id.value;
  const cli = `${$.plugin.root}/bin/sidekick`;
  const argv = [cli, 'session', '--json', '--self', sessionId];
  const check = sessionCheckOf(
    await settle($.process.run(argv, { timeoutMs: RUN_TIMEOUT_MS })),
  );
  if ('failure' in check) {
    logLine($, check.failure);
    return;
  }
  const { name } = check.answer;
  if (name !== null) state.name = { sessionId, name };
}

// The breakdown estimates every category, so the limit is read at the start,
// at each measure, and on the heartbeat, not at every event. An unknown limit
// keeps the last one known, as the gauge's variable does.
async function refreshLimit(
  $: EngineInterface,
  state: PublishState,
): Promise<void> {
  const usage = await settle($.session.usage({ breakdown: 'summary' }));
  if ('reason' in usage) {
    logLine($, `reading the context limit failed: ${usage.reason}`);
    return;
  }
  const inputs = limitInputs(usage.value.context);
  if (inputs !== undefined) state.limit = limitOf(inputs).tokens;
}

async function readProfile($: EngineInterface): Promise<string | undefined> {
  const flag = await settle($.settings.read({ source: 'flag' }));
  if ('reason' in flag) {
    logLine($, `reading the flag settings failed: ${flag.reason}`);
    return undefined;
  }
  return profileOf(flag.value);
}

async function keepSelf(
  $: EngineInterface,
  state: PublishState,
  self: SelfFacts,
): Promise<void> {
  if (state.self !== undefined && sameSelf(state.self, self)) return;
  const kept = await settle($.state.set(SELF, self));
  if ('reason' in kept) {
    logLine($, `keeping the self facts failed: ${kept.reason}`);
    return;
  }
  state.self = self;
}

// A key needs the time; the tokens and the subagents are left out when their
// reads fail.
async function keyNow(
  $: EngineInterface,
  facts: Omit<SessionFacts, 'tokens'>,
): Promise<PublishedSession | undefined> {
  const now = await settle($.clock.now());
  if ('reason' in now) {
    logLine($, `reading the time failed: ${now.reason}`);
    return undefined;
  }
  const usage = await settle($.session.usage());
  if ('reason' in usage) {
    logLine($, `reading the context failed: ${usage.reason}`);
  }
  const agents = await settle($.agent.list());
  if ('reason' in agents) {
    logLine($, `listing the subagents failed: ${agents.reason}`);
  }
  const tokens = 'value' in usage ? usage.value.context.tokens : undefined;
  return buildKey(
    { ...facts, tokens },
    'value' in agents ? agents.value : [],
    now.value,
  );
}

// A session id the publisher has no name for gets one check, unawaited so the
// publish goes on, then a republish; the heartbeat waits up to HEARTBEAT_MS.
async function learnName(
  $: EngineInterface,
  state: PublishState,
): Promise<void> {
  try {
    await refreshName($, state);
  } catch (error) {
    logLine($, `the name check failed: ${reasonOf(error)}`);
  }
  await requestPublish($, state, 'change');
}

async function publishOnce(
  $: EngineInterface,
  state: PublishState,
  kind: PublishKind,
): Promise<void> {
  const { role } = state;
  if (role === undefined) return;
  if (!(await isShown($))) return;
  const id = await settle($.session.id());
  if ('reason' in id) {
    logLine($, `reading the session id failed: ${id.reason}`);
    return;
  }
  const sessionId = id.value;
  const name =
    state.name?.sessionId === sessionId ? state.name.name : undefined;
  const isNameUnknown = name === undefined && state.nameAskedFor !== sessionId;
  if (isNameUnknown) {
    state.nameAskedFor = sessionId;
    void learnName($, state);
  }
  const self = selfFactsOf({ role, profile: state.profile, name });
  await keepSelf($, state, self);
  const { activity, limit } = state;
  const key = await keyNow($, { sessionId, self, activity, limit });
  if (key === undefined) return;
  const isUnchanged =
    kind === 'change' &&
    state.written !== undefined &&
    sameKey(state.written, key);
  if (isUnchanged) return;
  // Checked just before the write is issued: a publish under way across an
  // end, or a start still settling, must not write the ended key back.
  if (sessionId === state.lastEnded) return;
  const written = await settle($.store.set(keyOf(sessionId), key));
  if ('reason' in written) {
    logLine($, `writing the key failed: ${written.reason}`);
    return;
  }
  state.written = key;
}

// One publish runs at a time; asks meanwhile fold into one more run, forced
// when any ask was. Never rejects.
async function requestPublish(
  $: EngineInterface,
  state: PublishState,
  kind: PublishKind,
): Promise<void> {
  if (!state.isStarted) return;
  if (state.isPublishing) {
    state.queued = state.queued === 'force' ? 'force' : kind;
    return;
  }
  state.isPublishing = true;
  try {
    let next: PublishKind | undefined = kind;
    while (next !== undefined) {
      state.queued = undefined;
      try {
        await publishOnce($, state, next);
      } catch (error) {
        logLine($, `publishing failed: ${reasonOf(error)}`);
      }
      next = state.queued;
    }
  } finally {
    state.isPublishing = false;
  }
}

async function heartbeat($: EngineInterface, state: PublishState) {
  try {
    if (!(await isShown($))) return;
    await refreshName($, state);
    await refreshLimit($, state);
  } catch (error) {
    logLine($, `the heartbeat failed: ${reasonOf(error)}`);
  }
  await requestPublish($, state, 'force');
}

// Publishes before the name comes, so the role shows at once; the name check
// that publish asks for republishes once the name has come. A second start in one load keeps the one heartbeat.
async function startPublishing(
  $: EngineInterface,
  state: PublishState,
): Promise<void> {
  try {
    const isFirstStart = !state.isStarted;
    state.role = await settleRole($);
    state.profile = await readProfile($);
    state.isStarted = true;
    if (isFirstStart) {
      $.clock.every(HEARTBEAT_MS, () => void heartbeat($, state));
    }
    await refreshLimit($, state);
  } catch (error) {
    logLine($, `starting failed: ${reasonOf(error)}`);
  }
  // The first publish asks for the name, which republishes once it comes.
  await requestPublish($, state, 'change');
}

async function measured($: EngineInterface, state: PublishState) {
  try {
    await refreshLimit($, state);
  } catch (error) {
    logLine($, `session.measure failed: ${reasonOf(error)}`);
  }
  await requestPublish($, state, 'change');
}

// A failed clock read leaves the activity out rather than guess the time.
async function endTurn($: EngineInterface, state: PublishState) {
  try {
    const turn = state.turns;
    const now = await settle($.clock.now());
    if (state.turns !== turn) return;
    if ('reason' in now) {
      logLine($, `reading the time failed: ${now.reason}`);
      state.activity = undefined;
    } else {
      state.activity = idleText(now.value);
    }
  } catch (error) {
    logLine($, `turn.complete failed: ${reasonOf(error)}`);
  }
  await requestPublish($, state, 'change');
}

// The end is recorded before the start check, so a start still settling does
// not publish the session that ended. The next session begins with no activity.
async function endSession(
  $: EngineInterface,
  state: PublishState,
  sessionId: string,
): Promise<void> {
  state.lastEnded = sessionId;
  state.activity = undefined;
  state.turns += 1;
  if (!state.isStarted) return;
  try {
    const deleted = await settle($.store.delete(keyOf(sessionId)));
    if ('reason' in deleted) {
      logLine($, `deleting the key failed: ${deleted.reason}`);
    }
  } catch (error) {
    logLine($, `session.end failed: ${reasonOf(error)}`);
  }
}

/**
 * Hooks the publisher: in every interactive session, whatever its role and
 * profile, it publishes the session's key at the start, on the events that
 * change it, and every `HEARTBEAT_MS`, keeps its self facts in state, and
 * deletes the key at `session.end`.
 */
export function registerPublish(on: On): void {
  const state: PublishState = {
    isStarted: false,
    role: undefined,
    profile: undefined,
    name: undefined,
    nameAskedFor: undefined,
    isCheckingName: false,
    limit: undefined,
    activity: undefined,
    turns: 0,
    isPublishing: false,
    queued: undefined,
    written: undefined,
    self: undefined,
    lastEnded: undefined,
  };

  // The engine refuses a second `session.start` hook without a matcher, and
  // the gauge has one. A background session reads `isInteractive` true as well.
  on('session.start', { isInteractive: true }, ($, e, next) => {
    void startPublishing($, state);
    return next(e);
  });

  on('session.measure', ($, e, next) => {
    void measured($, state);
    return next(e);
  });

  // A subagent's turn changes only the agent list; the main loop's starts its activity afresh.
  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) {
      state.turns += 1;
      state.activity = undefined;
    }
    void requestPublish($, state, 'change');
    return next(e);
  });

  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined) void endTurn($, state);
    else void requestPublish($, state, 'change');
    return next(e);
  });

  // Only the main loop's calls name the activity: the engine's own forks call
  // tools under ids the agent list never shows.
  on('tool.call', ($, e, next) => {
    try {
      if (e.agentId === undefined) {
        state.activity = activityOf(e.tool, e);
        void requestPublish($, state, 'change');
      }
    } catch (error) {
      logLine($, `tool.call failed: ${reasonOf(error)}`);
    }
    return next(e);
  });

  on('session.end', async ($, e, next) => {
    await endSession($, state, e.sessionId);
    return next(e);
  });
}
