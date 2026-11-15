import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  LOOP,
  MINUTE_MS,
  NOW,
  snapshot,
  type UnitFixture,
  unitFixture,
} from './fixtures/loop/units.js';
import { removeTemps } from './fixtures/worker/repo.js';
import { LOOP_USAGE_LINE, type LoopEnv, runLoopCli } from './loop.js';
import { readLoopManifest } from './loop-manifest.js';
import { appendRecord } from './loop-record.js';
import { RESUME_USAGE_LINE } from './loop-resume.js';
import { breakerTripped } from './loop-units.js';
import { keyHits } from './memory-patterns.js';

afterEach(removeTemps);

const key = (): string => `${'ghp'}${'_'}${'a1'.repeat(18)}`;

const resumeArgs = (reason = 'the flaky gate is fixed'): string[] => [
  'resume',
  LOOP,
  '--reason',
  reason,
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

// `count` units failed, one a minute, before `NOW`.
const failUnits = (fx: UnitFixture, count: number): void => {
  for (let n = count; n >= 1; n--) {
    appendRecord(fx.loopDir, {
      v: 1,
      at: new Date(NOW.getTime() - n * MINUTE_MS).toISOString(),
      kind: 'failed',
      unit: `triage-${n}`,
      reason: 'gate failed',
    });
  }
};

// The caps the fixture's `loop.json` sets.
const capsOf = (fx: UnitFixture) => {
  const read = readLoopManifest(path.join(fx.loopDir, 'loop.json'));
  if (!read.ok) throw new Error(read.issues.join('\n'));
  return read.manifest.caps;
};

describe('loop resume', () => {
  test('resume refuses an untripped breaker', () => {
    const fx = unitFixture();
    failUnits(fx, 2);
    const before = snapshot(fx.loopDir);
    const r = run(fx, resumeArgs());
    expect(r).toEqual({
      code: 1,
      out: [],
      err: [
        'the breaker has not tripped: 2 units failed in a row, the cap is 3, so resume has nothing to reset',
      ],
    });
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test('resume writes resumed, and the breaker no longer trips', () => {
    const fx = unitFixture();
    failUnits(fx, 3);
    expect(breakerTripped(fx.ledger(), capsOf(fx))).toBe(true);
    const r = run(fx, resumeArgs());
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(fx.ledger().at(-1)).toEqual({
      v: 1,
      at: NOW.toISOString(),
      kind: 'resumed',
      reason: 'the flaky gate is fixed',
    });
    expect(breakerTripped(fx.ledger(), capsOf(fx))).toBe(false);
    expect(r.out).toEqual([
      `loop ${LOOP} resumed: the count of units failed in a row restarts at 0`,
    ]);
    expect(fs.existsSync(path.join(fx.loopDir, 'units.lock'))).toBe(false);
  });

  test('an empty SIDEKICK_LOOP reads as unset, so the operator may resume', () => {
    const fx = unitFixture();
    failUnits(fx, 3);
    const r = run(fx, resumeArgs(), {
      env: { CLAUDE_CONFIG_DIR: fx.config, SIDEKICK_LOOP: '' },
    });
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(fx.ledger().at(-1)?.kind).toBe('resumed');
  });

  test('resume reaps nothing, so it calls no claude, even past the work cap', () => {
    const fx = unitFixture({ dispatchedAgo: 240 });
    failUnits(fx, 3);
    const r = run(fx, resumeArgs());
    expect(r.code).toBe(0);
    expect(fx.claude.calls).toEqual([]);
    expect(
      fx
        .ledger()
        .map((l) => l.kind)
        .at(-1),
    ).toBe('resumed');
  });
});

describe('loop resume refuses, changing nothing', () => {
  const rows: [
    string,
    string[],
    (fx: UnitFixture) => Partial<LoopEnv>,
    string,
  ][] = [
    [
      'an empty reason',
      resumeArgs(''),
      () => ({}),
      '--reason: Invalid length: Expected >=1 but received 0',
    ],
    [
      'a reason with a control character',
      resumeArgs('a\u0007b'),
      () => ({}),
      '--reason: must hold no control character',
    ],
    [
      'a key in the reason, naming the check and never the text',
      resumeArgs(`token ${key()}`),
      () => ({}),
      '--reason holds text that looks like a key (github-classic-pat): keep keys out of the record',
    ],
    [
      "another loop's SIDEKICK_LOOP",
      resumeArgs(),
      (fx) => ({
        env: { CLAUDE_CONFIG_DIR: fx.config, SIDEKICK_LOOP: 'other' },
      }),
      'SIDEKICK_LOOP is "other": resume is the operator\'s and runs from a main, so a loop never clears a breaker',
    ],
    [
      "the loop's own SIDEKICK_LOOP, as its compiled env sets it",
      resumeArgs(),
      (fx) => ({ env: { CLAUDE_CONFIG_DIR: fx.config, SIDEKICK_LOOP: LOOP } }),
      'SIDEKICK_LOOP is "fixer": resume is the operator\'s and runs from a main, so a loop never clears a breaker',
    ],
    [
      'a non-empty SIDEKICK_WORKER',
      resumeArgs(),
      (fx) => ({
        env: { CLAUDE_CONFIG_DIR: fx.config, SIDEKICK_WORKER: fx.brief },
      }),
      'SIDEKICK_WORKER is set',
    ],
    [
      'a store with no such loop',
      resumeArgs(),
      (fx) => ({ env: { CLAUDE_CONFIG_DIR: path.join(fx.home, 'other') } }),
      'holds no loop "fixer"',
    ],
    [
      'a units.lock another verb holds',
      resumeArgs(),
      (fx) => {
        fs.writeFileSync(
          path.join(fx.loopDir, 'units.lock'),
          JSON.stringify({ pid: 77, at: NOW.toISOString() }),
        );
        return { isAlive: (pid: number) => pid === 77 };
      },
      'another unit verb holds the lock (pid 77)',
    ],
    [
      'a record it cannot read',
      resumeArgs(),
      (fx) => {
        fs.mkdirSync(path.join(fx.loopDir, 'records', '2026-11-13.jsonl'));
        return {};
      },
      "resume cannot read the loop's record, so it cannot count the units failed in a row",
    ],
  ];

  test.each(rows)('%s', (_label, args, setup, expected) => {
    const fx = unitFixture();
    failUnits(fx, 3);
    const over = setup(fx);
    const before = snapshot(fx.loopDir);
    const r = run(fx, args, over);
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err.join('\n')).toContain(expected);
    expect(r.err.join('\n')).not.toContain(key());
    expect(snapshot(fx.loopDir)).toEqual(before);
  });

  test.each([
    ['no --reason', ['resume', LOOP]],
    ['no name', ['resume', '--reason', 'r']],
    ['a --unit', [...resumeArgs(), '--unit', 'a']],
  ])('%s prints the usage', (_label, args) => {
    const fx = unitFixture();
    expect(run(fx, args)).toEqual({
      code: 1,
      out: [],
      err: [`usage: ${RESUME_USAGE_LINE}`],
    });
  });
});

test('the usage names resume', () => {
  expect(RESUME_USAGE_LINE).toBe('sidekick loop resume <name> --reason <text>');
  expect(LOOP_USAGE_LINE).toContain('| resume <name> --reason <text>');
});

test('this test file holds no literal key', () => {
  expect(keyHits(fs.readFileSync(import.meta.path, 'utf8'))).toEqual([]);
});
