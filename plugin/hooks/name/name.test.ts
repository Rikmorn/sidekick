import type { On, SessionStartInput, Settings } from 'claude-code';
import {
  type Engine,
  expect,
  type MockClock,
  mock,
  test,
} from 'claude-code/testing';
import { RUN_TIMEOUT_MS } from './contract';
import { RENAME_DELAY_MS } from './name';

type Source = Parameters<Engine['classic']['SessionStart']>[0]['source'];

const MAIN = 'Single word reply';
const JOB_DIR = '/Users/someone/.claude/jobs/aaaa0001';
const BRIEF = '/Users/someone/repo/.superpowers/sdd/brief.md';
const REFUSAL = 'refused by a plugin above';
const NAME_LOG = 'sidekick name: ';
const SECONDS = RUN_TIMEOUT_MS / 1_000;
const DISPATCH =
  'cd x && sidekick worker dispatch b.md --permission-mode default';
const LAUNCH = '"$CLAUDE_PLUGIN_ROOT"/bin/sidekick profile launch qa --bg';
const FREEZING =
  'sidekick name: freezing "Single word reply" once this turn ends';

// What the hooks beneath the plugin answer for a tool's classic `PostToolUse`.
const AFTER_TOOL = { additionalContext: ['from beneath'] };

const START: SessionStartInput = {
  cwd: '/',
  surface: 'terminal',
  isInteractive: true,
};

// What the session command answers: an exit with its streams, or a refusal,
// which rejects the plugin's run as a timeout or a failed start does.
type RunAnswer =
  | { exitCode: number; stdout: string; stderr: string }
  | { deny: string };

// The session beneath the plugin. A test may change `answer` between launches;
// a run waits on `hold` before it answers.
type World = {
  env: Readonly<Record<string, string>>;
  // The session's flag settings, as `--settings` gave them.
  flag: Settings;
  answer: RunAnswer;
  hold?: Promise<void>;
  refused: Set<'session.id'>;
  // Whether the rename rejects, as the engine rejects one past a host's limit; the kit's bottom stands in.
  isRenameRejected: boolean;
};

// What the plugin asked of the engine.
type Seen = {
  // The session command's runs; every other run is refused unseen.
  runs: (readonly string[])[];
  timeouts: (number | undefined)[];
  // The slash commands a plugin ran.
  ran: { command: string; args: string }[];
  // Lines sent to the debug log.
  debug: string[];
};

function answered(answer: unknown): RunAnswer {
  return { exitCode: 0, stdout: `${JSON.stringify(answer)}\n`, stderr: '' };
}

const NOT_HELD = answered({ version: 1, name: MAIN, held: false });
const HELD = answered({ version: 1, name: MAIN, held: true });
const EXITED: RunAnswer = {
  exitCode: 1,
  stdout: '',
  stderr: 'claude agents --json did not return in time.\n',
};

function worldWith(answer: RunAnswer, over: Partial<World> = {}): World {
  return {
    env: {},
    flag: {},
    answer,
    refused: new Set(),
    isRenameRejected: false,
    ...over,
  };
}

// Nothing sits beneath the test's hooks but the kit's own bottom, so they
// answer every call the name mod makes and end every chain it continues. The
// other mods share the module: their reads are answered, their runs refused,
// and no surface draws, so the desk's tick runs nothing.
function answerBeneath(on: On, world: World): { seen: Seen; clock: MockClock } {
  const seen: Seen = { runs: [], timeouts: [], ran: [], debug: [] };
  mock.env(on, world.env);
  on('ui.log', (_$, e) => {
    if (e.to === 'debug') seen.debug.push(e.text);
    return { value: undefined };
  });
  on('settings.read', (_$, e) => ({
    value: e.source === 'flag' ? world.flag : {},
  }));
  on('session.id', () =>
    world.refused.has('session.id')
      ? { deny: REFUSAL }
      : { value: 'session-1' },
  );
  on('session.surfaces', () => ({ value: [] }));
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 1000000 }, rateLimits: [] },
  }));
  on('ui.status', () => ({ value: undefined }));
  on('command.register', (_$, e) => ({ value: { command: e.name } }));
  on('process.run', async (_$, e) => {
    if (e.argv[1] !== 'session') return { deny: 'no other runs here' };
    seen.runs.push(e.argv);
    seen.timeouts.push(e.init?.timeoutMs);
    await world.hold;
    const { answer } = world;
    if ('deny' in answer) return { deny: answer.deny };
    return {
      value: { ...answer, isStdoutTruncated: false, isStderrTruncated: false },
    };
  });
  on('command.run', (_$, e, next) => {
    seen.ran.push({ command: e.command, args: e.args });
    return world.isRenameRejected
      ? next(e)
      : { text: `Session renamed to: ${e.args}` };
  });
  const clock = mock.clock(on);
  on('session.start', (_$, e) => ({ cwd: e.cwd }));
  on('classic.SessionStart', () => ({}));
  on('classic.PostToolUse', () => AFTER_TOOL);
  return { seen, clock };
}

