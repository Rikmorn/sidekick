import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { envWithoutRepoVars } from './git-env.js';
import { readSection } from './hook.js';
import { LOOP_USAGE_LINE, type LoopEnv, runLoopCli } from './loop.js';
import {
  DISPATCH_USAGE_LINE,
  loopDispatch,
  UNIT_REPORT,
  type UnitDispatchOptions,
} from './loop-dispatch.js';
import { appendRecord, type RecordLine } from './loop-record.js';
import { readLedger, readWorkerFile } from './loop-units.js';
import {
  execRunner,
  type Runner,
  type RunOptions,
  type RunResult,
} from './pm-data.js';
import type { ClaudeResult, ClaudeRunner } from './profile-launch.js';
import { readBriefLimits } from './subagent-limits.js';
import { readBrief } from './worker-brief.js';
import { HARDENED_GIT_FLAGS } from './worker-git.js';

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

const NOW = new Date(2026, 10, 15, 10, 20);
const HOUR_MS = 60 * 60 * 1000;
const PID = 4321;
const JOB = 'job-7';
const ME = 'operator';
const ORIGIN_URL = 'https://github.com/acme/widgets.git';
const ISSUE = 42;
const SKILL = 'fixer:fix-bug';
const UNIT = 'fix-bug-42';
const WORKER = 'fixer-abc123';
const ARGS = ['fixer', '--issue', String(ISSUE), '--skill', SKILL];

let tmp: string;
let home: string;
let config: string;
let origin: string;
let seed: string;
let repo: string;
let loopTree: string;
let launches: { args: string[]; cwd: string }[];
let rows: Record<string, unknown>[];
let ghCalls: string[][];
let pluginList: ClaudeResult;
let launchReply: (args: string[], cwd: string) => ClaudeResult;
let issueState: string;
let onLaunch: () => void;
let gitCalls: { args: string[]; cwd: string; opts: RunOptions | undefined }[];
let gitReply: (args: string[]) => RunResult | undefined;
let stops: string[][];

const result = (over: Partial<ClaudeResult> = {}): ClaudeResult => ({
  code: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  ...over,
});

const write = (file: string, content: string): string => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
};
const writeJson = (file: string, value: unknown): string =>
  write(file, `${JSON.stringify(value, null, 2)}\n`);

const loopDir = (): string => path.join(config, 'sidekick', 'loops', 'fixer');
const profileDir = (): string =>
  path.join(config, 'sidekick', 'profiles', 'fixer');
const attemptOf = (worker = WORKER): string =>
  path.join(loopDir(), 'units', UNIT, worker);
const workerTree = (worker = WORKER): string =>
  path.join(repo, '.claude', 'worktrees', worker);

// What Claude Code's own creation does for `--worktree <name>`: a worktree on
// `worktree-<name>` at the launching folder's HEAD, which the listing then names.
const nativeLanding = (args: string[], cwd: string): ClaudeResult => {
  const name = args[args.indexOf('--worktree') + 1];
  const where = workerTree(name);
  git(cwd, 'worktree', 'add', '-q', where, '-b', `worktree-${name}`);
  rows.push({
    id: JOB,
    kind: 'background',
    name,
    cwd: where,
    state: 'working',
  });
  return result({ stdout: `backgrounded · ${JOB} · ${name}\n` });
};

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
  if (args.at(-1) === 'doctor') return doctorPasses(args);
  if (args.at(-3) === 'plugin' && args.at(-2) === 'list') return pluginList;
  if (args[0] === 'agents') return result({ stdout: JSON.stringify(rows) });
  if (args[0] === 'stop') {
    stops.push(args);
    return result();
  }
  if (args.includes('--bg')) {
    launches.push({ args, cwd: opts.cwd });
    onLaunch();
    return launchReply(args, opts.cwd);
  }
  throw new Error(`dispatch runs no such claude call: ${args.join(' ')}`);
};

const issueData = () => ({
  data: {
    viewer: { login: ME },
    repository: {
      issue: {
        state: issueState,
        title: 'Fix the widget',
        body: 'The widget breaks.',
        url: 'https://github.com/acme/widgets/issues/42',
        author: { login: ME },
        editor: null,
        lastEditedAt: null,
        renames: { totalCount: 0, nodes: [] },
        comments: { totalCount: 0, nodes: [] },
      },
    },
  },
});

