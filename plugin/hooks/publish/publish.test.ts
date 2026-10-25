import type {
  AgentInfo,
  On,
  RenderSurface,
  SessionContextBreakdown,
  SessionStartInput,
  Settings,
} from 'claude-code';
import {
  type Engine,
  expect,
  type MockClock,
  mock,
  test,
} from 'claude-code/testing';
import { RUN_TIMEOUT_MS } from '../name/contract';
import {
  HEARTBEAT_MS,
  keyOf,
  type PublishedSession,
  parsePublished,
} from './contract';

const NOW = new Date(2026, 9, 25, 9, 30).getTime();
const FIRST = 'session-1';
const SECOND = 'session-2';
const MAIN = 'Single word reply';
const PUBLISH_LOG = 'sidekick publish: ';
const REFUSAL = 'refused by a plugin above';

const START: SessionStartInput = {
  cwd: '/',
  surface: 'terminal',
  isInteractive: true,
};

// What the session command answers: an exit with its streams.
type RunAnswer = { exitCode: number; stdout: string; stderr: string };

// The session beneath the plugin. A test may change any field between events,
// as /clear changes `sessionId`.
type World = {
  env: Readonly<Record<string, string>>;
  flag: Settings;
  sessionId: string;
  surfaces: RenderSurface[];
  agents: AgentInfo[];
  /** The live window's tokens, absent before the first response. */
  tokens?: number;
  window: number;
  threshold?: number;
  isAutoCompactEnabled: boolean;
  /** What the session command answers, whose `--self` it was asked about. */
  answerFor: (sessionId: string) => RunAnswer;
  refused: Set<'store.set' | 'session.id'>;
};

// What the plugin asked of the engine.
type Seen = {
  /** What the store holds now. */
  store: Map<string, unknown>;
  /** Each store write, in order. */
  sets: { key: string; value: unknown }[];
  deletes: string[];
  /** Each value written to `$.state` `sidekick.self`, in order. */
  selves: unknown[];
  /** The session command's runs, by the id each asked about. */
  runs: string[];
  timeouts: (number | undefined)[];
  debug: string[];
};

function answered(name: string | null): RunAnswer {
  return {
    exitCode: 0,
    stdout: `${JSON.stringify({ version: 1, name, held: true })}\n`,
    stderr: '',
  };
}

const EXITED: RunAnswer = {
  exitCode: 1,
  stdout: '',
  stderr: 'claude agents --json did not return in time.\n',
};

function worldWith(over: Partial<World> = {}): World {
  return {
    env: {},
    flag: { sidekick: { profile: 'main' } },
    sessionId: FIRST,
    surfaces: ['terminal'],
    agents: [],
    tokens: 64_347,
    window: 1_000_000,
    threshold: 967_000,
    isAutoCompactEnabled: true,
    answerFor: (sessionId) => answered(`name of ${sessionId}`),
    refused: new Set(),
    ...over,
  };
}

function breakdownOf(world: World): SessionContextBreakdown {
  return {
    categories: [],
    totalTokens: 0,
    maxTokens: world.window,
    rawMaxTokens: world.window,
    autocompactSource: 'auto',
    percentage: 0,
    gridRows: [],
    model: 'claude-opus-5-5',
    memoryFiles: [],
    mcpTools: [],
    agents: [],
    autoCompactThreshold: world.threshold,
    isAutoCompactEnabled: world.isAutoCompactEnabled,
    apiUsage: null,
  };
}

// The calls only the other mods make, answered so they stay quiet: their
// runs are refused, and the gauge's limit write and status are taken.
function answerTheOtherMods(on: On): void {
  on('session.model', () => ({ value: 'claude-opus-5-5' }));
  on('env.set', () => ({ value: {} }));
  on('ui.status', () => ({ value: undefined }));
  on('command.register', (_$, e) => ({ value: { command: e.name } }));
  on('ui.invalidate', (_$, e, next) => next(e));
}

function answerTheStore(on: On, world: World, seen: Seen): void {
  on('store.set', (_$, e) => {
    if (world.refused.has('store.set')) return { deny: REFUSAL };
    seen.sets.push({ key: e.key, value: e.value });
    seen.store.set(e.key, e.value);
    return { value: undefined };
  });
  on('store.delete', (_$, e) => {
    seen.deletes.push(e.key);
    seen.store.delete(e.key);
    return { value: undefined };
  });
  const kept: Record<string, unknown> = {};
  on('state.get', (_$, e) => ({ value: { value: kept[e.key], version: 0 } }));
  on('state.set', (_$, e) => {
    kept[e.key] = e.value;
    if (e.key === 'self') seen.selves.push(e.value);
    return { value: { isSet: true, version: 1 } };
  });
}

