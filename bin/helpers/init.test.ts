import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  detectDefaultBranch,
  detectGates,
  ensureGitignore,
  runInit,
  writeConfig,
} from './init.js';

describe('detectDefaultBranch', () => {
  let tmpRoot: string;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-init-'));
    execSync('git init -q', { cwd: tmpRoot });
    execSync('git config user.email test@test.example', { cwd: tmpRoot });
    execSync('git config user.name Test', { cwd: tmpRoot });
  });
  afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

  it('returns the local default branch from `git symbolic-ref HEAD`', () => {
    fs.writeFileSync(path.join(tmpRoot, 'a'), 'x');
    execSync('git add a && git commit -q -m initial', { cwd: tmpRoot });
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: tmpRoot })
      .toString()
      .trim();
    expect(detectDefaultBranch(tmpRoot)).toBe(branch);
  });

  it('falls back through the cascade when origin/HEAD unset and no commits', () => {
    expect(detectDefaultBranch(tmpRoot)).toBe('main');
  });
});

describe('detectGates', () => {
  let tmpRoot: string;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-init-'));
  });
  afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

  it('reads package.json scripts to detect gate commands', () => {
    fs.writeFileSync(
      path.join(tmpRoot, 'package.json'),
      JSON.stringify({
        name: 't',
        version: '0.0.0',
        scripts: {
          typecheck: 'tsc --noEmit',
          lint: 'biome check .',
          test: 'vitest run',
        },
      }),
    );
    const gates = detectGates(tmpRoot);
    expect(gates.typecheck).toBe('pnpm typecheck');
    expect(gates.lint).toBe('pnpm lint');
    expect(gates.test).toBe('pnpm test');
  });

  it('returns empty strings for missing scripts', () => {
    fs.writeFileSync(
      path.join(tmpRoot, 'package.json'),
      JSON.stringify({
        name: 't',
        version: '0.0.0',
        scripts: { test: 'vitest run' },
      }),
    );
    const gates = detectGates(tmpRoot);
    expect(gates.typecheck).toBe('');
    expect(gates.lint).toBe('');
    expect(gates.test).toBe('pnpm test');
  });

  it('handles missing package.json gracefully', () => {
    expect(() => detectGates(tmpRoot)).not.toThrow();
    const gates = detectGates(tmpRoot);
    expect(gates).toEqual({ typecheck: '', lint: '', test: '' });
  });
});

describe('writeConfig', () => {
  let tmpRoot: string;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-init-'));
  });
  afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

  it('creates .sidekick/ directory and writes config.json', () => {
    writeConfig(tmpRoot, {
      schemaVersion: 1,
      defaultBranch: 'main',
      gates: { typecheck: 't', lint: 'l', test: 'te' },
      waveSizeCap: 4,
      buildCheckpoints: 'deviations-only',
    });
    const raw = fs.readFileSync(
      path.join(tmpRoot, '.sidekick', 'config.json'),
      'utf-8',
    );
    const parsed = JSON.parse(raw);
    expect(parsed.defaultBranch).toBe('main');
  });

  it('overwrites existing config.json on re-run', () => {
    fs.mkdirSync(path.join(tmpRoot, '.sidekick'));
    fs.writeFileSync(
      path.join(tmpRoot, '.sidekick', 'config.json'),
      '{"old":"value"}',
    );
    writeConfig(tmpRoot, {
      schemaVersion: 1,
      defaultBranch: 'master',
      gates: { typecheck: 't', lint: 'l', test: 'te' },
      waveSizeCap: 4,
      buildCheckpoints: 'deviations-only',
    });
    const parsed = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, '.sidekick', 'config.json'), 'utf-8'),
    );
    expect(parsed.defaultBranch).toBe('master');
    expect(parsed.old).toBeUndefined();
  });
});

