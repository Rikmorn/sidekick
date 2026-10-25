import type { On, SessionStartInput, Settings } from 'claude-code';
import { type Engine, expect, mock, test } from 'claude-code/testing';
import { type Role, roleOf, wayBack, workerAnswer } from './role';

type RoleInput = Parameters<typeof roleOf>[0];
type Source = Parameters<Engine['classic']['SessionStart']>[0]['source'];

const JOB_DIR = '/Users/someone/.claude/jobs/aaaa0001';
const MAIN = 'Single word reply';
const BRIEF = '/Users/someone/repo/.superpowers/sdd/brief.md';
const REFUSAL = 'refused by a plugin above';
const ROLE_LOG = 'sidekick role: ';

const START: SessionStartInput = {
  cwd: '/',
  surface: 'terminal',
  isInteractive: true,
};

// How a session started: whether it has a job dir, and whether its classic
// start read `fork`.
const STARTS: { name: string; jobDir: string | undefined; forked: boolean }[] =
  [
    { name: 'an interactive', jobDir: undefined, forked: false },
    { name: 'a forked background', jobDir: JOB_DIR, forked: true },
    { name: 'an unforked background', jobDir: JOB_DIR, forked: false },
  ];

const NOT_OBJECTS: { name: string; flagEnv: unknown }[] = [
  { name: 'missing', flagEnv: undefined },
  { name: 'null', flagEnv: null },
  { name: 'a string', flagEnv: 'SIDEKICK_MAIN=x' },
  { name: 'an array', flagEnv: ['SIDEKICK_MAIN'] },
  { name: 'a number', flagEnv: 42 },
];

const ROWS: { name: string; input: RoleInput; role: Role }[] = [
  {
    name: 'no job dir is a main',
    input: { flagEnv: {}, jobDir: undefined, forked: false },
    role: { kind: 'main' },
  },
  {
    name: 'a job dir with a fork is a main',
    input: { flagEnv: {}, jobDir: JOB_DIR, forked: true },
    role: { kind: 'main' },
  },
  {
    name: 'a job dir without a fork, a spare or a hand-started --bg, is other',
    input: { flagEnv: {}, jobDir: JOB_DIR, forked: false },
    role: { kind: 'other' },
  },
  ...STARTS.map(({ name, jobDir, forked }) => ({
    name: `SIDEKICK_MAIN makes ${name} session a worker with that main`,
    input: { flagEnv: { SIDEKICK_MAIN: MAIN }, jobDir, forked },
    role: { kind: 'worker', main: MAIN } satisfies Role,
  })),
  {
    name: 'both markers make a worker with the main SIDEKICK_MAIN names',
    input: {
      flagEnv: { SIDEKICK_MAIN: MAIN, SIDEKICK_WORKER: BRIEF },
      jobDir: JOB_DIR,
      forked: false,
    },
    role: { kind: 'worker', main: MAIN },
  },
  {
    name: 'only SIDEKICK_WORKER makes a worker without a main',
    input: {
      flagEnv: { SIDEKICK_WORKER: BRIEF },
      jobDir: JOB_DIR,
      forked: false,
    },
    role: { kind: 'worker', main: undefined },
  },
  {
    name: 'empty marker strings make no worker, interactive',
    input: {
      flagEnv: { SIDEKICK_MAIN: '', SIDEKICK_WORKER: '' },
      jobDir: undefined,
      forked: false,
    },
    role: { kind: 'main' },
  },
  {
    name: 'empty marker strings make no worker, unforked background',
    input: {
      flagEnv: { SIDEKICK_MAIN: '', SIDEKICK_WORKER: '' },
      jobDir: JOB_DIR,
      forked: false,
    },
    role: { kind: 'other' },
  },
  {
    name: 'markers that are not strings make no worker',
    input: {
      flagEnv: { SIDEKICK_MAIN: 42, SIDEKICK_WORKER: true },
      jobDir: undefined,
      forked: false,
    },
    role: { kind: 'main' },
  },
  ...NOT_OBJECTS.map(({ name, flagEnv }) => ({
    name: `an env that is ${name} holds no marker`,
    input: { flagEnv, jobDir: undefined, forked: false },
    role: { kind: 'main' } satisfies Role,
  })),
];