// gh answers from the fixture, and origin reads as a GitHub repo, while every
// other git call is kept and runs for real against the bare origin, unless
// `gitReply` answers it.
const runGit: Runner = (cmd, args, cwd, opts) => {
  if (cmd === 'gh') {
    ghCalls.push(args);
    return { code: 0, stdout: JSON.stringify(issueData()), stderr: '' };
  }
  gitCalls.push({ args, cwd, opts });
  if (args.join(' ') === 'remote get-url origin') {
    return { code: 0, stdout: `${ORIGIN_URL}\n`, stderr: '' };
  }
  return gitReply(args) ?? execRunner(cmd, args, cwd, opts);
};

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
    waitMinutesPerUnit: 1440,
    unitsPerDay: 4,
    failedUnitsInARow: 3,
  },
  mandate: { reads: [], classes: {}, never: [] },
});

const stateOf = (over: Record<string, unknown> = {}) => ({
  v: 1,
  launch: 'launch-1',
  job: 'loop-job',
  session: 'loop-fixer',
  launchedAt: new Date(NOW.getTime() - HOUR_MS).toISOString(),
  startedAt: new Date(NOW.getTime() - HOUR_MS).toISOString(),
  hash: 'h',
  record: false,
  states: {},
  schedule: '7 * * * *',
  tick: '/fixer:tick',
  ...over,
});

// A commit on origin's main, made in the seed repo and fetched into the bare
// origin, so no fixture pushes.
const commitOnOrigin = (file: string, text: string): string => {
  write(path.join(seed, file), text);
  git(seed, 'add', file);
  git(seed, 'commit', '-q', '-m', `add ${file}`);
  git(origin, 'fetch', '-q', seed, 'main:main');
  return git(seed, 'rev-parse', 'HEAD');
};

beforeEach(() => {
  tmp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sk-loop-dispatch-')),
  );
  home = path.join(tmp, 'home');
  config = path.join(home, '.claude');
  origin = path.join(tmp, 'origin.git');
  seed = path.join(tmp, 'seed');
  repo = path.join(tmp, 'repo');
  fs.mkdirSync(config, { recursive: true });
  git(tmp, 'init', '-q', '--bare', '--initial-branch=main', origin);
  git(tmp, 'init', '-q', '--initial-branch=main', seed);
  commitOnOrigin('a.txt', 'a\n');
  git(tmp, 'clone', '-q', origin, repo);
  loopTree = path.join(repo, '.claude', 'worktrees', 'loop-fixer');
  git(
    repo,
    'worktree',
    'add',
    '-q',
    '-b',
    'worktree-loop-fixer',
    loopTree,
    'origin/main',
  );
  writeJson(path.join(profileDir(), 'profile.json'), {
    description: 'Fixer',
    pluginDirs: ['plugin'],
  });
  writeJson(
    path.join(profileDir(), 'plugin', '.claude-plugin', 'plugin.json'),
    {
      name: 'fixer',
    },
  );
  write(
    path.join(profileDir(), 'plugin', 'skills', 'fix-bug', 'SKILL.md'),
    '---\nname: fix-bug\ndescription: Fix a bug\n---\n',
  );
  writeJson(path.join(loopDir(), 'loop.json'), validLoop());
  writeJson(path.join(loopDir(), 'state.json'), stateOf());
  launches = [];
  rows = [];
  ghCalls = [];
  pluginList = result({ stdout: '[]' });
  launchReply = nativeLanding;
  issueState = 'OPEN';
  onLaunch = () => {};
  gitCalls = [];
  gitReply = () => undefined;
  stops = [];
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const lenvOf = (over: Partial<LoopEnv> = {}): LoopEnv => ({
  env: {},
  cwd: loopTree,
  home,
  workTree: { kind: 'inside', top: loopTree },
  tmpdir: tmp,
  runClaude: fakeClaude,
  runGit,
  write: () => {},
  now: () => NOW,
  bootTime: () => new Date(NOW.getTime() - 2 * HOUR_MS),
  sleep: () => {},
  isAlive: () => false,
  pid: PID,
  managedFile: path.join(tmp, 'managed-settings.json'),
  ...over,
});

const dispatch = (
  args: string[] = ARGS,
  over: Partial<LoopEnv> = {},
  opts: UnitDispatchOptions = { draw: () => 'abc123' },
) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = loopDispatch(
    args,
    lenvOf(over),
    (l) => out.push(l),
    (l) => err.push(l),
    opts,
  );
  return { code, out, err };
};

