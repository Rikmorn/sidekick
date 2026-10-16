import type {
  AgentOfferInput,
  On,
  RenderViewport,
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

const REFUSAL = 'refused by a plugin above';

function offer(agent: string): AgentOfferInput {
  return {
    agent,
    description: 'an agent',
    source: 'built-in',
    provider: { plugin: 'engine', tier: 'core' },
  };
}

// What lies beneath the plugin: the flag settings, a refusal, or a throw.
function answerBeneath(
  on: On,
  flag: Settings | 'refuse' | 'throw',
): { debug: string[] } {
  const seen: { debug: string[] } = { debug: [] };
  mock.env(on, {});
  mock.clock(on);
  on('ui.log', (_$, e) => {
    if (e.to === 'debug') seen.debug.push(e.text);
    return { value: undefined };
  });
  on('agent.offer', () => ({ isOffered: true }));
  on('settings.read', () => {
    if (flag === 'refuse') return { deny: REFUSAL };
    if (flag === 'throw') throw new Error('settings exploded');
    return { value: flag };
  });
  return seen;
}

test('a hidden agent is withheld, and any other passes through', async ($, on) => {
  answerBeneath(on, { sidekick: { hide: { agents: ['Explore'] } } });
  expect(await $.agent.offer(offer('Explore'))).toEqual({ isOffered: false });
  expect(await $.agent.offer(offer('Plan'))).toEqual({ isOffered: true });
});

test('settings without a hide key offer every agent', async ($, on) => {
  answerBeneath(on, {});
  expect(await $.agent.offer(offer('Explore'))).toEqual({ isOffered: true });
});

test('a malformed hide key offers every agent', async ($, on) => {
  answerBeneath(on, { sidekick: { hide: { agents: 'Explore' } } });
  expect(await $.agent.offer(offer('Explore'))).toEqual({ isOffered: true });
});

test('a refused settings read offers every agent and names the failure', async ($, on) => {
  const seen = answerBeneath(on, 'refuse');
  expect(await $.agent.offer(offer('Explore'))).toEqual({ isOffered: true });
  expect(seen.debug).toContainEqual(
    expect.stringMatching(
      /^sidekick scope: agent\.offer failed: .*refused by a plugin above$/,
    ),
  );
});

test('a settings read that throws offers every agent', async ($, on) => {
  answerBeneath(on, 'throw');
  expect(await $.agent.offer(offer('Explore'))).toEqual({ isOffered: true });
});

// The /profile pane. The whole hooks module loads in every test, so the gauge's
// own start-up read of the usage is told apart by counting from the pane's open.
type UsageAnswer = { breakdown: SessionContextBreakdown } | 'refuse' | 'throw';

type ProfileWorld = {
  env: Readonly<Record<string, string>>;
  flag: Settings;
  usage: UsageAnswer;
  panes: Map<string, boolean>;
  /** The session's folder, or a refusal of its read. */
  cwd: string | 'refuse';
};

type ProfileSeen = {
  commands: string[];
  opened: string[];
  closed: string[];
  summaryReads: number;
  debug: string[];
};

const BENEATH = 'drawn beneath';
const JOB_DIR = '/Users/someone/.claude/jobs/aaaa0001';
const START: SessionStartInput = {
  cwd: '/',
  surface: 'terminal',
  isInteractive: true,
};
const VIEWPORT: RenderViewport = { columns: 200, rows: 50, isFullscreen: true };

function breakdownWith(
  over: Partial<SessionContextBreakdown> = {},
): SessionContextBreakdown {
  return {
    categories: [
      {
        name: 'Messages',
        tokens: 1_234,
        color: 'text',
        isDeferred: false,
        kind: 'used',
      },
      {
        name: 'Free space',
        tokens: 900_000,
        color: 'inactive',
        isDeferred: false,
        kind: 'free',
      },
    ],
    totalTokens: 1_234,
    maxTokens: 1_000_000,
    rawMaxTokens: 1_000_000,
    autocompactSource: 'auto',
    percentage: 0,
    gridRows: [],
    model: 'm',
    memoryFiles: [],
    mcpTools: [],
    agents: [{ agentType: 'worker-agent', source: 'plugin', tokens: 321 }],
    isAutoCompactEnabled: true,
    apiUsage: null,
    ...over,
  };
}

function profileWorld(over: Partial<ProfileWorld> = {}): ProfileWorld {
  return {
    env: {},
    flag: { sidekick: { profile: 'worker', hide: { agents: ['Explore'] } } },
    usage: { breakdown: breakdownWith() },
    panes: new Map(),
    cwd: '/work/repo',
    ...over,
  };
}

function answerProfile(
  on: On,
  world: ProfileWorld,
): { seen: ProfileSeen; clock: MockClock } {
  const seen: ProfileSeen = {
    commands: [],
    opened: [],
    closed: [],
    summaryReads: 0,
    debug: [],
  };
  mock.env(on, world.env);
  on('ui.log', (_$, e) => {
    if (e.to === 'debug') seen.debug.push(e.text);
    return { value: undefined };
  });
  on('settings.read', () => ({ value: world.flag }));
  on('session.usage', (_$, e) => {
    if (e.breakdown === 'summary') seen.summaryReads += 1;
    if (world.usage === 'refuse') return { deny: REFUSAL };
    if (world.usage === 'throw') throw new Error('usage exploded');
    return {
      value: {
        startedAt: 0,
        context: { window: 1_000_000, breakdown: world.usage.breakdown },
        rateLimits: [],
      },
    };
  });
  on('session.id', () => ({ value: 'session-1' }));
  on('session.cwd', () =>
    world.cwd === 'refuse' ? { deny: REFUSAL } : { value: world.cwd },
  );
  on('ui.status', () => ({ value: undefined }));
  const clock = mock.clock(on);
  on('command.register', (_$, e) => {
    seen.commands.push(e.name);
    return { value: { command: e.name } };
  });
  on('ui.open', (_$, e) => {
    seen.opened.push(e.id);
    world.panes.set(e.id, true);
    return { value: { isPlaced: true } };
  });
  on('ui.close', (_$, e) => {
    seen.closed.push(e.id);
    world.panes.delete(e.id);
    return { value: undefined };
  });
  on('ui.panes', () => ({
    value: [...world.panes.keys()].map((id) => ({
      id,
      title: id,
      isShown: true,
      isFocused: false,
      isPlaced: true,
    })),
  }));
  on('session.start', (_$, e) => ({ cwd: e.cwd }));
  on('ui.render', { component: 'AbovePrompt' }, () => ({
    type: 'Text',
    children: [BENEATH],
  }));
  on('ui.render', { component: 'Pane' }, () => ({
    type: 'Text',
    children: [BENEATH],
  }));
  return { seen, clock };
}

async function profileStarted($: Engine, clock: MockClock): Promise<void> {
  await $.session.start(START);
  await clock.settle();
}

function runProfile($: Engine) {
  return $.command.run({
    command: 'profile',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 200 },
  });
}

