import type {
  On,
  RenderPropsOf,
  RenderSurface,
  RenderViewport,
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
import { type DeskSnapshot, RUN_TIMEOUT_MS } from './contract';
import { TICK_MS } from './desk';
import { bandLines, paneLines } from './logic';

type OkSnapshot = Extract<DeskSnapshot, { ok: true }>;

// What the next desk run answers: an exit with its streams, a refusal, which
// rejects the plugin's `$.process.run` as a timeout or a failed start does, or
// no result at all, a shape the desk does not expect.
type RunAnswer =
  | { exitCode: number; stdout: string; stderr: string }
  | { deny: string }
  | { isMissing: true };

type OpenPane = { title: string; isPlaced: boolean };

// The session beneath the plugin. A test may change `sessionId` and `answer`
// between ticks; a run waits on `hold` before it answers. A call named in
// `refused` is refused, as a plugin above the desk may refuse it.
type World = {
  env: Readonly<Record<string, string>>;
  sessionId: string;
  answer: RunAnswer;
  hold?: Promise<void>;
  panes: Map<string, OpenPane>;
  refused: Set<'settings.read' | 'session.id' | 'ui.open' | 'ui.invalidate'>;
  /** The session's flag settings, as `--settings` gave them. */
  flag: Settings;
};

const REFUSAL = 'refused by a plugin above';

// What the plugin asked of the engine.
type Seen = {
  runs: (readonly string[])[];
  timeouts: (number | undefined)[];
  commands: string[];
  invalidations: string[];
  opened: { id: string; title?: string }[];
  closed: string[];
  /** Lines sent to the debug log. */
  debug: string[];
};

const PLUGIN = 'sidekick';
const SURFACES = ['terminal', 'desktop'] as const;
const BENEATH = 'drawn beneath';
const JOB_DIR = '/Users/someone/.claude/jobs/aaaa0001';

const START: SessionStartInput = {
  cwd: '/',
  surface: 'terminal',
  isInteractive: true,
};

const FULLSCREEN: RenderViewport = {
  columns: 200,
  rows: 50,
  isFullscreen: true,
};
const MAIN_SCREEN: RenderViewport = { ...FULLSCREEN, isFullscreen: false };

function snapshot(over: Partial<OkSnapshot> = {}): OkSnapshot {
  return {
    version: 1,
    ok: true,
    repo: 'sidekick',
    waiting: [],
    children: [],
    finished: 0,
    others: [],
    warnings: [],
    ...over,
  };
}

const QUIET = snapshot();
const WAITING = snapshot({
  waiting: [
    {
      name: 'odin-ae',
      repo: 'odin',
      reason: 'permission prompt',
      child: false,
    },
  ],
});
const WORKERS = snapshot({
  waiting: WAITING.waiting,
  children: [
    {
      name: 'p8-board',
      state: 'working',
      tokens: 412000,
      plan: 'The board',
      lastCommit: 'feat: a thing',
      unintegrated: 3,
      uncommitted: true,
    },
  ],
  finished: 2,
  others: [
    {
      name: 'odin-ae',
      repo: 'odin',
      kind: 'interactive',
      state: 'waiting',
      reason: 'permission prompt',
    },
  ],
});

function printed(shown: DeskSnapshot): RunAnswer {
  return { exitCode: 0, stdout: `${JSON.stringify(shown)}\n`, stderr: '' };
}

function worldWith(answer: RunAnswer, env: Record<string, string> = {}): World {
  return {
    env,
    sessionId: 'session-1',
    answer,
    panes: new Map(),
    refused: new Set(),
    flag: {},
  };
}

function bandProps(
  bodyColumns: number,
  hasSurvey = false,
): RenderPropsOf['AbovePrompt'] {
  return {
    hasSurvey,
    isWorking: false,
    maxRows: 10,
    bodyColumns,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  };
}

function paneProps(bodyColumns: number): RenderPropsOf['Pane'] {
  return {
    title: 'Desk',
    isFocused: false,
    bodyColumns,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  };
}

// Nothing sits beneath the test's hooks but the kit's own bottom, so they
// answer every call the desk makes and end every chain it continues.
function answerBeneath(on: On, world: World): { seen: Seen; clock: MockClock } {
  const seen: Seen = {
    runs: [],
    timeouts: [],
    commands: [],
    invalidations: [],
    opened: [],
    closed: [],
    debug: [],
  };
  mock.env(on, world.env);
  on('ui.log', (_$, e) => {
    if (e.to === 'debug') seen.debug.push(e.text);
    return { value: undefined };
  });
  // The gauge shares the module, so its reads are answered too: no profile,
  // no breakdown.
  on('settings.read', () =>
    world.refused.has('settings.read')
      ? { deny: REFUSAL }
      : { value: world.flag },
  );
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 1000000 }, rateLimits: [] },
  }));
  on('ui.status', () => ({ value: undefined }));
  on('session.id', () =>
    world.refused.has('session.id')
      ? { deny: REFUSAL }
      : { value: world.sessionId },
  );
  on('process.run', async (_$, e) => {
    seen.runs.push(e.argv);
    seen.timeouts.push(e.init?.timeoutMs);
    await world.hold;
    const { answer } = world;
    if ('deny' in answer) return { deny: answer.deny };
    // A deliberately invalid answer, past the compiler.
    if ('isMissing' in answer) return { value: JSON.parse('null') };
    return {
      value: { ...answer, isStdoutTruncated: false, isStderrTruncated: false },
    };
  });
  const clock = mock.clock(on);
  on('command.register', (_$, e) => {
    seen.commands.push(e.name);
    return { value: { command: e.name } };
  });
  on('ui.invalidate', (_$, e, next) => {
    seen.invalidations.push(e.event);
    return world.refused.has('ui.invalidate') ? { deny: REFUSAL } : next(e);
  });
  on('ui.open', (_$, e) => {
    if (world.refused.has('ui.open')) return { deny: REFUSAL };
    seen.opened.push({ id: e.id, title: e.title });
    world.panes.set(e.id, { title: e.title ?? e.id, isPlaced: true });
    return { value: { isPlaced: true } };
  });
  on('ui.close', (_$, e) => {
    seen.closed.push(e.id);
    world.panes.delete(e.id);
    return { value: undefined };
  });
  on('ui.panes', () => ({
    value: [...world.panes].map(([id, pane]) => ({
      id,
      title: pane.title,
      isShown: pane.isPlaced,
      isFocused: false,
      isPlaced: pane.isPlaced,
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

// The session starts, and its first run answers.
async function started($: Engine, clock: MockClock, start = START) {
  await $.session.start(start);
  await clock.settle();
}

type Drawn = { text: string; color: unknown };

async function drawnBand(
  $: Engine,
  surface: RenderSurface,
  props: RenderPropsOf['AbovePrompt'],
  viewport: RenderViewport = FULLSCREEN,
): Promise<Drawn[]> {
  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface,
    component: 'AbovePrompt',
    props,
    viewport,
  });
  const texts = await ui.findAll({ type: 'Text' });
  await ui.unmount();
  return texts.map((text) => ({ text: text.text, color: text.props.color }));
}

async function runDeskCommand($: Engine) {
  return $.command.run({
    command: 'desk',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 200 },
  });
}

test('a background session runs nothing, ticks nothing, and opens no pane', async ($, on) => {
  const world = worldWith(printed(WORKERS), { CLAUDE_JOB_DIR: JOB_DIR });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await clock.advance(TICK_MS * 3);
  expect(seen.runs).toEqual([]);
  expect(seen.commands).toEqual([]);
  expect(seen.opened).toEqual([]);
});

// `isInteractive` reads true in background sessions too, so it guards only
// against a `-p` run, where nobody sees a band.
test('a headless run polls nothing either', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith(printed(WORKERS)));
  await started($, clock, { ...START, surface: null, isInteractive: false });
  await clock.advance(TICK_MS);
  expect(seen.runs).toEqual([]);
  expect(seen.commands).toEqual([]);
});

test('an interactive start registers /desk, runs the desk for this session, and ticks every 10 s', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith(printed(QUIET)));
  await started($, clock);
  expect(seen.commands).toEqual(['desk']);
  expect(seen.runs).toHaveLength(1);
  const [argv] = seen.runs;
  expect(argv?.slice(-4)).toEqual(['desk', '--json', '--self', 'session-1']);
  expect(argv?.[0]).toEndWith('/bin/sidekick');
  expect(seen.timeouts).toEqual([RUN_TIMEOUT_MS]);
  await clock.advance(TICK_MS - 1);
  expect(seen.runs).toHaveLength(1);
  await clock.advance(1);
  expect(seen.runs).toHaveLength(2);
});

