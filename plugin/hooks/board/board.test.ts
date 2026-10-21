import type {
  On,
  RenderElement,
  RenderNode,
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
import type { DeskSnapshot } from '../desk/contract';
import { width } from '../lines';
import { HINT_INSET } from './board';
import {
  type BoardGlance,
  GLANCE_VERSION,
  type GlanceLevel,
  PICKUP_TIMEOUT_MS,
} from './contract';
import { clockText } from './logic';
import { type BoardView, rowSegments, SEPARATOR } from './view';

// What the next pickup answers: an exit with its streams, a refusal, which
// rejects the plugin's `$.process.run` as a timeout or a failed start does, or
// no result at all, a shape the board does not expect.
type RunAnswer =
  | { exitCode: number; stdout: string; stderr: string }
  | { deny: string }
  | { isMissing: true };

type OpenPane = { title: string; isPlaced: boolean };

// The session beneath the plugin. A pickup waits on `hold` before it answers.
// A call named in `refused` is refused, as a plugin above the board may refuse it.
type World = {
  env: Readonly<Record<string, string>>;
  answer: RunAnswer;
  /** What the desk's own run prints: the desk shares the module and polls too. */
  desk: DeskSnapshot;
  hold?: Promise<void>;
  panes: Map<string, OpenPane>;
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
  opened: { id: string; title?: string }[];
  closed: string[];
  /** Lines sent to the debug log. */
  debug: string[];
};

const PLUGIN = 'sidekick';
const SURFACES = ['terminal', 'desktop'] as const;
const HINT = '? for shortcuts';
const BENEATH = 'drawn beneath';
const JOB_DIR = '/Users/someone/.claude/jobs/aaaa0001';
const REFUSAL = 'refused by a plugin above';
const NOW = new Date(2026, 9, 16, 9, 30).getTime();
const MINUTE_MS = 60_000;
const BOARD_URL = 'https://github.com/users/Rikmorn/projects/2';

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
const WIDE: RenderViewport = { columns: 200, rows: 40, isFullscreen: true };

const BRIEF = [
  'Milestone 9 — R9 control centre',
  'In progress: #233 the board’s state line',
  'Next: #232 /profile that fits',
];

function glanceOf(over: Partial<BoardGlance> = {}): BoardGlance {
  return {
    version: GLANCE_VERSION,
    board: { owner: 'Rikmorn', repo: 'sidekick', number: 2, url: BOARD_URL },
    milestone: 'R9 — Control centre',
    state: { level: 'warning', word: 'drift', detail: '3 unpushed' },
    brief: BRIEF.join('\n'),
    ...over,
  };
}

const GLANCE = glanceOf();

function printed(glance: BoardGlance): RunAnswer {
  return { exitCode: 0, stdout: `${JSON.stringify(glance)}\n`, stderr: '' };
}

const PRINTED = printed(GLANCE);
const BAD_GATEWAY: RunAnswer = {
  exitCode: 1,
  stdout: '',
  stderr: '\ngh: HTTP 502\nmore detail\n',
};
/** A glance from a newer plugin, as after an upgrade mid-session. */
const UNKNOWN_VERSION: RunAnswer = {
  exitCode: 0,
  stdout: `${JSON.stringify({ ...GLANCE, version: GLANCE_VERSION + 1 })}\n`,
  stderr: '',
};

/** What the hooks beneath the board answer for the classic start. */
const AT_START = { additionalContext: ['superpowers: you have superpowers.'] };
/** What the hooks beneath the board answer for a tool's classic `PostToolUse`. */
const AFTER_TOOL = { additionalContext: ['from beneath'] };
/** sk-orient's status post, as its skill writes it. */
const STATUS_POST = `body="$(sidekick pm pickup --report --milestone "R9 — Control centre")" && gh api graphql -f query='mutation($p:ID!){createProjectV2StatusUpdate(input:{projectId:$p}){statusUpdate{id}}}' -f p=PVT_1`;

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
    panes: new Map(),
    refused: new Set(),
    flag: {},
    ...over,
  };
}

