import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { envWithoutRepoVars } from './git-env.js';
import type { LoopEnv } from './loop.js';
import { runStart, START_USAGE_LINE } from './loop-start.js';
import { configDirIssue } from './loop-start-prepare.js';
import { type LoopState, readState, writeArmed } from './loop-state.js';
import type { Runner } from './pm-data.js';
import { LAUNCH_TIMEOUT_MS } from './profile.js';
import type { ClaudeResult, ClaudeRunner } from './profile-launch.js';

// The operator's git config and this worktree's repo variables stay out of the fixtures.
const GIT_ENV = {
  ...envWithoutRepoVars(process.env),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

const git = (cwd: string, ...args: string[]): string => {
  const r = spawnSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date(2026, 10, 15, 10, 20);
const BOOT = new Date(NOW.getTime() - 2 * HOUR_MS);
const WAIT = { armWaitMs: 300, pollMs: 100 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OTHER_PID = 999;
const LOOP_PID = 7;
const UNARMED_WARNING =
  'fixer: job job-1 runs, but start cannot show its cron jobs alive: no current armed.json shows them, or the machine booted since start launched or respawned it. So it may never tick. Stop it with claude stop job-1, then run sidekick loop start fixer, which launches it fresh.';

type Verb = 'bg' | 'stop' | 'rm' | 'respawn';
type Call = { kind: string; args: string[]; cwd: string; timeoutMs: number };

let tmp: string;
let home: string;
let config: string;
let repo: string;
let elsewhere: string;
let managed: string;
let events: string[];
let calls: Call[];
let rows: Record<string, unknown>[];
let listingReply: ClaudeResult | undefined;
let onListing: () => void;
let reply: Partial<Record<Verb, (args: string[]) => ClaudeResult>>;
let bgCount: number;
let atBg: (LoopState | undefined)[];
let alive: Set<number>;
let clock: Date;
let onSleep: () => void;
let gitFails: (args: string[]) => boolean;

const result = (over: Partial<ClaudeResult> = {}): ClaudeResult => ({
  code: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  ...over,
});

// `doctor`'s report for clean settings: the canary key alone.
const doctorPasses = (args: string[]): ClaudeResult => {
  const file = args[args.indexOf('--settings') + 1];
  const key = Object.keys(JSON.parse(fs.readFileSync(file, 'utf-8'))).find(
    (k) => k === 'feedbackSurveyRate' || k === 'cleanupPeriodDays',
  );
  return result({
    stdout: `Invalid settings\n- ${file} › ${key}: Expected number, but received string\n\n`,
  });
};

const loopsRoot = (): string => path.join(config, 'sidekick', 'loops');
const sidekick = (): string => path.join(config, 'sidekick');
const loopDir = (name = 'fixer'): string => path.join(loopsRoot(), name);
const lockFile = (name = 'fixer'): string =>
  path.join(loopDir(name), 'start.lock');

const stateOf = (name = 'fixer'): LoopState | undefined => {
  const read = readState(loopDir(name));
  if (read.kind === 'broken') throw new Error(read.issue);
  return read.kind === 'ok' ? read.value : undefined;
};

const loopOfBg = (args: string[]): string =>
  args[args.indexOf('-n') + 1].replace(/^loop-/, '');

function kindOf(args: string[]): string {
  if (args[0] === 'agents') return 'agents';
  if (args.at(-1) === 'doctor') return 'doctor';
  if (args.at(-3) === 'plugin' && args.at(-2) === 'list') return 'plugin list';
  if (args.includes('--bg')) return `bg ${loopOfBg(args)}`;
  return args.join(' ');
}

const DEFAULTS: Record<Verb, (args: string[]) => ClaudeResult> = {
  bg: (args) => {
    bgCount += 1;
    return result({
      stdout: `backgrounded · job-${bgCount} · loop-${loopOfBg(args)}\n`,
    });
  },
  stop: (args) => {
    const pid = rows.find((r) => r.id === args[1])?.pid;
    if (typeof pid === 'number') alive.delete(pid);
    return result();
  },
  rm: (args) => result({ stdout: `removed ${args[1]}\n` }),
  respawn: () => result(),
};

const verbOf = (args: string[]): Verb | undefined => {
  if (args.includes('--bg')) return 'bg';
  const [first] = args;
  return first === 'stop' || first === 'rm' || first === 'respawn'
    ? first
    : undefined;
};

const fakeClaude: ClaudeRunner = (args, opts) => {
  const kind = kindOf(args);
  calls.push({ kind, args, cwd: opts.cwd, timeoutMs: opts.timeoutMs });
  events.push(`claude ${kind}`);
  if (kind === 'agents') {
    onListing();
    return listingReply ?? result({ stdout: JSON.stringify(rows) });
  }
  if (kind === 'doctor') return doctorPasses(args);
  if (kind === 'plugin list') return result({ stdout: '[]' });
  const verb = verbOf(args);
  if (verb === undefined) {
    throw new Error(`start runs no such claude call: ${args.join(' ')}`);
  }
  if (verb === 'bg') atBg.push(stateOf(loopOfBg(args)));
  return (reply[verb] ?? DEFAULTS[verb])(args);
};

const testGit: Runner = (cmd, args, cwd) => {
  events.push(`git ${args[0]}`);
  if (gitFails(args)) {
    return { code: 1, stdout: '', stderr: 'refused by the test' };
  }
  const r = spawnSync(cmd, args, { cwd, env: GIT_ENV, encoding: 'utf8' });
  return {
    code: r.status ?? 1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
};

// The loop's own arm: an armed.json for the launch its state.json records.
const armFor = (name: string): void => {
  const state = stateOf(name);
  if (state === undefined) return;
  writeArmed(loopDir(name), {
    v: 1,
    launch: state.launch,
    at: clock.toISOString(),
    tick: 'tick-1',
    renewal: 'renewal-1',
    renewalAt: new Date(clock.getTime() + 24 * HOUR_MS).toISOString(),
  });
};

const armEvery = (): void => {
  for (const name of fs.readdirSync(loopsRoot())) armFor(name);
};

beforeEach(() => {
  tmp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sk-loop-start-')),
  );
  home = path.join(tmp, 'home');
  config = path.join(home, '.claude');
  repo = path.join(tmp, 'repo');
  elsewhere = path.join(tmp, 'elsewhere');
  managed = path.join(tmp, 'managed-settings.json');
  fs.mkdirSync(config, { recursive: true });
  for (const dir of [repo, elsewhere]) {
    fs.mkdirSync(dir);
    git(dir, 'init', '--quiet');
    git(dir, 'commit', '--quiet', '--allow-empty', '-m', 'first');
  }
  events = [];
  calls = [];
  rows = [];
  listingReply = undefined;
  onListing = () => {};
  reply = {};
  bgCount = 0;
  atBg = [];
  alive = new Set();
  clock = NOW;
  onSleep = armEvery;
  gitFails = () => false;
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const lenvOf = (over: Partial<LoopEnv> = {}): LoopEnv => ({
  env: {},
  cwd: elsewhere,
  home,
  workTree: { kind: 'outside' },
  tmpdir: tmp,
  runClaude: fakeClaude,
  runGit: testGit,
  write: () => {},
  now: () => clock,
  bootTime: () => BOOT,
  managedFile: managed,
  sleep: (ms) => {
    events.push(`sleep ${ms}`);
    onSleep();
  },
  isAlive: (pid) => alive.has(pid),
  pid: 4321,
  ...over,
});

// `null` passes no options, so runStart's own defaults apply.
const run = (
  args: string[],
  over: Partial<LoopEnv> = {},
  opts: { armWaitMs?: number; pollMs?: number } | null = WAIT,
) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = runStart(
    args,
    lenvOf(over),
    (line) => {
      out.push(line);
      events.push(`out ${line}`);
    },
    (line) => {
      err.push(line);
      events.push(`err ${line}`);
    },
    opts ?? undefined,
  );
  return { code, out, err };
};

const write = (file: string, content: string): string => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
};
const writeJson = (file: string, value: unknown): string =>
  write(file, `${JSON.stringify(value, null, 2)}\n`);

type Manifest = ReturnType<typeof validLoop>;
const validLoop = () => ({
  description: 'Fix bugs filed in the repo',
  repo,
  profile: 'fixer',
  schedule: '7 * * * *',
  tick: '/fixer:tick',
  hosts: ['registry.npmjs.org'],
  gates: ['bun run test'],
  caps: {
    attemptsPerUnit: 2,
    workMinutesPerUnit: 180,
    unitsPerDay: 4,
    failedUnitsInARow: 3,
  },
  mandate: {
    reads: ['Bash(gh issue view *)'],
    classes: {
      triage: {
        state: 'record',
        allow: ['Bash(gh issue edit * --add-label *)'],
      },
      label: { state: 'act', allow: ['Bash(gh label list *)'] },
    },
    never: ['Bash(git push --force *)'],
  },
});

const writeLoop = (
  name = 'fixer',
  edit: (m: Manifest) => void = () => {},
): string => {
  const m = validLoop();
  edit(m);
  return writeJson(path.join(loopDir(name), 'loop.json'), m);
};

const pause = (m: Manifest): void => {
  Object.assign(m, { paused: true });
};

const reschedule = (m: Manifest): void => {
  m.schedule = '9 * * * *';
};

const writeProfile = (): string => {
  const dir = path.join(sidekick(), 'profiles', 'fixer');
  writeJson(path.join(dir, 'profile.json'), { description: 'd' });
  return dir;
};

const live = (job: string, over: Record<string, unknown> = {}) => {
  alive.add(LOOP_PID);
  return {
    id: job,
    kind: 'bg',
    name: 'loop-fixer',
    pid: LOOP_PID,
    status: 'idle',
    ...over,
  };
};

const stopped = (job: string) => ({ id: job, kind: 'bg', name: 'loop-fixer' });

const forget = (): void => {
  events = [];
  calls = [];
  atBg = [];
};

// Launches `name` fresh, arms it, and forgets the calls, so a test reads only its own run.
const launchOnce = (name = 'fixer'): LoopState => {
  writeLoop(name);
  writeProfile();
  const r = run([name]);
  const state = stateOf(name);
  if (r.code !== 0 || state === undefined) throw new Error(r.err.join('\n'));
  forget();
  return state;
};

// The calls that act on a session, in order.
const acted = (): string[] =>
  calls.map((c) => c.kind).filter((k) => /^(bg|stop|rm|respawn) /.test(k));

const sleeps = (): string[] => events.filter((e) => e.startsWith('sleep '));

const commits = (): number =>
  Number(git(sidekick(), 'rev-list', '--count', 'HEAD'));

const lastSubject = (): string => git(sidekick(), 'log', '-1', '--format=%s');

describe('runStart: usage', () => {
  test('the usage line names a loop or --all, and the two flags', () => {
    expect(START_USAGE_LINE).toBe(
      'sidekick loop start (<name> | --all) [--record] [--now]',
    );
  });

  test.each([
    ['no name', []],
    ['a name with --all', ['a', '--all']],
    ['two names', ['a', 'b']],
    ['--plugin-dir', ['--plugin-dir', '/x', 'fixer']],
    ['an unknown flag', ['fixer', '--bogus']],
  ])('%s prints the usage and returns 1', (_label, args) => {
    expect(run(args)).toEqual({
      code: 1,
      out: [],
      err: [`usage: ${START_USAGE_LINE}`],
    });
    expect(calls).toEqual([]);
  });
});

describe('runStart: what refuses before a loop is prepared', () => {
  test('a relative CLAUDE_CONFIG_DIR refuses before any claude call', () => {
    const env = { CLAUDE_CONFIG_DIR: 'cfg' };
    expect(run(['--all'], { env })).toEqual({
      code: 1,
      out: [],
      err: [configDirIssue(env) ?? 'configDirIssue gave no issue'],
    });
    expect(calls).toEqual([]);
  });

  test.each([
    [
      'fails',
      result({ code: 1, stderr: 'daemon down' }),
      ['claude agents --json --all failed with exit code 1.', 'daemon down'],
    ],
    [
      'times out',
      result({ code: 1, timedOut: true }),
      ['claude agents --json --all did not return in time.'],
    ],
  ])('a listing that %s refuses every loop and runs no other claude call', (_label, listing, lines) => {
    writeLoop('alpha');
    writeLoop('beta');
    writeProfile();
    listingReply = listing;
    expect(run(['--all'])).toEqual({
      code: 1,
      out: ['alpha: refused', 'beta: refused'],
      err: [
        ...lines,
        'start cannot tell a running loop from a stopped one without the listing, so it changed no loop.',
      ],
    });
    expect(calls.map((c) => c.kind)).toEqual(['agents']);
    expect(stateOf('alpha')).toBeUndefined();
  });

  test('a lock another live start holds refuses that loop, naming the pid', () => {
    writeLoop();
    writeProfile();
    const theirs = JSON.stringify({ pid: OTHER_PID, at: NOW.toISOString() });
    write(lockFile(), theirs);
    alive.add(OTHER_PID);
    expect(run(['fixer'])).toEqual({
      code: 1,
      out: ['fixer: refused'],
      err: [
        `fixer: ${lockFile()}: another start holds the lock (pid ${OTHER_PID}); if no start is running, delete the file, then run start again`,
      ],
    });
    expect(calls).toEqual([]);
    expect(fs.readFileSync(lockFile(), 'utf-8')).toBe(theirs);
  });

  test('a lock taken before the boot is taken over, though its pid runs again', () => {
    writeLoop();
    writeProfile();
    const before = new Date(BOOT.getTime() - HOUR_MS).toISOString();
    write(lockFile(), JSON.stringify({ pid: OTHER_PID, at: before }));
    alive.add(OTHER_PID);
    const r = run(['fixer']);
    expect(r.code).toBe(0);
    expect(acted()).toEqual(['bg fixer']);
    expect(fs.existsSync(lockFile())).toBe(false);
  });

  test('a loop with no folder refuses with the check, and leaves no folder or lock behind', () => {
    const r = run(['nope']);
    expect(r.code).toBe(1);
    expect(r.out).toEqual(['nope: refused']);
    expect(r.err[0]).toStartWith(
      `nope: ${path.join(loopDir('nope'), 'loop.json')}: `,
    );
    expect(calls).toEqual([]);
    expect(fs.existsSync(loopDir('nope'))).toBe(false);
  });

  test('a name that breaks the name rule refuses before any read or claude call', () => {
    const r = run(['../escape']);
    expect(r.code).toBe(1);
    expect(r.err[0]).toContain('"../escape" is not a loop name');
    expect(calls).toEqual([]);
    expect(fs.existsSync(path.join(sidekick(), 'escape'))).toBe(false);
  });

  test('a name that resolves to a folder outside the store takes no lock there', () => {
    writeLoop();
    const theirs = path.join(sidekick(), 'start.lock');
    write(theirs, JSON.stringify({ pid: OTHER_PID, at: NOW.toISOString() }));
    alive.add(OTHER_PID);
    const r = run(['..']);
    expect(r.code).toBe(1);
    expect(r.err).toHaveLength(1);
    expect(r.err[0]).toContain('".." is not a loop name');
  });
});

describe('runStart: a fresh launch', () => {
  test('writes state.json with job null before the --bg call, then with the job id', () => {
    writeLoop();
    writeProfile();
    expect(run(['fixer']).code).toBe(0);
    const after = stateOf();
    expect(atBg).toEqual([
      after === undefined ? undefined : { ...after, job: null },
    ]);
    expect(after).toMatchObject({
      v: 1,
      job: 'job-1',
      session: 'loop-fixer',
      launchedAt: NOW.toISOString(),
      startedAt: NOW.toISOString(),
      record: false,
      states: { triage: 'record', label: 'act' },
      schedule: '7 * * * *',
      tick: '/fixer:tick',
    });
    expect(after?.launch).toMatch(UUID);
    expect(after?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('--record writes every class as record', () => {
    writeLoop();
    writeProfile();
    expect(run(['fixer', '--record']).code).toBe(0);
    expect(stateOf()).toMatchObject({
      record: true,
      states: { triage: 'record', label: 'record' },
    });
  });

  test("runs --bg from the loop's repo within the launch limit, after the inherited listing", () => {
    writeLoop();
    writeProfile();
    const r = run(['fixer']);
    const bg = calls.find((c) => c.kind === 'bg fixer');
    expect(bg?.cwd).toBe(repo);
    expect(bg?.timeoutMs).toBe(LAUNCH_TIMEOUT_MS);
    expect(bg?.args.at(-1)).toBe('/sidekick:loop-arm fixer');
    const header = events.indexOf('out fixer: inherited beyond the mandate:');
    expect(header).toBeGreaterThan(-1);
    expect(header).toBeLessThan(events.indexOf('claude bg fixer'));
    expect(r.out).toContain('  Allow rules');
    expect(r.out.at(-1)).toBe('fixer: launched job-1 (new), armed');
  });

  test('"Workspace not trusted" refuses the loop, names claude in the repo as the fix, removes state.json, and keeps the commit', () => {
    writeLoop();
    writeProfile();
    const said = `Workspace not trusted. Run \`claude\` in ${repo} once and accept the trust prompt, then retry.`;
    reply.bg = () => result({ code: 1, stderr: `${said}\n` });
    const r = run(['fixer']);
    expect(r.code).toBe(1);
    expect(r.err).toEqual([
      'fixer: claude --bg failed with exit code 1, so the loop did not start:',
      `fixer: ${said}`,
      `fixer: Claude Code does not trust ${repo} as a workspace. Run claude in ${repo} once and accept the trust prompt, then run sidekick loop start fixer again.`,
    ]);
    expect(r.out.at(-1)).toBe('fixer: failed');
    expect(stateOf()).toBeUndefined();
    expect(lastSubject()).toStartWith('loop start: fixer launch ');
    expect(sleeps()).toEqual([]);
  });

  test('a failed --bg after a relaunch removes the state.json the old launch wrote', () => {
    launchOnce();
    writeLoop('fixer', reschedule);
    rows = [live('job-1')];
    reply.bg = () => result({ code: 2, stderr: 'broke' });
    const r = run(['fixer']);
    expect(r.code).toBe(1);
    expect(acted()).toEqual(['stop job-1', 'rm job-1', 'bg fixer']);
    expect(stateOf()).toBeUndefined();
  });

  test('a --bg that times out keeps state.json with job null, and fails the loop', () => {
    writeLoop();
    writeProfile();
    reply.bg = () => result({ code: 1, timedOut: true });
    const r = run(['fixer']);
    expect(r.code).toBe(1);
    expect(r.err).toEqual([
      'fixer: claude --bg did not return in time, so start cannot tell whether the loop started',
      'fixer: state.json keeps job null, so the next start finds the session by its name if it started.',
    ]);
    expect(stateOf()?.job).toBeNull();
    expect(r.out.at(-1)).toBe('fixer: failed');
  });

  test('exit 0 with no backgrounded line keeps job null and warns', () => {
    writeLoop();
    writeProfile();
    reply.bg = () => result({ stdout: 'started\n' });
    const r = run(['fixer']);
    expect(r.code).toBe(0);
    expect(stateOf()?.job).toBeNull();
    expect(r.err).toEqual([
      'fixer: claude --bg printed no backgrounded line for loop-fixer, so state.json keeps job null; the next start finds the session by its name.',
    ]);
    expect(r.out.at(-1)).toBe('fixer: launched with no job id (new), armed');
  });
});

describe('runStart: the commit', () => {
  test('makes the sidekick folder a repo, then commits it before the --bg call, naming the loop, the action, and the hash', () => {
    writeLoop();
    writeProfile();
    run(['fixer']);
    const init = events.indexOf('git init');
    const commit = events.indexOf('git commit');
    expect(init).toBeGreaterThan(-1);
    expect(init).toBeLessThan(commit);
    expect(commit).toBeLessThan(events.indexOf('claude bg fixer'));
    const hash = stateOf()?.hash ?? '';
    expect(lastSubject()).toBe(`loop start: fixer launch ${hash.slice(0, 12)}`);
  });

  test('one commit names every loop that acts', () => {
    writeLoop('alpha');
    writeLoop('beta');
    writeProfile();
    run(['--all']);
    const a = (stateOf('alpha')?.hash ?? '').slice(0, 12);
    const b = (stateOf('beta')?.hash ?? '').slice(0, 12);
    expect(lastSubject()).toBe(
      `loop start: alpha launch ${a}, beta launch ${b}`,
    );
    expect(events.filter((e) => e === 'git commit')).toHaveLength(1);
  });

  test('a failed commit warns, and the launch goes on', () => {
    writeLoop();
    writeProfile();
    gitFails = (args) => args[0] === 'commit';
    const r = run(['fixer']);
    expect(r.code).toBe(0);
    expect(r.err).toContain(
      `git could not commit the sidekick folder ${sidekick()}, so its history lacks this start; the loops start anyway.`,
    );
    expect(acted()).toEqual(['bg fixer']);
  });
});

describe('runStart: a loop that runs', () => {
  test('an unchanged live loop is left: one line, and no inherited listing, commit, or launch', () => {
    launchOnce();
    rows = [live('job-1')];
    const before = commits();
    expect(run(['fixer'])).toEqual({
      code: 0,
      out: ['fixer: left job-1 (unchanged), armed'],
      err: [],
    });
    expect(acted()).toEqual([]);
    expect(commits()).toBe(before);
  });

  test('a live loop that is not armed is left with a warning naming claude stop, then start', () => {
    launchOnce();
    fs.rmSync(path.join(loopDir(), 'armed.json'));
    rows = [live('job-1')];
    expect(run(['fixer'])).toEqual({
      code: 0,
      out: ['fixer: left job-1 (unchanged), not armed'],
      err: [UNARMED_WARNING],
    });
  });

  test('a live loop started before the boot is left, not armed, though its arm is current', () => {
    launchOnce();
    clock = new Date(NOW.getTime() + 2 * HOUR_MS);
    rows = [live('job-1')];
    const r = run(['fixer'], {
      bootTime: () => new Date(NOW.getTime() + HOUR_MS),
    });
    expect(r).toEqual({
      code: 0,
      out: ['fixer: left job-1 (unchanged), not armed'],
      err: [UNARMED_WARNING],
    });
    expect(acted()).toEqual([]);
  });

  test('a changed live loop between ticks is relaunched: stop, rm, then --bg', () => {
    const first = launchOnce();
    writeLoop('fixer', reschedule);
    rows = [live('job-1')];
    const r = run(['fixer']);
    expect(r.code).toBe(0);
    expect(acted()).toEqual(['stop job-1', 'rm job-1', 'bg fixer']);
    expect(r.out.at(-1)).toBe(
      'fixer: relaunched job-2 in place of job-1 (definition changed), armed',
    );
    const after = stateOf();
    expect(after).toMatchObject({ job: 'job-2', schedule: '9 * * * *' });
    expect(after?.launch).not.toBe(first.launch);
  });

  test('the relaunch waits for the stopped process to exit before claude rm', () => {
    launchOnce();
    writeLoop('fixer', reschedule);
    rows = [live('job-1')];
    reply.stop = () => result();
    onSleep = () => {
      alive.delete(LOOP_PID);
      armEvery();
    };
    expect(run(['fixer']).code).toBe(0);
    const stop = events.indexOf('claude stop job-1');
    const wait = events.indexOf('sleep 250');
    expect(stop).toBeLessThan(wait);
    expect(wait).toBeLessThan(events.indexOf('claude rm job-1'));
  });

  test('a stopped process that outlives the wait refuses, and leaves the row and state.json as they were', () => {
    const first = launchOnce();
    writeLoop('fixer', reschedule);
    rows = [live('job-1')];
    reply.stop = () => result();
    const r = run(['fixer']);
    expect(r.code).toBe(1);
    expect(acted()).toEqual(['stop job-1']);
    expect(r.err).toContain(
      `fixer: job job-1's process, pid ${LOOP_PID}, still runs 15 s after claude stop, so start removed nothing and launched nothing. Run start again once it exits.`,
    );
    expect(stateOf()).toEqual(first);
    expect(r.out.at(-1)).toBe('fixer: failed');
  });

  test('a changed busy loop refuses, naming --now, and --now relaunches it', () => {
    launchOnce();
    writeLoop('fixer', reschedule);
    rows = [live('job-1', { status: 'busy' })];
    const r = run(['fixer']);
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      'fixer: Run start again between ticks, or add --now to relaunch it at once.',
    );
    expect(r.out).toEqual(['fixer: refused']);
    expect(acted()).toEqual([]);
    forget();
    expect(run(['fixer', '--now']).code).toBe(0);
    expect(acted()).toEqual(['stop job-1', 'rm job-1', 'bg fixer']);
  });

  test('a changed stopped loop runs claude rm, then a fresh launch', () => {
    launchOnce();
    writeLoop('fixer', reschedule);
    rows = [stopped('job-1')];
    const r = run(['fixer']);
    expect(r.code).toBe(0);
    expect(acted()).toEqual(['rm job-1', 'bg fixer']);
    expect(r.out.at(-1)).toBe(
      'fixer: launched job-2 in place of job-1 (definition changed), armed',
    );
  });

  test('claude rm that does not say removed refuses, prints its output, and never discards', () => {
    const first = launchOnce();
    writeLoop('fixer', reschedule);
    rows = [stopped('job-1')];
    const kept = `kept job-1: its worktree has commits no remote holds. To discard them, run claude rm job-1 --discard-unpushed ${'a'.repeat(40)}@abc123`;
    reply.rm = () => result({ stdout: `${kept}\n` });
    const r = run(['fixer']);
    expect(r.code).toBe(1);
    expect(r.err).toEqual([
      'fixer: claude rm job-1 did not say it removed the job, so start launched nothing:',
      `fixer: ${kept}`,
      "fixer: start never discards a job's work. Read what claude rm printed, settle job job-1 by hand, then run start again.",
    ]);
    expect(acted()).toEqual(['rm job-1']);
    expect(calls.some((c) => c.args.includes('--discard-unpushed'))).toBe(
      false,
    );
    expect(stateOf()).toEqual(first);
  });

  test('claude rm runs within a long limit, and one that times out refuses like a failed one', () => {
    launchOnce();
    writeLoop('fixer', reschedule);
    rows = [stopped('job-1')];
    reply.rm = () => result({ code: 1, timedOut: true });
    const r = run(['fixer']);
    expect(r.code).toBe(1);
    expect(r.err[0]).toBe(
      'fixer: claude rm job-1 did not return in time, so start launched nothing',
    );
    expect(calls.find((c) => c.kind === 'rm job-1')?.timeoutMs).toBe(180_000);
    expect(acted()).toEqual(['rm job-1']);
  });

  test('a stopped loop whose jobs are alive is respawned, and only its startedAt changes', () => {
    const first = launchOnce();
    clock = new Date(NOW.getTime() + HOUR_MS);
    rows = [stopped('job-1')];
    const r = run(['fixer']);
    expect(r.code).toBe(0);
    expect(acted()).toEqual(['respawn job-1']);
    expect(stateOf()).toEqual({ ...first, startedAt: clock.toISOString() });
    expect(r.out.at(-1)).toBe(
      'fixer: respawned job-1 (stopped, cron jobs alive), armed',
    );
    expect(sleeps()).toEqual([]);
  });

  test('a failed respawn fails the loop, naming claude rm, then start, as the way out', () => {
    const first = launchOnce();
    clock = new Date(NOW.getTime() + HOUR_MS);
    rows = [stopped('job-1')];
    reply.respawn = () => result({ code: 1, stderr: 'no such job' });
    const r = run(['fixer']);
    expect(r.code).toBe(1);
    expect(r.err).toEqual([
      'fixer: claude respawn job-1 failed with exit code 1, so the loop may not run:',
      'fixer: no such job',
      'fixer: To launch the loop fresh instead, run claude rm job-1, then sidekick loop start fixer.',
    ]);
    expect(r.out.at(-1)).toBe('fixer: failed');
    expect(stateOf()).toEqual(first);
  });
});

describe('runStart: a paused loop', () => {
  test('a live one between ticks is stopped with claude stop alone, and its state.json records the pause', () => {
    const first = launchOnce();
    writeLoop('fixer', pause);
    rows = [live('job-1')];
    expect(run(['fixer'])).toEqual({
      code: 0,
      out: ['fixer: stopped job job-1', 'fixer: paused'],
      err: [],
    });
    expect(acted()).toEqual(['stop job-1']);
    expect(calls.find((c) => c.kind === 'stop job-1')?.cwd).toBe(repo);
    expect(stateOf()).toEqual({ ...first, pausedAt: NOW.toISOString() });
    expect(lastSubject()).toBe('loop start: fixer pause');
  });

  test('one already off records the pause once, and a later start keeps its time', () => {
    const first = launchOnce();
    writeLoop('fixer', pause);
    rows = [stopped('job-1')];
    expect(run(['fixer']).out).toEqual(['fixer: paused']);
    expect(stateOf()).toEqual({ ...first, pausedAt: NOW.toISOString() });
    clock = new Date(NOW.getTime() + HOUR_MS);
    expect(run(['fixer']).code).toBe(0);
    expect(stateOf()?.pausedAt).toBe(NOW.toISOString());
    expect(acted()).toEqual([]);
  });

  test.each([
    ['deleting the paused line', () => writeLoop()],
    [
      'setting paused to false',
      () => writeLoop('fixer', (m) => Object.assign(m, { paused: false })),
    ],
  ])('unpausing by %s removes the stopped row and launches fresh, without pausedAt', (_how, unpause) => {
    const first = launchOnce();
    writeLoop('fixer', pause);
    rows = [live('job-1')];
    expect(run(['fixer']).code).toBe(0);
    forget();
    unpause();
    rows = [stopped('job-1')];
    const r = run(['fixer']);
    expect(r.code).toBe(0);
    expect(acted()).toEqual(['rm job-1', 'bg fixer']);
    expect(r.out.at(-1)).toBe(
      'fixer: launched job-2 in place of job-1 (unpaused), armed',
    );
    const after = stateOf();
    expect(after?.pausedAt).toBeUndefined();
    expect(after?.launch).not.toBe(first.launch);
  });

  test('a pause taken with --now, then lifted, launches fresh', () => {
    launchOnce();
    writeLoop('fixer', pause);
    rows = [live('job-1', { status: 'busy' })];
    expect(run(['fixer', '--now']).code).toBe(0);
    expect(acted()).toEqual(['stop job-1']);
    expect(stateOf()?.pausedAt).toBe(NOW.toISOString());
    forget();
    writeLoop();
    rows = [stopped('job-1')];
    const r = run(['fixer']);
    expect(r.code).toBe(0);
    expect(acted()).toEqual(['rm job-1', 'bg fixer']);
    expect(r.out.at(-1)).toBe(
      'fixer: launched job-2 in place of job-1 (unpaused), armed',
    );
    expect(stateOf()?.pausedAt).toBeUndefined();
  });

  test("one whose repo is gone runs claude stop from start's own folder", () => {
    launchOnce();
    writeLoop('fixer', pause);
    rows = [live('job-1')];
    fs.rmSync(repo, { recursive: true, force: true });
    expect(run(['fixer']).code).toBe(0);
    expect(calls.find((c) => c.kind === 'stop job-1')?.cwd).toBe(elsewhere);
  });

  test('one already off prints paused, exits 0, and runs no claude call but the listing', () => {
    writeLoop('fixer', (m) => {
      pause(m);
      m.profile = 'gone';
    });
    expect(run(['fixer'])).toEqual({
      code: 0,
      out: ['fixer: paused'],
      err: [],
    });
    expect(calls.map((c) => c.kind)).toEqual(['agents']);
  });

  test('a busy one refuses without --now, naming --now, and exits 1', () => {
    launchOnce();
    writeLoop('fixer', pause);
    rows = [live('job-1', { status: 'busy' })];
    const r = run(['fixer']);
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      'fixer: Run start again between ticks, or add --now to stop it at once.',
    );
    expect(r.out).toEqual(['fixer: refused']);
    expect(acted()).toEqual([]);
  });

  test('a failed claude stop exits 1', () => {
    launchOnce();
    writeLoop('fixer', pause);
    rows = [live('job-1')];
    reply.stop = () => result({ code: 1, stderr: 'no daemon' });
    const r = run(['fixer']);
    expect(r.code).toBe(1);
    expect(r.err).toEqual([
      'fixer: claude stop job-1 failed with exit code 1, so its session may still run:',
      'fixer: no daemon',
    ]);
    expect(r.out).toEqual(['fixer: failed']);
  });
});

describe('runStart: the wait for the arm', () => {
  test('an armed.json for the new launch, written between polls, prints armed', () => {
    writeLoop();
    writeProfile();
    const r = run(['fixer']);
    expect(sleeps()).toEqual(['sleep 100']);
    expect(r.out.at(-1)).toBe('fixer: launched job-1 (new), armed');
  });

  test('an armed.json for another launch does not count', () => {
    writeLoop();
    writeProfile();
    onSleep = () => {
      writeArmed(loopDir(), {
        v: 1,
        launch: 'an-old-launch',
        at: clock.toISOString(),
        tick: 'tick-1',
        renewal: 'renewal-1',
        renewalAt: new Date(clock.getTime() + HOUR_MS).toISOString(),
      });
    };
    expect(run(['fixer']).out.at(-1)).toBe(
      'fixer: launched job-1 (new), not armed',
    );
  });

  test('no arm within armWaitMs warns, naming claude logs <job>', () => {
    onSleep = () => {};
    writeLoop();
    writeProfile();
    const r = run(['fixer']);
    expect(r.code).toBe(0);
    expect(r.err).toEqual([
      "fixer: no armed.json for this launch after 0.3 s, so its cron jobs may not exist; read the session's output with claude logs job-1",
    ]);
    expect(r.out.at(-1)).toBe('fixer: launched job-1 (new), not armed');
    expect(sleeps()).toEqual(['sleep 100', 'sleep 100', 'sleep 100']);
  });

  test('the wait defaults to 90 s, polled every 2 s', () => {
    onSleep = () => {};
    writeLoop();
    writeProfile();
    run(['fixer'], {}, null);
    expect(sleeps()).toEqual(Array(45).fill('sleep 2000'));
  });

  test('under --all, every launch runs before the first poll', () => {
    writeLoop('alpha');
    writeLoop('beta');
    writeProfile();
    const r = run(['--all']);
    const firstPoll = events.findIndex((e) => e.startsWith('sleep '));
    expect(events.indexOf('claude bg alpha')).toBeLessThan(firstPoll);
    expect(events.indexOf('claude bg beta')).toBeLessThan(firstPoll);
    expect(r.out.slice(-2)).toEqual([
      'alpha: launched job-1 (new), armed',
      'beta: launched job-2 (new), armed',
    ]);
  });
});

describe('runStart: --all', () => {
  test("one loop's refusal leaves the others running, and the exit is 1", () => {
    writeLoop('alpha');
    writeLoop('beta', (m) => {
      m.profile = 'gone';
    });
    writeProfile();
    const r = run(['--all']);
    expect(r.code).toBe(1);
    expect(acted()).toEqual(['bg alpha']);
    expect(r.out.slice(-2)).toEqual([
      'alpha: launched job-1 (new), armed',
      'beta: refused',
    ]);
    expect(r.err.some((line) => line.startsWith('beta: '))).toBe(true);
  });

  test('an empty store prints one line and exits 0', () => {
    expect(run(['--all'])).toEqual({
      code: 0,
      out: [`the loop store ${loopsRoot()} holds no loop`],
      err: [],
    });
    expect(calls).toEqual([]);
  });

  test('a paused loop prints paused and never sets exit 1', () => {
    writeLoop('alpha', pause);
    writeLoop('beta');
    writeProfile();
    const r = run(['--all']);
    expect(r.code).toBe(0);
    expect(r.out.slice(-2)).toEqual([
      'alpha: paused',
      'beta: launched job-1 (new), armed',
    ]);
  });
});

describe('runStart: the lock', () => {
  test('is released after a launch', () => {
    launchOnce();
    expect(fs.existsSync(lockFile())).toBe(false);
  });

  test('is released after a refusal', () => {
    writeLoop('fixer', (m) => {
      m.profile = 'gone';
    });
    expect(run(['fixer']).code).toBe(1);
    expect(fs.existsSync(lockFile())).toBe(false);
  });

  test('is released when a claude call throws', () => {
    writeLoop();
    writeProfile();
    reply.bg = () => {
      throw new Error('boom');
    };
    expect(() => run(['fixer'])).toThrow('boom');
    expect(fs.existsSync(lockFile())).toBe(false);
  });

  test('is held from the preparation to the last write', () => {
    writeLoop();
    writeProfile();
    const held: boolean[] = [];
    reply.bg = (args) => {
      held.push(fs.existsSync(lockFile()));
      return DEFAULTS.bg(args);
    };
    onSleep = () => {
      held.push(fs.existsSync(lockFile()));
      armEvery();
    };
    onListing = () => {
      held.push(fs.existsSync(lockFile()));
    };
    run(['fixer']);
    expect(held).toEqual([true, true, false]);
  });

  test('is released when the listing throws, before any loop acts', () => {
    writeLoop();
    writeProfile();
    onListing = () => {
      throw new Error('listing broke');
    };
    expect(() => run(['fixer'])).toThrow('listing broke');
    expect(fs.existsSync(lockFile())).toBe(false);
  });
});
