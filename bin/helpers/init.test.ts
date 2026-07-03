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

  const writePkg = (scripts: Record<string, string>) => {
    fs.writeFileSync(
      path.join(tmpRoot, 'package.json'),
      JSON.stringify({ name: 't', version: '0.0.0', scripts }),
    );
  };
  const fullScripts = {
    typecheck: 'tsc --noEmit',
    lint: 'biome check .',
    test: 'vitest run',
  };

  it('suggests pnpm commands when pnpm-lock.yaml identifies the runner', () => {
    writePkg(fullScripts);
    fs.writeFileSync(path.join(tmpRoot, 'pnpm-lock.yaml'), '');
    const gates = detectGates(tmpRoot);
    expect(gates.typecheck).toBe('pnpm typecheck');
    expect(gates.lint).toBe('pnpm lint');
    expect(gates.test).toBe('pnpm test');
  });

  it('suggests bun commands when a bun lockfile identifies the runner', () => {
    writePkg(fullScripts);
    fs.writeFileSync(path.join(tmpRoot, 'bun.lock'), '');
    const gates = detectGates(tmpRoot);
    expect(gates.typecheck).toBe('bun run typecheck');
    expect(gates.lint).toBe('bun run lint');
    expect(gates.test).toBe('bun run test');
  });

  it('suggests npm commands when package-lock.json identifies the runner', () => {
    writePkg(fullScripts);
    fs.writeFileSync(path.join(tmpRoot, 'package-lock.json'), '{}');
    const gates = detectGates(tmpRoot);
    expect(gates.typecheck).toBe('npm run typecheck');
  });

  it('suggests nothing without a lockfile — the runner would be a guess', () => {
    writePkg(fullScripts);
    const gates = detectGates(tmpRoot);
    expect(gates).toEqual({ typecheck: '', lint: '', test: '' });
  });

  it('suggests only the scripts that exist', () => {
    writePkg({ test: 'vitest run' });
    fs.writeFileSync(path.join(tmpRoot, 'pnpm-lock.yaml'), '');
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
    expect(result.added).toEqual([
      '.sidekick/state/',
      '.claude/settings.local.json',
    ]);
    expect(content).toContain('.sidekick/state/');
  });
});

describe('runInit (non-interactive flag path)', () => {
  let tmpRoot: string;
  let claudeHome: string;
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
    claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-home-'));
  });
  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(claudeHome, { recursive: true, force: true });
  });

  it('hard-stops with code 1 outside a git repo', async () => {
    const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-init-nongit-'));
    const exitCode = await runInit({
      repoRoot: nonGit,
      claudeHome,
      nonInteractive: true,
    });
    expect(exitCode).toBe(1);
    fs.rmSync(nonGit, { recursive: true, force: true });
  });

  it('writes a valid config.json in --non-interactive mode using detected values', async () => {
    fs.writeFileSync(path.join(tmpRoot, 'bun.lock'), '');
    const exitCode = await runInit({
      repoRoot: tmpRoot,
      claudeHome,
      nonInteractive: true,
    });
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
    expect(cfg.gates).toEqual({
      typecheck: 'bun run typecheck',
      lint: 'bun run lint',
      test: 'bun run test',
    });
    expect(cfg.verifiers).toEqual([]);
  });

  it('ensures .gitignore covers the .sidekick working state', async () => {
    await runInit({ repoRoot: tmpRoot, claudeHome, nonInteractive: true });
    const content = fs.readFileSync(path.join(tmpRoot, '.gitignore'), 'utf-8');
    expect(content).toContain('.sidekick/cache/');
    expect(content).toContain('.sidekick/state/');
  });

  it('leaves gates unconfigured when nothing is detected — never a runner guess', async () => {
    // Fresh tmp repo with git but no package.json (overrides the describe-level beforeEach setup)
    const tmpRoot2 = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-init-nopkg-'));
    execSync('git init -q', { cwd: tmpRoot2 });
    try {
      const exitCode = await runInit({
        repoRoot: tmpRoot2,
        claudeHome,
        nonInteractive: true,
      });
      expect(exitCode).toBe(0);
      const cfg = JSON.parse(
        fs.readFileSync(
          path.join(tmpRoot2, '.sidekick', 'config.json'),
          'utf-8',
        ),
      );
      expect(cfg.gates).toEqual({});
    } finally {
      fs.rmSync(tmpRoot2, { recursive: true, force: true });
    }
  });

  it('writes only the detected gates when detection is partial', async () => {
    fs.writeFileSync(
      path.join(tmpRoot, 'package.json'),
      JSON.stringify({ name: 't', version: '0.0.0', scripts: { test: 'v' } }),
    );
    fs.writeFileSync(path.join(tmpRoot, 'pnpm-lock.yaml'), '');
    await runInit({ repoRoot: tmpRoot, claudeHome, nonInteractive: true });
    const cfg = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, '.sidekick', 'config.json'), 'utf-8'),
    );
    expect(cfg.gates).toEqual({ test: 'pnpm test' });
  });
});

describe('runInit hook install', () => {
  let tmpRoot: string;
  let claudeHome: string;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-init-'));
    execSync('git init -q', { cwd: tmpRoot });
    claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-home-'));
  });
  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(claudeHome, { recursive: true, force: true });
  });

  const settingsPath = () =>
    path.join(tmpRoot, '.claude', 'settings.local.json');

  it('installs the guard hook block by default (non-interactive)', async () => {
    await runInit({ repoRoot: tmpRoot, claudeHome, nonInteractive: true });
    const s = JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'));
    expect(s.hooks.PreToolUse[0].hooks[0].command).toContain(
      'hook guard-config',
    );
    expect(s.hooks.PreToolUse[0].hooks[0].command).toContain(
      path.join(claudeHome, 'sidekick', 'bin', 'sidekick'),
    );
    expect(s.hooks.Stop[0].hooks[0].command).toContain('hook scan-config');
  });

  it('omits the guard hook when hooks:false (--no-hooks)', async () => {
    await runInit({
      repoRoot: tmpRoot,
      claudeHome,
      nonInteractive: true,
      hooks: false,
    });
    expect(fs.existsSync(settingsPath())).toBe(false);
  });

  it('gitignores .claude/settings.local.json', async () => {
    await runInit({ repoRoot: tmpRoot, claudeHome, nonInteractive: true });
    const gi = fs.readFileSync(path.join(tmpRoot, '.gitignore'), 'utf-8');
    expect(gi).toContain('.claude/settings.local.json');
  });
});