function answerTheSession(on: On, world: World): void {
  mock.env(on, world.env);
  on('settings.read', (_$, e) => ({
    value: e.source === 'flag' ? world.flag : {},
  }));
  on('session.id', () =>
    world.refused.has('session.id')
      ? { deny: REFUSAL }
      : { value: world.sessionId },
  );
  on('session.surfaces', () => ({ value: world.surfaces }));
  // As the engine does, the breakdown comes back only when the call asks.
  on('session.usage', (_$, e) => {
    const { tokens, window } = world;
    const breakdown =
      e.breakdown === undefined ? {} : { breakdown: breakdownOf(world) };
    const context = {
      window,
      ...(tokens === undefined ? {} : { tokens }),
      ...breakdown,
    };
    return { value: { startedAt: 0, context, rateLimits: [] } };
  });
  on('agent.list', () => ({ value: world.agents }));
}

// Nothing sits beneath the test's hooks but the kit's own bottom, so they
// answer every call the publisher makes and end every chain it continues.
function answerBeneath(on: On, world: World): { seen: Seen; clock: MockClock } {
  const seen: Seen = {
    store: new Map(),
    sets: [],
    deletes: [],
    selves: [],
    runs: [],
    timeouts: [],
    debug: [],
  };
  on('ui.log', (_$, e) => {
    if (e.to === 'debug') seen.debug.push(e.text);
    return { value: undefined };
  });
  answerTheSession(on, world);
  answerTheStore(on, world, seen);
  answerTheOtherMods(on);
  on('process.run', (_$, e) => {
    if (e.argv[1] !== 'session') return { deny: 'no other runs here' };
    const self = e.argv.at(-1) ?? '';
    seen.runs.push(self);
    seen.timeouts.push(e.init?.timeoutMs);
    const answer = world.answerFor(self);
    return {
      value: { ...answer, isStdoutTruncated: false, isStderrTruncated: false },
    };
  });
  const clock = mock.clock(on, { now: NOW });
  on('session.start', (_$, e) => ({ cwd: e.cwd }));
  on('classic.SessionStart', () => ({}));
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }));
  on('session.measure', (_$, e) => ({ changed: e.changed }));
  on('turn.start', (_$, e) => ({ turnId: e.turnId }));
  on('turn.complete', (_$, e) => ({ text: e.answer }));
  on('classic.PreToolUse', () => ({}));
  on('tool.call', () => ({ result: 'from beneath' }));
  return { seen, clock };
}

// The classic start, then the interactive one, as a session fires them, and
// what each started meanwhile.
async function started($: Engine, clock: MockClock, start = START) {
  await $.classic.SessionStart({ source: 'startup' });
  await $.session.start(start);
  await clock.settle();
}

function keyIn(seen: Seen, sessionId: string): PublishedSession | undefined {
  return parsePublished(seen.store.get(keyOf(sessionId)));
}

function publishLines(seen: Seen): string[] {
  return seen.debug.filter((line) => line.startsWith(PUBLISH_LOG));
}

async function turnStarted($: Engine, clock: MockClock, agentId?: string) {
  await $.turn.start({
    text: '',
    turnId: 't1',
    ...(agentId ? { agentId } : {}),
  });
  await clock.settle();
}

async function turnCompleted($: Engine, clock: MockClock, agentId?: string) {
  await $.turn.complete({
    answer: 'ok',
    durationMs: 1,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    ...(agentId ? { agentId } : {}),
  });
  await clock.settle();
}

async function ended(
  $: Engine,
  clock: MockClock,
  sessionId: string,
  reason: 'clear' | 'other',
) {
  await $.session.end({ reason, sessionId, resume: { id: sessionId } });
  await clock.settle();
}

test('a start publishes the key and the self facts', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith());
  await started($, clock);
  expect(keyIn(seen, FIRST)).toEqual({
    version: 1,
    sessionId: FIRST,
    name: 'name of session-1',
    role: 'main',
    profile: 'main',
    subagents: [],
    context: { used: 64_347, limit: 967_000 },
    publishedAt: NOW,
  });
  expect(seen.selves.at(-1)).toEqual({
    name: 'name of session-1',
    role: 'main',
    profile: 'main',
  });
  expect(publishLines(seen)).toEqual([]);
});

