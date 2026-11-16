import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  compileLoop,
  effectiveStates,
  fixedVerbRules,
  landActWarnings,
  overlapRules,
} from './loop-compile.js';
import type { LoopManifest } from './loop-manifest.js';
import { ruleIssues } from './loop-rules.js';
import { realPathOf } from './sidekick-home.js';

const manifest = (
  classes: LoopManifest['mandate']['classes'],
): LoopManifest => ({
  description: 'd',
  repo: '/repo',
  profile: 'worker',
  schedule: '*/5 * * * *',
  tick: '/sk-tick',
  hosts: [],
  gates: ['bun test'],
  caps: {
    attemptsPerUnit: 1,
    workMinutesPerUnit: 1,
    waitMinutesPerUnit: 1,
    unitsPerDay: 1,
    failedUnitsInARow: 1,
  },
  mandate: { reads: ['Read(*)'], never: ['Bash(rm *)'], classes },
});

const m = manifest({
  fix: { state: 'act', allow: ['Edit(src/**)'] },
  trial: { state: 'record', allow: ['Bash(git push *)'] },
  review: { state: 'ask', allow: ['Bash(gh pr merge *)'] },
});

const input = (over: { record?: boolean; loopDir?: string } = {}) => ({
  name: 'lp',
  manifest: m,
  loopDir: over.loopDir ?? '/loops/lp',
  profileDir: '/profiles/prof',
  record: over.record ?? false,
});

const permissions = (s: Record<string, unknown>): Record<string, unknown> => {
  const p = s.permissions;
  if (typeof p !== 'object' || p === null) throw new Error('no permissions');
  return Object.fromEntries(Object.entries(p));
};

describe('effectiveStates', () => {
  test('keeps each state, or records all under record', () => {
    expect(effectiveStates(m, false)).toEqual({
      fix: 'act',
      trial: 'record',
      review: 'ask',
    });
    expect(effectiveStates(m, true)).toEqual({
      fix: 'record',
      trial: 'record',
      review: 'record',
    });
  });
});

describe('fixedVerbRules', () => {
  test('pins the loop name', () => {
    expect(fixedVerbRules('lp')).toEqual([
      'Bash(sidekick loop record lp *)',
      'Bash(sidekick loop arm lp)',
      'Bash(sidekick loop arm lp *)',
      'Bash(sidekick loop dispatch lp *)',
      'Bash(sidekick loop answer lp *)',
      'Bash(sidekick loop wake lp *)',
      'Bash(sidekick loop report lp *)',
      'Bash(sidekick loop discard lp *)',
      'Bash(sidekick loop reap lp)',
    ]);
  });

  test('the fixed verbs include the unit verbs pinned to the name', () => {
    const rules = fixedVerbRules('lp');
    for (const verb of ['dispatch', 'answer', 'wake', 'report', 'discard']) {
      expect(rules).toContain(`Bash(sidekick loop ${verb} lp *)`);
    }
    expect(rules).toContain('Bash(sidekick loop reap lp)');
  });

  test('resume is not a fixed verb', () => {
    expect(fixedVerbRules('lp').join('\n')).not.toContain('resume');
  });

  test('a fixed verb the judge refuses in a mandate list still lands in the compiled settings', () => {
    const rule = 'Bash(sidekick loop dispatch lp *)';
    expect(ruleIssues(rule, 'allow', '/repo')).not.toEqual([]);
    expect(permissions(compileLoop(input())).allow).toContain(rule);
  });
});

