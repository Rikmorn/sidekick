import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runScopeCheckCli } from './scope-check.js';

// ---- fixtures ---------------------------------------------------------------

/** A temp git repo on `master` with one initial commit. */
function mkTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-scope-'));
  execSync('git init -q -b master', { cwd: dir });
  execSync('git config user.email test@test.example', { cwd: dir });
  execSync('git config user.name Test', { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README'), 'hello');
  execSync('git add -A && git commit -q -m initial', { cwd: dir });
  return dir;
}

function writeFile(dir: string, rel: string, content: string): void {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function writePlan(dir: string, slug: string, body: string): void {
  const planDir = path.join(dir, '.sidekick', 'plans', slug);
  fs.mkdirSync(planDir, { recursive: true });
  fs.writeFileSync(path.join(planDir, 'PLAN.md'), body);
  // Commit the plan so it mirrors the real flow (PLAN.md is a committed
  // artifact) and isn't itself reported as a producer-run dirty path.
  execSync('git add .sidekick && git commit -q -m plan', { cwd: dir });
}

/** A minimal PLAN.md with a single task whose Files: block lists `files`. */
function planWithTask(taskId: string, files: string[]): string {
  const bullets = files.map((f) => `- Modify: ${f}`).join('\n');
  return `# Demo plan

## Tasks

### ${taskId} Do the thing
**Deps:** none
**Files:**
${bullets}
`;
}

interface ScopeResult {
  task_id: string | null;
  declared: string[];
  baseline: string[];
  actual: string[];
  out_of_scope: string[];
  unreported: string[] | null;
  reported_unchanged: string[] | null;
  verdict: 'clean' | 'out_of_scope';
  warnings: string[];
}

describe('runScopeCheckCli', () => {
  let repo: string;
  beforeEach(() => {
    repo = mkTmpRepo();
  });
  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  const run = (opts: Parameters<typeof runScopeCheckCli>[0]) =>
    runScopeCheckCli(opts);
  const parseOk = (
    opts: Omit<Parameters<typeof runScopeCheckCli>[0], 'repoRoot'>,
  ): ScopeResult => {
    const { stdout, exitCode } = run({ repoRoot: repo, ...opts });
    expect(exitCode).toBe(0);
    return JSON.parse(stdout) as ScopeResult;
  };

  describe('mode A (plan-backed)', () => {
    it('clean when every changed path is declared for the task', () => {
      writePlan(repo, 'demo', planWithTask('T-01', ['src/a.ts', 'src/b.ts']));
      writeFile(repo, 'src/a.ts', 'a');
      writeFile(repo, 'src/b.ts', 'b');
      const r = parseOk({ slug: 'demo', task: 'T-01' });
      expect(r.verdict).toBe('clean');
      expect(r.task_id).toBe('T-01');
      expect(r.out_of_scope).toEqual([]);
      expect(r.actual.sort()).toEqual(['src/a.ts', 'src/b.ts']);
      expect(r.declared.sort()).toEqual(['src/a.ts', 'src/b.ts']);
    });

    it('flags an untracked out-of-scope write', () => {
      writePlan(repo, 'demo', planWithTask('T-01', ['src/a.ts']));
      writeFile(repo, 'src/a.ts', 'a');
      writeFile(repo, 'src/evil.ts', 'not declared');
      const r = parseOk({ slug: 'demo', task: 'T-01' });
      expect(r.verdict).toBe('out_of_scope');
      expect(r.out_of_scope).toEqual(['src/evil.ts']);
    });

    it('errors on an unknown task id', () => {
      writePlan(repo, 'demo', planWithTask('T-01', ['src/a.ts']));
      const { stdout, exitCode } = run({
        repoRoot: repo,
        slug: 'demo',
        task: 'T-99',
      });
      expect(exitCode).toBe(1);
      expect(JSON.parse(stdout).error).toMatch(/T-99|task/i);
    });

    it('errors when PLAN.md is missing', () => {
      const { stdout, exitCode } = run({
        repoRoot: repo,
        slug: 'ghost',
        task: 'T-01',
      });
      expect(exitCode).toBe(1);
      expect(JSON.parse(stdout).error).toMatch(/PLAN\.md/i);
    });
  });

  describe('baseline subtraction', () => {
    it('does not attribute a pre-dirty path to this run', () => {
      writePlan(repo, 'demo', planWithTask('T-01', ['src/a.ts']));
      writeFile(repo, 'src/pre.ts', 'was already dirty');
      writeFile(repo, 'src/a.ts', 'a');

      // Without a baseline, the pre-existing dirty file is attributed and
      // scored out-of-scope.
      const without = parseOk({ slug: 'demo', task: 'T-01' });
      expect(without.out_of_scope).toEqual(['src/pre.ts']);
      expect(without.verdict).toBe('out_of_scope');

      // With the baseline, it is subtracted before scoring.
      const withBaseline = parseOk({
        slug: 'demo',
        task: 'T-01',
        baseline: ['src/pre.ts'],
      });
      expect(withBaseline.actual).toEqual(['src/a.ts']);
      expect(withBaseline.out_of_scope).toEqual([]);
      expect(withBaseline.verdict).toBe('clean');
    });
  });

  describe('mode B (explicit declared)', () => {
    it('covers any path under a declared directory prefix', () => {
      writeFile(repo, 'src/gen/x.ts', 'x');
      writeFile(repo, 'src/gen/y.ts', 'y');
      const r = parseOk({ declared: ['src/gen/'] });
      expect(r.task_id).toBeNull();
      expect(r.verdict).toBe('clean');
      expect(r.actual.sort()).toEqual(['src/gen/x.ts', 'src/gen/y.ts']);
      expect(r.out_of_scope).toEqual([]);
    });

    it('expands a brand-new untracked directory to its files (not the dir)', () => {
      writeFile(repo, 'newpkg/deep/mod.ts', 'nested');
      const r = parseOk({ declared: ['newpkg/deep/mod.ts'] });
      expect(r.actual).toEqual(['newpkg/deep/mod.ts']);
      expect(r.verdict).toBe('clean');
    });

    it('computes unreported and reported_unchanged only when --reported given', () => {
      writeFile(repo, 'src/a.ts', 'a');
      writeFile(repo, 'src/b.ts', 'b');

      // Producer claimed a.ts + c.ts; actually touched a.ts + b.ts.
      const withReported = parseOk({
        declared: ['src/a.ts', 'src/b.ts'],
        reported: ['src/a.ts', 'src/c.ts'],
      });
      expect(withReported.unreported).toEqual(['src/b.ts']); // changed, not claimed
      expect(withReported.reported_unchanged).toEqual(['src/c.ts']); // claimed, not changed
      expect(withReported.verdict).toBe('clean'); // deltas never flip the verdict

      const without = parseOk({ declared: ['src/a.ts', 'src/b.ts'] });
      expect(without.unreported).toBeNull();
      expect(without.reported_unchanged).toBeNull();
    });

    it('captures both sides of a rename', () => {
      writeFile(repo, 'src/old.ts', 'content');
      execSync('git add -A && git commit -q -m add-old', { cwd: repo });
      execSync('git mv src/old.ts src/new.ts', { cwd: repo });
      const r = parseOk({ declared: ['src/old.ts', 'src/new.ts'] });
      expect(r.actual.sort()).toEqual(['src/new.ts', 'src/old.ts']);
      expect(r.verdict).toBe('clean');
    });
  });

  describe('invocation errors', () => {
    it('rejects supplying both a plan mode flag and --declared', () => {
      const { stdout, exitCode } = run({
        repoRoot: repo,
        slug: 'demo',
        task: 'T-01',
        declared: ['src/a.ts'],
      });
      expect(exitCode).toBe(1);
      expect(JSON.parse(stdout).error).toMatch(/mode|both|exclusive/i);
    });

    it('rejects supplying neither mode', () => {
      const { stdout, exitCode } = run({ repoRoot: repo });
      expect(exitCode).toBe(1);
      expect(JSON.parse(stdout).error).toMatch(/mode|declared|slug/i);
    });

    it('rejects an incomplete plan mode (--slug without --task)', () => {
      const { stdout, exitCode } = run({ repoRoot: repo, slug: 'demo' });
      expect(exitCode).toBe(1);
      expect(JSON.parse(stdout).error).toMatch(/task|slug/i);
    });

    it('errors when the target directory is not a git repo', () => {
      const nonRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-nogit-'));
      try {
        const { stdout, exitCode } = run({
          repoRoot: nonRepo,
          declared: ['src/a.ts'],
        });
        expect(exitCode).toBe(1);
        expect(JSON.parse(stdout).error).toMatch(/git/i);
      } finally {
        fs.rmSync(nonRepo, { recursive: true, force: true });
      }
    });
  });
});
