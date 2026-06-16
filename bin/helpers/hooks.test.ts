import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as nodePath from 'node:path';
import {
  decideGuardConfig,
  decideScanConfig,
  installHooks,
  isSidekickConfigPath,
  runScanConfig,
} from './hooks.js';

describe('isSidekickConfigPath', () => {
  it('matches an absolute .sidekick/config.json', () => {
    expect(isSidekickConfigPath('/repo/.sidekick/config.json')).toBe(true);
  });
  it('matches a relative path resolved against cwd', () => {
    expect(isSidekickConfigPath('.sidekick/config.json', '/repo')).toBe(true);
  });
  it('does not match a config.json elsewhere', () => {
    expect(isSidekickConfigPath('/repo/src/config.json')).toBe(false);
  });
  it('does not match a nested .sidekick/state file', () => {
    expect(isSidekickConfigPath('/repo/.sidekick/state/config.json')).toBe(
      false,
    );
  });
});

describe('decideGuardConfig', () => {
  const editConfig = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: '/repo/.sidekick/config.json' },
  });

  it('denies an Edit targeting .sidekick/config.json', () => {
    const d = decideGuardConfig(editConfig);
    expect(d?.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(d?.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(d?.hookSpecificOutput.permissionDecisionReason).toContain(
      '.sidekick/config.json',
    );
  });

  it('returns null (no-op) for an unrelated file', () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: '/repo/src/index.ts' },
    });
    expect(decideGuardConfig(input)).toBeNull();
  });

  it('returns null for malformed JSON (fails open-quiet)', () => {
    expect(decideGuardConfig('not json {')).toBeNull();
  });

  it('returns null when file_path is absent', () => {
    expect(decideGuardConfig(JSON.stringify({ tool_name: 'Bash' }))).toBeNull();
  });
});

describe('decideScanConfig', () => {
  it('advises when config.json is modified', () => {
    const a = decideScanConfig(' M .sidekick/config.json\n');
    expect(a?.systemMessage).toContain('.sidekick/config.json');
  });
  it('advises when config.json is untracked/added', () => {
    expect(decideScanConfig('?? .sidekick/config.json\n')).not.toBeNull();
  });
  it('returns null on a clean tree', () => {
    expect(decideScanConfig('')).toBeNull();
  });
  it('returns null when only other files changed', () => {
    expect(decideScanConfig(' M src/index.ts\n')).toBeNull();
  });
});

describe('runScanConfig', () => {
  it('uses the injected porcelain reader', () => {
    const a = runScanConfig({
      cwd: '/repo',
      readPorcelain: () => ' M .sidekick/config.json\n',
    });
    expect(a?.systemMessage).toContain('.sidekick/config.json');
  });
  it('returns null when the reader throws (non-git / unavailable)', () => {
    const a = runScanConfig({
      cwd: '/repo',
      readPorcelain: () => {
        throw new Error('not a git repo');
      },
    });
    expect(a).toBeNull();
  });
});

describe('installHooks', () => {
  let tmp: string;
  let settingsPath: string;
  const launcher = '/home/u/.claude/sidekick/bin/sidekick';
  beforeEach(() => {
    tmp = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'sk-hooks-'));
    settingsPath = nodePath.join(tmp, '.claude', 'settings.local.json');
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  // Bare JSON.parse infers `any` (not an *explicit* `any`, so biome's
  // noExplicitAny does not flag it) — same style as init.test.ts.
  const read = () => JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

  it('creates settings with both hook entries when enabled', () => {
    const r = installHooks({
      settingsLocalPath: settingsPath,
      launcherPath: launcher,
      enabled: true,
    });
    expect(r.action).toBe('installed');
    const s = read();
    expect(s.hooks.PreToolUse[0].matcher).toBe('Edit|Write|MultiEdit');
    expect(s.hooks.PreToolUse[0].hooks[0].command).toContain(launcher);
    expect(s.hooks.PreToolUse[0].hooks[0].command).toContain(
      'hook guard-config',
    );
    expect(s.hooks.Stop[0].hooks[0].command).toContain('hook scan-config');
  });

  it('is idempotent on re-run', () => {
    installHooks({
      settingsLocalPath: settingsPath,
      launcherPath: launcher,
      enabled: true,
    });
    const r2 = installHooks({
      settingsLocalPath: settingsPath,
      launcherPath: launcher,
      enabled: true,
    });
    expect(r2.changed).toBe(false);
    expect(read().hooks.PreToolUse).toHaveLength(1);
  });

  it('preserves a foreign hook across install', () => {
    fs.mkdirSync(nodePath.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: 'Edit',
              hooks: [{ type: 'command', command: 'biome check' }],
            },
          ],
        },
      }),
    );
    installHooks({
      settingsLocalPath: settingsPath,
      launcherPath: launcher,
      enabled: true,
    });
    const s = read();
    expect(s.hooks.PostToolUse[0].hooks[0].command).toBe('biome check');
    expect(s.hooks.PreToolUse).toHaveLength(1);
  });

  it('strips our entries when disabled, leaving foreign hooks', () => {
    fs.mkdirSync(nodePath.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: 'Edit',
              hooks: [{ type: 'command', command: 'biome check' }],
            },
          ],
        },
      }),
    );
    installHooks({
      settingsLocalPath: settingsPath,
      launcherPath: launcher,
      enabled: true,
    });
    const r = installHooks({
      settingsLocalPath: settingsPath,
      launcherPath: launcher,
      enabled: false,
    });
    expect(r.action).toBe('removed');
    const s = read();
    expect(s.hooks.PreToolUse).toBeUndefined();
    expect(s.hooks.Stop).toBeUndefined();
    expect(s.hooks.PostToolUse[0].hooks[0].command).toBe('biome check');
  });

  it('is a no-op when disabling an absent guard', () => {
    const r = installHooks({
      settingsLocalPath: settingsPath,
      launcherPath: launcher,
      enabled: false,
    });
    expect(r.action).toBe('noop');
    expect(fs.existsSync(settingsPath)).toBe(false);
  });

  it('throws on malformed existing settings (no write)', () => {
    fs.mkdirSync(nodePath.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, '{ not valid json');
    expect(() =>
      installHooks({
        settingsLocalPath: settingsPath,
        launcherPath: launcher,
        enabled: true,
      }),
    ).toThrow();
  });
});