const HINT_PROPS: RenderPropsOf['PromptHint'] = {
  isDraft: false,
  isWorking: false,
  hint: HINT,
};

function bandProps(bodyColumns: number): RenderPropsOf['AbovePrompt'] {
  return {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  };
}

function paneProps(bodyColumns: number): RenderPropsOf['Pane'] {
  return {
    title: 'Board',
    isFocused: false,
    bodyColumns,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  };
}

// Nothing sits beneath the test's hooks but the kit's own bottom, so they
// answer every call the board makes and end every chain it continues. The
// gauge, the scope mod, and the desk share the module, so their calls are
// answered too.
function answerBeneath(on: On, world: World): { seen: Seen; clock: MockClock } {
  const seen: Seen = {
    pickups: [],
    timeouts: [],
    deskRuns: 0,
    commands: [],
    opened: [],
    closed: [],
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
  on('ui.open', (_$, e) => {
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
  on('classic.SessionStart', () => AT_START);
  on('classic.PostToolUse', () => AFTER_TOOL);
  on('ui.render', { component: 'PromptHint' }, () => ({
    type: 'Text',
    children: [HINT],
  }));
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

// The interactive start, and the runs it began.
async function started($: Engine, clock: MockClock, start = START) {
  await $.session.start(start);
  await clock.settle();
}

type Source = Parameters<Engine['classic']['SessionStart']>[0]['source'];

// The classic start, as the hooks beneath answered it, and the runs it began.
async function classicStart(
  $: Engine,
  clock: MockClock,
  source: Source = 'startup',
) {
  const result = await $.classic.SessionStart({ source });
  await clock.settle();
  return result;
}

// Both start hooks, the interactive one first, and the runs they began.
async function bothStarts($: Engine, clock: MockClock) {
  await started($, clock);
  await classicStart($, clock);
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

// A stretch of drawn text in one colour; a Link's carries its URL.
type Run = { text: string; color: unknown; href?: string };

function childrenOf(node: RenderElement): RenderNode[] {
  return 'children' in node && Array.isArray(node.children)
    ? node.children
    : [];
}

function textIn(nodes: readonly RenderNode[]): string {
  return nodes
    .map((node) => (typeof node === 'string' ? node : textIn(childrenOf(node))))
    .join('');
}

// A Text's colour reaches its children unless one sets its own.
function runsOf(node: RenderNode, color: unknown): Run[] {
  if (typeof node === 'string') return [{ text: node, color }];
  if (node.type === 'Link') {
    return [{ text: textIn(childrenOf(node)), color, href: node.props.href }];
  }
  const own = node.type === 'Text' ? node.props?.color : undefined;
  return childrenOf(node).flatMap((child) => runsOf(child, own ?? color));
}

// Neighbouring runs of one colour join, so the assertions read whole stretches.
function merged(runs: readonly Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    const last = out.at(-1);
    const joins =
      last !== undefined &&
      last.href === undefined &&
      run.href === undefined &&
      last.color === run.color;
    if (joins) last.text += run.text;
    else out.push({ ...run });
  }
  return out;
}

// What the hint site drew, line by line: a column's children, or one tree.
async function drawnHint(
  $: Engine,
  surface: RenderSurface,
  viewport?: RenderViewport,
): Promise<Run[][]> {
  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface,
    component: 'PromptHint',
    props: HINT_PROPS,
    ...(viewport === undefined ? {} : { viewport }),
  });
  const tree = await ui.drawn();
  await ui.unmount();
  const lines = tree.type === 'Box' ? childrenOf(tree) : [tree];
  return lines.map((line) => merged(runsOf(line, undefined)));
}

function rowText(runs: readonly Run[] | undefined): string {
  return (runs ?? []).map((run) => run.text).join('');
}

type PaneRow = { text: string; color: unknown; wrap: unknown; href?: string };

function paneRowOf(node: RenderNode): PaneRow {
  if (typeof node === 'string' || node.type !== 'Text') {
    return { text: JSON.stringify(node), color: 'not a Text', wrap: undefined };
  }
  const runs = runsOf(node, undefined);
  const href = runs.find((run) => run.href !== undefined)?.href;
  return {
    text: rowText(runs),
    color: node.props?.color,
    wrap: node.props?.wrap,
    ...(href === undefined ? {} : { href }),
  };
}

async function drawnPane(
  $: Engine,
  surface: RenderSurface,
  bodyColumns = 60,
): Promise<PaneRow[]> {
  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface,
    component: 'Pane',
    requestId: 'board',
    props: paneProps(bodyColumns),
  });
  const tree = await ui.drawn();
  await ui.unmount();
  return childrenOf(tree).map(paneRowOf);
}