for (const row of ROWS) {
  test(`roleOf: ${row.name}`, () => {
    expect(roleOf(row.input)).toEqual(row.role);
  });
}

test('wayBack names the main to select', () => {
  expect(wayBack(MAIN)).toBe('←, select Single word reply, Enter');
});

test('a worker with a main answers a command with the way back', () => {
  expect(workerAnswer('desk', MAIN)).toBe(
    '/desk is off in this worker. Its main is Single word reply: ←, select it, Enter.',
  );
});

test('a worker without a main answers a command in one clause', () => {
  expect(workerAnswer('board', undefined)).toBe(
    '/board is off in this worker.',
  );
});

// The session beneath the plugin. A test may change `flag` and `isRefusing`
// between starts.
type World = {
  env: Readonly<Record<string, string>>;
  /** The session's flag settings, as `--settings` gave them. */
  flag: Settings;
  /** Whether a plugin above refuses the settings read. */
  isRefusing: boolean;
  /** Whether a plugin above refuses the `CLAUDE_JOB_DIR` read. */
  isEnvRefusing?: boolean;
  /** The values sidekick keeps in `$.state`, by key; the test's own record to read back. */
  state?: Record<string, unknown>;
  /** Whether a plugin above refuses every `$.state` call. */
  isStateRefusing?: boolean;
};

// Nothing sits beneath the test's hooks but the kit's own bottom, so they end
// every chain the start continues. The other mods share the module: the clock
// holds their timers, their runs are refused, and the gauge's status is
// answered. Returns the lines the plugins send to the debug log.
function answerBeneath(on: On, world: World): string[] {
  const debug: string[] = [];
  if (world.isEnvRefusing === true) on('env.get', () => ({ deny: REFUSAL }));
  else mock.env(on, world.env);
  mock.clock(on);
  on('ui.log', (_$, e) => {
    if (e.to === 'debug') debug.push(e.text);
    return { value: undefined };
  });
  on('settings.read', (_$, e) => {
    if (world.isRefusing) return { deny: REFUSAL };
    return { value: e.source === 'flag' ? world.flag : {} };
  });
  const kept = world.state ?? {};
  on('state.get', (_$, e) => {
    if (world.isStateRefusing === true) return { deny: REFUSAL };
    return { value: { value: kept[e.key], version: 0 } };
  });
  on('state.set', (_$, e) => {
    if (world.isStateRefusing === true) return { deny: REFUSAL };
    kept[e.key] = e.value;
    return { value: { isSet: true, version: 1 } };
  });
  on('process.run', () => ({ deny: 'no runs beneath this test' }));
  on('ui.status', () => ({ value: undefined }));
  on('classic.SessionStart', () => ({}));
  on('session.start', (_$, e) => ({ cwd: e.cwd }));
  return debug;
}

function roleLines(debug: string[]): string[] {
  return debug.filter((line) => line.startsWith(ROLE_LOG));
}

// The classic start, then the interactive one, as a session fires them.
async function startedFrom($: Engine, source: Source): Promise<void> {
  await $.classic.SessionStart({ source });
  await $.session.start(START);
}

test('a forked background session settles as a main', async ($, on) => {
  const debug = answerBeneath(on, {
    env: { CLAUDE_JOB_DIR: JOB_DIR },
    flag: {},
    isRefusing: false,
  });
  await startedFrom($, 'fork');
  expect(roleLines(debug)).toEqual(['sidekick role: main']);
});

test('a background session whose classic start is not a fork settles as other', async ($, on) => {
  const debug = answerBeneath(on, {
    env: { CLAUDE_JOB_DIR: JOB_DIR },
    flag: {},
    isRefusing: false,
  });
  await startedFrom($, 'startup');
  expect(roleLines(debug)).toEqual(['sidekick role: other']);
});

test('the markers come from the flag settings, so a worker names its main', async ($, on) => {
  const debug = answerBeneath(on, {
    env: { CLAUDE_JOB_DIR: JOB_DIR },
    flag: { env: { SIDEKICK_MAIN: MAIN, SIDEKICK_WORKER: BRIEF } },
    isRefusing: false,
  });
  await startedFrom($, 'startup');
  expect(roleLines(debug)).toEqual([
    'sidekick role: worker of Single word reply',
  ]);
});