describe('compileLoop', () => {
  test('sorts rules into allow and deny by state', () => {
    const p = permissions(compileLoop(input()));
    expect(p.allow).toEqual([
      'Read(*)',
      'Edit(src/**)',
      ...fixedVerbRules('lp'),
    ]);
    expect(p.deny).toEqual(
      expect.arrayContaining([
        'Bash(rm *)',
        'Bash(git push *)',
        'Bash(gh pr merge *)',
      ]),
    );
    expect(p.deny).not.toContain('Edit(src/**)');
  });

  test('record denies every class and allows only reads and the fixed verbs', () => {
    const p = permissions(compileLoop(input({ record: true })));
    expect(p.allow).toEqual(['Read(*)', ...fixedVerbRules('lp')]);
    expect(p.deny).toEqual(
      expect.arrayContaining(['Edit(src/**)', 'Bash(git push *)']),
    );
  });

  test('self-denies the loop and profile folders as // paths', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-compile-'));
    try {
      const loopDir = path.join(tmp, 'loop');
      fs.mkdirSync(loopDir);
      const p = permissions(compileLoop(input({ loopDir })));
      expect(p.deny).toContain(`Edit(/${realPathOf(loopDir)}/**)`);
      expect(p.deny).toContain('Edit(//profiles/prof/**)');
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  test('resolves a loop folder under a link', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-compile-'));
    try {
      const real = fs.realpathSync(tmp);
      const link = path.join(real, 'link');
      fs.mkdirSync(path.join(real, 'target'));
      fs.symlinkSync(path.join(real, 'target'), link);
      const p = permissions(compileLoop(input({ loopDir: link })));
      expect(p.deny).toContain(`Edit(/${path.join(real, 'target')}/**)`);
      expect(p.deny).not.toContain(`Edit(/${link}/**)`);
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  test('sets env, inbound, and blockReadsOutsideWorkingDirectories', () => {
    const s = compileLoop(input());
    expect(s.env).toEqual({
      SIDEKICK_LOOP: 'lp',
      DISABLE_AUTOUPDATER: '1',
      SIDEKICK_MAIN: '',
      SIDEKICK_WORKER: '',
    });
    expect(s.crossSessionInbound).toBe('accept');
    expect(permissions(s).blockReadsOutsideWorkingDirectories).toBe(true);
  });

  test('the compiled env sets SIDEKICK_WORKER empty', () => {
    expect(compileLoop(input()).env).toHaveProperty('SIDEKICK_WORKER', '');
  });

  test('names no worker beyond the emptied env key', () => {
    const { env, ...rest } = compileLoop(input());
    expect(JSON.stringify(rest).toLowerCase()).not.toContain('worker');
    expect(Object.keys(env ?? {}).filter((k) => /worker/i.test(k))).toEqual([
      'SIDEKICK_WORKER',
    ]);
    expect(Object.values(env ?? {}).filter((v) => /worker/i.test(v))).toEqual(
      [],
    );
  });
});

describe('overlapRules', () => {
  test('finds an act rule that a record class also names', () => {
    const o = manifest({
      a: { state: 'act', allow: ['Edit(src/**)', 'Bash(x)'] },
      b: { state: 'record', allow: ['Bash(x)'] },
    });
    expect(overlapRules(compileLoop({ ...input(), manifest: o }))).toEqual([
      'Bash(x)',
    ]);
  });

  test('finds none in a clean overlay', () => {
    expect(overlapRules(compileLoop(input()))).toEqual([]);
  });
});

describe('landActWarnings', () => {
  const one = (state: 'act' | 'ask', rule: string) =>
    manifest({ c: { state, allow: [rule] } });

  test.each([
    'Bash(sidekick loop land *)',
    'Bash(sidekick loop land)',
    'Bash(sidekick loop *)',
    'Bash(sidekick *)',
    'Bash(*)',
    'Bash',
  ])('warns for an act class with %s', (rule) => {
    const w = landActWarnings(one('act', rule), false);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('c');
  });

  test.each([
    'Bash(sidekick loop record *)',
    'Bash(sidekick loop landing *)',
    'Edit(*)',
    'Bash(git push *)',
  ])('is quiet for an act class with %s', (rule) => {
    expect(landActWarnings(one('act', rule), false)).toEqual([]);
  });

  test('is quiet for an ask class and under record', () => {
    expect(
      landActWarnings(one('ask', 'Bash(sidekick loop land *)'), false),
    ).toEqual([]);
    expect(
      landActWarnings(one('act', 'Bash(sidekick loop land *)'), true),
    ).toEqual([]);
  });
});