type Drawn = { text: string; color: unknown };

async function drawnBand($: Engine, surface: RenderSurface): Promise<Drawn[]> {
  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface,
    component: 'AbovePrompt',
    props: bandProps(200),
    viewport: WIDE,
  });
  const texts = await ui.findAll({ type: 'Text' });
  await ui.unmount();
  return texts.map((text) => ({ text: text.text, color: text.props.color }));
}

const UNDER: Run[] = [{ text: HINT, color: undefined }];

// The row for GLANCE at 200 columns: every segment, the board a Link, the
// state in its level's colour, the rest subtle.
function wideRow(time: string): Run[] {
  return [
    { text: '▣ Rikmorn/sidekick · ', color: 'subtle' },
    { text: 'board #2', color: 'subtle', href: BOARD_URL },
    { text: ' · ', color: 'subtle' },
    { text: '▲ drift', color: 'warning' },
    { text: ` · 3 unpushed · R9 — Control centre · ${time}`, color: 'subtle' },
  ];
}

// A matcher for the one run a failure draws, its text matching `line`.
function failureRow(line: string | RegExp): unknown[] {
  return [{ text: expect.stringMatching(line), color: 'error' }];
}

const ORDERS: {
  name: string;
  start: ($: Engine, clock: MockClock) => Promise<unknown>;
}[] = [
  { name: 'the interactive start first', start: bothStarts },
  {
    name: 'the classic start first',
    start: async ($, clock) => {
      await classicStart($, clock);
      await started($, clock);
    },
  },
];

for (const order of ORDERS) {
  test(`with ${order.name}, a live start runs one glance pickup and draws its row under the hint`, async ($, on) => {
    const { seen, clock } = answerBeneath(on, worldWith());
    await order.start($, clock);
    expect(seen.pickups).toHaveLength(1);
    const [argv] = seen.pickups;
    expect(argv?.slice(1)).toEqual(['pm', 'pickup', '--glance']);
    expect(argv?.[0]).toEndWith('/bin/sidekick');
    expect(seen.timeouts).toEqual([PICKUP_TIMEOUT_MS]);
    for (const surface of SURFACES) {
      expect(await drawnHint($, surface, WIDE)).toEqual([
        UNDER,
        wideRow(clockText(NOW)),
      ]);
    }
  });
}

test('the classic start returns what lay beneath, unchanged', async ($, on) => {
  const { clock } = answerBeneath(on, worldWith());
  await started($, clock);
  expect(await classicStart($, clock)).toEqual(AT_START);
});

const GLANCE_VIEW: BoardView = {
  state: 'ok',
  glance: GLANCE,
  takenAt: clockText(NOW),
};

// The view sheds to the width it is handed, so the row's text says which.
test('the row takes its width from the viewport, less the hint area’s inset', async ($, on) => {
  const { clock } = answerBeneath(on, worldWith());
  await bothStarts($, clock);
  for (const columns of [30, 48, 64]) {
    const lines = await drawnHint($, 'terminal', { ...WIDE, columns });
    const expected = rowSegments(GLANCE_VIEW, columns - HINT_INSET)
      .map((segment) => segment.text)
      .join(SEPARATOR);
    expect(rowText(lines[1])).toBe(expected);
  }
});

