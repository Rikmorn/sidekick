import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { envWithoutRepoVars } from './git-env.js';
import { localMinute } from './local-date.js';
import { LOOP_USAGE_LINE, type LoopEnv, runLoopCli } from './loop.js';
import { GITHUB_HOST_WARNING } from './loop-check.js';
import { BUILTIN_NOTE } from './loop-inherited.js';
import { appendRecord, type RecordLine, readRecords } from './loop-record.js';
import { keyHits } from './memory-patterns.js';
import { execRunner } from './pm-data.js';
import type { ClaudeResult } from './profile-launch.js';
import { PROFILE_NAME_RULE } from './profile-manifest.js';

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

const NOW = new Date(2026, 10, 14, 10, 20);
const HOUR_MS = 60 * 60 * 1000;
const USAGE = `usage: ${LOOP_USAGE_LINE}`;
const EMPTY_PLUGIN_LIST: ClaudeResult = {
  code: 0,
  stdout: '[]',
  stderr: '',
  timedOut: false,
};

let tmp: string;
let home: string;
let config: string;
let repo: string;
let managed: string;
let calls: { claude: string[][]; git: string[][] };
let claudeReply: ClaudeResult;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-loop-cli-'));
  home = path.join(tmp, 'home');
  config = path.join(home, '.claude');
  repo = path.join(tmp, 'repo');
  managed = path.join(tmp, 'managed-settings.json');
  fs.mkdirSync(config, { recursive: true });
  fs.mkdirSync(repo);
  git(repo, 'init', '--quiet');
  git(repo, 'commit', '--quiet', '--allow-empty', '-m', 'first');
  calls = { claude: [], git: [] };
  claudeReply = EMPTY_PLUGIN_LIST;
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const lenvOf = (over: Partial<LoopEnv> = {}): LoopEnv => ({
  env: {},
  cwd: tmp,
  home,
  workTree: { kind: 'outside' },
  tmpdir: tmp,
  runClaude: (args) => {
    calls.claude.push(args);
    return claudeReply;
  },
  runGit: (cmd, args, cwd, opts) => {
    calls.git.push(args);
    return execRunner(cmd, args, cwd, opts);
  },
  write: () => {},
  now: () => NOW,
  managedFile: managed,
  ...over,
});

const run = (args: string[], over: Partial<LoopEnv> = {}) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = runLoopCli(
    args,
    lenvOf(over),
    (l) => out.push(l),
    (l) => err.push(l),
  );
  return { code, out, err };
};

const key = (): string => `${'ghp'}${'_'}${'a1'.repeat(18)}`;

const write = (file: string, content: string): string => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
};
const writeJson = (file: string, value: unknown): string =>
  write(file, `${JSON.stringify(value, null, 2)}\n`);

const loopsRoot = (): string => path.join(config, 'sidekick', 'loops');
const loopDir = (name = 'fixer'): string => path.join(loopsRoot(), name);
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
      integrate: { state: 'ask', allow: ['Bash(gh issue close *)'] },
      label: { state: 'act', allow: ['Bash(gh label list *)'] },
    },
    never: ['Bash(git push --force *)'],
  },
});

const writeLoop = (
  edit: (m: Manifest) => void = () => {},
  name = 'fixer',
): string => {
  const m = validLoop();
  edit(m);
  return writeJson(loopFile(name), m);
};

const writeProfile = (name = 'fixer'): string =>
  writeJson(path.join(userStore(), name, 'profile.json'), {
    description: 'd',
  });

const at = (d: Date) => ({ v: 1 as const, at: d.toISOString() });

describe('runLoopCli: usage', () => {
  test.each([
    ['no verb', []],
    ['an unknown verb', ['nope']],
    ['list with an argument', ['list', 'fixer']],
    ['show with no name', ['show']],
    ['show with two names', ['show', 'a', 'b']],
    ['show with an unknown flag', ['show', 'fixer', '--from', 'x']],
    ['record with no name', ['record', '--kind', 'note', '--summary', 's']],
    ['record without --kind', ['record', 'fixer', '--summary', 's']],
    ['record without --summary', ['record', 'fixer', '--kind', 'note']],
    [
      'record with an unknown flag',
      ['record', 'fixer', '--kind', 'note', '--summary', 's', '--x', 'y'],
    ],
  ])('%s prints the loop usage and returns 1', (_label, args) => {
    const r = run(args);
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err).toEqual([USAGE]);
  });

  test.each([
    ['show', ['show', 'Bad_Name']],
    ['record', ['record', 'Bad_Name', '--kind', 'note', '--summary', 's']],
  ])('%s refuses a name that breaks the name rule before reading anything', (_verb, args) => {
    writeLoop(() => {}, 'Bad_Name');
    const r = run(args);
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err).toEqual([
      `"Bad_Name" is not a loop name: use ${PROFILE_NAME_RULE}`,
    ]);
    expect(calls).toEqual({ claude: [], git: [] });
  });
});