describe('ensureGitignore', () => {
  let tmpRoot: string;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-init-'));
  });
  afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

  it('creates .gitignore with the .sidekick working-state entries when absent', () => {
    const result = ensureGitignore(tmpRoot);
    expect(result.changed).toBe(true);
    const content = fs.readFileSync(path.join(tmpRoot, '.gitignore'), 'utf-8');
    expect(content).toContain('.sidekick/cache/');
    expect(content).toContain('.sidekick/state/');
  });

  it('appends missing entries without clobbering existing .gitignore content', () => {
    fs.writeFileSync(
      path.join(tmpRoot, '.gitignore'),
      'node_modules/\ndist/\n',
    );
    ensureGitignore(tmpRoot);
    const content = fs.readFileSync(path.join(tmpRoot, '.gitignore'), 'utf-8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('dist/');
    expect(content).toContain('.sidekick/cache/');
    expect(content).toContain('.sidekick/state/');
  });

  it('is idempotent — re-running adds nothing', () => {
    ensureGitignore(tmpRoot);
    const first = fs.readFileSync(path.join(tmpRoot, '.gitignore'), 'utf-8');
    const result = ensureGitignore(tmpRoot);
    const second = fs.readFileSync(path.join(tmpRoot, '.gitignore'), 'utf-8');
    expect(result.changed).toBe(false);
    expect(second).toBe(first);
  });

  it('does not duplicate an entry already present', () => {
    fs.writeFileSync(path.join(tmpRoot, '.gitignore'), '.sidekick/cache/\n');
    const result = ensureGitignore(tmpRoot);
    const content = fs.readFileSync(path.join(tmpRoot, '.gitignore'), 'utf-8');
    const cacheCount = content
      .split('\n')
      .filter((l) => l.trim() === '.sidekick/cache/').length;
    expect(cacheCount).toBe(1);
    expect(result.added).toEqual(['.sidekick/state/']);
    expect(content).toContain('.sidekick/state/');
  });
});

describe('runInit (non-interactive flag path)', () => {
  let tmpRoot: string;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-init-'));
    execSync('git init -q', { cwd: tmpRoot });
    fs.writeFileSync(
      path.join(tmpRoot, 'package.json'),
      JSON.stringify({
        name: 't',
        version: '0.0.0',
        scripts: { typecheck: 'tsc', lint: 'biome', test: 'vitest' },
      }),
    );
  });
  afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

  it('hard-stops with code 1 outside a git repo', async () => {
    const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-init-nongit-'));
    const exitCode = await runInit({ repoRoot: nonGit, nonInteractive: true });
    expect(exitCode).toBe(1);
    fs.rmSync(nonGit, { recursive: true, force: true });
  });

  it('writes a valid config.json in --non-interactive mode using detected defaults', async () => {
    const exitCode = await runInit({ repoRoot: tmpRoot, nonInteractive: true });
    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(tmpRoot, '.sidekick', 'config.json'))).toBe(
      true,
    );
    const cfg = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, '.sidekick', 'config.json'), 'utf-8'),
    );
    expect(cfg.waveSizeCap).toBe(4);
    expect(cfg.buildCheckpoints).toBe('deviations-only');
    expect(cfg.fanout).toEqual({ backend: 'auto', budget: 'standard' });
  });

  it('ensures .gitignore covers the .sidekick working state', async () => {
    await runInit({ repoRoot: tmpRoot, nonInteractive: true });
    const content = fs.readFileSync(path.join(tmpRoot, '.gitignore'), 'utf-8');
    expect(content).toContain('.sidekick/cache/');
    expect(content).toContain('.sidekick/state/');
  });

  it('uses gate defaults when package.json is absent', async () => {
    // Fresh tmp repo with git but no package.json (overrides the describe-level beforeEach setup)
    const tmpRoot2 = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-init-nopkg-'));
    execSync('git init -q', { cwd: tmpRoot2 });
    try {
      const exitCode = await runInit({
        repoRoot: tmpRoot2,
        nonInteractive: true,
      });
      expect(exitCode).toBe(0);
      const cfg = JSON.parse(
        fs.readFileSync(
          path.join(tmpRoot2, '.sidekick', 'config.json'),
          'utf-8',
        ),
      );
      expect(cfg.gates.typecheck).toBe('pnpm typecheck');
      expect(cfg.gates.lint).toBe('pnpm lint');
      expect(cfg.gates.test).toBe('pnpm test');
    } finally {
      fs.rmSync(tmpRoot2, { recursive: true, force: true });
    }
  });
});