// GLANCE's whole row is 82 columns, so these widths each shed or cut the
// milestone, and a row sized to the surface's full width would overflow.
test('from 60 to 82 columns the row fits inside the inset, its time whole', async ($, on) => {
  const { clock } = answerBeneath(on, worldWith());
  await bothStarts($, clock);
  for (const columns of [60, 76, 80, 82]) {
    const [, row] = await drawnHint($, 'terminal', { ...WIDE, columns });
    const text = rowText(row);
    expect(width(text)).toBeLessThanOrEqual(columns - HINT_INSET);
    expect(text).toEndWith(`${SEPARATOR}${clockText(NOW)}`);
  }
});

test('a surface narrower than the inset draws only what lies beneath', async ($, on) => {
  const { clock } = answerBeneath(on, worldWith());
  await bothStarts($, clock);
  for (const columns of [HINT_INSET, 1]) {
    const lines = await drawnHint($, 'terminal', { ...WIDE, columns });
    expect(lines).toEqual([UNDER]);
  }
});

test('an absent viewport draws only what lies beneath', async ($, on) => {
  const { clock } = answerBeneath(on, worldWith());
  await bothStarts($, clock);
  for (const surface of SURFACES) {
    expect(await drawnHint($, surface)).toEqual([UNDER]);
  }
});

const LEVEL_COLORS: readonly [GlanceLevel, string][] = [
  ['good', 'success'],
  ['warning', 'warning'],
  ['bad', 'error'],
  ['unknown', 'inactive'],
];

for (const [level, color] of LEVEL_COLORS) {
  test(`the state at level ${level} draws in ${color}`, async ($, on) => {
    const state = { level, word: 'word', detail: null };
    const answer = printed(glanceOf({ state }));
    const { clock } = answerBeneath(on, worldWith({ answer }));
    await bothStarts($, clock);
    const [, row] = await drawnHint($, 'terminal', WIDE);
    expect(row?.filter((run) => run.color !== 'subtle')).toEqual([
      { text: expect.stringMatching(/ word$/), color },
    ]);
  });
}

// Under `-p` the interactive start never fires, and nobody sees a row.
const UNSEEN: {
  name: string;
  over: Partial<World>;
  start?: SessionStartInput;
}[] = [
  { name: 'a start under -p', over: {}, start: HEADLESS },
  { name: 'a background session', over: { env: { CLAUDE_JOB_DIR: JOB_DIR } } },
  {
    name: 'a profile that hides the board',
    over: { flag: { sidekick: { hide: { mods: ['board'] } } } },
  },
];

for (const unseen of UNSEEN) {
  test(`${unseen.name} gets no /board, runs no pickup, and draws no row`, async ($, on) => {
    const world = worldWith(unseen.over);
    const { seen, clock } = answerBeneath(on, world);
    await started($, clock, unseen.start);
    await classicStart($, clock);
    await afterBash($, 'gh issue close 5');
    await boardCommand($);
    await classicStart($, clock, 'clear');
    await clock.settle();
    expect(seen.pickups).toEqual([]);
    expect(seen.commands).not.toContain('board');
    expect(seen.opened).toEqual([]);
    expect(await drawnHint($, 'terminal', WIDE)).toEqual([UNDER]);
  });
}

