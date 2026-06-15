import { describe, expect, it } from 'bun:test';
import {
  decideGuardConfig,
  decideScanConfig,
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