test('the session command runs for this session under its timeout, at start and each heartbeat only', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith());
  await started($, clock);
  expect(seen.runs).toEqual([FIRST]);
  expect(seen.timeouts).toEqual([RUN_TIMEOUT_MS]);
  await turnStarted($, clock);
  await $.tool.call({ tool: 'Bash', command: 'ls' });
  await turnCompleted($, clock);
  expect(seen.runs).toEqual([FIRST]);
  await clock.advance(HEARTBEAT_MS);
  expect(seen.runs).toEqual([FIRST, FIRST]);
});

test('a heartbeat republishes with a fresh publishedAt, though nothing changed, and leaves self alone', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith());
  await started($, clock);
  const writes = seen.sets.length;
  const selves = seen.selves.length;
  await clock.advance(HEARTBEAT_MS);
  expect(seen.sets).toHaveLength(writes + 1);
  expect(keyIn(seen, FIRST)?.publishedAt).toBe(NOW + HEARTBEAT_MS);
  expect(seen.selves).toHaveLength(selves);
});

test('an event that changes nothing writes nothing; one that does writes once', async ($, on) => {
  const world = worldWith();
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  const writes = seen.sets.length;
  await $.session.measure({
    context: { window: world.window, tokens: world.tokens },
    rateLimits: [],
    changed: ['context'],
  });
  await clock.settle();
  expect(seen.sets).toHaveLength(writes);
  world.tokens = 70_000;
  await $.session.measure({
    context: { window: world.window, tokens: world.tokens },
    rateLimits: [],
    changed: ['context'],
  });
  await clock.settle();
  expect(seen.sets).toHaveLength(writes + 1);
  expect(keyIn(seen, FIRST)?.context).toEqual({ used: 70_000, limit: 967_000 });
});

test("the activity follows the main loop's tool calls, then reads idle since the turn's end", async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith());
  await started($, clock);
  expect(keyIn(seen, FIRST)?.activity).toBeUndefined();
  await turnStarted($, clock);
  expect(
    await $.tool.call({ tool: 'Read', file_path: 'plugin/hooks/lines.ts' }),
  ).toMatchObject({ result: 'from beneath' });
  await clock.settle();
  expect(keyIn(seen, FIRST)?.activity).toBe('Read: plugin/hooks/lines.ts');
  await $.tool.call({ tool: 'Bash', command: 'sleep 45', agentId: 'a1' });
  await clock.settle();
  expect(keyIn(seen, FIRST)?.activity).toBe('Read: plugin/hooks/lines.ts');
  await clock.advance(5 * 60_000);
  await turnCompleted($, clock);
  expect(keyIn(seen, FIRST)?.activity).toBe('idle since 09:35');
});

test("a subagent's turn neither starts nor ends the main loop's activity", async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith());
  await started($, clock);
  await turnStarted($, clock);
  await $.tool.call({ tool: 'Bash', command: 'bun run test' });
  await turnCompleted($, clock, 'a1');
  await turnStarted($, clock, 'a2');
  expect(keyIn(seen, FIRST)?.activity).toBe('Bash: bun run test');
});

test('the subagents are the running, pending, and waiting ones the agent list holds', async ($, on) => {
  const world = worldWith();
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  world.agents = [
    {
      id: 'a1',
      type: 'general-purpose',
      description: 'probe alpha',
      status: 'running',
    },
    {
      id: 'a2',
      type: 'Explore',
      description: 'probe beta',
      status: 'completed',
    },
  ];
  await turnStarted($, clock, 'a1');
  expect(keyIn(seen, FIRST)?.subagents).toEqual([
    { type: 'general-purpose', description: 'probe alpha', status: 'running' },
  ]);
});

test('a worker publishes its role and its main, in the key and in self', async ($, on) => {
  const world = worldWith({
    env: { CLAUDE_JOB_DIR: '/Users/someone/.claude/jobs/aaaa0001' },
    flag: { env: { SIDEKICK_MAIN: MAIN }, sidekick: { profile: 'worker' } },
  });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  expect(keyIn(seen, FIRST)).toMatchObject({
    role: 'worker',
    main: MAIN,
    profile: 'worker',
  });
  expect(seen.selves.at(-1)).toEqual({
    name: 'name of session-1',
    role: 'worker',
    main: MAIN,
    profile: 'worker',
  });
});

test('a session whose profile hides every mod part still publishes', async ($, on) => {
  const world = worldWith({
    flag: {
      sidekick: {
        profile: 'quiet',
        hide: { mods: ['board', 'desk', 'gauge'] },
      },
    },
  });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  expect(keyIn(seen, FIRST)?.profile).toBe('quiet');
});