test('a compact start runs nothing, and a live /clear runs one pickup and draws it', async ($, on) => {
  const world = worldWith();
  const { seen, clock } = answerBeneath(on, world);
  await bothStarts($, clock);
  await classicStart($, clock, 'compact');
  expect(seen.pickups).toHaveLength(1);
  await clock.advance(MINUTE_MS);
  world.answer = printed(
    glanceOf({
      milestone: 'R10 — The loop',
      state: { level: 'good', word: 'on track', detail: null },
    }),
  );
  await classicStart($, clock, 'clear');
  expect(seen.pickups).toHaveLength(2);
  const [, row] = await drawnHint($, 'terminal', WIDE);
  expect(rowText(row)).toBe(
    `▣ Rikmorn/sidekick · board #2 · ● on track · R10 — The loop · ${clockText(NOW + MINUTE_MS)}`,
  );
});

for (const source of ['resume', 'fork'] as const) {
  test(`a live ${source} start runs one pickup and draws its row`, async ($, on) => {
    const { seen, clock } = answerBeneath(on, worldWith());
    await started($, clock);
    await classicStart($, clock, source);
    expect(seen.pickups).toHaveLength(1);
    expect(await drawnHint($, 'terminal', WIDE)).toEqual([
      UNDER,
      wideRow(clockText(NOW)),
    ]);
  });
}

test('/board on a pane held undrawn opens it again, with a pickup, and closes nothing', async ($, on) => {
  const world = worldWith();
  const { seen, clock } = answerBeneath(on, world);
  await bothStarts($, clock);
  world.panes.set('board', { title: 'Board', isPlaced: false });
  await boardCommand($);
  await clock.settle();
  expect(seen.opened).toEqual([{ id: 'board', title: 'Board' }]);
  expect(seen.closed).toEqual([]);
  expect(seen.pickups).toHaveLength(2);
});

test('/board opens the pane and runs one asked pickup, and a second /board closes it and runs nothing', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith());
  await bothStarts($, clock);
  expect(seen.commands).toContain('board');
  expect(await boardCommand($)).toEqual({});
  await clock.settle();
  expect(seen.opened).toEqual([{ id: 'board', title: 'Board' }]);
  expect(seen.pickups).toHaveLength(2);
  expect(await boardCommand($)).toEqual({});
  await clock.settle();
  expect(seen.closed).toEqual(['board']);
  expect(seen.pickups).toHaveLength(2);
});

test('the pane draws the brief wrapped, a blank line, the board as a Link, and the stamp', async ($, on) => {
  const { clock } = answerBeneath(on, worldWith());
  await bothStarts($, clock);
  await boardCommand($);
  await clock.settle();
  for (const surface of SURFACES) {
    expect(await drawnPane($, surface)).toEqual([
      ...BRIEF.map((text) => ({ text, color: 'text', wrap: 'wrap' })),
      { text: '', color: 'text', wrap: 'wrap' },
      { text: BOARD_URL, color: 'text', wrap: 'wrap', href: BOARD_URL },
      { text: `as of ${clockText(NOW)}`, color: 'subtle', wrap: 'wrap' },
    ]);
  }
});

test('an empty pickup, as in an untracked repo, draws no row and an empty pane', async ($, on) => {
  const answer = { exitCode: 0, stdout: '', stderr: '' };
  const { clock } = answerBeneath(on, worldWith({ answer }));
  await bothStarts($, clock);
  await boardCommand($);
  await clock.settle();
  expect(await drawnHint($, 'terminal', WIDE)).toEqual([UNDER]);
  expect(await drawnPane($, 'terminal')).toEqual([]);
});

// The tool's result reaches the model before the pickup ends, so a slow pickup
// never holds the turn.
const WRITES = [
  { name: 'a git push', command: 'cd /x && git push origin master' },
  { name: 'sk-orient’s status post', command: STATUS_POST },
];

for (const write of WRITES) {
  test(`${write.name} runs a pickup, and the hook returns what lay beneath while it runs`, async ($, on) => {
    const world = worldWith();
    const { seen, clock } = answerBeneath(on, world);
    await bothStarts($, clock);
    let release = () => {};
    world.hold = new Promise((resolve) => {
      release = resolve;
    });
    let returned: unknown;
    const call = afterBash($, write.command).then((result) => {
      returned = result;
    });
    await clock.settle();
    expect(seen.pickups).toHaveLength(2);
    expect(returned).toEqual(AFTER_TOOL);
    release();
    await call;
    await clock.settle();
  });
}

