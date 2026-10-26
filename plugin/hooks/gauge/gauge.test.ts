import type {
  On,
  SessionContextBreakdown,
  SessionStartInput,
  Settings,
} from 'claude-code';
import { type Engine, expect, mock, test } from 'claude-code/testing';
import { HINT_INSET } from '../lines';
import type { SelfFacts } from '../state';
import { CONTEXT_LIMIT_VAR, FIXTURE_FLAG, parseContextLimit } from './contract';
import { identityRuns } from './logic';

// The session the test's hooks answer for, beneath the plugin. A test may
// change `id` between events, as /clear does. `isAutoCompactEnabled` is what
// the breakdown reports, and `threshold` is the compaction point when it comes;
// `hasBreakdown` false is a session that answers no breakdown even when asked.
type Session = {
  flag: Settings;
  id: string;
  model: string;
  window: number;
  threshold?: number;
  isAutoCompactEnabled: boolean;
  hasBreakdown: boolean;
};

// What the plugin wrote or drew through the engine.
type Seen = {
  env: Map<string, string | undefined>;
  statuses: (string | undefined)[];
  modes: (readonly string[])[];
  // What `$.state` holds under `sidekick.self`; the publisher writes it.
  self: SelfFacts | undefined;
  selfReads: number;
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
    isAutoCompactEnabled: true,
    hasBreakdown: true,
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
    isAutoCompactEnabled: session.isAutoCompactEnabled,
    apiUsage: null,
  };
}