// The classic start, then the interactive one, as a session fires them.
async function started(
  $: Engine,
  clock: MockClock,
  source: Source = 'startup',
) {
  await $.classic.SessionStart({ source });
  await $.session.start(START);
  await clock.settle();
}

async function afterBash($: Engine, command: string, tool = 'Bash') {
  return $.classic.PostToolUse({
    tool_name: tool,
    tool_input: { command },
    tool_response: {},
    tool_use_id: 'toolu_1',
  });
}

function nameLines(seen: Seen): string[] {
  return seen.debug.filter((line) => line.startsWith(NAME_LOG));
}

test('in a main, a launch runs the session command for this session, under the run timeout', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith(NOT_HELD));
  await started($, clock);
  expect(await afterBash($, DISPATCH)).toEqual(AFTER_TOOL);
  expect(seen.runs).toHaveLength(1);
  const [argv] = seen.runs;
  expect(argv?.slice(1)).toEqual(['session', '--json', '--self', 'session-1']);
  expect(argv?.[0]).toEndWith('/bin/sidekick');
  expect(seen.timeouts).toEqual([RUN_TIMEOUT_MS]);
});

test('a name that does not hold is renamed to itself once the delay passes, never inside the hook, the spaced name whole', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith(NOT_HELD));
  await started($, clock);
  expect(await afterBash($, LAUNCH)).toEqual(AFTER_TOOL);
  await clock.settle();
  expect(seen.ran).toEqual([]);
  await clock.advance(RENAME_DELAY_MS - 1);
  expect(seen.ran).toEqual([]);
  await clock.advance(1);
  expect(seen.ran).toEqual([{ command: 'rename', args: 'Single word reply' }]);
  expect(nameLines(seen)).toEqual([FREEZING]);
});

test('a forked background main freezes its name too', async ($, on) => {
  const world = worldWith(NOT_HELD, { env: { CLAUDE_JOB_DIR: JOB_DIR } });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock, 'fork');
  expect(await afterBash($, DISPATCH)).toEqual(AFTER_TOOL);
  await clock.advance(RENAME_DELAY_MS);
  expect(seen.ran).toEqual([{ command: 'rename', args: MAIN }]);
});

test('after a rename is scheduled, a later launch checks nothing and schedules nothing', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith(NOT_HELD));
  await started($, clock);
  await afterBash($, DISPATCH);
  await clock.advance(RENAME_DELAY_MS);
  expect(await afterBash($, LAUNCH)).toEqual(AFTER_TOOL);
  await clock.advance(RENAME_DELAY_MS * 2);
  expect(seen.runs).toHaveLength(1);
  expect(seen.ran).toEqual([{ command: 'rename', args: MAIN }]);
});

test('a launch while a check runs starts no second check', async ($, on) => {
  const world = worldWith(NOT_HELD);
  const { seen, clock } = answerBeneath(on, world);
  let release = () => {};
  world.hold = new Promise((resolve) => {
    release = resolve;
  });
  await started($, clock);
  const first = afterBash($, DISPATCH);
  await clock.settle();
  expect(seen.runs).toHaveLength(1);
  expect(await afterBash($, LAUNCH)).toEqual(AFTER_TOOL);
  release();
  expect(await first).toEqual(AFTER_TOOL);
  await clock.advance(RENAME_DELAY_MS);
  expect(seen.runs).toHaveLength(1);
  expect(seen.ran).toEqual([{ command: 'rename', args: MAIN }]);
});

const NO_FREEZE: { name: string; answer: RunAnswer; line: unknown }[] = [
  {
    name: 'a name that holds',
    answer: HELD,
    line: "sidekick name: the session's name holds: nothing to freeze",
  },
  {
    name: 'a hold the command cannot tell',
    answer: answered({ version: 1, name: MAIN, held: null }),
    line: 'sidekick name: nothing frozen: whether the name holds is unknown',
  },
  {
    name: 'a session the listing gives no name',
    answer: answered({ version: 1, name: null, held: false }),
    line: 'sidekick name: nothing frozen: the listing gives the session no name',
  },
  {
    name: 'a command that exits 1',
    answer: EXITED,
    line: 'sidekick name: the session command exited 1: claude agents --json did not return in time.',
  },
  {
    name: 'a command that prints junk',
    answer: { exitCode: 0, stdout: 'not json\n', stderr: '' },
    line: 'sidekick name: the session command printed no answer',
  },
  {
    name: 'a run that is refused',
    answer: { deny: REFUSAL },
    line: expect.stringMatching(
      new RegExp(
        `^sidekick name: the session command did not start, or did not finish within ${SECONDS} s: .*${REFUSAL}$`,
      ),
    ),
  },
];