// Every entry under the loop's folder, a folder as `<path>/`, a file with its text.
function snapshot(dir: string = loopDir()): Record<string, string> {
  const walk = (at: string): [string, string][] =>
    fs.readdirSync(at, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(at, entry.name);
      const rel = path.relative(dir, full);
      const own: [string, string] = entry.isDirectory()
        ? [`${rel}/`, '']
        : [rel, fs.readFileSync(full, 'utf8')];
      return entry.isDirectory() ? [own, ...walk(full)] : [own];
    });
  return Object.fromEntries(walk(dir));
}

const head = (where: string): string => git(where, 'rev-parse', 'HEAD');

const at = (hoursAgo: number): string =>
  new Date(NOW.getTime() - hoursAgo * HOUR_MS).toISOString();

const record = (...lines: RecordLine[]): void => {
  for (const l of lines) appendRecord(loopDir(), l);
};

const dispatchedLines = () => {
  const read = readLedger(loopDir(), NOW);
  if ('issues' in read) throw new Error(read.issues.join('\n'));
  return read.lines.filter((l) => l.kind === 'dispatched');
};

describe('loop dispatch refuses, changing nothing in the loop folder', () => {
  // The third column is the text the refusal holds, read late when it names a fixture path.
  const rowsOf: [
    string,
    () => Partial<LoopEnv> | undefined,
    string | (() => string),
    string[]?,
  ][] = [
    [
      'a non-empty SIDEKICK_WORKER refuses',
      () => ({ env: { SIDEKICK_WORKER: '/x/brief.md' } }),
      'SIDEKICK_WORKER is set',
    ],
    [
      'another SIDEKICK_LOOP refuses',
      () => ({ env: { SIDEKICK_LOOP: 'other' } }),
      'SIDEKICK_LOOP is "other"',
    ],
    [
      'a store with no such loop refuses',
      () => ({ env: { CLAUDE_CONFIG_DIR: path.join(tmp, 'other-config') } }),
      'holds no loop "fixer"',
    ],
    [
      'a loop with no state.json refuses',
      () => {
        fs.rmSync(path.join(loopDir(), 'state.json'));
        return undefined;
      },
      'state.json does not exist',
    ],
    [
      'a state.json that names another session refuses',
      () => {
        writeJson(
          path.join(loopDir(), 'state.json'),
          stateOf({ session: 'loop-else' }),
        );
        return undefined;
      },
      'names the session "loop-else", not "loop-fixer"',
    ],
    [
      'an attempt in flight refuses',
      () => {
        record({
          v: 1,
          kind: 'dispatched',
          at: at(1),
          unit: 'triage-7',
          worker: 'fixer-000001',
        });
        return undefined;
      },
      'in flight: unit triage-7, worker fixer-000001',
    ],
    [
      'attemptsPerUnit at its limit refuses',
      () => {
        for (const [n, worker] of ['fixer-000001', 'fixer-000002'].entries()) {
          record(
            {
              v: 1,
              kind: 'dispatched',
              at: at(4 - n),
              unit: UNIT,
              worker,
            },
            {
              v: 1,
              kind: 'discarded',
              at: at(3.5 - n),
              unit: UNIT,
              worker,
              reason: 'requeued',
            },
          );
        }
        return undefined;
      },
      'attemptsPerUnit:',
    ],
    [
      'unitsPerDay at its limit refuses',
      () => {
        for (const n of [1, 2, 3, 4]) {
          record(
            {
              v: 1,
              kind: 'dispatched',
              at: at(n / 4),
              unit: `triage-${n}`,
            },
            {
              v: 1,
              kind: 'discarded',
              at: at(n / 4 - 0.1),
              unit: `triage-${n}`,
              reason: 'requeued',
            },
          );
        }
        return undefined;
      },
      'unitsPerDay:',
    ],
    [
      'failedUnitsInARow at its limit refuses',
      () => {
        for (const n of [1, 2, 3]) {
          record({
            v: 1,
            kind: 'failed',
            at: at(n),
            unit: `triage-${n}`,
            reason: 'gate failed',
          });
        }
        return undefined;
      },
      'failedUnitsInARow:',
    ],
    [
      'an unreadable day file refuses',
      () => {
        fs.mkdirSync(path.join(loopDir(), 'records', '2026-11-13.jsonl'), {
          recursive: true,
        });
        return undefined;
      },
      '2026-11-13.jsonl',
    ],
    [
      'a units.lock another verb holds refuses',
      () => {
        writeJson(path.join(loopDir(), 'units.lock'), {
          pid: 77,
          at: NOW.toISOString(),
        });
        return { isAlive: (pid: number) => pid === 77 };
      },
      'another unit verb holds the lock (pid 77)',
    ],
    [
      "a skill outside the role's plugins refuses",
      () => undefined,
      'has no plugin named "other"',
      ['fixer', '--issue', '42', '--skill', 'other:fix-bug'],
    ],
    [
      'a skill its plugin lacks refuses',
      () => undefined,
      path.join('skills', 'nope', 'SKILL.md'),
      ['fixer', '--issue', '42', '--skill', 'fixer:nope'],
    ],
    [
      'a closed issue refuses',
      () => {
        issueState = 'CLOSED';
        return undefined;
      },
      'issue #42 is closed',
    ],
    [
      'the loop worktree dirty refuses',
      () => {
        write(path.join(loopTree, 'a.txt'), 'changed\n');
        return undefined;
      },
      () => `${loopTree}: tracked files have uncommitted changes`,
    ],
    [
      'the loop worktree off its branch refuses',
      () => {
        git(loopTree, 'switch', '-q', '-c', 'elsewhere');
        return undefined;
      },
      () => `${loopTree} holds the branch elsewhere, not worktree-loop-fixer`,
    ],
    [
      'the loop worktree ahead of origin refuses',
      () => {
        write(path.join(loopTree, 'b.txt'), 'b\n');
        git(loopTree, 'add', 'b.txt');
        git(loopTree, 'commit', '-q', '-m', 'own');
        return undefined;
      },
      'is ahead of origin/main',
    ],
    [
      'the loop worktree diverged from origin refuses',
      () => {
        write(path.join(loopTree, 'b.txt'), 'b\n');
        git(loopTree, 'add', 'b.txt');
        git(loopTree, 'commit', '-q', '-m', 'own');
        commitOnOrigin('c.txt', 'c\n');
        return undefined;
      },
      'has diverged from origin/main',
    ],
    [
      'a missing loop worktree refuses',
      () => {
        git(repo, 'worktree', 'remove', '--force', loopTree);
        return { cwd: repo, workTree: { kind: 'inside', top: repo } };
      },
      () => `${loopTree} does not exist`,
    ],
    [
      'an unset origin/HEAD refuses',
      () => {
        // From git 2.48 a fetch makes a missing origin/HEAD unless told not to.
        git(repo, 'config', 'remote.origin.followRemoteHEAD', 'never');
        git(repo, 'remote', 'set-head', 'origin', '--delete');
        return undefined;
      },
      'git remote set-head origin --auto',
    ],
  ];

  test.each(rowsOf)('%s', (_label, setup, expected, args = ARGS) => {
    const over = setup() ?? {};
    const before = snapshot();
    const loopHead = fs.existsSync(loopTree) ? head(loopTree) : undefined;
    const r = dispatch(args, over);
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain(
      typeof expected === 'string' ? expected : expected(),
    );
    expect(launches).toEqual([]);
    expect(snapshot()).toEqual(before);
    if (loopHead !== undefined) expect(head(loopTree)).toBe(loopHead);
  });

  test('each argument refusal names its flag, and reads nothing', () => {
    const r = dispatch(['Bad_Name', '--issue', '0', '--skill', 'fixer']);
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain('"Bad_Name" is not a loop name');
    expect(r.err.join('\n')).toContain('--issue');
    expect(r.err.join('\n')).toContain('--skill');
    expect(ghCalls).toEqual([]);
  });

  test("a profile the loop's worktree would load from the repo refuses after the fast-forward, writing nothing in the loop folder", () => {
    const tip = commitOnOrigin(
      path.join('.claude', 'profiles', 'fixer', 'profile.json'),
      '{"description":"planted"}\n',
    );
    const before = snapshot();
    const r = dispatch();
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain(
      `the unit launch would load profile "fixer" from ${path.join(loopTree, '.claude', 'profiles', 'fixer')}`,
    );
    expect(launches).toEqual([]);
    expect(snapshot()).toEqual(before);
    expect(head(loopTree)).toBe(tip);
  });

  test('a missing flag prints the usage', () => {
    const r = dispatch(['fixer', '--issue', '42']);
    expect(r).toEqual({
      code: 1,
      out: [],
      err: [`usage: ${DISPATCH_USAGE_LINE}`],
    });
  });
});

