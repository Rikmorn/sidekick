import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { envWithoutRepoVars } from './git-env.js';
import type { LoopEnv } from './loop.js';
import { checkLoop } from './loop-check.js';
import { compileLoop } from './loop-compile.js';
import { type LoopManifest, readLoopManifest } from './loop-manifest.js';
import {
  configDirIssue,
  type Prepared,
  prepareLoop,
  type StartFlags,
} from './loop-start-prepare.js';
import {
  type LoopState,
  launchHash,
  readState,
  writeArmed,
  writeState,
} from './loop-state.js';
import { execRunner, type Runner } from './pm-data.js';
import {
  type ClaudeResult,
  type ClaudeRunner,
  SKIP_VARIABLE,
} from './profile-launch.js';
import { PROFILE_NAME_RULE } from './profile-manifest.js';
import type { Job } from './worker-jobs.js';

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

const git = (cwd: string, ...args: string[]): void => {
  const r = spawnSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
};

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date(2026, 10, 15, 10, 20);
const BOOT = new Date(NOW.getTime() - 2 * HOUR_MS);
const PLAIN: StartFlags = { record: false, now: false };
const LAUNCH_TAIL = [
  '--permission-mode',
  'dontAsk',
  '--worktree',
  'loop-fixer',
  '--bg',
  '-n',
  'loop-fixer',
  '--',
  '/sidekick:loop-arm fixer',
];

type Call = { args: string[]; cwd: string };

let tmp: string;
let home: string;
let config: string;
let repo: string;
let elsewhere: string;
let managed: string;
let calls: { claude: Call[]; git: Call[] };
let doctor: (args: string[]) => ClaudeResult;
let printed: string[];

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

const fakeClaude: ClaudeRunner = (args, opts) => {
  calls.claude.push({ args, cwd: opts.cwd });
  if (args.at(-1) === 'doctor') return doctor(args);
  if (args.at(-3) === 'plugin' && args.at(-2) === 'list') {
    return result({ stdout: '[]' });
  }
  throw new Error(`prepare runs no such claude call: ${args.join(' ')}`);
};

const recordingGit: Runner = (cmd, args, cwd, opts) => {
  calls.git.push({ args, cwd });
  return execRunner(cmd, args, cwd, opts);
};