describe('list', () => {
  test('an empty store prints one line saying it holds no loop, naming the folder', () => {
    fs.mkdirSync(loopsRoot(), { recursive: true });
    fs.writeFileSync(path.join(loopsRoot(), '.DS_Store'), '');
    fs.mkdirSync(path.join(loopsRoot(), '.hidden'));
    const r = run(['list']);
    expect(r).toEqual({
      code: 0,
      out: [`the loop store ${loopsRoot()} holds no loop`],
      err: [],
    });
  });

  test('a missing store prints the same line', () => {
    expect(run(['list']).out).toEqual([
      `the loop store ${loopsRoot()} holds no loop`,
    ]);
  });

  test('prints one line per loop with its repo, profile, schedule, classes, and ok', () => {
    writeLoop(() => {}, 'alpha');
    writeLoop((m) => {
      m.schedule = '0 9 * * 1';
    }, 'beta');
    writeProfile();
    const r = run(['list']);
    expect(r.err).toEqual([]);
    expect(r.out).toEqual([
      `alpha  repo: ${repo}  profile: fixer  schedule: 7 * * * *  classes: triage (record), integrate (ask), label (act)  ok`,
      `beta  repo: ${repo}  profile: fixer  schedule: 0 9 * * 1  classes: triage (record), integrate (ask), label (act)  ok`,
    ]);
    expect(r.code).toBe(0);
  });

  test('a loop with issues lists its count, and the listing returns 1 as profile list does', () => {
    writeLoop((m) => {
      m.profile = 'gone';
      m.mandate.reads = ['Bash(bash -c *)'];
    });
    writeProfile();
    const r = run(['list']);
    expect(r.out).toEqual([
      `fixer  repo: ${repo}  profile: gone  schedule: 7 * * * *  classes: triage (record), integrate (ask), label (act)  refused: 2 issues (sidekick loop show fixer lists them)`,
    ]);
    expect(r.code).toBe(1);
  });

  test('a loop whose loop.json fails to parse still lists, with its issue count', () => {
    write(loopFile('broken'), '{');
    writeLoop(() => {}, 'good');
    writeProfile();
    const r = run(['list']);
    expect(r.out).toEqual([
      'broken  refused: 1 issue (sidekick loop show broken lists them)',
      `good  repo: ${repo}  profile: fixer  schedule: 7 * * * *  classes: triage (record), integrate (ask), label (act)  ok`,
    ]);
    expect(r.code).toBe(1);
  });

  test('a loop with no classes says so', () => {
    writeLoop((m) => {
      Object.assign(m.mandate, { classes: {} });
    });
    writeProfile();
    expect(run(['list']).out).toEqual([
      `fixer  repo: ${repo}  profile: fixer  schedule: 7 * * * *  classes: (none)  ok`,
    ]);
  });

  test('list runs no claude', () => {
    writeLoop();
    writeProfile();
    run(['list']);
    expect(calls.claude).toEqual([]);
  });
});

