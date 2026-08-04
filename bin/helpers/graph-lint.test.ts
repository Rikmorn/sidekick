import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  checkGeneratedDrift,
  checkStateSize,
  checkTaxonomy,
  collectLint,
  isError,
  runGraphLint,
  STATE_LINE_CAP,
} from './graph-lint.js';

function write(repo: string, rel: string, content: string): void {
  const full = path.join(repo, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe('checkTaxonomy', () => {
  let repo: string;
  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-lint-'));
  });
  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('accepts the declared folders', () => {
    for (const dir of ['adr', 'research', 'work']) {
      write(repo, `docs/${dir}/x.md`, '# x');
    }
    expect(checkTaxonomy(repo)).toEqual([]);
  });

  it('accepts the dissolving folders and the declared enclave', () => {
    for (const dir of ['references', 'reviews', 'backlog', 'superpowers']) {
      write(repo, `docs/${dir}/x.md`, '# x');
    }
    expect(checkTaxonomy(repo)).toEqual([]);
  });

  it('flags a folder the taxonomy record never declared', () => {
    write(repo, 'docs/notes/x.md', '# x');
    const findings = checkTaxonomy(repo);
    expect(findings.map((f) => f.code)).toEqual(['undeclared-location']);
    expect(findings[0].message).toContain('retrieval axis');
    expect(isError(findings[0])).toBe(true);
  });

  it('invalid-metric findings are error-tier (bench-1 gate)', () => {
    expect(
      isError({ code: 'invalid-metric', message: 'x', origin: null }),
    ).toBe(true);
  });
});

describe('checkGeneratedDrift', () => {
  let repo: string;
  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-drift-'));
  });
  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('is dormant while the generated file does not exist yet', () => {
    expect(
      checkGeneratedDrift(repo, [
        { path: 'MAP.md', regenerate: () => 'anything' },
      ]),
    ).toEqual([]);
  });

  it('passes when the committed file equals a fresh generation', () => {
    write(repo, 'MAP.md', 'generated\n');
    expect(
      checkGeneratedDrift(repo, [
        { path: 'MAP.md', regenerate: () => 'generated\n' },
      ]),
    ).toEqual([]);
  });

  it('fails when the committed file has drifted', () => {
    write(repo, 'MAP.md', 'stale\n');
    const findings = checkGeneratedDrift(repo, [
      { path: 'MAP.md', regenerate: () => 'fresh\n' },
    ]);
    expect(findings.map((f) => f.code)).toEqual(['generated-drift']);
    expect(findings[0].origin).toBe('MAP.md');
  });
});

describe('checkStateSize', () => {
  let repo: string;
  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-size-'));
  });
  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('passes at the cap and is dormant when the file is absent', () => {
    expect(checkStateSize(repo, 'docs/STATE.md')).toEqual([]);
    write(repo, 'docs/STATE.md', Array(STATE_LINE_CAP).fill('x').join('\n'));
    expect(checkStateSize(repo, 'docs/STATE.md')).toEqual([]);
  });

  it('says an overflow is about unclosed entities, not formatting', () => {
    write(
      repo,
      'docs/STATE.md',
      Array(STATE_LINE_CAP + 5)
        .fill('x')
        .join('\n'),
    );
    const findings = checkStateSize(repo, 'docs/STATE.md');
    expect(findings.map((f) => f.code)).toEqual(['state-size-cap']);
    expect(findings[0].message).toContain('unclosed entities');
    expect(findings[0].message).toContain('not formatting');
  });
});

describe('collectLint / runGraphLint', () => {
  let repo: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-lintrun-'));
    execSync('git init -q -b master', { cwd: repo });
    execSync('git config user.email t@t.example', { cwd: repo });
    execSync('git config user.name T', { cwd: repo });
    write(
      repo,
      'docs/work/ops/1.md',
      [
        '---',
        'id: ops-1',
        'kind: item',
        'status: done',
        '---',
        '',
        '# ops-1',
      ].join('\n'),
    );
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('passes a clean tree', () => {
    const res = runGraphLint({ repoRoot: repo });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('lint clean');
  });

  it('fails on a broken reference', () => {
    write(
      repo,
      'docs/work/ops/2.md',
      [
        '---',
        'id: ops-2',
        'kind: item',
        'status: open',
        'deps: [ops-99]',
        '---',
        '',
        '# ops-2',
      ].join('\n'),
    );
    const res = runGraphLint({ repoRoot: repo, json: true });
    expect(res.exitCode).toBe(1);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.errors).toBeGreaterThan(0);
    expect(
      parsed.findings.some(
        (f: { code: string }) => f.code === 'unresolvable-ref',
      ),
    ).toBe(true);
  });

  it('fails on a relation outside the closed vocabulary', () => {
    write(
      repo,
      'docs/work/ops/2.md',
      [
        '---',
        'id: ops-2',
        'kind: item',
        'status: open',
        '---',
        '',
        '# ops-2',
        '',
        '- blocks [[ops-1]]',
      ].join('\n'),
    );
    expect(runGraphLint({ repoRoot: repo }).exitCode).toBe(1);
  });

  it('fails on a work file with no frontmatter', () => {
    write(repo, 'docs/work/ops/loose.md', '# just prose');
    const res = runGraphLint({ repoRoot: repo, json: true });
    expect(res.exitCode).toBe(1);
    expect(
      JSON.parse(res.stdout).findings.some(
        (f: { code: string }) => f.code === 'missing-frontmatter',
      ),
    ).toBe(true);
  });

  it('exempts the legacy monoliths from the frontmatter requirement', () => {
    write(repo, 'docs/EPIC.md', '# EPIC\n\nNo frontmatter here.');
    write(repo, 'docs/EPIC-STATE.md', '# EPIC-STATE\n\nNor here.');
    write(repo, 'docs/LIMITS.md', '# Limits');
    expect(runGraphLint({ repoRoot: repo }).exitCode).toBe(0);
  });

  it('reports ambiguity as advisory, not as a gate failure', () => {
    write(
      repo,
      'docs/adr/0002-x.md',
      [
        '# ADR-0002 — Something',
        '',
        '**Status:** Accepted (2026-06-10). Spawns E19–E22.',
      ].join('\n'),
    );
    const res = runGraphLint({ repoRoot: repo, json: true });
    const parsed = JSON.parse(res.stdout);
    expect(parsed.advisories).toBeGreaterThan(0);
    expect(parsed.errors).toBe(0);
    expect(res.exitCode).toBe(0);
  });

  it('flags a dangling applies-to on an open backlog item', () => {
    write(
      repo,
      'docs/backlog/note.md',
      [
        '---',
        'applies-to: [agents/sk-nonexistent.md]',
        '---',
        '',
        '# Note',
        '',
        '**Status:** Open.',
      ].join('\n'),
    );
    const res = runGraphLint({ repoRoot: repo, json: true });
    expect(res.exitCode).toBe(1);
    expect(
      JSON.parse(res.stdout).findings.some(
        (f: { code: string }) => f.code === 'dangling-applies-to',
      ),
    ).toBe(true);
  });

  it('orders errors before advisories', () => {
    write(repo, 'docs/notes/x.md', '# stray folder');
    write(
      repo,
      'docs/adr/0002-x.md',
      '# ADR-0002 — X\n\n**Status:** Accepted (2026-06-10). Spawns E19–E22.',
    );
    const findings = collectLint({ repoRoot: repo });
    const firstAdvisory = findings.findIndex((f) => !isError(f));
    const lastError = findings.map(isError).lastIndexOf(true);
    expect(lastError).toBeLessThan(firstAdvisory);
  });
});
