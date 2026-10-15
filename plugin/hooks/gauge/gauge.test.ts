import type {
  On,
  SessionContextBreakdown,
  SessionStartInput,
  Settings,
} from 'claude-code';
import { expect, test } from 'claude-code/testing';
import { CONTEXT_LIMIT_VAR, FIXTURE_FLAG, parseContextLimit } from './contract';
import { UNPROFILED } from './logic';

// The session the test's hooks answer for, beneath the plugin. A test may
// change `id` between events, as /clear does.
type Session = {
  flag: Settings;
  id: string;
  model: string;
  window: number;
  threshold: number;
};

// What the plugin wrote or drew through the engine.
type Seen = {
  env: Map<string, string | undefined>;
  statuses: (string | undefined)[];
  modes: (readonly string[])[];
};

const START: SessionStartInput = {
  cwd: '/',
  surface: 'terminal',
  isInteractive: true,
};

const SURFACES = ['terminal', 'desktop'] as const;

function sessionWith(flag: Settings): Session {
  return {
    flag,
    id: 'session-1',
    model: 'claude-opus-5-5',
    window: 1000000,
    threshold: 967000,
  };
}

function breakdownOf(session: Session): SessionContextBreakdown {
  return {
    categories: [],
    totalTokens: 0,
    maxTokens: session.window,
    rawMaxTokens: session.window,
    autocompactSource: 'auto',
    percentage: 0,
    gridRows: [],
    model: session.model,
    memoryFiles: [],
    mcpTools: [],
    agents: [],
    autoCompactThreshold: session.threshold,
    isAutoCompactEnabled: true,
    apiUsage: null,
  };
}

// Nothing sits beneath the test's hooks, so they answer every call the
// gauge makes and end every chain it continues.
function answerBeneath(on: On, session: Session): Seen {
  const seen: Seen = { env: new Map(), statuses: [], modes: [] };
  on('settings.read', (_$, e) => ({
    value: e.source === 'flag' ? session.flag : {},
  }));
  on('session.id', () => ({ value: session.id }));
  on('session.model', () => ({ value: session.model }));
  // As the engine does, the breakdown comes back only when the call asks.
  on('session.usage', (_$, e) => {
    const context =
      e.breakdown === undefined
        ? { window: session.window }
        : { window: session.window, breakdown: breakdownOf(session) };
    return { value: { startedAt: 0, context, rateLimits: [] } };
  });
  on('env.set', (_$, e) => {
    seen.env.set(e.name, e.value);
    return { value: undefined };
  });
  on('ui.status', (_$, e) => {
    seen.statuses.push(e.text);
    return { value: undefined };
  });
  on('session.start', (_$, e) => ({ cwd: e.cwd }));
  on('classic.PostToolBatch', () => ({}));
  on('ui.render', { component: 'SessionMode' }, (_$, e) => {
    seen.modes.push(e.props.modes);
    return { type: 'Text', children: [e.props.modes.join(' & ')] };
  });
  return seen;
}

function limitIn(seen: Seen) {
  return parseContextLimit(seen.env.get(CONTEXT_LIMIT_VAR));
}

test('session start sets the compaction limit and no status when profiled', async ($, on) => {
  const seen = answerBeneath(on, sessionWith(FIXTURE_FLAG));
  await $.session.start(START);
  expect(limitIn(seen)).toEqual({
    session: 'session-1',
    model: 'claude-opus-5-5',
    kind: 'compaction',
    tokens: 967000,
  });
  expect(seen.statuses).toEqual([]);
});

test('session start pins the unprofiled status when the flag names no profile', async ($, on) => {
  const seen = answerBeneath(on, sessionWith({}));
  await $.session.start(START);
  expect(seen.statuses).toEqual([UNPROFILED]);
});

test('a tool batch after the session id changes names the new id', async ($, on) => {
  const session = sessionWith(FIXTURE_FLAG);
  const seen = answerBeneath(on, session);
  await $.session.start(START);
  session.id = 'session-2';
  await $.classic.PostToolBatch({ tool_calls: [] });
  expect(limitIn(seen)).toMatchObject({ session: 'session-2' });
});

test('the footer gains the profile label on every surface', async ($, on) => {
  const seen = answerBeneath(on, sessionWith(FIXTURE_FLAG));
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'sidekick',
      surface,
      component: 'SessionMode',
      props: { modes: ['focus'] },
    });
    expect(seen.modes.at(-1)).toEqual(['focus', 'profile: fixture']);
    await ui.unmount();
  }
});

test('the footer is left as it was when the flag names no profile', async ($, on) => {
  const seen = answerBeneath(on, sessionWith({}));
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'sidekick',
      surface,
      component: 'SessionMode',
      props: { modes: ['focus'] },
    });
    expect(seen.modes.at(-1)).toEqual(['focus']);
    await ui.unmount();
  }
});