async function drawnPane(
  $: Engine,
  requestId: string,
  columns = 200,
): Promise<{ text: string; color: unknown }[]> {
  const ui = await $.ui.mount({
    plugin: 'sidekick',
    surface: 'terminal',
    component: 'Pane',
    requestId,
    props: {
      title: 'Profile',
      isFocused: false,
      bodyColumns: columns,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 20 },
      view: {},
    },
    viewport: VIEWPORT,
  });
  const texts = await ui.findAll({ type: 'Text' });
  await ui.unmount();
  return texts.map((text) => ({ text: text.text, color: text.props.color }));
}

test('an interactive start registers /profile', async ($, on) => {
  const { seen, clock } = answerProfile(on, profileWorld());
  await profileStarted($, clock);
  expect(seen.commands).toContain('profile');
});

test('a background session registers no /profile', async ($, on) => {
  const { seen, clock } = answerProfile(
    on,
    profileWorld({ env: { CLAUDE_JOB_DIR: JOB_DIR } }),
  );
  await profileStarted($, clock);
  expect(seen.commands).not.toContain('profile');
});

test('/profile opens the pane, and a second /profile closes it', async ($, on) => {
  const { seen, clock } = answerProfile(on, profileWorld());
  await profileStarted($, clock);
  expect(await runProfile($)).toEqual({});
  expect(seen.opened).toEqual(['profile']);
  await runProfile($);
  expect(seen.closed).toEqual(['profile']);
});