beforeEach(() => {
  tmp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sk-loop-prepare-')),
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
  calls = { claude: [], git: [] };
  doctor = doctorPasses;
  printed = [];
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

// `cwd` is another repo, and `workTree` a wrong answer, so a result that follows them shows.
const lenvOf = (over: Partial<LoopEnv> = {}): LoopEnv => ({
  env: {},
  cwd: elsewhere,
  home,
  workTree: { kind: 'outside' },
  tmpdir: tmp,
  runClaude: fakeClaude,
  runGit: recordingGit,
  write: () => {},
  now: () => NOW,
  bootTime: () => BOOT,
  managedFile: managed,
  ...over,
});

const prepare = (
  opts: {
    name?: string;
    flags?: StartFlags;
    rows?: Job[];
    over?: Partial<LoopEnv>;
  } = {},
): Prepared =>
  prepareLoop(opts.name ?? 'fixer', opts.flags ?? PLAIN, {
    lenv: lenvOf(opts.over),
    rows: opts.rows ?? [],
    err: (line) => printed.push(line),
  });

const unexpected = (kind: string, prepared: Prepared): Error =>
  new Error(`expected ${kind}, got ${JSON.stringify(prepared)}`);

function readyOf(prepared: Prepared) {
  if (prepared.kind !== 'ready') throw unexpected('ready', prepared);
  return prepared;
}

function pausedOf(prepared: Prepared) {
  if (prepared.kind !== 'paused') throw unexpected('paused', prepared);
  return prepared;
}

function refusedOf(prepared: Prepared) {
  if (prepared.kind !== 'refused') throw unexpected('refused', prepared);
  return prepared;
}

const write = (file: string, content: string): string => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
};
const writeJson = (file: string, value: unknown): string =>
  write(file, `${JSON.stringify(value, null, 2)}\n`);

const loopDir = (name = 'fixer'): string =>
  path.join(config, 'sidekick', 'loops', name);
const loopFile = (name = 'fixer'): string =>
  path.join(loopDir(name), 'loop.json');
const userStore = (): string => path.join(config, 'sidekick', 'profiles');

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

const writeLoop = (edit: (m: Manifest) => void = () => {}): string => {
  const m = validLoop();
  edit(m);
  return writeJson(loopFile(), m);
};

const pause = (m: Manifest): void => {
  Object.assign(m, { paused: true });
};

const writeProfile = (
  manifest: Record<string, unknown> = { description: 'd' },
  root = userStore(),
): string => {
  const dir = path.join(root, 'fixer');
  writeJson(path.join(dir, 'profile.json'), manifest);
  return dir;
};

const manifestOf = (): LoopManifest => {
  const read = readLoopManifest(loopFile());
  if (!read.ok) throw new Error(read.issues.join('\n'));
  return read.manifest;
};

const settingsOf = (args: readonly string[]): unknown =>
  JSON.parse(args[args.indexOf('--settings') + 1]);

const row = (over: Partial<Job>): Job => ({
  id: undefined,
  kind: undefined,
  name: undefined,
  cwd: undefined,
  sessionId: undefined,
  state: undefined,
  status: undefined,
  pid: undefined,
  ...over,
});

const stateWith = (over: Partial<LoopState>): LoopState => ({
  v: 1,
  launch: 'launch-1',
  job: 'job-1',
  session: 'loop-fixer',
  launchedAt: new Date(NOW.getTime() - HOUR_MS).toISOString(),
  startedAt: new Date(NOW.getTime() - HOUR_MS).toISOString(),
  hash: 'h'.repeat(64),
  record: false,
  states: { triage: 'record', label: 'act' },
  schedule: '7 * * * *',
  tick: '/fixer:tick',
  ...over,
});

const armNow = (): void => {
  writeArmed(loopDir(), {
    v: 1,
    launch: 'launch-1',
    at: new Date(NOW.getTime() - HOUR_MS).toISOString(),
    tick: 'tick-1',
    renewal: 'renewal-1',
    renewalAt: new Date(NOW.getTime() + 24 * HOUR_MS).toISOString(),
  });
};

describe('configDirIssue', () => {
  test.each([
    'cfg',
    './cfg',
    '../cfg',
  ])('a relative CLAUDE_CONFIG_DIR "%s" refuses, naming the fix', (dir) => {
    expect(configDirIssue({ CLAUDE_CONFIG_DIR: dir })).toBe(
      `CLAUDE_CONFIG_DIR is the relative path "${dir}". A loop's own record and arm resolve it against the loop's worktree, so they would read another store than start writes. Set it to an absolute path, then run start again.`,
    );
  });

  test.each([
    ['absolute', { CLAUDE_CONFIG_DIR: '/abs/cfg' }],
    ['unset', {}],
    ['empty, which Claude Code reads as unset', { CLAUDE_CONFIG_DIR: '' }],
  ])('an %s CLAUDE_CONFIG_DIR gives undefined', (_label, env) => {
    expect(configDirIssue(env)).toBeUndefined();
  });
});

describe('prepareLoop: refusals', () => {
  test('a name that breaks the name rule refuses before reading anything', () => {
    const p = refusedOf(prepare({ name: 'Bad_Name' }));
    expect(p).toEqual({
      kind: 'refused',
      name: 'Bad_Name',
      lines: [
        `${loopDir('Bad_Name')}: "Bad_Name" is not a loop name: use ${PROFILE_NAME_RULE}`,
      ],
    });
    expect(calls).toEqual({ claude: [], git: [] });
  });

  test("a loop with check issues refuses with the check's issues, even when the check sets profile", () => {
    writeLoop();
    writeProfile({ description: 'd' }, path.join(repo, '.claude', 'profiles'));
    const check = checkLoop('fixer', {
      env: {},
      cwd: elsewhere,
      home,
      runGit: execRunner,
      managedFile: managed,
    });
    expect(check.profile).toBeDefined();
    expect(check.issues.length).toBeGreaterThan(0);
    expect(prepare()).toEqual({
      kind: 'refused',
      name: 'fixer',
      lines: check.issues,
    });
    expect(calls.claude).toEqual([]);
  });

  test('a loop.json that fails to parse refuses with the parse issue', () => {
    write(loopFile(), '{');
    const p = refusedOf(prepare());
    expect(p.lines[0]).toStartWith(`${loopFile()}: invalid JSON: `);
    expect(calls.claude).toEqual([]);
  });

  test.each([
    ['an unpaused', (_m: Manifest) => {}],
    ['a paused', pause],
  ])('%s loop with a broken state.json refuses, naming the file', (_label, edit) => {
    writeLoop(edit);
    writeProfile();
    write(path.join(loopDir(), 'state.json'), '{"v": 1}\n');
    const read = readState(loopDir());
    if (read.kind !== 'broken') throw new Error('the fixture should be broken');
    const p = refusedOf(prepare());
    expect(p.lines).toEqual([read.issue]);
    expect(read.issue).toStartWith(`${path.join(loopDir(), 'state.json')}: `);
  });

  test("checkComposed's refusal refuses with its lines, and prints nothing itself", () => {
    writeLoop();
    writeProfile();
    doctor = () => result({ code: 2, stderr: 'doctor broke' });
    expect(prepare()).toEqual({
      kind: 'refused',
      name: 'fixer',
      lines: ['claude doctor failed with exit code 2.', 'doctor broke'],
    });
    expect(printed).toEqual([]);
  });

  test('a loop.json edited while the check reads it refuses, so the hash never covers bytes the compile did not see', () => {
    writeLoop();
    writeProfile();
    let edited = false;
    const editingGit: Runner = (cmd, args, cwd, opts) => {
      if (!edited) {
        edited = true;
        writeLoop((m) => {
          m.schedule = '9 * * * *';
        });
      }
      return recordingGit(cmd, args, cwd, opts);
    };
    expect(prepare({ over: { runGit: editingGit } })).toEqual({
      kind: 'refused',
      name: 'fixer',
      lines: [
        `${loopFile()}: the file changed while start read it; run start again`,
      ],
    });
    expect(calls.claude).toEqual([]);
  });
});

describe('prepareLoop: a paused loop', () => {
  test('skips the check and the compose, so a missing profile still gives paused', () => {
    writeLoop((m) => {
      pause(m);
      m.profile = 'gone';
    });
    expect(prepare()).toEqual({
      kind: 'paused',
      name: 'fixer',
      dir: loopDir(),
      repo,
      state: undefined,
      action: { kind: 'off' },
    });
    expect(calls).toEqual({ claude: [], git: [] });
  });

  test('a live row between ticks gives the pause action, and the state as read', () => {
    writeLoop(pause);
    const state = stateWith({});
    writeState(loopDir(), state);
    const p = pausedOf(
      prepare({
        rows: [
          row({ id: 'job-1', name: 'loop-fixer', pid: 7, status: 'idle' }),
        ],
      }),
    );
    expect(p.action).toEqual({ kind: 'pause', job: 'job-1' });
    expect(p.state).toEqual(state);
  });

  test('a busy row refuses through the action without --now, and --now stops it', () => {
    writeLoop(pause);
    const rows = [
      row({ id: 'job-1', name: 'loop-fixer', pid: 7, status: 'busy' }),
    ];
    expect(pausedOf(prepare({ rows })).action.kind).toBe('refuse');
    expect(
      pausedOf(prepare({ rows, flags: { record: false, now: true } })).action,
    ).toEqual({ kind: 'pause', job: 'job-1' });
  });
});

describe('prepareLoop: a loop ready to launch', () => {
  test('args end with the launch flags and the arm prompt', () => {
    writeLoop();
    writeProfile();
    const p = readyOf(prepare());
    expect(p.args.slice(-LAUNCH_TAIL.length)).toEqual(LAUNCH_TAIL);
    expect(p.args.filter((a) => a === '--bg')).toEqual(['--bg']);
  });

  test.each([
    false,
    true,
  ])('--settings holds the compiled overlay, with --record %p', (record) => {
    writeLoop();
    const profileDir = writeProfile();
    const p = readyOf(prepare({ flags: { record, now: false } }));
    const compiled = compileLoop({
      name: 'fixer',
      manifest: manifestOf(),
      loopDir: loopDir(),
      profileDir,
      record,
    });
    expect(settingsOf(p.args)).toMatchObject(compiled);
  });

  test("the composed memory keys and every claude call follow the loop's repo, not lenv.cwd", () => {
    for (const [dir, key] of [
      [repo, '/m/loop-repo'],
      [elsewhere, '/m/elsewhere'],
    ]) {
      writeJson(path.join(dir, '.claude', 'settings.local.json'), {
        autoMemoryDirectory: key,
      });
    }
    writeLoop();
    writeProfile({ description: 'd', settingSources: ['project'] });
    const p = readyOf(
      prepare({ over: { env: { SIDEKICK_MEMORY_STORE: '/m' } } }),
    );
    expect(settingsOf(p.args)).toMatchObject({
      autoMemoryDirectory: '/m/loop-repo',
      permissions: { additionalDirectories: ['/m'] },
    });
    expect(calls.claude.map((c) => c.args.at(-1))).toEqual([
      'doctor',
      '--json',
    ]);
    expect(calls.claude.every((c) => c.cwd === repo)).toBe(true);
    expect(p.repo).toBe(repo);
  });

  test("the hash is launchHash over the args, loop.json's text, the flag, and the profile's folders", () => {
    writeLoop();
    const plugin = path.join(tmp, 'role-plugin');
    write(path.join(plugin, 'skills', 'tick', 'SKILL.md'), '# tick\n');
    const profileDir = writeProfile({ description: 'd', pluginDirs: [plugin] });
    const hashOf = (record: boolean): string => {
      const p = readyOf(prepare({ flags: { record, now: false } }));
      expect(p.hash).toBe(
        launchHash({
          loopJson: fs.readFileSync(loopFile(), 'utf-8'),
          record,
          args: p.args,
          profileDir,
          pluginDirs: [plugin],
        }),
      );
      return p.hash;
    };
    expect(hashOf(false)).not.toBe(hashOf(true));
  });

  test("the warnings hold the check's, the compose's, the overlap's, and the landing's, in that order", () => {
    writeLoop((m) => {
      m.hosts = ['github.com'];
      m.mandate.never.push('Bash(gh issue view *)');
      m.mandate.classes.label.allow.push('Bash(sidekick loop land *)');
    });
    writeProfile();
    const env = { [SKIP_VARIABLE]: '1' };
    const check = checkLoop('fixer', {
      env,
      cwd: elsewhere,
      home,
      runGit: execRunner,
      managedFile: managed,
    });
    expect(check.warnings.length).toBeGreaterThan(0);
    const p = readyOf(prepare({ over: { env } }));
    expect(p.warnings).toEqual([
      ...check.warnings,
      `${SKIP_VARIABLE}=1 is set, so the settings were not checked with claude doctor.`,
      `${loopFile()}: Bash(gh issue view *) compiles into both permissions.allow and permissions.deny, and a deny wins, so the loop never runs it`,
      `${loopFile()}: class label is act and allows \`sidekick loop land\`; a landing stays a request the operator runs (ADR-0015 Decision 5)`,
    ]);
    expect(printed).toEqual([]);
  });

  test('carries the loop folder, the repo, the manifest, and no state when none exists', () => {
    writeLoop();
    writeProfile();
    const p = readyOf(prepare());
    expect(p.name).toBe('fixer');
    expect(p.dir).toBe(loopDir());
    expect(p.repo).toBe(repo);
    expect(p.manifest).toEqual(manifestOf());
    expect(p.state).toBeUndefined();
    expect(p.action).toEqual({
      kind: 'launch',
      remove: undefined,
      reason: 'new',
    });
  });
});

describe('prepareLoop: the reconcile reads the hash, the state, the arm, and the boot time', () => {
  // The first prepare gives the hash a launch of today's definition records.
  const recordedLaunch = (over: Partial<LoopState>): LoopState => {
    writeLoop();
    writeProfile();
    const { hash } = readyOf(prepare());
    const state = stateWith({ hash, ...over });
    writeState(loopDir(), state);
    return state;
  };

  test('an unchanged live loop is left, and armed only with a current arm', () => {
    const state = recordedLaunch({});
    const rows = [
      row({ id: 'job-1', name: 'loop-fixer', pid: 7, status: 'idle' }),
    ];
    const left = readyOf(prepare({ rows }));
    expect(left.action).toEqual({ kind: 'leave', job: 'job-1', armed: false });
    expect(left.state).toEqual(state);
    armNow();
    expect(readyOf(prepare({ rows })).action).toEqual({
      kind: 'leave',
      job: 'job-1',
      armed: true,
    });
  });

  test('a changed definition relaunches a live loop between ticks', () => {
    recordedLaunch({ hash: 'x'.repeat(64) });
    const rows = [
      row({ id: 'job-1', name: 'loop-fixer', pid: 7, status: 'idle' }),
    ];
    expect(readyOf(prepare({ rows })).action).toEqual({
      kind: 'relaunch',
      job: 'job-1',
    });
  });

  test('a stopped loop started after the boot, with its jobs alive, is respawned', () => {
    recordedLaunch({
      startedAt: new Date(BOOT.getTime() + HOUR_MS).toISOString(),
    });
    armNow();
    const rows = [row({ id: 'job-1', name: 'loop-fixer' })];
    expect(readyOf(prepare({ rows })).action).toEqual({
      kind: 'respawn',
      job: 'job-1',
    });
  });

  test('a stopped loop started before the boot launches fresh', () => {
    recordedLaunch({
      startedAt: new Date(BOOT.getTime() - HOUR_MS).toISOString(),
    });
    armNow();
    const rows = [row({ id: 'job-1', name: 'loop-fixer' })];
    expect(readyOf(prepare({ rows })).action).toEqual({
      kind: 'launch',
      remove: 'job-1',
      reason: 'rebooted',
    });
  });

  test('a busy changed loop refuses without --now and relaunches with it', () => {
    recordedLaunch({ hash: 'x'.repeat(64) });
    const rows = [
      row({ id: 'job-1', name: 'loop-fixer', pid: 7, status: 'busy' }),
    ];
    expect(readyOf(prepare({ rows })).action.kind).toBe('refuse');
    expect(
      readyOf(prepare({ rows, flags: { record: false, now: true } })).action,
    ).toEqual({ kind: 'relaunch', job: 'job-1' });
  });
});