test('a worker without a main says so', async ($, on) => {
  const debug = answerBeneath(on, {
    env: { CLAUDE_JOB_DIR: JOB_DIR },
    flag: { env: { SIDEKICK_WORKER: BRIEF } },
    isRefusing: false,
  });
  await startedFrom($, 'startup');
  expect(roleLines(debug)).toEqual(['sidekick role: worker']);
});

test('markers in the process environment make no worker', async ($, on) => {
  const debug = answerBeneath(on, {
    env: { SIDEKICK_MAIN: MAIN, SIDEKICK_WORKER: BRIEF },
    flag: {},
    isRefusing: false,
  });
  await startedFrom($, 'startup');
  expect(roleLines(debug)).toEqual(['sidekick role: main']);
});

test('a refused settings read settles with no marker, and logs the failure', async ($, on) => {
  const debug = answerBeneath(on, {
    env: {},
    flag: { env: { SIDEKICK_MAIN: MAIN } },
    isRefusing: true,
  });
  await startedFrom($, 'startup');
  expect(roleLines(debug)).toEqual([
    expect.stringMatching(
      /^sidekick role: reading the flag settings failed: .*refused by a plugin above$/,
    ),
    'sidekick role: main',
  ]);
});

test('a refused CLAUDE_JOB_DIR read counts as unset: a main, and the failure logs', async ($, on) => {
  const debug = answerBeneath(on, {
    env: { CLAUDE_JOB_DIR: JOB_DIR },
    flag: {},
    isRefusing: false,
    isEnvRefusing: true,
  });
  await startedFrom($, 'startup');
  expect(roleLines(debug)).toEqual([
    expect.stringMatching(
      /^sidekick role: reading CLAUDE_JOB_DIR failed: .*refused by a plugin above$/,
    ),
    'sidekick role: main',
  ]);
});

// A hot reload loads the module afresh and fires no classic start; the fork
// an earlier load recorded stands in state.
test('a load with no classic start reads the fork an earlier load kept in state', async ($, on) => {
  const debug = answerBeneath(on, {
    env: { CLAUDE_JOB_DIR: JOB_DIR },
    flag: {},
    isRefusing: false,
    state: { forked: true },
  });
  await $.session.start(START);
  expect(roleLines(debug)).toEqual(['sidekick role: main']);
});

test('a fork start writes forked to state', async ($, on) => {
  const state: Record<string, unknown> = {};
  answerBeneath(on, {
    env: { CLAUDE_JOB_DIR: JOB_DIR },
    flag: {},
    isRefusing: false,
    state,
  });
  await $.classic.SessionStart({ source: 'fork' });
  expect(state).toEqual({ forked: true });
});

test('a refused state write still settles the fork as a main, and logs the failure', async ($, on) => {
  const debug = answerBeneath(on, {
    env: { CLAUDE_JOB_DIR: JOB_DIR },
    flag: {},
    isRefusing: false,
    isStateRefusing: true,
  });
  await startedFrom($, 'fork');
  expect(roleLines(debug)).toEqual([
    expect.stringMatching(
      /^sidekick role: keeping the fork failed: .*refused by a plugin above$/,
    ),
    'sidekick role: main',
  ]);
});

test('a refused state read counts as no kept fork, and logs the failure', async ($, on) => {
  const debug = answerBeneath(on, {
    env: { CLAUDE_JOB_DIR: JOB_DIR },
    flag: {},
    isRefusing: false,
    isStateRefusing: true,
  });
  await startedFrom($, 'startup');
  expect(roleLines(debug)).toEqual([
    expect.stringMatching(
      /^sidekick role: reading the kept fork failed: .*refused by a plugin above$/,
    ),
    'sidekick role: other',
  ]);
});

// Without its markers, the second start would settle as other.
test('a second session.start in the same load keeps the role the first settled', async ($, on) => {
  const world: World = {
    env: { CLAUDE_JOB_DIR: JOB_DIR },
    flag: { env: { SIDEKICK_MAIN: MAIN } },
    isRefusing: false,
  };
  const debug = answerBeneath(on, world);
  await startedFrom($, 'startup');
  world.flag = {};
  await $.session.start(START);
  expect(roleLines(debug)).toEqual([
    'sidekick role: worker of Single word reply',
    'sidekick role: worker of Single word reply',
  ]);
});
