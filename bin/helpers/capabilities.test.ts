import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { compareSemver, parseSemver, runCapabilities } from './capabilities.js';

describe('parseSemver', () => {
  it('extracts the first semver from CLI output', () => {
    expect(parseSemver('2.1.168 (Claude Code)')).toBe('2.1.168');
  });
  it('returns null when no semver present', () => {
    expect(parseSemver('command not found')).toBe(null);
  });
});

describe('compareSemver', () => {
  it('orders versions correctly', () => {
    expect(compareSemver('2.1.154', '2.1.154')).toBe(0);
    expect(compareSemver('2.1.168', '2.1.154')).toBeGreaterThan(0);
    expect(compareSemver('2.0.999', '2.1.154')).toBeLessThan(0);
  });
});

describe('runCapabilities', () => {
  let repoRoot: string;
  let claudeHome: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-repo-'));
    claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-home-'));
  });
  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(claudeHome, { recursive: true, force: true });
  });

  const base = () => ({
    repoRoot,
    claudeHome,
    env: {},
    managedSettingsPaths: [] as string[],
    readClaudeVersion: () => '2.1.168 (Claude Code)',
  });

  it('reports likely when version ok and nothing disables', () => {
    const report = runCapabilities(base());
    expect(report.cc_version).toBe('2.1.168');
    expect(report.workflows.version_ok).toBe(true);
    expect(report.workflows.disabled_by).toBe(null);
    expect(report.workflows.available).toBe('likely');
    // The plan-gating limit is always surfaced (documented-limits posture).
    expect(report.notes.join(' ')).toContain('Plan-level gating');
  });

  it('reports false when env kill-switch is set', () => {
    const report = runCapabilities({
      ...base(),
      env: { CLAUDE_CODE_DISABLE_WORKFLOWS: '1' },
    });
    expect(report.workflows.disabled_by).toBe(
      'env:CLAUDE_CODE_DISABLE_WORKFLOWS',
    );
    expect(report.workflows.available).toBe(false);
  });

  it('reports false when project settings disable workflows', () => {
    const settingsDir = path.join(repoRoot, '.claude');
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsPath = path.join(settingsDir, 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify({ disableWorkflows: true }));
    const report = runCapabilities(base());
    expect(report.workflows.disabled_by).toBe(settingsPath);
    expect(report.workflows.available).toBe(false);
  });

  it('ignores settings files without the flag or with flag=false', () => {
    const settingsDir = path.join(repoRoot, '.claude');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify({ disableWorkflows: false }),
    );
    const report = runCapabilities(base());
    expect(report.workflows.disabled_by).toBe(null);
    expect(report.workflows.available).toBe('likely');
  });

  it('reports false when CC version is below the minimum', () => {
    const report = runCapabilities({
      ...base(),
      readClaudeVersion: () => '2.1.100 (Claude Code)',
    });
    expect(report.workflows.version_ok).toBe(false);
    expect(report.workflows.available).toBe(false);
  });

  it('reports unknown when the claude binary is unavailable', () => {
    const report = runCapabilities({
      ...base(),
      readClaudeVersion: () => null,
    });
    expect(report.cc_version).toBe(null);
    expect(report.workflows.version_ok).toBe('unknown');
    expect(report.workflows.available).toBe('unknown');
  });

  it('checks managed settings paths first', () => {
    const managed = path.join(repoRoot, 'managed-settings.json');
    fs.writeFileSync(managed, JSON.stringify({ disableWorkflows: true }));
    const report = runCapabilities({
      ...base(),
      managedSettingsPaths: [managed],
    });
    expect(report.workflows.disabled_by).toBe(managed);
    expect(report.workflows.available).toBe(false);
  });

  it('treats unparseable settings files as not disabling', () => {
    const settingsDir = path.join(repoRoot, '.claude');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(path.join(settingsDir, 'settings.json'), '{not json');
    const report = runCapabilities(base());
    expect(report.workflows.disabled_by).toBe(null);
  });

  // #81: "where does the roster come from" needs an answer even when the
  // answer is "nothing installed it".
  describe('install provenance', () => {
    const writeManifest = (body: string): void => {
      fs.mkdirSync(path.join(claudeHome, 'sidekick'), { recursive: true });
      fs.writeFileSync(
        path.join(claudeHome, 'sidekick', 'manifest.json'),
        body,
      );
    };

    it('reports the root, version, date and on-disk counts', () => {
      writeManifest(
        JSON.stringify({
          schemaVersion: 1,
          packageVersion: '9.9.9',
          installedAt: '2026-09-17T00:00:00.000Z',
          files: [],
        }),
      );
      fs.mkdirSync(path.join(claudeHome, 'agents'), { recursive: true });
      fs.writeFileSync(path.join(claudeHome, 'agents', 'sk-a.md'), '');
      fs.writeFileSync(path.join(claudeHome, 'agents', 'sk-b.md'), '');
      fs.mkdirSync(path.join(claudeHome, 'skills', 'sk-one'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(claudeHome, 'skills', 'sk-one', 'SKILL.md'),
        '',
      );
      // A directory without a SKILL.md is not a skill.
      fs.mkdirSync(path.join(claudeHome, 'skills', 'not-a-skill'), {
        recursive: true,
      });
      fs.mkdirSync(path.join(claudeHome, 'sidekick', 'rules'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(claudeHome, 'sidekick', 'rules', 'sk-x.md'),
        '',
      );

      const report = runCapabilities(base());
      expect(report.schemaVersion).toBe(2);
      expect(report.install.root).toBe(claudeHome);
      expect(report.install.package_version).toBe('9.9.9');
      expect(report.install.installed_at).toBe('2026-09-17T00:00:00.000Z');
      expect(report.install.counts).toEqual({ agents: 2, skills: 1, rules: 1 });
      expect(report.install.note).toBe(null);
    });

    it('reports the absence explicitly when no manifest exists', () => {
      const report = runCapabilities(base());
      expect(report.install.root).toBe(claudeHome);
      expect(report.install.package_version).toBe(null);
      expect(report.install.installed_at).toBe(null);
      expect(report.install.counts).toEqual({ agents: 0, skills: 0, rules: 0 });
      expect(report.install.note).toContain('No install manifest');
    });

    it('reports the absence explicitly when the manifest is unreadable', () => {
      writeManifest('{not json');
      const report = runCapabilities(base());
      expect(report.install.package_version).toBe(null);
      expect(report.install.note).toContain('unreadable');
    });
  });
});