describe('loop dispatch dispatches', () => {
  test('a dispatch writes the attempt folder, the brief, the unit file, worker.json, and dispatched with worker and issue', () => {
    const r = dispatch();
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    const attempt = attemptOf();
    expect(fs.readdirSync(attempt).sort()).toEqual([
      'brief.md',
      'unit.md',
      'worker.json',
    ]);
    expect(fs.readFileSync(path.join(attempt, 'unit.md'), 'utf8')).toContain(
      '# Issue #42: Fix the widget',
    );
    expect(readWorkerFile(attempt)).toEqual({
      v: 1,
      worker: WORKER,
      job: JOB,
      issue: ISSUE,
      dispatchedAt: NOW.toISOString(),
    });
    expect(dispatchedLines()).toEqual([
      {
        v: 1,
        at: NOW.toISOString(),
        kind: 'dispatched',
        unit: UNIT,
        worker: WORKER,
        issue: ISSUE,
      },
    ]);
    expect(launches).toHaveLength(1);
    expect(launches[0].cwd).toBe(loopTree);
    expect(launches[0].args.at(-1)).toBe(
      `/sidekick:sk-worker --dispatched ${path.join(attempt, 'brief.md')}`,
    );
    expect(r.out).toContain(`unit ${UNIT} · worker ${WORKER} · job ${JOB}`);
    expect(r.out.join('\n')).toContain(
      `sidekick loop report fixer --unit ${UNIT}`,
    );
    expect(r.out.join('\n')).toContain(
      `sidekick loop discard fixer --unit ${UNIT} --reason <text>`,
    );
    expect(fs.existsSync(path.join(loopDir(), 'units.lock'))).toBe(false);
  });

  test('a record-mode loop writes record: true', () => {
    writeJson(path.join(loopDir(), 'state.json'), stateOf({ record: true }));
    expect(dispatch().code).toBe(0);
    expect(dispatchedLines()).toEqual([
      expect.objectContaining({ record: true, worker: WORKER }),
    ]);
  });

  test("an empty SIDEKICK_WORKER reads as absent, as a loop's compiled env sets it", () => {
    const r = dispatch(ARGS, {
      env: { SIDEKICK_WORKER: '', SIDEKICK_LOOP: 'fixer' },
    });
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
  });

  test("it fast-forwards the loop's worktree to origin's tip, which the brief names as the baseline", () => {
    const tip = commitOnOrigin('c.txt', 'c\n');
    expect(dispatch().code).toBe(0);
    expect(head(loopTree)).toBe(tip);
    const read = readBrief(path.join(attemptOf(), 'brief.md'));
    if ('issues' in read) throw new Error(read.issues.join('\n'));
    expect(read.brief.baseline).toBe(tip);
    expect(head(workerTree())).toBe(tip);
  });

  test('a refused worker name is drawn again', () => {
    git(repo, 'branch', 'worktree-fixer-aaaaaa');
    const draws = ['aaaaaa', 'bbbbbb'];
    const r = dispatch(ARGS, {}, { draw: () => draws.shift() ?? 'zzzzzz' });
    expect(r.code).toBe(0);
    expect(fs.existsSync(attemptOf('fixer-bbbbbb'))).toBe(true);
    expect(dispatchedLines()).toEqual([
      expect.objectContaining({ worker: 'fixer-bbbbbb' }),
    ]);
  });

  test('when every draw is refused, it refuses naming the last reason, and writes nothing', () => {
    git(repo, 'branch', 'worktree-fixer-aaaaaa');
    const before = snapshot();
    const r = dispatch(ARGS, {}, { draw: () => 'aaaaaa', draws: 3 });
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain('worktree-fixer-aaaaaa already exists');
    expect(snapshot()).toEqual(before);
    expect(launches).toEqual([]);
  });

  test("a long loop name keeps 33 characters of it in the worker's name", () => {
    const name = `${'a'.repeat(32)}-tail-of-the-name`;
    const named = path.join(path.dirname(loopDir()), name);
    fs.renameSync(loopDir(), named);
    writeJson(
      path.join(named, 'state.json'),
      stateOf({ session: `loop-${name}` }),
    );
    const tree = path.join(repo, '.claude', 'worktrees', `loop-${name}`);
    git(repo, 'worktree', 'remove', loopTree);
    git(
      repo,
      'worktree',
      'add',
      '-q',
      '-b',
      `worktree-loop-${name}`,
      tree,
      'origin/main',
    );
    const r = dispatch([name, '--issue', '42', '--skill', SKILL], {
      cwd: tree,
      workTree: { kind: 'inside', top: tree },
    });
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    const worker = `${'a'.repeat(32)}-abc123`;
    expect(fs.existsSync(path.join(named, 'units', UNIT, worker))).toBe(true);
  });

  test("Workspace not trusted adds start's fix line, and leaves nothing", () => {
    launchReply = () =>
      result({ code: 1, stderr: 'Error: Workspace not trusted. Run claude\n' });
    const before = snapshot();
    const r = dispatch();
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      `Claude Code does not trust ${loopTree} as a workspace. Run claude in ${loopTree} once and accept the trust prompt, then run sidekick loop dispatch fixer --issue 42 --skill ${SKILL} again.`,
    );
    expect(snapshot()).toEqual(before);
    expect(dispatchedLines()).toEqual([]);
  });

  test('a launch that times out counts as an attempt: dispatched lands, the folder stays, and the next dispatch refuses as in flight', () => {
    launchReply = () => result({ code: 124, timedOut: true });
    const r = dispatch();
    expect(r.code).toBe(124);
    expect(r.err.join('\n')).toContain(
      `claude --bg did not return in time, so dispatch cannot tell whether worker ${WORKER} started. The attempt now counts`,
    );
    expect(r.err.join('\n')).toContain(
      `give up on the attempt with sidekick loop discard fixer --unit ${UNIT} --reason <text>`,
    );
    expect(r.err.join('\n')).not.toContain('claude stop');
    expect(fs.readdirSync(attemptOf()).sort()).toEqual([
      'brief.md',
      'unit.md',
      'worker.json',
    ]);
    expect(readWorkerFile(attemptOf())).toEqual(
      expect.objectContaining({ worker: WORKER, job: null, issue: ISSUE }),
    );
    expect(dispatchedLines()).toEqual([
      expect.objectContaining({ unit: UNIT, worker: WORKER, issue: ISSUE }),
    ]);
    launchReply = nativeLanding;
    const next = dispatch(ARGS, {}, { draw: () => 'def456' });
    expect(next.code).toBe(1);
    expect(next.err.join('\n')).toContain(
      `in flight: unit ${UNIT}, worker ${WORKER}`,
    );
    expect(launches).toHaveLength(1);
  });

  test('a timed-out launch whose attempt cannot be recorded leaves nothing, and says how to stop a worker that started', () => {
    const records = path.join(loopDir(), 'records');
    fs.mkdirSync(records);
    launchReply = () => result({ code: 124, timedOut: true });
    const before = snapshot();
    fs.chmodSync(records, 0o555);
    try {
      const r = dispatch();
      expect(r.code).toBe(124);
      expect(r.err.join('\n')).toContain('recording the attempt failed');
      expect(r.err.join('\n')).toContain(
        'find it with claude agents --json --all, then stop it with claude stop <id>',
      );
    } finally {
      fs.chmodSync(records, 0o755);
    }
    expect(snapshot()).toEqual(before);
  });

  test('a start whose dispatched line cannot be written stops the worker as a stray, and removes the attempt folder', () => {
    const records = path.join(loopDir(), 'records');
    fs.mkdirSync(records);
    const before = snapshot();
    fs.chmodSync(records, 0o555);
    try {
      const r = dispatch();
      expect(r.code).toBe(1);
      expect(r.err.join('\n')).toContain(
        'the worker started, but recording its start failed',
      );
      expect(stops).toEqual([['stop', JOB]]);
    } finally {
      fs.chmodSync(records, 0o755);
    }
    expect(snapshot()).toEqual(before);
    expect(dispatchedLines()).toEqual([]);
  });

  test("a refusal by the launch's own checks removes the attempt folder it wrote, and the unit folder it made", () => {
    fs.mkdirSync(path.join(loopDir(), 'units'));
    pluginList = result({ code: 1, stderr: 'boom\n' });
    const before = snapshot();
    const r = dispatch();
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain('claude plugin list failed');
    expect(launches).toEqual([]);
    expect(snapshot()).toEqual(before);
  });

  test('a worker that starts in the wrong worktree keeps its dispatched line, and dispatch names loop discard', () => {
    launchReply = (args, cwd) => {
      const name = args[args.indexOf('--worktree') + 1];
      const where = path.join(tmp, 'elsewhere', name);
      git(cwd, 'worktree', 'add', '-q', where, '-b', `worktree-${name}`);
      rows.push({
        id: JOB,
        kind: 'background',
        name,
        cwd: where,
        state: 'working',
      });
      return result({ stdout: `backgrounded · ${JOB} · ${name}\n` });
    };
    const r = dispatch();
    expect(r.code).toBe(1);
    expect(dispatchedLines()).toEqual([
      expect.objectContaining({ worker: WORKER, unit: UNIT }),
    ]);
    expect(fs.existsSync(attemptOf())).toBe(true);
    expect(r.err.join('\n')).toContain(
      `sidekick loop discard fixer --unit ${UNIT} --reason <text>`,
    );
    expect(r.err.join('\n')).not.toContain('sidekick worker finish');
  });

  test('two verbs racing on one loop: the second refuses on units.lock, and only one attempt counts', () => {
    const second: { code?: number; err?: string[] } = {};
    onLaunch = () => {
      const r = dispatch(ARGS, { isAlive: (pid) => pid === PID });
      second.code = r.code;
      second.err = r.err;
    };
    const first = dispatch(ARGS, { isAlive: (pid) => pid === PID });
    expect(first.code).toBe(0);
    expect(second.code).toBe(1);
    expect(second.err?.join('\n')).toContain(
      `another unit verb holds the lock (pid ${PID})`,
    );
    expect(dispatchedLines()).toHaveLength(1);
    expect(launches).toHaveLength(1);
  });

  test('the brief has a Limits section and parses as a unit brief', () => {
    expect(dispatch().code).toBe(0);
    const attempt = attemptOf();
    const briefPath = path.join(attempt, 'brief.md');
    const read = readBrief(briefPath);
    if ('issues' in read) throw new Error(read.issues.join('\n'));
    expect(read.brief).toEqual({
      kind: 'unit',
      name: WORKER,
      unit: path.join(attempt, 'unit.md'),
      rulings: path.join(attempt, 'rulings.md'),
      baseline: head(loopTree),
      skill: SKILL,
      place: 'worktree',
      report: UNIT_REPORT,
      orchestrator: 'loop-fixer',
    });
    expect(readBriefLimits(briefPath, readSection)).toBe(
      [
        '## Limits',
        '',
        `- Write only inside this worktree, ${workerTree()}.`,
        `- Read only this worktree, the role's own skills, and the attempt's folder, ${attempt}, which holds this brief, the unit file, and the rulings file.`,
        '- Make no GitHub write: no issue, comment, label, or board change.',
        '- Never push. Never amend a commit; a fix is a new commit.',
        '- The network reaches only these hosts: registry.npmjs.org.',
      ].join('\n'),
    );
    const text = fs.readFileSync(briefPath, 'utf8');
    expect(text).toContain('`bun run test`');
    expect(text).toContain('timeout');
    expect(text).toContain('## Proposals');
    expect(text).not.toMatch(/cannot (label|comment|close)/);
  });
});

