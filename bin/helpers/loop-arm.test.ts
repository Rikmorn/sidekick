import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { localMinute } from './local-date.js';
import type { LoopEnv } from './loop.js';
import {
  armPrompt,
  RENEWAL_VARIABLE,
  renewalCron,
  renewalTime,
  runArm,
} from './loop-arm.js';
import { readArmed } from './loop-state.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 15, 10, 0, 30);

let tmp: string;
let home: string;
let loopDir: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-loop-arm-'));
  home = path.join(tmp, 'home');
  loopDir = path.join(home, '.claude', 'sidekick', 'loops', 'fixer');
  fs.mkdirSync(loopDir, { recursive: true });
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const lenvOf = (env: Record<string, string> = {}): LoopEnv => ({
  env,
  cwd: tmp,
  home,
  workTree: { kind: 'outside' },
  tmpdir: tmp,
  runClaude: () => {
    throw new Error('arm runs no claude');
  },
  runGit: () => {
    throw new Error('arm runs no git');
  },
  write: () => {},
  now: () => NOW,
});

const arm = (args: string[], env: Record<string, string> = {}) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = runArm(
    args,
    lenvOf(env),
    (l) => out.push(l),
    (l) => err.push(l),
  );
  return { code, out, err };
};

const stateOf = (launch = 'L1') => ({
  v: 1,
  launch,
  job: 'job1',
  session: 'loop-fixer',
  launchedAt: NOW.toISOString(),
  startedAt: NOW.toISOString(),
  hash: 'h'.repeat(64),
  record: false,
  states: { triage: 'record' },
  schedule: '7 * * * *',
  tick: '/fixer:tick',
});
const writeState = (launch = 'L1'): void =>
  fs.writeFileSync(
    path.join(loopDir, 'state.json'),
    JSON.stringify(stateOf(launch)),
  );
const writeArmedFile = (launch: string): void =>
  fs.writeFileSync(
    path.join(loopDir, 'armed.json'),
    JSON.stringify({
      v: 1,
      launch,
      at: NOW.toISOString(),
      tick: 'oldtick',
      renewal: 'oldren',
      renewalAt: NOW.toISOString(),
    }),
  );
const filesIn = (): string[] => fs.readdirSync(loopDir).sort();

describe('renewalTime and renewalCron', () => {
  test('six days on, rounded up to the next whole minute', () => {
    const at = renewalTime(new Date(2026, 10, 15, 10, 0, 30));
    expect(at.getTime()).toBe(
      new Date(2026, 10, 15, 10, 1, 0).getTime() + 6 * DAY_MS,
    );
  });

  test('a whole minute stays', () => {
    const now = new Date(2026, 10, 15, 10, 0, 0);
    expect(renewalTime(now).getTime()).toBe(now.getTime() + 6 * DAY_MS);
  });

  test('minutes replaces the six days', () => {
    const now = new Date(2026, 10, 15, 10, 0, 0);
    expect(renewalTime(now, 3).getTime()).toBe(now.getTime() + 3 * 60_000);
  });

  test('the cron reads local minute, hour, day, and month', () => {
    expect(renewalCron(new Date(2026, 10, 21, 10, 1))).toBe('1 10 21 11 *');
  });

  test('six days from 2026-12-28 crosses the year end', () => {
    const at = renewalTime(new Date(2026, 11, 28, 10, 0, 0));
    expect(renewalCron(at)).toBe(
      `${at.getMinutes()} ${at.getHours()} ${at.getDate()} ${at.getMonth() + 1} *`,
    );
    expect(at.getMonth()).toBe(0);
    expect(at.getDate()).toBe(3);
  });
});