test('a Bash call that only reads the board, or another tool, runs nothing', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith());
  await bothStarts($, clock);
  expect(await afterBash($, 'gh issue list')).toEqual(AFTER_TOOL);
  expect(await afterBash($, 'git push', 'Read')).toEqual(AFTER_TOOL);
  const noCommand = await $.classic.PostToolUse({
    tool_name: 'Bash',
    tool_input: { command: 5 },
    tool_response: {},
    tool_use_id: 'toolu_2',
  });
  expect(noCommand).toEqual(AFTER_TOOL);
  await clock.settle();
  expect(seen.pickups).toHaveLength(1);
});

test('three requests during one run give exactly one more run', async ($, on) => {
  const world = worldWith();
  const { seen, clock } = answerBeneath(on, world);
  await bothStarts($, clock);
  let release = () => {};
  world.hold = new Promise((resolve) => {
    release = resolve;
  });
  await afterBash($, 'gh issue close 5');
  await clock.settle();
  expect(seen.pickups).toHaveLength(2);
  await boardCommand($);
  await afterBash($, 'git push');
  await afterBash($, 'gh issue close 6');
  await clock.settle();
  expect(seen.pickups).toHaveLength(2);
  release();
  await clock.settle();
  expect(seen.pickups).toHaveLength(3);
  await afterBash($, 'git commit -m x');
  await clock.settle();
  expect(seen.pickups).toHaveLength(4);
});

// What reruns the pickup: an open of the pane, or a Bash board write.
const RERUNS: { name: string; run: ($: Engine) => Promise<unknown> }[] = [
  { name: '/board', run: boardCommand },
  { name: 'a board write', run: ($) => afterBash($, 'gh issue close 5') },
];

const BAD_RUNS: { name: string; answer: RunAnswer; debug: RegExp }[] = [
  {
    name: 'exits non-zero',
    answer: BAD_GATEWAY,
    debug: /^sidekick board: the pickup exited 1: gh: HTTP 502$/,
  },
  {
    name: 'prints a glance of an unknown version',
    answer: UNKNOWN_VERSION,
    debug: /^sidekick board: the pickup's output did not parse$/,
  },
];

for (const rerun of RERUNS) {
  for (const bad of BAD_RUNS) {
    test(`a run from ${rerun.name} that ${bad.name} after a good one keeps the row, stamped refresh failed`, async ($, on) => {
      const world = worldWith();
      const { seen, clock } = answerBeneath(on, world);
      await bothStarts($, clock);
      await clock.advance(MINUTE_MS);
      world.answer = bad.answer;
      await rerun.run($);
      await clock.settle();
      const failed = `refresh failed ${clockText(NOW + MINUTE_MS)}`;
      const [, row] = await drawnHint($, 'terminal', WIDE);
      expect(rowText(row)).toBe(
        `▣ Rikmorn/sidekick · board #2 · ▲ drift · 3 unpushed · R9 — Control centre · ${failed}`,
      );
      expect(seen.debug).toContainEqual(expect.stringMatching(bad.debug));
    });
  }
}

test('after a failed refresh, the pane keeps the brief and stamps the failure', async ($, on) => {
  const world = worldWith();
  const { clock } = answerBeneath(on, world);
  await bothStarts($, clock);
  await clock.advance(MINUTE_MS);
  world.answer = BAD_GATEWAY;
  await boardCommand($);
  await clock.settle();
  const rows = await drawnPane($, 'terminal');
  expect(rows.at(-1)).toEqual({
    text: `refresh failed ${clockText(NOW + MINUTE_MS)}`,
    color: 'subtle',
    wrap: 'wrap',
  });
  expect(rows.map((row) => row.text).slice(0, BRIEF.length)).toEqual(BRIEF);
});

