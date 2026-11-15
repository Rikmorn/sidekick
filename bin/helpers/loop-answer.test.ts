import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  LOOP,
  NOW,
  snapshot,
  UNIT,
  UNNAMED_UNIT,
  type UnitFixture,
  unitFixture,
  unnamedInFlight,
  WORKER,
} from './fixtures/loop/units.js';
import { removeTemps } from './fixtures/worker/repo.js';
import { localDate, localMinute } from './local-date.js';
import { LOOP_USAGE_LINE, type LoopEnv, runLoopCli } from './loop.js';
import { ANSWER_USAGE_LINE } from './loop-answer.js';
import { keyHits } from './memory-patterns.js';

afterEach(removeTemps);

const key = (): string => `${'ghp'}${'_'}${'a1'.repeat(18)}`;

const answerArgs = (text: string, unit = UNIT): string[] => [
  'answer',
  LOOP,
  '--unit',
  unit,
  text,
];

function run(fx: UnitFixture, args: string[], over: Partial<LoopEnv> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = runLoopCli(
    args,
    fx.lenv(over),
    (l) => out.push(l),
    (l) => err.push(l),
  );
  return { code, out, err };
}

const rulingsOf = (fx: UnitFixture): string =>
  path.join(fx.attempt, 'rulings.md');

const heading = `## Ruling, ${localMinute(NOW)}`;

describe('loop answer', () => {
  test('answer appends and writes answered', () => {
    const fx = unitFixture();
    const first = 'Use the v2 API.\n\tKeep the v1 shim.';
    const r = run(fx, answerArgs(first));
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(fs.readFileSync(rulingsOf(fx), 'utf8')).toBe(
      `${heading}\n\n${first}\n`,
    );
    expect(fx.ledger().slice(1)).toEqual([
      {
        v: 1,
        at: NOW.toISOString(),
        kind: 'answered',
        unit: UNIT,
        worker: WORKER,
      },
    ]);
    expect(r.out[0]).toBe(
      `unit ${UNIT} · worker ${WORKER} · answered in ${rulingsOf(fx)}`,
    );
    const second = run(fx, answerArgs('Skip the flaky test.\n'));
    expect(second.code).toBe(0);
    expect(fs.readFileSync(rulingsOf(fx), 'utf8')).toBe(
      `${heading}\n\n${first}\n\n${heading}\n\nSkip the flaky test.\n`,
    );
    expect(fx.ledger().map((l) => l.kind)).toEqual([
      'dispatched',
      'answered',
      'answered',
    ]);
    expect(fs.existsSync(path.join(fx.loopDir, 'units.lock'))).toBe(false);
  });

  test('answer outside the loop prints the wake step', () => {
    const fx = unitFixture();
    const wake = `next: message loop-${LOOP} to wake it, so it wakes worker ${WORKER} and points it at ${rulingsOf(fx)}`;
    expect(run(fx, answerArgs('Go ahead.')).out.at(-1)).toBe(wake);
    const empty = { env: { CLAUDE_CONFIG_DIR: fx.config, SIDEKICK_LOOP: '' } };
    expect(run(fx, answerArgs('Go ahead.'), empty).out.at(-1)).toBe(wake);
  });

  test('answer inside its own loop prints the wake verb, then the message', () => {
    const fx = unitFixture();
    const r = run(fx, answerArgs('Go ahead.'), {
      env: { CLAUDE_CONFIG_DIR: fx.config, SIDEKICK_LOOP: LOOP },
    });
    expect(r.code).toBe(0);
    expect(r.out.at(-1)).toBe(
      `next: run sidekick loop wake ${LOOP} --unit ${UNIT}, then message ${WORKER} to read ${rulingsOf(fx)}`,
    );
  });

  test('answer takes text of 20,000 characters, and refuses one more', () => {
    const fx = unitFixture();
    expect(run(fx, answerArgs('a'.repeat(20_000))).code).toBe(0);
    const before = snapshot(fx.loopDir);
    const r = run(fx, answerArgs('a'.repeat(20_001)));
    expect(r.code).toBe(1);
    expect(r.err).toEqual([
      'the text runs to 20001 characters, past the cap of 20000: shorten the ruling',
    ]);
    expect(snapshot(fx.loopDir)).toEqual(before);
  });
});