describe('arm', () => {
  test('the prompt starts the skill with the loop name', () => {
    expect(armPrompt('fixer')).toBe('/sidekick:loop-arm fixer');
  });

  test.each([
    ['a missing state.json', () => {}, {}, 'does not exist'],
    [
      'a broken state.json',
      () => fs.writeFileSync(path.join(loopDir, 'state.json'), '{nope'),
      {},
      'state.json',
    ],
    ['another loop', () => writeState(), { SIDEKICK_LOOP: 'other' }, 'other'],
    ['a bad loop name', () => writeState(), {}, 'is not a loop name'],
  ])('the plain form refuses %s and writes nothing', (label, setup, env, text) => {
    setup();
    const before = filesIn();
    const r = arm([label === 'a bad loop name' ? 'Bad Name' : 'fixer'], env);
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err.join('\n')).toContain(text);
    expect(filesIn()).toEqual(before);
  });

  test('the plain form prints each job and the --armed line, and writes nothing', () => {
    writeState();
    const r = arm(['fixer'], { SIDEKICK_LOOP: 'fixer' });
    const renewalAt = renewalTime(NOW);
    expect(r.code).toBe(0);
    expect(r.err).toEqual([]);
    expect(r.out).toEqual([
      'loop: fixer',
      'launch: L1',
      'tick job: recurring',
      'tick schedule: 7 * * * *',
      'tick prompt: /fixer:tick',
      'renewal job: one-shot',
      `renewal cron: ${renewalCron(renewalAt)}`,
      `renewal at: ${localMinute(renewalAt)}`,
      'renewal prompt: /sidekick:loop-arm fixer',
      'old jobs: none recorded',
      'after both jobs exist, run: sidekick loop arm fixer --armed --tick <tick job id> --renewal <renewal job id>',
    ]);
    expect(filesIn()).toEqual(['state.json']);
  });

  test('the plain form prints the ids of a current armed.json, and ignores a stale one', () => {
    writeState();
    writeArmedFile('L1');
    const current = arm(['fixer']).out;
    expect(current).toContain('old tick job id: oldtick');
    expect(current).toContain('old renewal job id: oldren');
    writeArmedFile('older-launch');
    const stale = arm(['fixer']).out;
    expect(stale).toContain('old jobs: none recorded');
    expect(stale.join('\n')).not.toContain('oldtick');
  });

  test('the variable moves the renewal that many minutes on', () => {
    writeState();
    const r = arm(['fixer'], { [RENEWAL_VARIABLE]: '3' });
    const at = renewalTime(NOW, 3);
    expect(r.out).toContain(`renewal cron: ${renewalCron(at)}`);
  });

  test.each([
    '0',
    '-1',
    'x',
    '',
    '1.5',
  ])('the variable %p refuses, naming it', (value) => {
    writeState();
    const r = arm(['fixer'], { [RENEWAL_VARIABLE]: value });
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain(RENEWAL_VARIABLE);
  });

  test('--armed writes armed.json with the launch, the time, both ids, and the renewal time', () => {
    writeState();
    const r = arm([
      'fixer',
      '--armed',
      '--tick',
      'abc123',
      '--renewal',
      'r_9-x',
    ]);
    expect(r.code).toBe(0);
    const read = readArmed(loopDir);
    expect(read).toEqual({
      kind: 'ok',
      value: {
        v: 1,
        launch: 'L1',
        at: NOW.toISOString(),
        tick: 'abc123',
        renewal: 'r_9-x',
        renewalAt: renewalTime(NOW).toISOString(),
      },
    });
  });

  test('--armed follows the renewal variable', () => {
    writeState();
    arm(['fixer', '--armed', '--tick', 'a', '--renewal', 'b'], {
      [RENEWAL_VARIABLE]: '3',
    });
    const read = readArmed(loopDir);
    expect(read.kind === 'ok' && read.value.renewalAt).toBe(
      renewalTime(NOW, 3).toISOString(),
    );
  });

  test.each([
    '',
    'has space',
    'a/b',
    'x'.repeat(65),
  ])('--armed refuses the id %p', (id) => {
    writeState();
    const r = arm(['fixer', '--armed', '--tick', id, '--renewal', 'ok']);
    expect(r.code).toBe(1);
    expect(filesIn()).toEqual(['state.json']);
  });

  test('--armed refuses a missing state.json', () => {
    const r = arm(['fixer', '--armed', '--tick', 'a', '--renewal', 'b']);
    expect(r.code).toBe(1);
    expect(filesIn()).toEqual([]);
  });

  test.each([
    [['fixer', '--armed']],
    [['fixer', '--tick', 'a']],
    [['fixer', '--armed', '--tick', 'a']],
    [[]],
  ])('usage errors: %p', (args) => {
    writeState();
    const r = arm(args);
    expect(r.code).toBe(1);
    expect(r.err[0]).toContain('usage: sidekick loop arm');
  });
});