const FAILURES: { name: string; answer: RunAnswer; line: string | RegExp }[] = [
  {
    name: 'a non-zero exit draws its code and the first line of stderr',
    answer: BAD_GATEWAY,
    line: /^⚠ board: the pickup exited 1: gh: HTTP 502$/,
  },
  {
    name: 'a run that cannot start, or outlasts its timeout, draws the rejection',
    answer: { deny: 'spawn ENOENT' },
    line: new RegExp(
      `^⚠ board: the pickup did not start, or did not finish within ${PICKUP_TIMEOUT_MS / 1_000} s: .*spawn ENOENT`,
    ),
  },
  {
    name: 'output that does not parse draws its own reason',
    answer: UNKNOWN_VERSION,
    line: /^⚠ board: the pickup's output did not parse$/,
  },
];

for (const failure of FAILURES) {
  // Pickup also fails in an untracked repo when `gh`, its scope, or the
  // network is missing, and an untracked repo's row draws nothing.
  test(`with no good row yet, a failed start leaves the row empty, and /board draws the failure: ${failure.name}`, async ($, on) => {
    const world = worldWith({ answer: failure.answer });
    const { seen, clock } = answerBeneath(on, world);
    await bothStarts($, clock);
    expect(seen.pickups).toHaveLength(1);
    expect(await drawnHint($, 'terminal', WIDE)).toEqual([UNDER]);
    expect(seen.debug).toContainEqual(
      expect.stringMatching(/^sidekick board: the pickup/),
    );
    await boardCommand($);
    await clock.settle();
    expect(await drawnHint($, 'terminal', WIDE)).toEqual([
      UNDER,
      failureRow(failure.line),
    ]);
    expect(await drawnPane($, 'terminal')).toEqual([
      {
        text: expect.stringMatching(failure.line),
        color: 'error',
        wrap: 'wrap',
      },
    ]);
  });
}

test('after a failed /board, a failed unasked run keeps the failure line, and a good one replaces it', async ($, on) => {
  const world = worldWith({ answer: BAD_GATEWAY });
  const { clock } = answerBeneath(on, world);
  await bothStarts($, clock);
  await boardCommand($);
  await clock.settle();
  world.answer = { exitCode: 2, stdout: '', stderr: 'gh: no network\n' };
  await afterBash($, 'gh issue close 5');
  await clock.settle();
  expect(await drawnHint($, 'terminal', WIDE)).toEqual([
    UNDER,
    failureRow(/^⚠ board: the pickup exited 1: gh: HTTP 502$/),
  ]);
  world.answer = PRINTED;
  await afterBash($, 'gh issue close 5');
  await clock.settle();
  expect(await drawnHint($, 'terminal', WIDE)).toEqual([
    UNDER,
    wideRow(clockText(NOW)),
  ]);
});

test('a good run after a failed refresh draws the row fresh', async ($, on) => {
  const world = worldWith();
  const { clock } = answerBeneath(on, world);
  await bothStarts($, clock);
  world.answer = BAD_GATEWAY;
  await afterBash($, 'git push');
  await clock.settle();
  await clock.advance(MINUTE_MS);
  world.answer = PRINTED;
  await afterBash($, 'git push');
  await clock.settle();
  expect(await drawnHint($, 'terminal', WIDE)).toEqual([
    UNDER,
    wideRow(clockText(NOW + MINUTE_MS)),
  ]);
});