describe('loop answer refuses, changing nothing', () => {
  test.each([
    ['a bell', 'a\u0007b', 'U+0007'],
    ['a carriage return', 'a\r\nb', 'U+000D'],
    ['an escape', '\u001b[2Jhidden', 'U+001B'],
    ['a delete', 'a\u007fb', 'U+007F'],
    ['a C1 control', 'a\u0085b', 'U+0085'],
    [
      'two controls, each named once',
      'a\u0007b\u001bc\u0007',
      'U+0007, U+001B',
    ],
  ])('answer refuses a control character other than newline and tab: %s', (_label, text, named) => {
    const fx = unitFixture();
    const before = snapshot(fx.loopDir);
    const r = run(fx, answerArgs(text));
    expect(r).toEqual({
      code: 1,
      out: [],
      err: [
        `the text holds a control character (${named}): it may hold newlines and tabs, and no other control character`,
      ],
    });
    expect(fx.claude.calls).toEqual([]);
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test('answer refuses a key', () => {
    const fx = unitFixture();
    const before = snapshot(fx.loopDir);
    const r = run(fx, answerArgs(`use the token ${key()} for the API`));
    expect(r.code).toBe(1);
    expect(r.err).toEqual([
      'the text holds what looks like a key (github-classic-pat): keep keys out of the rulings file',
    ]);
    expect(r.err.join('\n')).not.toContain(key());
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  const rows: [
    string,
    string[],
    (fx: UnitFixture) => Partial<LoopEnv>,
    string,
  ][] = [
    [
      'an empty text',
      answerArgs(' \n\t'),
      () => ({}),
      'the text is empty: write the ruling in it',
    ],
    [
      'a unit id that names a folder',
      answerArgs('ok', '..'),
      () => ({}),
      'unit: .. names a folder, not a unit',
    ],
    [
      "another loop's SIDEKICK_LOOP",
      answerArgs('ok'),
      () => ({ env: { SIDEKICK_LOOP: 'other' } }),
      'SIDEKICK_LOOP is "other", so this session cannot run loop answer for "fixer"',
    ],
    [
      'a non-empty SIDEKICK_WORKER',
      answerArgs('ok'),
      (fx) => ({
        env: { CLAUDE_CONFIG_DIR: fx.config, SIDEKICK_WORKER: fx.brief },
      }),
      'SIDEKICK_WORKER is set',
    ],
    [
      'a units.lock another verb holds',
      answerArgs('ok'),
      (fx) => {
        fs.writeFileSync(
          path.join(fx.loopDir, 'units.lock'),
          JSON.stringify({ pid: 77, at: NOW.toISOString() }),
        );
        return { isAlive: (pid: number) => pid === 77 };
      },
      'another unit verb holds the lock (pid 77)',
    ],
  ];

  test.each(rows)('%s', (_label, args, setup, expected) => {
    const fx = unitFixture();
    const over = setup(fx);
    const before = snapshot(fx.loopDir);
    const r = run(fx, args, over);
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err.join('\n')).toContain(expected);
    expect(fx.claude.calls).toEqual([]);
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test('answer refuses a unit with no attempt in flight', () => {
    const fx = unitFixture();
    const before = snapshot(fx.loopDir);
    const r = run(fx, answerArgs('ok', 'triage-7'));
    expect(r).toEqual({
      code: 1,
      out: [],
      err: [
        `no attempt for unit triage-7 is in flight, so answer has no worker to rule for; the attempt in flight is unit ${UNIT}, worker ${WORKER}`,
      ],
    });
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test('a rulings file that is a symbolic link is never followed, and no answered line is written', () => {
    const fx = unitFixture();
    const target = path.join(fx.home, 'elsewhere.md');
    fs.writeFileSync(target, 'kept\n');
    fs.symlinkSync(target, rulingsOf(fx));
    const r = run(fx, answerArgs('ok'));
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err).toHaveLength(1);
    expect(r.err[0]).toStartWith(
      `cannot write the ruling to ${rulingsOf(fx)}:`,
    );
    expect(fs.readFileSync(target, 'utf8')).toBe('kept\n');
    expect(fx.ledger().map((l) => l.kind)).toEqual(['dispatched']);
  });

  test('answer refuses an attempt whose record names no worker, writing nothing', () => {
    const fx = unitFixture();
    unnamedInFlight(fx);
    const before = snapshot(fx.loopDir);
    const r = run(fx, answerArgs('ok', UNNAMED_UNIT));
    expect(r).toEqual({
      code: 1,
      out: [],
      err: [
        `the attempt in flight for unit ${UNNAMED_UNIT} names no worker, so answer has no rulings file to write`,
      ],
    });
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test('a record that cannot be written after the ruling says the ruling is in, and that a re-run appends it again', () => {
    const fx = unitFixture();
    const day = path.join(fx.loopDir, 'records', `${localDate(NOW)}.jsonl`);
    fs.chmodSync(day, 0o444);
    const r = run(fx, answerArgs('Go ahead.'));
    fs.chmodSync(day, 0o644);
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err).toHaveLength(1);
    expect(r.err[0]).toStartWith(
      `the ruling is already in ${rulingsOf(fx)}, but answer cannot write the record in ${fx.loopDir}:`,
    );
    expect(r.err[0]).toEndWith(
      ". Running answer again appends the ruling a second time, and the attempt's wait stays open until an answered line closes it",
    );
    expect(fs.readFileSync(rulingsOf(fx), 'utf8')).toBe(
      `${heading}\n\nGo ahead.\n`,
    );
    expect(fx.ledger().map((l) => l.kind)).toEqual(['dispatched']);
  });

  test('answer of an overdue attempt lets the reap close it, then refuses', () => {
    const fx = unitFixture({ dispatchedAgo: 240 });
    const r = run(fx, answerArgs('ok'));
    expect(r.code).toBe(1);
    expect(r.out[0]).toStartWith(`unit ${UNIT} · worker ${WORKER} worked 240`);
    expect(r.err).toEqual([
      `no attempt for unit ${UNIT} is in flight, so answer has no worker to rule for`,
    ]);
    expect(fs.existsSync(rulingsOf(fx))).toBe(false);
    expect(fx.ledger().map((l) => l.kind)).toEqual([
      'dispatched',
      'failed',
      'discarded',
    ]);
  });

  test('answer refuses when the reap cannot stop an overdue worker, writing nothing', () => {
    const fx = unitFixture({ dispatchedAgo: 240 });
    fx.claude.state.stopResult = {
      code: 1,
      stdout: '',
      stderr: '',
      timedOut: false,
    };
    const before = snapshot(fx.loopDir);
    const r = run(fx, answerArgs('ok'));
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err[0]).toStartWith(`unit ${UNIT} · worker ${WORKER} worked 240`);
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test.each([
    ['no text', ['answer', LOOP, '--unit', UNIT]],
    ['no --unit', ['answer', LOOP, 'ok']],
    ['two texts', ['answer', LOOP, '--unit', UNIT, 'a', 'b']],
    ['an unknown flag', [...answerArgs('ok'), '--force']],
  ])('%s prints the usage', (_label, args) => {
    const fx = unitFixture();
    expect(run(fx, args)).toEqual({
      code: 1,
      out: [],
      err: [`usage: ${ANSWER_USAGE_LINE}`],
    });
  });
});

test('the usage names answer', () => {
  expect(ANSWER_USAGE_LINE).toBe(
    'sidekick loop answer <name> --unit <id> <text>',
  );
  expect(LOOP_USAGE_LINE).toContain('| answer <name> --unit <id> <text>');
});

test('this test file holds no literal key', () => {
  expect(keyHits(fs.readFileSync(import.meta.path, 'utf8'))).toEqual([]);
});