test('each tick names the session id it reads then, as after /clear', async ($, on) => {
  const world = worldWith(printed(QUIET));
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  world.sessionId = 'session-2';
  await clock.advance(TICK_MS);
  expect(seen.runs.map((argv) => argv.at(-1))).toEqual([
    'session-1',
    'session-2',
  ]);
});

test('a tick with the same snapshot does not redraw, and a changed one redraws once', async ($, on) => {
  const world = worldWith(printed(QUIET));
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  expect(seen.invalidations).toEqual(['ui.render']);
  await clock.advance(TICK_MS);
  expect(seen.invalidations).toEqual(['ui.render']);
  world.answer = printed(WAITING);
  await clock.advance(TICK_MS);
  expect(seen.invalidations).toEqual(['ui.render', 'ui.render']);
});

test('a tick while a run is still in flight starts no second run', async ($, on) => {
  const world = worldWith(printed(QUIET));
  const { seen, clock } = answerBeneath(on, world);
  let release = () => {};
  world.hold = new Promise((resolve) => {
    release = resolve;
  });
  await started($, clock);
  await clock.advance(TICK_MS);
  expect(seen.runs).toHaveLength(1);
  release();
  await clock.settle();
  await clock.advance(TICK_MS);
  expect(seen.runs).toHaveLength(2);
});