describe('show', () => {
  const recordsAt = (): RecordLine[] => [
    {
      ...at(new Date(2026, 10, 1, 8, 5)),
      kind: 'note',
      summary: 'an old note',
    },
    {
      ...at(new Date(NOW.getTime() - 25 * HOUR_MS)),
      kind: 'note',
      summary: 'yesterday, a little over a day ago',
    },
    {
      ...at(new Date(NOW.getTime() - HOUR_MS)),
      kind: 'would',
      summary: 'label it',
      class: 'triage',
      command: 'gh issue edit 5 --add-label bug',
      unit: 'u5',
    },
    {
      ...at(new Date(NOW.getTime() - 30 * 60 * 1000)),
      kind: 'note',
      summary: 'half an hour ago',
    },
    {
      ...at(new Date(NOW.getTime() - 10 * 60 * 1000)),
      kind: 'landed',
      unit: 'u5',
      commit: 'abc1234',
    },
  ];
  const seed = (): void => {
    for (const line of recordsAt()) appendRecord(loopDir(), line);
  };
  const lastDay = (): string[] => [
    `records since ${localMinute(new Date(NOW.getTime() - 24 * HOUR_MS))}:`,
    `  ${localMinute(new Date(NOW.getTime() - HOUR_MS))}  would  class triage  gh issue edit 5 --add-label bug  unit u5`,
    `  ${localMinute(new Date(NOW.getTime() - 30 * 60 * 1000))}  note  half an hour ago`,
    `  ${localMinute(new Date(NOW.getTime() - 10 * 60 * 1000))}  landed  commit abc1234  unit u5`,
  ];

  test('prints the definition, its issues and warnings, the listing, then the last 24 hours of records', () => {
    writeLoop();
    writeProfile();
    seed();
    const r = run(['show', 'fixer']);
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    const definition = [
      `definition (${loopFile()}):`,
      '  description: Fix bugs filed in the repo',
      `  repo: ${repo}`,
      '  profile: fixer',
      '  schedule: 7 * * * *',
      '  tick: /fixer:tick',
      '  hosts: ["registry.npmjs.org"]',
      '  gates: ["bun run test"]',
      '  caps: {"attemptsPerUnit":2,"workMinutesPerUnit":180,"unitsPerDay":4,"failedUnitsInARow":3}',
      '  mandate.reads: ["Bash(gh issue view *)"]',
      '  mandate.classes.triage: {"state":"record","allow":["Bash(gh issue edit * --add-label *)"]}',
      '  mandate.classes.integrate: {"state":"ask","allow":["Bash(gh issue close *)"]}',
      '  mandate.classes.label: {"state":"act","allow":["Bash(gh label list *)"]}',
      '  mandate.never: ["Bash(git push --force *)"]',
    ];
    expect(r.out.slice(0, definition.length)).toEqual(definition);
    expect(r.out.slice(definition.length, definition.length + 4)).toEqual([
      'issues:',
      '  (none)',
      'warnings:',
      '  (none)',
    ]);
    const listingAt = definition.length + 4;
    expect(r.out[listingAt]).toBe('inherited beyond the mandate:');
    expect(r.out[listingAt + 1]).toBe('  Allow rules');
    const builtins = r.out.indexOf('  Built-ins');
    expect(builtins).toBeGreaterThan(listingAt);
    expect(
      r.out.slice(builtins + 1, builtins + 1 + BUILTIN_NOTE.length),
    ).toEqual(BUILTIN_NOTE.map((line) => `    ${line}`));
    expect(r.out.slice(builtins + 1 + BUILTIN_NOTE.length)).toEqual(lastDay());
    expect(calls.claude).toEqual([['plugin', 'list', '--json']]);
  });

  test('--since reaches back to that local midnight', () => {
    writeLoop();
    writeProfile();
    seed();
    const r = run(['show', 'fixer', '--since', '2026-11-01']);
    const from = r.out.indexOf(
      `records since ${localMinute(new Date(2026, 10, 1))}:`,
    );
    expect(from).toBeGreaterThan(-1);
    expect(r.out.slice(from + 1)).toEqual([
      `  ${localMinute(new Date(2026, 10, 1, 8, 5))}  note  an old note`,
      `  ${localMinute(new Date(NOW.getTime() - 25 * HOUR_MS))}  note  yesterday, a little over a day ago`,
      ...lastDay().slice(1),
    ]);
  });

  test('a refused loop still shows, issues first, and returns 1 as profile show does', () => {
    writeLoop((m) => {
      m.profile = 'gone';
    });
    seed();
    const r = run(['show', 'fixer']);
    expect(r.code).toBe(1);
    expect(r.err).toEqual([]);
    expect(r.out[0]).toBe('issues:');
    expect(r.out[1]).toStartWith(`  ${loopFile()}: profile: `);
    expect(r.out[2]).toBe(`definition (${loopFile()}):`);
    expect(r.out).toContain('  profile: gone');
    const listing = r.out.indexOf('inherited beyond the mandate:');
    expect(r.out[listing + 1]).toBe(
      '  not listed: the listing needs a loop.json that parses and a profile that loads',
    );
    expect(r.out.slice(listing + 2)).toEqual(lastDay());
    expect(calls.claude).toEqual([]);
  });

  test('a loop whose loop.json fails to parse shows its issues, no definition, and its records', () => {
    write(loopFile(), '{');
    seed();
    const r = run(['show', 'fixer']);
    expect(r.code).toBe(1);
    expect(r.out.slice(0, 4)).toEqual([
      'issues:',
      expect.stringContaining(`  ${loopFile()}: invalid JSON: `),
      `definition (${loopFile()}):`,
      '  not shown: loop.json did not load; the issues say why',
    ]);
    expect(r.out).toContain(
      '  not listed: the listing needs a loop.json that parses and a profile that loads',
    );
    expect(r.out.slice(-lastDay().length)).toEqual(lastDay());
  });

  test('withholds a definition value the key check flags, naming its ids', () => {
    writeLoop((m) => {
      m.description = `token ${key()}`;
      m.mandate.never.push(`Bash(echo ${key()})`);
    });
    writeProfile();
    const r = run(['show', 'fixer']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('  description: (withheld: github-classic-pat)');
    expect(r.out).toContain('  mandate.never: (withheld: github-classic-pat)');
    expect(r.out).toContain('  profile: fixer');
    expect(r.out.join('\n')).not.toContain(key());
  });

  test("warnings hold the check's and the listing's own", () => {
    writeLoop((m) => {
      m.hosts = ['github.com'];
    });
    writeProfile();
    claudeReply = { code: 1, stdout: '', stderr: 'boom', timedOut: false };
    const r = run(['show', 'fixer']);
    expect(r.code).toBe(0);
    const from = r.out.indexOf('warnings:');
    expect(r.out.slice(from + 1, from + 3)).toEqual([
      `  ${loopFile()}: hosts: github.com: ${GITHUB_HOST_WARNING}`,
      '  The plugin list is incomplete: claude plugin list exited with code 1.',
    ]);
  });

  test('counts the lines it skipped', () => {
    writeLoop();
    writeProfile();
    seed();
    fs.appendFileSync(
      path.join(loopDir(), 'records', '2026-11-14.jsonl'),
      'not json\n{"v":1}\n',
    );
    const r = run(['show', 'fixer']);
    expect(r.out.at(-1)).toBe('  skipped 2 lines that did not parse');
  });

  test('names a day file it cannot read, after the records', () => {
    writeLoop();
    writeProfile();
    const file = path.join(loopDir(), 'records', '2026-11-14.jsonl');
    fs.mkdirSync(file, { recursive: true });
    appendRecord(loopDir(), {
      ...at(new Date(NOW.getTime() - 20 * HOUR_MS)),
      kind: 'note',
      summary: 'yesterday',
    });
    const r = run(['show', 'fixer']);
    expect(r.out.at(-2)).toEndWith('  note  yesterday');
    expect(r.out.at(-1)).toStartWith(`  could not read ${file}: `);
    expect(r.out.at(-1)).toContain('EISDIR');
  });

  test('a loop with no records in the window says so', () => {
    writeLoop();
    writeProfile();
    const r = run(['show', 'fixer']);
    expect(r.out.slice(-2)).toEqual([
      `records since ${localMinute(new Date(NOW.getTime() - 24 * HOUR_MS))}:`,
      '  (none)',
    ]);
  });

  test.each([
    'yesterday',
    '2026-13-01',
    '2026-02-30',
    '26-11-01',
    '',
  ])('a bad --since %p is a usage error', (since) => {
    writeLoop();
    const r = run(['show', 'fixer', '--since', since]);
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err).toEqual([
      `--since takes a local date as YYYY-MM-DD, got "${since}"`,
      USAGE,
    ]);
  });
});

