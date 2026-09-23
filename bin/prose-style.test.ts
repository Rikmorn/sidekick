import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// The house style in .vale/ fires each rule where planted and nowhere else.

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const VALE = path.join(REPO_ROOT, 'node_modules', '.bin', 'vale');
const FIXTURES = path.join('bin', 'fixtures', 'prose');

type Alert = { Check: string; Severity: string; Line: number };

const isAlert = (value: unknown): value is Alert =>
  typeof value === 'object' &&
  value !== null &&
  'Check' in value &&
  typeof value.Check === 'string' &&
  'Severity' in value &&
  typeof value.Severity === 'string' &&
  'Line' in value &&
  typeof value.Line === 'number';

const lint = (target: string, vale = VALE): string[] => {
  const run = spawnSync(vale, ['--output=JSON', target], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (run.error) {
    throw new Error(`cannot run Vale at ${vale}: ${run.error.message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    throw new Error(
      `Vale printed no JSON (exit ${run.status}): ${run.stdout}${run.stderr}`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Vale's JSON is not an object: ${run.stdout}`);
  }
  return Object.values(parsed)
    .flatMap((alerts: unknown) => {
      if (!Array.isArray(alerts) || !alerts.every(isAlert)) {
        throw new Error(`unexpected Vale alert shape: ${run.stdout}`);
      }
      return alerts;
    })
    .map((alert) => `${alert.Line} ${alert.Check} ${alert.Severity}`)
    .sort();
};

describe('the Vale house style', () => {
  it('fires each rule at its level on its planted line', () => {
    expect(lint(path.join(FIXTURES, 'violations.md'))).toEqual(
      [
        '3 Sidekick.WordsToCut error',
        '5 Sidekick.WordsToWatch warning',
        '7 Sidekick.References error',
        '7 Sidekick.ReferencesToWatch warning',
        '9 Sidekick.ReferencesToWatch warning',
        '11 Sidekick.ReferencesToWatch warning',
        '13 Sidekick.SentenceLength warning',
      ].sort(),
    );
  });

  it('stays silent on clean prose', () => {
    expect(lint(path.join(FIXTURES, 'clean.md'))).toEqual([]);
  });

  it('skips a code span for both words and length', () => {
    expect(lint(path.join(FIXTURES, 'code-span.md'))).toEqual([]);
  });

  it('exempts sk-language.md by relative path', () => {
    expect(lint(path.join(FIXTURES, 'override', 'sk-language.md'))).toEqual([]);
  });

  it('exempts sk-language.md by absolute path', () => {
    expect(
      lint(path.join(REPO_ROOT, FIXTURES, 'override', 'sk-language.md')),
    ).toEqual([]);
  });

  it('fails loudly when the Vale binary cannot run', () => {
    expect(() =>
      lint(path.join(FIXTURES, 'clean.md'), '/nonexistent/vale'),
    ).toThrow('cannot run Vale');
  });

  it('fails loudly when Vale prints something other than JSON', () => {
    expect(() => lint(path.join(FIXTURES, 'clean.md'), '/bin/echo')).toThrow(
      'printed no JSON',
    );
  });
});

const prose = (...args: string[]) =>
  spawnSync(process.execPath, ['bin/prose.ts', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

describe('bun run prose', () => {
  it('refuses to run with no paths', () => {
    const run = prose();
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('name at least one');
  });

  it('refuses a path that does not exist', () => {
    const run = prose('docs/USAGE.mdd');
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('no such file');
  });

  it('passes clean prose and fails an error', () => {
    expect(prose(path.join(FIXTURES, 'clean.md')).status).toBe(0);
    expect(prose(path.join(FIXTURES, 'violations.md')).status).toBe(1);
  });
});