describe('loop dispatch, further', () => {
  test('a loop with no hosts says its worker reaches no host', () => {
    writeJson(path.join(loopDir(), 'loop.json'), {
      ...validLoop(),
      hosts: [],
    });
    expect(dispatch().code).toBe(0);
    const limits = readBriefLimits(
      path.join(attemptOf(), 'brief.md'),
      readSection,
    );
    expect(limits).toContain('- The network reaches no host.');
  });

  test("every git call into the loop's worktree runs hardened, the launch's own checks included", () => {
    expect(dispatch().code).toBe(0);
    const inside = gitCalls.filter(
      (c) => c.cwd === loopTree || c.cwd.startsWith(`${loopTree}/`),
    );
    for (const call of inside) {
      expect(call.args.slice(0, HARDENED_GIT_FLAGS.length)).toEqual([
        ...HARDENED_GIT_FLAGS,
      ]);
    }
    const shown = inside.map((c) => c.args.join(' '));
    expect(
      shown.some((a) =>
        a.endsWith(
          'rev-parse --path-format=absolute --show-toplevel --git-common-dir',
        ),
      ),
    ).toBe(true);
    expect(
      shown.some((a) => a.endsWith('status --porcelain --untracked-files=no')),
    ).toBe(true);
  });

  test('the fetch and the fast-forward both take the sync limit', () => {
    commitOnOrigin('c.txt', 'c\n');
    const r = dispatch(
      ARGS,
      {},
      { draw: () => 'abc123', syncTimeoutMs: 12_345 },
    );
    expect(r.code).toBe(0);
    const limitOf = (verb: string) =>
      gitCalls.find((c) => c.args.includes(verb))?.opts?.timeoutMs;
    expect(limitOf('fetch')).toBe(12_345);
    expect(limitOf('merge')).toBe(12_345);
  });

  test("an origin/HEAD read that fails for another reason names git's failure, not a missing ref", () => {
    gitReply = (args) =>
      args.includes('symbolic-ref') && args.includes('refs/remotes/origin/HEAD')
        ? { code: 124, stdout: '', stderr: 'git did not finish within 10 s' }
        : undefined;
    const r = dispatch();
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain(
      `git symbolic-ref refs/remotes/origin/HEAD failed in ${loopTree}: git did not finish within 10 s`,
    );
    expect(r.err.join('\n')).not.toContain('is not set');
  });

  test("independent reasons are named together: the skill, the issue, and the loop's worktree", () => {
    issueState = 'CLOSED';
    write(path.join(loopTree, 'a.txt'), 'changed\n');
    const r = dispatch(['fixer', '--issue', '42', '--skill', 'fixer:nope']);
    expect(r.code).toBe(1);
    const said = r.err.join('\n');
    expect(said).toContain(path.join('skills', 'nope', 'SKILL.md'));
    expect(said).toContain('issue #42 is closed');
    expect(said).toContain(
      `${loopTree}: tracked files have uncommitted changes`,
    );
    expect(launches).toEqual([]);
  });
});

describe('the loop verb table', () => {
  test('runLoopCli runs dispatch, and the usage names it', () => {
    expect(LOOP_USAGE_LINE).toContain(
      DISPATCH_USAGE_LINE.replace('sidekick loop ', ''),
    );
    const out: string[] = [];
    const err: string[] = [];
    const code = runLoopCli(
      ['dispatch', 'fixer'],
      lenvOf(),
      (l) => out.push(l),
      (l) => err.push(l),
    );
    expect(code).toBe(1);
    expect(err).toEqual([`usage: ${DISPATCH_USAGE_LINE}`]);
  });
});