// A rejected run's line opens with this, whatever the rejection's cause.
const NO_RESULT = `⚠ desk: the desk command did not start, or did not finish within ${RUN_TIMEOUT_MS / 1_000} s: `;

const FAILURES: { name: string; answer: RunAnswer; line: string | RegExp }[] = [
  {
    name: 'a non-zero exit draws its code and the first line of stderr',
    answer: {
      exitCode: 1,
      stdout: '',
      stderr: '\nsidekick desk: unknown option --jsn\nusage: …\n',
    },
    line: '⚠ desk: the desk command exited 1: sidekick desk: unknown option --jsn',
  },
  {
    name: 'a non-zero exit with nothing on stderr draws its code alone',
    answer: { exitCode: 2, stdout: '', stderr: '' },
    line: '⚠ desk: the desk command exited 2',
  },
  {
    name: 'a run that outlasts its timeout draws the rejection, with the reason',
    answer: { deny: `killed after ${RUN_TIMEOUT_MS} ms` },
    line: new RegExp(`^${NO_RESULT}.*killed after ${RUN_TIMEOUT_MS} ms`),
  },
  {
    name: 'a run that cannot start draws the same line, with the reason',
    answer: { deny: 'spawn ENOENT' },
    line: new RegExp(`^${NO_RESULT}.*spawn ENOENT`),
  },
  {
    name: 'output that does not parse draws the parse failure',
    answer: { exitCode: 0, stdout: 'Segmentation fault', stderr: '' },
    line: '⚠ desk: the desk command printed no JSON',
  },
];

for (const failure of FAILURES) {
  test(failure.name, async ($, on) => {
    const { clock } = answerBeneath(on, worldWith(failure.answer));
    await started($, clock);
    for (const surface of SURFACES) {
      const drawn = await drawnBand($, surface, bandProps(200));
      expect(drawn).toHaveLength(2);
      expect(drawn[0]?.text).toMatch(failure.line);
      expect(drawn[1]?.text).toBe(BENEATH);
    }
  });
}

test('the band draws its lines in their tones, above what lies beneath', async ($, on) => {
  const { clock } = answerBeneath(on, worldWith(printed(WORKERS)));
  await started($, clock);
  for (const surface of SURFACES) {
    expect(await drawnBand($, surface, bandProps(200))).toEqual([
      {
        text: '● needs you  odin-ae · permission prompt',
        color: 'warning',
      },
      {
        text: '◆ workers    p8-board working   2 finished',
        color: 'suggestion',
      },
      { text: BENEATH, color: undefined },
    ]);
  }
});

test('the band fits its lines to its own body width, not the terminal', async ($, on) => {
  const { clock } = answerBeneath(on, worldWith(printed(WORKERS)));
  await started($, clock);
  const narrow = 30;
  const expected = bandLines(WORKERS, narrow).map((line) => line.text);
  for (const surface of SURFACES) {
    const drawn = await drawnBand($, surface, bandProps(narrow));
    expect(drawn.map((line) => line.text)).toEqual([...expected, BENEATH]);
  }
});