test('session.end deletes the key', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith());
  await started($, clock);
  await ended($, clock, FIRST, 'other');
  expect(seen.deletes).toEqual([keyOf(FIRST)]);
  expect(seen.store.has(keyOf(FIRST))).toBe(false);
});

test('after /clear the old key goes, and the new id publishes its own at its next event', async ($, on) => {
  const world = worldWith();
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await ended($, clock, FIRST, 'clear');
  world.sessionId = SECOND;
  await turnStarted($, clock);
  expect(seen.store.has(keyOf(FIRST))).toBe(false);
  expect(keyIn(seen, SECOND)).toMatchObject({
    sessionId: SECOND,
    role: 'main',
  });
  expect(keyIn(seen, SECOND)?.name).toBeUndefined();
});

test('after /clear with no event, the heartbeat publishes the new id with its own name', async ($, on) => {
  const world = worldWith();
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await ended($, clock, FIRST, 'clear');
  world.sessionId = SECOND;
  await clock.advance(HEARTBEAT_MS);
  expect(seen.store.has(keyOf(FIRST))).toBe(false);
  expect(keyIn(seen, SECOND)?.name).toBe('name of session-2');
  expect(seen.runs).toEqual([FIRST, SECOND]);
  expect(seen.selves.at(-1)).toMatchObject({ name: 'name of session-2' });
});

test('a process with no surface, as the tab after ← is, publishes nothing more', async ($, on) => {
  const world = worldWith();
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  const writes = seen.sets.length;
  world.surfaces = [];
  await clock.advance(HEARTBEAT_MS);
  await turnStarted($, clock);
  expect(seen.sets).toHaveLength(writes);
  expect(seen.runs).toEqual([FIRST]);
});

test('a session that is not interactive, as a -p run, publishes nothing', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith());
  await started($, clock, { ...START, isInteractive: false });
  await turnStarted($, clock);
  await $.tool.call({ tool: 'Bash', command: 'ls' });
  await clock.advance(HEARTBEAT_MS);
  await ended($, clock, FIRST, 'other');
  expect(seen.sets).toEqual([]);
  expect(seen.deletes).toEqual([]);
  expect(seen.selves).toEqual([]);
});

test('the context reads the window when auto-compaction is off', async ($, on) => {
  const world = worldWith({
    threshold: undefined,
    isAutoCompactEnabled: false,
  });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  expect(keyIn(seen, FIRST)?.context).toEqual({
    used: 64_347,
    limit: 1_000_000,
  });
});

test('no context while the limit or the tokens are unknown', async ($, on) => {
  const world = worldWith({ threshold: undefined });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  expect(keyIn(seen, FIRST)).toMatchObject({ sessionId: FIRST });
  expect(keyIn(seen, FIRST)?.context).toBeUndefined();
  world.threshold = 967_000;
  world.tokens = undefined;
  await clock.advance(HEARTBEAT_MS);
  expect(keyIn(seen, FIRST)?.publishedAt).toBe(NOW + HEARTBEAT_MS);
  expect(keyIn(seen, FIRST)?.context).toBeUndefined();
});

test('a failed name run keeps the name the last good one gave', async ($, on) => {
  const world = worldWith();
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  world.answerFor = () => EXITED;
  await clock.advance(HEARTBEAT_MS);
  expect(keyIn(seen, FIRST)?.name).toBe('name of session-1');
  expect(publishLines(seen)).toEqual([
    'sidekick publish: the session command exited 1: claude agents --json did not return in time.',
  ]);
});

test('a refused store write goes to the debug log, and the tool call still answers', async ($, on) => {
  const world = worldWith();
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  world.refused.add('store.set');
  await turnStarted($, clock);
  expect(await $.tool.call({ tool: 'Bash', command: 'ls' })).toMatchObject({
    result: 'from beneath',
  });
  await clock.settle();
  expect(publishLines(seen)).toContainEqual(
    expect.stringMatching(
      /^sidekick publish: writing the key failed: .*refused by a plugin above$/,
    ),
  );
});

test('a refused session id read publishes nothing, and says why', async ($, on) => {
  const world = worldWith();
  world.refused.add('session.id');
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  expect(seen.sets).toEqual([]);
  expect(publishLines(seen)).toContainEqual(
    expect.stringMatching(
      /^sidekick publish: reading the session id failed: .*refused by a plugin above$/,
    ),
  );
});
