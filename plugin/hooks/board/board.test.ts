import type {
  On,
  RenderPropsOf,
  RenderSurface,
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
import type { DeskSnapshot } from '../desk/contract';
import { BRIEF_HEADER, PICKUP_TIMEOUT_MS } from './contract';
import { clockText } from './logic';

// What the next pickup answers: an exit with its streams, a refusal, which
// rejects the plugin's `$.process.run` as a timeout or a failed start does, or
// no result at all, a shape the board does not expect.
type RunAnswer =
  | { exitCode: number; stdout: string; stderr: string }
  | { deny: string }
  | { isMissing: true };

// The session beneath the plugin. `contexts` is what the settings hooks folded
// into the classic start's result. A pickup waits on `hold` before it answers.
// A call named in `refused` is refused, as a plugin above the board may refuse it.
type World = {
  env: Readonly<Record<string, string>>;
  contexts?: string[];
  answer: RunAnswer;
  /** What the desk's own run prints: the desk shares the module and polls too. */
  desk: DeskSnapshot;
  hold?: Promise<void>;
  refused: Set<'settings.read' | 'command.register'>;
  /** The session's flag settings, as `--settings` gave them. */
  flag: Settings;
};

// What the plugin asked of the engine.
type Seen = {
  pickups: (readonly string[])[];
  timeouts: (number | undefined)[];
  deskRuns: number;
  commands: string[];
  /** Lines sent to the debug log. */
  debug: string[];
};

type Source = Parameters<Engine['classic']['SessionStart']>[0]['source'];

const PLUGIN = 'sidekick';
const SURFACES = ['terminal', 'desktop'] as const;
const BENEATH = 'drawn beneath';
const JOB_DIR = '/Users/someone/.claude/jobs/aaaa0001';
const REFUSAL = 'refused by a plugin above';
const NOW = new Date(2026, 9, 16, 9, 30).getTime();
const MINUTE_MS = 60_000;

const START: SessionStartInput = {
  cwd: '/',
  surface: 'terminal',
  isInteractive: true,
};
const HEADLESS: SessionStartInput = {
  ...START,
  surface: null,
  isInteractive: false,
};

const OTHER = 'superpowers: you have superpowers.';
const BRIEF = [
  'Milestone 9 — R9 control centre',
  'In progress: #211 the board band…',
  'Next: #209 the scope mod',
];
const ENTRY = `${BRIEF_HEADER}\n\n${BRIEF.join('\n')}`;
const PICKED = ['Milestone 9 — R9 control centre', 'In progress: #209'];
const PRINTED: RunAnswer = {
  exitCode: 0,
  stdout: `${PICKED.join('\n')}\n`,
  stderr: '',
};
const BAD_GATEWAY: RunAnswer = {
  exitCode: 1,
  stdout: '',
  stderr: '\ngh: HTTP 502\nmore detail\n',
};

/** What the hooks beneath the board answer for a tool's classic `PostToolUse`. */
const AFTER_TOOL = { additionalContext: ['from beneath'] };

type OkDesk = Extract<DeskSnapshot, { ok: true }>;
const QUIET_DESK: OkDesk = {
  version: 1,
  ok: true,
  repo: 'sidekick',
  waiting: [],
  children: [],
  finished: 0,
  others: [],
  warnings: [],
};
const WAITING_DESK: OkDesk = {
  ...QUIET_DESK,
  waiting: [
    {
      name: 'odin-ae',
      repo: 'odin',
      reason: 'permission prompt',
      child: false,
    },
  ],
};

function worldWith(over: Partial<World> = {}): World {
  return {
    env: {},
    answer: PRINTED,
    desk: QUIET_DESK,
    refused: new Set(),
    flag: {},
    ...over,
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

// Nothing sits beneath the test's hooks but the kit's own bottom, so they
// answer every call the board makes and end every chain it continues. The
// gauge and the desk share the module, so their calls are answered too.
function answerBeneath(on: On, world: World): { seen: Seen; clock: MockClock } {
  const seen: Seen = {
    pickups: [],
    timeouts: [],
    deskRuns: 0,
    commands: [],
    debug: [],
  };
  mock.env(on, world.env);
  on('ui.log', (_$, e) => {
    if (e.to === 'debug') seen.debug.push(e.text);
    return { value: undefined };
  });
  on('settings.read', () =>
    world.refused.has('settings.read')
      ? { deny: REFUSAL }
      : { value: world.flag },
  );
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 1000000 }, rateLimits: [] },
  }));
  on('ui.status', () => ({ value: undefined }));
  on('session.id', () => ({ value: 'session-1' }));
  on('process.run', async (_$, e) => {
    if (e.argv[1] !== 'pm') {
      seen.deskRuns += 1;
      const stdout = `${JSON.stringify(world.desk)}\n`;
      return {
        value: {
          exitCode: 0,
          stdout,
          stderr: '',
          isStdoutTruncated: false,
          isStderrTruncated: false,
        },
      };
    }
    seen.pickups.push(e.argv);
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
  const clock = mock.clock(on, { now: NOW });
  on('command.register', (_$, e) => {
    if (world.refused.has('command.register')) return { deny: REFUSAL };
    seen.commands.push(e.name);
    return { value: { command: e.name } };
  });
  on('session.start', (_$, e) => ({ cwd: e.cwd }));
  on('classic.SessionStart', () =>
    world.contexts === undefined ? {} : { additionalContext: world.contexts },
  );
  on('classic.PostToolUse', () => AFTER_TOOL);
  on('ui.render', { component: 'AbovePrompt' }, () => ({
    type: 'Text',
    children: [BENEATH],
  }));
  return { seen, clock };
}

// The interactive start, and the runs it began.
async function started($: Engine, clock: MockClock, start = START) {
  await $.session.start(start);
  await clock.settle();
}

// The classic start, as the settings hooks answered it, and the runs it began.
async function captured(
  $: Engine,
  clock: MockClock,
  source: Source = 'startup',
) {
  const result = await $.classic.SessionStart({ source });
  await clock.settle();
  return result;
}

async function boardCommand($: Engine) {
  return $.command.run({
    command: 'board',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 200 },
  });
}

