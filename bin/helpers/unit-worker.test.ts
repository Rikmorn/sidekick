import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { removeTemps, tmp } from './fixtures/worker/repo.js';
import { isUnitWorker } from './unit-worker.js';

afterEach(removeTemps);

const briefOf = (kind: 'unit' | 'plan', dir: string): string =>
  [
    '---',
    ...(kind === 'unit'
      ? [
          'kind: unit',
          `unit: ${dir}/unit.md`,
          'skill: plug:skill',
          'report: unit-report.md',
        ]
      : [
          `plan: ${dir}/plan.md`,
          `spec: ${dir}/spec.md`,
          'skill: subagent-driven-development',
          'report: docs/report.md',
        ]),
    'name: w1',
    `rulings: ${dir}/rulings.md`,
    'baseline: abc1234',
    'place: worktree',
    'orchestrator: orch',
    '---',
    '',
  ].join('\n');

// A home whose config folder holds the loop store, and a brief written there or elsewhere.
function setup() {
  const home = tmp();
  const units = path.join(home, '.claude', 'sidekick', 'loops', 'fixer');
  const write = (file: string, text: string): string => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return file;
  };
  return { home, units, write };
}

describe('isUnitWorker', () => {
  test('a brief that reads as a unit brief is a unit worker, wherever it sits', () => {
    const { home, write } = setup();
    const brief = write(path.join(tmp(), 'brief.md'), briefOf('unit', '/x'));
    expect(isUnitWorker({ SIDEKICK_WORKER: brief }, home, home)).toBe(true);
  });

  test('a plan brief outside the loop store is not', () => {
    const { home, write } = setup();
    const brief = write(path.join(tmp(), 'brief.md'), briefOf('plan', '/x'));
    expect(isUnitWorker({ SIDEKICK_WORKER: brief }, home, home)).toBe(false);
  });

  test('no brief, or an empty one, is not', () => {
    const { home } = setup();
    expect(isUnitWorker({}, home, home)).toBe(false);
    expect(isUnitWorker({ SIDEKICK_WORKER: '' }, home, home)).toBe(false);
  });

  test("a brief that cannot be read under a loop's units folder is a unit worker", () => {
    const { home, units } = setup();
    const brief = path.join(units, 'units', 'fix-bug-42', 'w1', 'brief.md');
    expect(fs.existsSync(brief)).toBe(false);
    expect(isUnitWorker({ SIDEKICK_WORKER: brief }, home, home)).toBe(true);
  });

  test('the store follows CLAUDE_CONFIG_DIR', () => {
    const { home } = setup();
    const config = path.join(tmp(), 'config');
    const brief = path.join(
      config,
      'sidekick',
      'loops',
      'fixer',
      'units',
      'fix-bug-42',
      'w1',
      'brief.md',
    );
    const env = { SIDEKICK_WORKER: brief, CLAUDE_CONFIG_DIR: config };
    expect(isUnitWorker(env, home, home)).toBe(true);
    expect(isUnitWorker({ SIDEKICK_WORKER: brief }, home, home)).toBe(false);
  });

  test('an unreadable brief elsewhere in the loop store, or outside it, is not', () => {
    const { home, units } = setup();
    for (const brief of [
      path.join(units, 'loop.json'),
      path.join(units, 'records', 'brief.md'),
      path.join(home, '.claude', 'sidekick', 'loops', 'units', 'brief.md'),
      path.join(tmp(), 'units', 'x', 'brief.md'),
    ]) {
      expect(isUnitWorker({ SIDEKICK_WORKER: brief }, home, home)).toBe(false);
    }
  });
});