// Nothing sits beneath the test's hooks, so they answer every call the
// gauge makes and end every chain it continues.
function answerBeneath(on: On, session: Session): Seen {
  const seen: Seen = {
    env: new Map(),
    statuses: [],
    modes: [],
    self: undefined,
    selfReads: 0,
  };
  on('settings.read', (_$, e) => ({
    value: e.source === 'flag' ? session.flag : {},
  }));
  on('session.id', () => ({ value: session.id }));
  on('session.model', () => ({ value: session.model }));
  // As the engine does, the breakdown comes back only when the call asks.
  on('session.usage', (_$, e) => {
    const isAnswered = e.breakdown !== undefined && session.hasBreakdown;
    const context = isAnswered
      ? { window: session.window, breakdown: breakdownOf(session) }
      : { window: session.window };
    return { value: { startedAt: 0, context, rateLimits: [] } };
  });
  // Claude Code 2.1.301 answers a write with `{}`, or `{ deny }` when it holds it.
  on('env.set', (_$, e) => {
    seen.env.set(e.name, e.value);
    return { value: {} };
  });
  on('state.get', (_$, e) => {
    if (e.key === 'self') seen.selfReads += 1;
    return {
      value: { value: e.key === 'self' ? seen.self : undefined, version: 0 },
    };
  });
  on('state.set', (_$, e) => {
    if (e.key === 'self') seen.self = e.value as SelfFacts;
    return { value: { isSet: true, version: 1 } };
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

test('session start sets the window limit when auto-compaction is off', async ($, on) => {
  const session = {
    ...sessionWith(FIXTURE_FLAG),
    threshold: undefined,
    isAutoCompactEnabled: false,
  };
  const seen = answerBeneath(on, session);
  await $.session.start(START);
  expect(limitIn(seen)).toEqual({
    session: 'session-1',
    model: 'claude-opus-5-5',
    kind: 'window',
    tokens: 1000000,
  });
});

test('session start writes no limit when auto-compaction is on but no threshold arrives', async ($, on) => {
  const session = { ...sessionWith({}), threshold: undefined };
  const seen = answerBeneath(on, session);
  await $.session.start(START);
  expect(seen.env.has(CONTEXT_LIMIT_VAR)).toBe(false);
  expect(seen.statuses).toEqual([]);
});

test('session start writes no limit when the session gives no breakdown', async ($, on) => {
  const session = { ...sessionWith({}), hasBreakdown: false };
  const seen = answerBeneath(on, session);
  await $.session.start(START);
  expect(seen.env.has(CONTEXT_LIMIT_VAR)).toBe(false);
  expect(seen.statuses).toEqual([]);
});

test('session start draws no unprofiled status when the flag names no profile', async ($, on) => {
  const seen = answerBeneath(on, sessionWith({}));
  await $.session.start(START);
  expect(seen.statuses).toEqual([]);
});

test('a tool batch after the session id changes names the new id', async ($, on) => {
  const session = sessionWith(FIXTURE_FLAG);
  const seen = answerBeneath(on, session);
  await $.session.start(START);
  session.id = 'session-2';
  await $.classic.PostToolBatch({ tool_calls: [] });
  expect(limitIn(seen)).toMatchObject({ session: 'session-2' });
});

for (const [name, flag] of [
  ['profiled', FIXTURE_FLAG],
  ['unprofiled', {}],
] as const) {
  test(`the footer passes its modes through untouched on every surface when ${name}`, async ($, on) => {
    const seen = answerBeneath(on, sessionWith(flag));
    for (const surface of SURFACES) {
      seen.modes.length = 0;
      const ui = await $.ui.mount({
        plugin: 'sidekick',
        surface,
        component: 'SessionMode',
        props: { modes: ['focus'] },
      });
      expect(seen.modes).toEqual([['focus']]);
      await ui.unmount();
    }
  });
}

// The desk shares the module. The kit skips a module's whole hook for an event
// when one mod's part fails, so each mod keeps its own failures (rulings R9).
test('a desk whose /desk is refused leaves the gauge whole, and the band draws the desk, not a failure', async ($, on) => {
  const seen = answerBeneath(on, sessionWith({}));
  mock.env(on, {});
  on('command.register', () => ({ deny: 'refused by a plugin above' }));
  on('session.surfaces', () => ({ value: ['terminal'] }));
  on('ui.log', () => ({ value: undefined }));
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: `${JSON.stringify({
        version: 2,
        ok: true,
        repo: 'sidekick',
        waiting: [
          {
            name: 'odin-ae',
            repo: 'odin',
            reason: 'ask',
            child: false,
            hasPid: true,
          },
        ],
        children: [],
        finished: 0,
        others: [],
        warnings: [],
        paneWarnings: [],
        sessionIds: [],
      })}\n`,
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }));
  on('ui.render', { component: 'AbovePrompt' }, () => ({
    type: 'Text',
    children: ['drawn beneath'],
  }));
  await $.session.start(START);
  expect(limitIn(seen)).toMatchObject({ session: 'session-1', tokens: 967000 });
  expect(seen.statuses).toEqual([]);
  const ui = await $.ui.mount({
    plugin: 'sidekick',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 10,
      bodyColumns: 200,
      scroll: { offset: 0, bodyRows: 10 },
      view: {},
    },
  });
  const texts = (await ui.findAll({ type: 'Text' })).map((text) => text.text);
  expect(texts).toEqual([
    expect.stringMatching(/^● needs you {2}odin-ae/),
    'drawn beneath',
  ]);
});

const MAIN = 'Single word reply';

function hintBeneath(on: On): void {
  on('ui.log', () => ({ value: undefined }));
  on('ui.render', { component: 'PromptHint' }, () => ({
    type: 'Text',
    children: ['hint'],
  }));
}

async function hintDrawn($: Engine, columns: number | undefined) {
  const ui = await $.ui.mount({
    plugin: 'sidekick',
    surface: 'terminal',
    component: 'PromptHint',
    props: { isDraft: false, isWorking: false, hint: 'hint' },
    ...(columns === undefined ? {} : { viewport: { columns, rows: 24 } }),
  });
  const tree = await ui.drawn();
  await ui.unmount();
  return tree;
}

function workerFlag(main: string | undefined): Settings {
  return {
    env:
      main === undefined
        ? { SIDEKICK_WORKER: '/b.md' }
        : { SIDEKICK_MAIN: main },
  };
}