async function afterBash($: Engine, command: string, tool = 'Bash') {
  return $.classic.PostToolUse({
    tool_name: tool,
    tool_input: { command },
    tool_response: {},
    tool_use_id: 'toolu_1',
  });
}

type Drawn = { text: string; color: unknown };

async function drawnBand(
  $: Engine,
  surface: RenderSurface,
  props: RenderPropsOf['AbovePrompt'],
): Promise<Drawn[]> {
  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface,
    component: 'AbovePrompt',
    props,
  });
  const texts = await ui.findAll({ type: 'Text' });
  await ui.unmount();
  return texts.map((text) => ({ text: text.text, color: text.props.color }));
}

// The band's lines for a brief: the first stamped in the heading colour, the
// rest plain.
function stampedLines(lines: string[], stamp: string): Drawn[] {
  const [first = '', ...rest] = lines;
  return [
    { text: `${first} · ${stamp}`, color: 'claude' },
    ...rest.map((text) => ({ text, color: 'text' })),
  ];
}

const UNDER: Drawn = { text: BENEATH, color: undefined };

test('the band draws sidekick’s brief from among the start’s entries, stamped, and runs no pickup', async ($, on) => {
  const world = worldWith({ contexts: [OTHER, ENTRY] });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  expect(await captured($, clock)).toEqual({
    additionalContext: [OTHER, ENTRY],
  });
  const stamp = `as of ${clockText(NOW)}`;
  for (const surface of SURFACES) {
    expect(await drawnBand($, surface, bandProps(200))).toEqual([
      { text: `Milestone 9 — R9 control centre · ${stamp}`, color: 'claude' },
      { text: 'In progress: #211 the board band…', color: 'text' },
      { text: 'Next: #209 the scope mod', color: 'text' },
      UNDER,
    ]);
  }
  expect(seen.pickups).toEqual([]);
});

test('a live start with no sidekick entry runs one pickup and draws its lines', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith({ contexts: [OTHER] }));
  await started($, clock);
  await captured($, clock);
  expect(seen.pickups).toHaveLength(1);
  const [argv] = seen.pickups;
  expect(argv?.slice(1)).toEqual(['pm', 'pickup', '--brief']);
  expect(argv?.[0]).toEndWith('/bin/sidekick');
  expect(seen.timeouts).toEqual([PICKUP_TIMEOUT_MS]);
  const drawn = await drawnBand($, 'terminal', bandProps(200));
  expect(drawn).toEqual([
    ...stampedLines(PICKED, `as of ${clockText(NOW)}`),
    UNDER,
  ]);
});