// The run in flight keeps its own kind; the one it queues counts as asked
// once any request behind it was.
test('a /board during an unasked run makes the run it queues asked, so its failure draws', async ($, on) => {
  const world = worldWith({ answer: BAD_GATEWAY });
  const { seen, clock } = answerBeneath(on, world);
  await bothStarts($, clock);
  let release = () => {};
  world.hold = new Promise((resolve) => {
    release = resolve;
  });
  await afterBash($, 'gh issue close 5');
  await clock.settle();
  await boardCommand($);
  await afterBash($, 'gh issue close 6');
  release();
  await clock.settle();
  expect(seen.pickups).toHaveLength(3);
  expect(await drawnHint($, 'terminal', WIDE)).toEqual([
    UNDER,
    failureRow(/^⚠ board: the pickup exited 1: gh: HTTP 502$/),
  ]);
});

test('board writes during an unasked run queue an unasked run, whose failure leaves the row empty', async ($, on) => {
  const world = worldWith({ answer: BAD_GATEWAY });
  const { seen, clock } = answerBeneath(on, world);
  await bothStarts($, clock);
  let release = () => {};
  world.hold = new Promise((resolve) => {
    release = resolve;
  });
  await afterBash($, 'gh issue close 5');
  await clock.settle();
  await afterBash($, 'gh issue close 6');
  await afterBash($, 'git push');
  release();
  await clock.settle();
  expect(seen.pickups).toHaveLength(3);
  expect(await drawnHint($, 'terminal', WIDE)).toEqual([UNDER]);
});

// The run is outside any hook, so a throw it left unhandled would fail the
// file here; the next request must still run.
test('a run that throws is logged, and the next request still runs', async ($, on) => {
  const world = worldWith({ answer: { isMissing: true } });
  const { seen, clock } = answerBeneath(on, world);
  await bothStarts($, clock);
  expect(seen.debug).toContainEqual(
    expect.stringMatching(/^sidekick board: a refresh failed: /),
  );
  world.answer = PRINTED;
  await boardCommand($);
  await clock.settle();
  expect(seen.pickups).toHaveLength(2);
  const [, row] = await drawnHint($, 'terminal', WIDE);
  expect(rowText(row)).toStartWith('▣ Rikmorn/sidekick');
});

test('a refused settings read leaves the board on, and the debug log names it', async ($, on) => {
  const world = worldWith();
  world.refused.add('settings.read');
  const { seen, clock } = answerBeneath(on, world);
  await bothStarts($, clock);
  expect(seen.commands).toContain('board');
  expect(seen.pickups).toHaveLength(1);
  expect(seen.debug).toContainEqual(
    expect.stringMatching(
      /^sidekick board: reading the profile's hidden parts failed: .*refused by a plugin above$/,
    ),
  );
});

// The classic start goes first, so the only start pickup is the interactive
// start's own, which a refused `/board` must not stop.
test('a refused /board leaves the row running, and the debug log names it', async ($, on) => {
  const world = worldWith();
  world.refused.add('command.register');
  const { seen, clock } = answerBeneath(on, world);
  await classicStart($, clock);
  await started($, clock);
  expect(seen.pickups).toHaveLength(1);
  expect(await drawnHint($, 'terminal', WIDE)).toEqual([
    UNDER,
    wideRow(clockText(NOW)),
  ]);
  expect(seen.debug).toContainEqual(
    expect.stringMatching(
      /^sidekick board: session\.start failed: .*refused by a plugin above$/,
    ),
  );
});

test('with the desk drawing too, both interactive starts run, and only the desk draws above the prompt', async ($, on) => {
  const world = worldWith({ desk: WAITING_DESK });
  const { seen, clock } = answerBeneath(on, world);
  await bothStarts($, clock);
  expect(seen.commands.filter((name) => name !== 'profile')).toEqual([
    'board',
    'desk',
  ]);
  expect(seen.deskRuns).toBe(1);
  for (const surface of SURFACES) {
    expect(await drawnBand($, surface)).toEqual([
      { text: '● needs you  odin-ae · permission prompt', color: 'warning' },
      { text: BENEATH, color: undefined },
    ]);
    expect(await drawnHint($, surface, WIDE)).toEqual([
      UNDER,
      wideRow(clockText(NOW)),
    ]);
  }
});