test('the pane draws the profile, what it hides, and what loaded, in theme colours', async ($, on) => {
  const { clock } = answerProfile(on, profileWorld());
  await profileStarted($, clock);
  await runProfile($);
  expect(await drawnPane($, 'profile')).toEqual([
    { text: 'PROFILE', color: 'claude' },
    { text: 'worker', color: 'text' },
    { text: 'hides agents: Explore', color: 'text' },
    { text: 'CONTEXT', color: 'claude' },
    { text: 'Messages  1.2k', color: 'text' },
    { text: 'AGENTS', color: 'claude' },
    { text: 'worker-agent  321', color: 'text' },
  ]);
});

test('the pane reads usage once per open, and again after a reopen', async ($, on) => {
  const { seen, clock } = answerProfile(on, profileWorld());
  await profileStarted($, clock);
  const before = seen.summaryReads;
  await runProfile($);
  await drawnPane($, 'profile');
  await drawnPane($, 'profile', 30);
  expect(seen.summaryReads - before).toBe(1);
  await runProfile($);
  await runProfile($);
  await drawnPane($, 'profile');
  expect(seen.summaryReads - before).toBe(2);
});

async function failureDrawnFor(
  usage: 'refuse' | 'throw',
  $: Engine,
  on: On,
): Promise<{ lines: { text: string; color: unknown }[]; reads: number }> {
  const { seen, clock } = answerProfile(on, profileWorld({ usage }));
  await profileStarted($, clock);
  const before = seen.summaryReads;
  await runProfile($);
  const lines = await drawnPane($, 'profile');
  await drawnPane($, 'profile');
  return { lines, reads: seen.summaryReads - before };
}

for (const usage of ['refuse', 'throw'] as const) {
  test(`a usage read that is ${usage === 'refuse' ? 'refused' : 'thrown'} draws the failure line once per open`, async ($, on) => {
    const { lines, reads } = await failureDrawnFor(usage, $, on);
    expect(reads).toBe(1);
    const texts = lines.map((line) => line.text);
    expect(texts).toContain('worker');
    expect(texts).not.toContain('CONTEXT');
    const failure = lines.find((line) => line.color === 'error');
    expect(failure?.text).toMatch(/^context usage could not be read: /);
  });
}

const MEMORY_FILES = [
  { path: '/home/me/.claude/CLAUDE.md', type: 'User', tokens: 1_500 },
  { path: '/work/repo/CLAUDE.md', type: 'Project', tokens: 900 },
];

function memoryWorld(over: Partial<ProfileWorld> = {}): ProfileWorld {
  return profileWorld({
    env: { HOME: '/home/me' },
    usage: { breakdown: breakdownWith({ memoryFiles: MEMORY_FILES }) },
    ...over,
  });
}

async function memoryLines($: Engine, columns: number): Promise<string[]> {
  const texts = (await drawnPane($, 'profile', columns)).map((l) => l.text);
  return texts.slice(texts.indexOf('MEMORY FILES') + 1);
}

test('the pane prints memory files short, under the session folder or home', async ($, on) => {
  const { clock } = answerProfile(on, memoryWorld());
  await profileStarted($, clock);
  await runProfile($);
  expect(await memoryLines($, 40)).toEqual([
    '~/.claude/CLAUDE.md  1.5k',
    'CLAUDE.md  900',
  ]);
});

test('a refused folder read leaves memory file paths whole, and the debug log names it', async ($, on) => {
  const { seen, clock } = answerProfile(on, memoryWorld({ cwd: 'refuse' }));
  await profileStarted($, clock);
  await runProfile($);
  expect(await memoryLines($, 80)).toEqual([
    '/home/me/.claude/CLAUDE.md  1.5k',
    '/work/repo/CLAUDE.md  900',
  ]);
  expect(seen.debug).toContainEqual(
    expect.stringMatching(
      /^sidekick scope: reading the folders failed: .*refused by a plugin above$/,
    ),
  );
});

test('a pane of another id is left to what lies beneath', async ($, on) => {
  const { clock } = answerProfile(on, profileWorld());
  await profileStarted($, clock);
  expect(await drawnPane($, 'another')).toEqual([
    { text: BENEATH, color: undefined },
  ]);
});