// Under `-p` the interactive start never fires, and nobody sees a band.
test('a start whose interactive hook never ran, as under -p, runs no pickup', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith({ contexts: [OTHER] }));
  await started($, clock, HEADLESS);
  await captured($, clock);
  await afterBash($, 'gh issue close 5');
  await clock.settle();
  expect(seen.pickups).toEqual([]);
  expect(seen.commands).not.toContain('board');
});

const ORDERS: {
  name: string;
  start: ($: Engine, clock: MockClock) => Promise<void>;
}[] = [
  {
    name: 'the interactive start first',
    start: async ($, clock) => {
      await started($, clock);
      await captured($, clock);
    },
  },
  {
    name: 'the classic start first',
    start: async ($, clock) => {
      await captured($, clock);
      await started($, clock);
    },
  },
];

for (const order of ORDERS) {
  test(`with ${order.name}, a start with no sidekick entry runs one pickup`, async ($, on) => {
    const { seen, clock } = answerBeneath(on, worldWith({ contexts: [OTHER] }));
    await order.start($, clock);
    expect(seen.pickups).toHaveLength(1);
  });
}

test('a compact start runs nothing and keeps the lines it had', async ($, on) => {
  const world = worldWith({ contexts: [OTHER, ENTRY] });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await captured($, clock);
  world.contexts = [OTHER];
  await captured($, clock, 'compact');
  expect(seen.pickups).toEqual([]);
  const drawn = await drawnBand($, 'terminal', bandProps(200));
  expect(drawn).toEqual([
    ...stampedLines(BRIEF, `as of ${clockText(NOW)}`),
    UNDER,
  ]);
});

// The start hook fires again on /clear, with the board as it is then.
test('a live /clear with a new sidekick entry draws the new brief, stamped then', async ($, on) => {
  const world = worldWith({ contexts: [OTHER, ENTRY] });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await captured($, clock);
  await clock.advance(MINUTE_MS);
  const cleared = ['Milestone 10 — the loop', 'In progress: none'];
  world.contexts = [OTHER, `${BRIEF_HEADER}\n\n${cleared.join('\n')}`];
  await captured($, clock, 'clear');
  expect(seen.pickups).toEqual([]);
  const drawn = await drawnBand($, 'terminal', bandProps(200));
  expect(drawn).toEqual([
    ...stampedLines(cleared, `as of ${clockText(NOW + MINUTE_MS)}`),
    UNDER,
  ]);
});

test('a live /clear with no sidekick entry runs one pickup and draws its lines', async ($, on) => {
  const world = worldWith({ contexts: [OTHER, ENTRY] });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await captured($, clock);
  world.contexts = [OTHER];
  await captured($, clock, 'clear');
  expect(seen.pickups).toHaveLength(1);
  const drawn = await drawnBand($, 'terminal', bandProps(200));
  expect(drawn).toEqual([
    ...stampedLines(PICKED, `as of ${clockText(NOW)}`),
    UNDER,
  ]);
});

test('/board runs one pickup and draws what it printed', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith({ contexts: [ENTRY] }));
  await started($, clock);
  await captured($, clock);
  expect(seen.commands).toContain('board');
  expect(await boardCommand($)).toEqual({});
  await clock.settle();
  expect(seen.pickups).toHaveLength(1);
  const drawn = await drawnBand($, 'terminal', bandProps(200));
  expect(drawn).toEqual([
    ...stampedLines(PICKED, `as of ${clockText(NOW)}`),
    UNDER,
  ]);
});

test('three requests during one run give exactly one more run', async ($, on) => {
  const world = worldWith({ contexts: [ENTRY] });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await captured($, clock);
  let release = () => {};
  world.hold = new Promise((resolve) => {
    release = resolve;
  });
  await boardCommand($);
  await boardCommand($);
  await afterBash($, 'gh issue close 5');
  await boardCommand($);
  await clock.settle();
  expect(seen.pickups).toHaveLength(1);
  release();
  await clock.settle();
  expect(seen.pickups).toHaveLength(2);
  await boardCommand($);
  await clock.settle();
  expect(seen.pickups).toHaveLength(3);
});