describe('record', () => {
  const recordArgs = (...extra: string[]): string[] => [
    'record',
    'fixer',
    ...extra,
  ];
  const linesToday = (): RecordLine[] =>
    readRecords(loopDir(), new Date(2026, 10, 14), NOW).lines;
  const stamp = at(NOW);

  test.each<[string, string[], RecordLine, string]>([
    [
      'would',
      ['--class', 'triage', '--command', 'gh issue edit 5', '--unit', 'u5'],
      {
        ...stamp,
        kind: 'would',
        summary: 's',
        class: 'triage',
        command: 'gh issue edit 5',
        unit: 'u5',
      },
      'recorded would',
    ],
    [
      'request',
      ['--command', 'gh issue close 5', '--class', 'integrate'],
      {
        ...stamp,
        kind: 'request',
        summary: 's',
        command: 'gh issue close 5',
        class: 'integrate',
      },
      'new request',
    ],
    [
      'did',
      ['--class', 'label', '--command', 'gh label list'],
      {
        ...stamp,
        kind: 'did',
        summary: 's',
        class: 'label',
        command: 'gh label list',
      },
      'recorded did',
    ],
    [
      'denied',
      ['--command', 'gh repo delete'],
      { ...stamp, kind: 'denied', summary: 's', command: 'gh repo delete' },
      'recorded denied',
    ],
    [
      'note',
      ['--unit', 'u5'],
      { ...stamp, kind: 'note', summary: 's', unit: 'u5' },
      'recorded note',
    ],
  ])('--kind %s appends its line and prints one line', (kind, extra, line, printed) => {
    writeLoop();
    const r = run(recordArgs('--kind', kind, '--summary', 's', ...extra));
    expect(r).toEqual({ code: 0, out: [printed], err: [] });
    expect(linesToday()).toEqual([line]);
  });

  test('runs no git and no claude, so it succeeds when the profile is gone and the repo has moved', () => {
    writeLoop((m) => {
      m.repo = path.join(tmp, 'moved-away');
      m.profile = 'gone';
    });
    const r = run(recordArgs('--kind', 'note', '--summary', 'still here'));
    expect(r).toEqual({ code: 0, out: ['recorded note'], err: [] });
    expect(calls).toEqual({ claude: [], git: [] });
  });

  test('a request is new, then a repeat, then new once two fires have passed', () => {
    writeLoop();
    const ask = recordArgs(
      '--kind',
      'request',
      '--summary',
      'close it',
      '--command',
      'gh issue close 5',
      '--unit',
      'u5',
    );
    expect(run(ask).out).toEqual(['new request']);
    expect(run(ask).out).toEqual(['repeat request']);
    // Another unit is another request.
    expect(run([...ask.slice(0, -1), 'u6']).out).toEqual(['new request']);
    const later = new Date(NOW.getTime() + 2 * HOUR_MS);
    expect(run(ask, { now: () => later }).out).toEqual(['new request']);
  });

  const refusals: [string, string[], string[]][] = [
    [
      'a verb kind, dispatched',
      ['--kind', 'dispatched', '--summary', 's'],
      [
        '--kind dispatched: only sidekick loop dispatch writes it, since the caps count it; record writes would, request, did, denied, and note',
      ],
    ],
    [
      'a verb kind, landed',
      ['--kind', 'landed', '--summary', 's'],
      [
        '--kind landed: only sidekick loop land writes it, since the caps count it; record writes would, request, did, denied, and note',
      ],
    ],
    [
      'a verb kind, failed',
      ['--kind', 'failed', '--summary', 's'],
      [
        '--kind failed: only sidekick loop reap and sidekick loop land write it, since the caps count it; record writes would, request, did, denied, and note',
      ],
    ],
    [
      'a verb kind, discarded',
      ['--kind', 'discarded', '--summary', 's'],
      [
        '--kind discarded: only sidekick loop discard and sidekick loop reap write it, since the caps count it; record writes would, request, did, denied, and note',
      ],
    ],
    [
      'an unknown kind',
      ['--kind', 'shout', '--summary', 's'],
      ['--kind shout: record writes would, request, did, denied, and note'],
    ],
    [
      'would without --class',
      ['--kind', 'would', '--summary', 's', '--command', 'x'],
      ['--kind would needs --class'],
    ],
    [
      'did without --class',
      ['--kind', 'did', '--summary', 's', '--command', 'x'],
      ['--kind did needs --class'],
    ],
    [
      'would without --class or --command',
      ['--kind', 'would', '--summary', 's'],
      ['--kind would needs --class', '--kind would needs --command'],
    ],
    [
      'request without --command',
      ['--kind', 'request', '--summary', 's'],
      ['--kind request needs --command'],
    ],
    [
      'denied without --command',
      ['--kind', 'denied', '--summary', 's'],
      ['--kind denied needs --command'],
    ],
    [
      'did without --command',
      ['--kind', 'did', '--summary', 's', '--class', 'label'],
      ['--kind did needs --command'],
    ],
    [
      'note with --class',
      ['--kind', 'note', '--summary', 's', '--class', 'triage'],
      ['--kind note takes no --class: its line holds a summary alone'],
    ],
    [
      'note with --command',
      ['--kind', 'note', '--summary', 's', '--command', 'x'],
      ['--kind note takes no --command: its line holds a summary alone'],
    ],
    [
      'a class loop.json does not name',
      [
        '--kind',
        'would',
        '--summary',
        's',
        '--class',
        'nope',
        '--command',
        'x',
      ],
      [
        `--class nope: <loop.json> names no class "nope" in mandate.classes; record checks loop.json as it is now, so a class removed since the loop started refuses until its next start`,
      ],
    ],
    [
      'did on a class in record',
      [
        '--kind',
        'did',
        '--summary',
        's',
        '--class',
        'triage',
        '--command',
        'x',
      ],
      [
        `--kind did: class "triage" is in state record in <loop.json>; did needs a class in act, so record it as would or ask with request`,
      ],
    ],
    [
      'did on a class in ask',
      [
        '--kind',
        'did',
        '--summary',
        's',
        '--class',
        'integrate',
        '--command',
        'x',
      ],
      [
        `--kind did: class "integrate" is in state ask in <loop.json>; did needs a class in act, so record it as would or ask with request`,
      ],
    ],
    [
      'an empty summary',
      ['--kind', 'note', '--summary', ''],
      ['--summary: Invalid length: Expected >=1 but received 0'],
    ],
    [
      'a summary past 1,000 characters',
      ['--kind', 'note', '--summary', 'x'.repeat(1001)],
      ['--summary: Invalid length: Expected <=1000 but received 1001'],
    ],
    [
      'a command past 4,000 characters',
      ['--kind', 'denied', '--summary', 's', '--command', 'x'.repeat(4001)],
      ['--command: Invalid length: Expected <=4000 but received 4001'],
    ],
    [
      'a bad unit',
      ['--kind', 'note', '--summary', 's', '--unit', 'two words'],
      ['--unit: must be 1 to 64 of A-Z a-z 0-9 . _ -'],
    ],
    [
      'an ESC in the summary',
      ['--kind', 'note', '--summary', 'a\u001b[1Ab'],
      [
        '--summary: must hold no control character (U+0000 to U+001F, or U+007F)',
      ],
    ],
    [
      'a newline in the command',
      ['--kind', 'denied', '--summary', 's', '--command', 'a\nb'],
      [
        '--command: must hold no control character (U+0000 to U+001F, or U+007F)',
      ],
    ],
  ];

  // The table is built before `beforeEach` makes the folders, so it names the loop's file by a placeholder.
  test.each(refusals)('refuses %s, writing nothing', (_label, args, err) => {
    writeLoop();
    const r = run(recordArgs(...args));
    expect(r).toEqual({
      code: 1,
      out: [],
      err: err.map((line) => line.replace('<loop.json>', loopFile())),
    });
    expect(fs.existsSync(path.join(loopDir(), 'records'))).toBe(false);
  });

  test.each([
    ['--summary', ['--kind', 'note', '--summary', `token ${key()}`]],
    [
      '--command',
      ['--kind', 'denied', '--summary', 's', '--command', `echo ${key()}`],
    ],
    [
      '--class',
      ['--kind', 'would', '--summary', 's', '--class', key(), '--command', 'x'],
    ],
    ['--unit', ['--kind', 'note', '--summary', 's', '--unit', key()]],
  ])('refuses a key in %s, naming the check and never the text', (flag, args) => {
    writeLoop();
    const r = run(recordArgs(...args));
    expect(r).toEqual({
      code: 1,
      out: [],
      err: [
        `${flag} holds text that looks like a key (github-classic-pat): keep keys out of the record`,
      ],
    });
    expect(r.err.join('\n')).not.toContain(key());
    expect(fs.existsSync(path.join(loopDir(), 'records'))).toBe(false);
  });

  test('refuses when loop.json fails to parse, naming its issues', () => {
    writeLoop((m) => {
      Object.assign(m, { schedule: 'often' });
    });
    const r = run(recordArgs('--kind', 'note', '--summary', 's'));
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err).toEqual([
      `${loopFile()}: schedule: a schedule needs five fields (minute hour day-of-month month day-of-week), got 1`,
    ]);
  });

  test('refuses a loop with no loop.json', () => {
    const r = run(recordArgs('--kind', 'note', '--summary', 's'));
    expect(r).toEqual({ code: 1, out: [], err: [`${loopFile()}: missing`] });
  });
});

test('this test file holds no literal key', () => {
  expect(keyHits(fs.readFileSync(import.meta.path, 'utf8'))).toEqual([]);
});