test('the band yields to a survey', async ($, on) => {
  const { clock } = answerBeneath(on, worldWith(printed(WORKERS)));
  await started($, clock);
  for (const surface of SURFACES) {
    const drawn = await drawnBand($, surface, bandProps(200, true));
    expect(drawn.map((line) => line.text)).toEqual([BENEATH]);
  }
});

test('with nothing to show the band is what lies beneath alone', async ($, on) => {
  const { clock } = answerBeneath(on, worldWith(printed(QUIET)));
  await started($, clock);
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'AbovePrompt',
      props: bandProps(200),
      viewport: FULLSCREEN,
    });
    expect(await ui.drawn()).toMatchObject({
      type: 'Text',
      children: [BENEATH],
    });
    await ui.unmount();
  }
});

test('the desk pane draws its lines fitted to the pane body', async ($, on) => {
  const { clock } = answerBeneath(on, worldWith(printed(WORKERS)));
  await started($, clock);
  const columns = 24;
  const expected = paneLines(WORKERS, columns).map((line) => line.text);
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'Pane',
      requestId: 'desk',
      props: paneProps(columns),
      viewport: FULLSCREEN,
    });
    const texts = await ui.findAll({ type: 'Text' });
    expect(texts.map((text) => text.text)).toEqual(expected);
    await ui.unmount();
  }
});

test('a pane of another id is left to what lies beneath', async ($, on) => {
  const { clock } = answerBeneath(on, worldWith(printed(WORKERS)));
  await started($, clock);
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'Pane',
      requestId: 'another',
      props: paneProps(60),
      viewport: FULLSCREEN,
    });
    const texts = await ui.findAll({ type: 'Text' });
    expect(texts.map((text) => text.text)).toEqual([BENEATH]);
    await ui.unmount();
  }
});

test('children appearing after a fullscreen render open the pane once', async ($, on) => {
  const world = worldWith(printed(QUIET));
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await drawnBand($, 'terminal', bandProps(120), FULLSCREEN);
  world.answer = printed(WORKERS);
  await clock.advance(TICK_MS);
  expect(seen.opened).toEqual([{ id: 'desk', title: 'Desk' }]);
  world.answer = printed({ ...WORKERS, finished: 3 });
  await clock.advance(TICK_MS);
  expect(seen.opened).toHaveLength(1);
});

// A failed run leaves the children unknown, not gone, so their return after
// it is no first appearance, and a pane the operator closed stays closed.
test('children back after a failed run leave a closed pane closed', async ($, on) => {
  const world = worldWith(printed(QUIET));
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await drawnBand($, 'terminal', bandProps(120), FULLSCREEN);
  world.answer = printed(WORKERS);
  await clock.advance(TICK_MS);
  await runDeskCommand($);
  expect(seen.closed).toEqual(['desk']);
  world.answer = { exitCode: 1, stdout: '', stderr: 'listing failed' };
  await clock.advance(TICK_MS);
  const drawn = await drawnBand($, 'terminal', bandProps(120), FULLSCREEN);
  expect(drawn[0]?.text).toBe(
    '⚠ desk: the desk command exited 1: listing failed',
  );
  world.answer = printed(WORKERS);
  await clock.advance(TICK_MS);
  expect(seen.opened).toEqual([{ id: 'desk', title: 'Desk' }]);
});

test('a profile that hides the desk gets no /desk, no clock, and no run', async ($, on) => {
  const world = worldWith(printed(WORKERS));
  world.flag = { sidekick: { hide: { mods: ['desk'] } } };
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await clock.advance(TICK_MS * 3);
  expect(seen.commands).toEqual([]);
  expect(seen.runs).toEqual([]);
  expect(seen.invalidations).toEqual([]);
});

test('a profile that hides only the board leaves the desk running', async ($, on) => {
  const world = worldWith(printed(QUIET));
  world.flag = { sidekick: { hide: { mods: ['board'] } } };
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  expect(seen.commands).toEqual(['desk']);
  expect(seen.runs).toHaveLength(1);
});