test('a Bash call that closes an issue runs a pickup, and the hook returns what lay beneath', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith({ contexts: [ENTRY] }));
  await started($, clock);
  await captured($, clock);
  expect(await afterBash($, 'cd /x && gh issue close 5')).toEqual(AFTER_TOOL);
  await clock.settle();
  expect(seen.pickups).toHaveLength(1);
});

// The tool's result reaches the model before the pickup ends, so a slow pickup
// never holds the turn.
test('a Bash board write returns what lay beneath while its pickup still runs', async ($, on) => {
  const world = worldWith({ contexts: [ENTRY] });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await captured($, clock);
  let release = () => {};
  world.hold = new Promise((resolve) => {
    release = resolve;
  });
  let returned: unknown;
  const call = afterBash($, 'gh issue close 5').then((result) => {
    returned = result;
  });
  await clock.settle();
  expect(seen.pickups).toHaveLength(1);
  expect(returned).toEqual(AFTER_TOOL);
  release();
  await call;
  await clock.settle();
});

test('a Bash call that only reads the board, or another tool, runs nothing', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith({ contexts: [ENTRY] }));
  await started($, clock);
  await captured($, clock);
  expect(await afterBash($, 'gh issue list')).toEqual(AFTER_TOOL);
  expect(await afterBash($, 'gh issue close 5', 'Read')).toEqual(AFTER_TOOL);
  const noCommand = await $.classic.PostToolUse({
    tool_name: 'Bash',
    tool_input: { command: 5 },
    tool_response: {},
    tool_use_id: 'toolu_2',
  });
  expect(noCommand).toEqual(AFTER_TOOL);
  await clock.settle();
  expect(seen.pickups).toEqual([]);
});

test('a failed run after a good one keeps the lines, stamped refresh failed', async ($, on) => {
  const world = worldWith({ contexts: [ENTRY] });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await captured($, clock);
  await clock.advance(MINUTE_MS);
  world.answer = BAD_GATEWAY;
  await boardCommand($);
  await clock.settle();
  const stamp = `refresh failed ${clockText(NOW + MINUTE_MS)}`;
  for (const surface of SURFACES) {
    const drawn = await drawnBand($, surface, bandProps(200));
    expect(drawn).toEqual([...stampedLines(BRIEF, stamp), UNDER]);
  }
  expect(seen.debug).toContain(
    'sidekick board: the pickup exited 1: gh: HTTP 502',
  );
});

const FAILURES: { name: string; answer: RunAnswer; line: string | RegExp }[] = [
  {
    name: 'a non-zero exit draws its code and the first line of stderr',
    answer: BAD_GATEWAY,
    line: '⚠ board: the pickup exited 1: gh: HTTP 502',
  },
  {
    name: 'a run that cannot start, or outlasts its timeout, draws the rejection',
    answer: { deny: 'spawn ENOENT' },
    line: new RegExp(
      `^⚠ board: the pickup did not start, or did not finish within ${PICKUP_TIMEOUT_MS / 1_000} s: .*spawn ENOENT`,
    ),
  },
];

for (const failure of FAILURES) {
  test(`with no good lines yet, ${failure.name}, in the error colour`, async ($, on) => {
    const world = worldWith({ contexts: [OTHER], answer: failure.answer });
    const { clock } = answerBeneath(on, world);
    await started($, clock);
    await captured($, clock);
    const drawn = await drawnBand($, 'terminal', bandProps(200));
    expect(drawn).toHaveLength(2);
    expect(drawn[0]?.text).toMatch(failure.line);
    expect(drawn[0]?.color).toBe('error');
    expect(drawn[1]).toEqual(UNDER);
  });
}

// The run is outside any hook, so a throw it left unhandled would fail the
// file here; the next request must still run.
test('a run that throws is logged, and the next request still runs', async ($, on) => {
  const world = worldWith({ contexts: [ENTRY], answer: { isMissing: true } });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await captured($, clock);
  await boardCommand($);
  await clock.settle();
  expect(seen.debug).toContainEqual(
    expect.stringMatching(/^sidekick board: a refresh failed: /),
  );
  world.answer = PRINTED;
  await boardCommand($);
  await clock.settle();
  expect(seen.pickups).toHaveLength(2);
  const drawn = await drawnBand($, 'terminal', bandProps(200));
  expect(drawn[0]?.text).toStartWith(PICKED[0] ?? '');
});