for (const row of NO_FREEZE) {
  test(`${row.name} schedules nothing, and the debug log says why`, async ($, on) => {
    const { seen, clock } = answerBeneath(on, worldWith(row.answer));
    await started($, clock);
    expect(await afterBash($, DISPATCH)).toEqual(AFTER_TOOL);
    await clock.advance(RENAME_DELAY_MS * 2);
    expect(seen.runs).toHaveLength(1);
    expect(seen.ran).toEqual([]);
    expect(nameLines(seen)).toEqual([row.line]);
  });
}

test('a name that holds ends the checks: a later launch runs nothing', async ($, on) => {
  const world = worldWith(HELD);
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await afterBash($, DISPATCH);
  world.answer = NOT_HELD;
  expect(await afterBash($, LAUNCH)).toEqual(AFTER_TOOL);
  await clock.advance(RENAME_DELAY_MS * 2);
  expect(seen.runs).toHaveLength(1);
  expect(seen.ran).toEqual([]);
});

test('a failed check leaves the next launch free to check and freeze', async ($, on) => {
  const world = worldWith(EXITED);
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  await afterBash($, DISPATCH);
  world.answer = NOT_HELD;
  expect(await afterBash($, LAUNCH)).toEqual(AFTER_TOOL);
  await clock.advance(RENAME_DELAY_MS);
  expect(seen.runs).toHaveLength(2);
  expect(seen.ran).toEqual([{ command: 'rename', args: MAIN }]);
});

test('a refused session id runs nothing, and the debug log names it', async ($, on) => {
  const world = worldWith(NOT_HELD, { refused: new Set(['session.id']) });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  expect(await afterBash($, DISPATCH)).toEqual(AFTER_TOOL);
  await clock.advance(RENAME_DELAY_MS);
  expect(seen.runs).toEqual([]);
  expect(seen.ran).toEqual([]);
  expect(nameLines(seen)).toEqual([
    expect.stringMatching(
      new RegExp(
        `^sidekick name: reading the session id failed: .*${REFUSAL}$`,
      ),
    ),
  ]);
});

test('a rejected rename goes to the debug log', async ($, on) => {
  const world = worldWith(NOT_HELD, { isRenameRejected: true });
  const { seen, clock } = answerBeneath(on, world);
  await started($, clock);
  expect(await afterBash($, DISPATCH)).toEqual(AFTER_TOOL);
  await clock.advance(RENAME_DELAY_MS);
  expect(seen.ran).toEqual([{ command: 'rename', args: MAIN }]);
  expect(nameLines(seen)).toEqual([
    FREEZING,
    expect.stringMatching(/^sidekick name: the rename failed: .+$/),
  ]);
});

const NOT_MAINS: {
  name: string;
  env: Record<string, string>;
  flag: Settings;
}[] = [
  {
    name: 'a worker with a main',
    env: { CLAUDE_JOB_DIR: JOB_DIR },
    flag: { env: { SIDEKICK_MAIN: MAIN } },
  },
  {
    name: 'a worker without a main',
    env: { CLAUDE_JOB_DIR: JOB_DIR },
    flag: { env: { SIDEKICK_WORKER: BRIEF } },
  },
  { name: 'an other session', env: { CLAUDE_JOB_DIR: JOB_DIR }, flag: {} },
];

for (const row of NOT_MAINS) {
  test(`in ${row.name}, a launch runs nothing`, async ($, on) => {
    const world = worldWith(NOT_HELD, { env: row.env, flag: row.flag });
    const { seen, clock } = answerBeneath(on, world);
    await started($, clock);
    expect(await afterBash($, DISPATCH)).toEqual(AFTER_TOOL);
    await clock.advance(RENAME_DELAY_MS);
    expect(seen.runs).toEqual([]);
    expect(seen.ran).toEqual([]);
    expect(nameLines(seen)).toEqual([]);
  });
}

test('with no interactive start, as in a -p run, a launch runs nothing', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith(NOT_HELD));
  expect(await afterBash($, DISPATCH)).toEqual(AFTER_TOOL);
  await clock.advance(RENAME_DELAY_MS);
  expect(seen.runs).toEqual([]);
  expect(seen.ran).toEqual([]);
});

test('in a main, a Bash call that launches nothing, or a launch through another tool, runs nothing', async ($, on) => {
  const { seen, clock } = answerBeneath(on, worldWith(NOT_HELD));
  await started($, clock);
  expect(await afterBash($, 'sidekick profile launch qa')).toEqual(AFTER_TOOL);
  expect(await afterBash($, 'sidekick profile list')).toEqual(AFTER_TOOL);
  expect(await afterBash($, DISPATCH, 'Read')).toEqual(AFTER_TOOL);
  const noCommand = await $.classic.PostToolUse({
    tool_name: 'Bash',
    tool_input: { description: DISPATCH },
    tool_response: {},
    tool_use_id: 'toolu_2',
  });
  expect(noCommand).toEqual(AFTER_TOOL);
  await clock.advance(RENAME_DELAY_MS);
  expect(seen.runs).toEqual([]);
  expect(seen.ran).toEqual([]);
});