// The row's runs as the engine draws them, joined; what lies beneath is the first child.
function identityText(tree: unknown): string {
  const column = tree as { children: { children: { children: string[] }[] }[] };
  return (
    column.children[1]?.children.map((run) => run.children[0]).join('') ?? ''
  );
}

const FACTS: SelfFacts = {
  name: 'add-greeting',
  role: 'worker',
  main: MAIN,
  profile: 'worker',
};

test('a session draws what lies beneath, then one identity row from its facts', async ($, on) => {
  const seen = answerBeneath(on, sessionWith(workerFlag(MAIN)));
  seen.self = FACTS;
  hintBeneath(on);
  await $.session.start(START);
  const tree = await hintDrawn($, 200);
  expect(tree).toMatchObject({
    type: 'Box',
    props: { flexDirection: 'column' },
    children: [
      { type: 'Text', children: ['hint'] },
      {
        type: 'Box',
        children: [
          { props: { color: 'suggestion', weight: 'bold' } },
          { props: { color: 'inactive' } },
          { props: { color: 'text' }, children: ['worker'] },
        ],
      },
    ],
  });
  expect(identityText(tree)).toBe(
    `◐ add-greeting · worker of ${MAIN} · back: ←, select ${MAIN}, Enter · profile worker`,
  );
});

test('the row cuts from its end at the viewport less the inset', async ($, on) => {
  const seen = answerBeneath(on, sessionWith({}));
  seen.self = FACTS;
  hintBeneath(on);
  await $.session.start(START);
  const columns = 60;
  const tree = await hintDrawn($, columns);
  const expected = identityRuns(FACTS, columns - HINT_INSET)
    .map((run) => run.text)
    .join('');
  expect(identityText(tree)).toBe(expected);
  expect(identityText(tree)).toContain('back: ←');
  expect(identityText(tree)).not.toContain('profile');
});

test('before the facts are written the settled role gives the row', async ($, on) => {
  answerBeneath(on, sessionWith(workerFlag(MAIN)));
  hintBeneath(on);
  await $.session.start(START);
  expect(identityText(await hintDrawn($, 200))).toBe(
    `◐ worker of ${MAIN} · back: ←, select ${MAIN}, Enter`,
  );
});

test('a main with no facts yet draws its role alone', async ($, on) => {
  answerBeneath(on, sessionWith({}));
  hintBeneath(on);
  await $.session.start(START);
  expect(identityText(await hintDrawn($, 200))).toBe('▣ your main');
});

// The engine redraws a site whose draw called `$.state.get` when the value is set; the kit has no `$.state`, so this proves the draw reads through it and follows the value.
// The engine redraws a site whose draw called `$.state.get` when the value is set, and the kit has no `$.state` to set it with. So this proves the draw reads through `state.get`, and that a fresh draw follows the value.
test('the row reads the facts through $.state.get when it draws, and follows a change', async ($, on) => {
  const seen = answerBeneath(on, sessionWith({}));
  seen.self = { name: 'first', role: 'main' };
  hintBeneath(on);
  await $.session.start(START);
  expect(identityText(await hintDrawn($, 200))).toBe(
    '▣ first · your main · no profile',
  );
  expect(seen.selfReads).toBeGreaterThan(0);
  seen.self = { name: 'second', role: 'main' };
  expect(identityText(await hintDrawn($, 200))).toBe(
    '▣ second · your main · no profile',
  );
});

test('a session without a viewport draws only what lies beneath', async ($, on) => {
  const seen = answerBeneath(on, sessionWith(workerFlag(MAIN)));
  seen.self = FACTS;
  hintBeneath(on);
  await $.session.start(START);
  expect(await hintDrawn($, undefined)).toMatchObject({
    type: 'Text',
    children: ['hint'],
  });
});

test('no row is drawn before the role settles and the facts are written', async ($, on) => {
  answerBeneath(on, sessionWith(workerFlag(MAIN)));
  hintBeneath(on);
  expect(await hintDrawn($, 200)).toMatchObject({
    type: 'Text',
    children: ['hint'],
  });
});