const UNSEEN: { name: string; over: Partial<World> }[] = [
  { name: 'a background session', over: { env: { CLAUDE_JOB_DIR: JOB_DIR } } },
  {
    name: 'a profile that hides the board',
    over: { flag: { sidekick: { hide: { mods: ['board'] } } } },
  },
];

for (const unseen of UNSEEN) {
  test(`${unseen.name} gets no /board, runs no pickup, and draws no band`, async ($, on) => {
    const world = worldWith({ ...unseen.over, contexts: [OTHER] });
    const { seen, clock } = answerBeneath(on, world);
    await started($, clock);
    await captured($, clock);
    await afterBash($, 'gh issue close 5');
    await boardCommand($);
    await clock.settle();
    expect(seen.pickups).toEqual([]);
    expect(seen.commands).not.toContain('board');
    world.contexts = [ENTRY];
    await captured($, clock, 'clear');
    const drawn = await drawnBand($, 'terminal', bandProps(200));
    expect(drawn).toEqual([UNDER]);
  });
}

test('a refused settings read leaves the board on, and the debug log names it', async ($, on) => {
  const world = worldWith({ contexts: [OTHER] });
  world.refused.add('settings.read');
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await captured($, clock);
  expect(seen.commands).toContain('board');
  expect(seen.pickups).toHaveLength(1);
  expect(seen.debug).toContainEqual(
    expect.stringMatching(
      /^sidekick board: reading the profile's hidden parts failed: .*refused by a plugin above$/,
    ),
  );
});

// The classic start goes first, so the only fallback is the interactive
// start's own, which a refused `/board` must not stop.
test('a refused /board leaves the band running, and the debug log names it', async ($, on) => {
  const world = worldWith({ contexts: [OTHER] });
  world.refused.add('command.register');
  const { seen, clock } = answerBeneath(on, world);
  await captured($, clock);
  await started($, clock);
  expect(seen.pickups).toHaveLength(1);
  const drawn = await drawnBand($, 'terminal', bandProps(200));
  expect(drawn.slice(0, PICKED.length)).toEqual(
    stampedLines(PICKED, `as of ${clockText(NOW)}`),
  );
  expect(seen.debug).toContainEqual(
    expect.stringMatching(
      /^sidekick board: session\.start failed: .*refused by a plugin above$/,
    ),
  );
});

test('the band yields to a survey', async ($, on) => {
  const { clock } = answerBeneath(on, worldWith({ contexts: [ENTRY] }));
  await started($, clock);
  await captured($, clock);
  for (const surface of SURFACES) {
    expect(await drawnBand($, surface, bandProps(200, true))).toEqual([UNDER]);
  }
});

// Each line is cut by code point, so a dash or an ellipsis is one column, and
// a width below zero cuts every line to nothing rather than to most of it.
test('the band cuts each line to its body width, and a negative width to nothing', async ($, on) => {
  const { clock } = answerBeneath(on, worldWith({ contexts: [ENTRY] }));
  await started($, clock);
  await captured($, clock);
  const narrow = await drawnBand($, 'terminal', bandProps(10));
  expect(narrow.map((line) => line.text)).toEqual([
    'Milestone ',
    'In progres',
    'Next: #209',
    BENEATH,
  ]);
  const none = await drawnBand($, 'terminal', bandProps(-3));
  expect(none.map((line) => line.text)).toEqual(['', '', '', BENEATH]);
});

// A plugin's registrations nest first outermost, so the board, registered
// before the desk, draws above the desk's band.
test('with the desk drawing too, the board’s lines come first, and both interactive starts run', async ($, on) => {
  const world = worldWith({ contexts: [ENTRY], desk: WAITING_DESK });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await captured($, clock);
  expect(seen.commands.filter((name) => name !== 'profile')).toEqual([
    'board',
    'desk',
  ]);
  expect(seen.deskRuns).toBe(1);
  for (const surface of SURFACES) {
    expect(await drawnBand($, surface, bandProps(200))).toEqual([
      ...stampedLines(BRIEF, `as of ${clockText(NOW)}`),
      { text: '● needs you  odin-ae · permission prompt', color: 'warning' },
      UNDER,
    ]);
  }
});