// A tick runs outside any hook, so a rejection it left unhandled would fail
// the file here, and in a session would surface nowhere the operator looks.
test('a refused unasked open leaves the desk polling and the band drawn', async ($, on) => {
  const world = worldWith(printed(QUIET));
  world.refused.add('ui.open');
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await drawnBand($, 'terminal', bandProps(200), FULLSCREEN);
  world.answer = printed(WORKERS);
  await clock.advance(TICK_MS);
  await clock.advance(TICK_MS);
  expect(seen.runs).toHaveLength(3);
  const drawn = await drawnBand($, 'terminal', bandProps(200));
  expect(drawn.map((line) => line.text)).toContain(
    '◆ workers    p8-board working   2 finished',
  );
});

// The kit skips a module's whole hook for an event when one mod's part
// fails, so each mod keeps its own failures (rulings R9).
test('a gauge that cannot read its settings leaves the desk polling', async ($, on) => {
  const world = worldWith(printed(QUIET));
  world.refused.add('settings.read');
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  expect(seen.commands).toEqual(['desk']);
  expect(seen.runs).toHaveLength(1);
  await clock.advance(TICK_MS);
  expect(seen.runs).toHaveLength(2);
  expect(seen.debug).toContainEqual(
    expect.stringMatching(
      /^sidekick gauge: session\.start failed: .*refused by a plugin above$/,
    ),
  );
  // The desk's own part check fails open and says so.
  expect(seen.debug).toContainEqual(
    expect.stringMatching(
      /^sidekick desk: reading the profile's hidden parts failed: .*refused by a plugin above$/,
    ),
  );
});

// The engine drops a refused `$.ui.invalidate` and reports it; the call does
// not throw into the tick.
test('a refused redraw is dropped, and the desk polls and draws on', async ($, on) => {
  const world = worldWith(printed(WORKERS));
  world.refused.add('ui.invalidate');
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await clock.advance(TICK_MS);
  expect(seen.runs).toHaveLength(2);
  const drawn = await drawnBand($, 'terminal', bandProps(200));
  expect(drawn[0]?.text).toBe('● needs you  odin-ae · permission prompt');
});

test('a throw inside the tick stays there, and the band names it', async ($, on) => {
  const world = worldWith({ isMissing: true });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await clock.advance(TICK_MS);
  expect(seen.runs).toHaveLength(2);
  const drawn = await drawnBand($, 'terminal', bandProps(200));
  expect(drawn[0]?.text).toMatch(/^⚠ desk: could not refresh: /);
  // One line per failed run: the start's and the tick's.
  const refreshFailed = expect.stringMatching(
    /^sidekick desk: could not refresh: /,
  );
  expect(seen.debug).toEqual([refreshFailed, refreshFailed]);
});

test('a session id the desk cannot read draws that, and runs nothing', async ($, on) => {
  const world = worldWith(printed(WORKERS));
  world.refused.add('session.id');
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  expect(seen.runs).toEqual([]);
  const drawn = await drawnBand($, 'terminal', bandProps(200));
  expect(drawn[0]?.text).toMatch(
    /^⚠ desk: the desk could not read the session id: .*refused by a plugin above/,
  );
});

test('children appearing after a main-screen render leave the pane closed', async ($, on) => {
  const world = worldWith(printed(QUIET));
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await drawnBand($, 'terminal', bandProps(120), MAIN_SCREEN);
  world.answer = printed(WORKERS);
  await clock.advance(TICK_MS);
  expect(seen.opened).toEqual([]);
});

test('/desk opens the pane when it is closed and closes it when it is open', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith(printed(QUIET)));
  await started($, clock);
  expect(await runDeskCommand($)).toEqual({});
  expect(seen.opened).toEqual([{ id: 'desk', title: 'Desk' }]);
  expect(seen.closed).toEqual([]);
  expect(await runDeskCommand($)).toEqual({});
  expect(seen.closed).toEqual(['desk']);
  expect(seen.opened).toHaveLength(1);
});

// An unasked open below 144 columns leaves the pane open but undrawn; the
// person who asks for the desk then wants it shown, not closed.
test('/desk shows a pane that waits undrawn instead of closing it', async ($, on) => {
  const world = worldWith(printed(QUIET));
  world.panes.set('desk', { title: 'Desk', isPlaced: false });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await runDeskCommand($);
  expect(seen.opened).toEqual([{ id: 'desk', title: 'Desk' }]);
  expect(seen.closed).toEqual([]);
});
