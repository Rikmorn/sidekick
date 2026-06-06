import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadConfig, parseConfig } from './config.js';

describe('parseConfig', () => {
  it('parses a full valid config', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      defaultBranch: 'main',
      gates: {
        typecheck: 'pnpm typecheck',
        lint: 'pnpm lint',
        test: 'pnpm test',
      },
    });
    const result = parseConfig(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.defaultBranch).toBe('main');
      expect(result.value.gates.typecheck).toBe('pnpm typecheck');
    }
  });

  it('rejects missing schemaVersion', () => {
    const result = parseConfig(
      JSON.stringify({ defaultBranch: 'main', gates: {} }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/schemaVersion/);
  });

  it('rejects unsupported schemaVersion', () => {
    const result = parseConfig(
      JSON.stringify({
        schemaVersion: 99,
        defaultBranch: 'main',
        gates: { typecheck: 'x', lint: 'x', test: 'x' },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unsupported schemaVersion/i);
  });

  it('rejects missing defaultBranch', () => {
    const result = parseConfig(
      JSON.stringify({
        schemaVersion: 1,
        gates: { typecheck: 'x', lint: 'x', test: 'x' },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/defaultBranch/);
  });

  it('rejects missing gates fields', () => {
    const result = parseConfig(
      JSON.stringify({
        schemaVersion: 1,
        defaultBranch: 'main',
        gates: { typecheck: 'x' },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/gates\.(lint|test)/);
  });

  it('rejects malformed JSON', () => {
    const result = parseConfig('{not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/JSON/i);
  });

  it('rejects non-object root', () => {
    const result = parseConfig('"a string"');
    expect(result.ok).toBe(false);
  });

  it('rejects empty defaultBranch', () => {
    const result = parseConfig(
      JSON.stringify({
        schemaVersion: 1,
        defaultBranch: '',
        gates: { typecheck: 'x', lint: 'x', test: 'x' },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/defaultBranch/);
  });

  it('rejects empty gates.typecheck', () => {
    const result = parseConfig(
      JSON.stringify({
        schemaVersion: 1,
        defaultBranch: 'main',
        gates: { typecheck: '', lint: 'l', test: 't' },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/gates\.typecheck/);
  });
});

describe('parseConfig — M3 fields', () => {
  const base = {
    schemaVersion: 1,
    defaultBranch: 'main',
    gates: { typecheck: 't', lint: 'l', test: 'x' },
  };

  it('defaults waveSizeCap to 4 and buildCheckpoints to deviations-only', () => {
    const r = parseConfig(JSON.stringify(base));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.waveSizeCap).toBe(4);
      expect(r.value.buildCheckpoints).toBe('deviations-only');
    }
  });

  it('accepts explicit valid values', () => {
    const r = parseConfig(
      JSON.stringify({ ...base, waveSizeCap: 8, buildCheckpoints: 'per-wave' }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.waveSizeCap).toBe(8);
      expect(r.value.buildCheckpoints).toBe('per-wave');
    }
  });

  it('rejects a non-positive waveSizeCap', () => {
    expect(parseConfig(JSON.stringify({ ...base, waveSizeCap: 0 })).ok).toBe(
      false,
    );
  });

  it('rejects an unknown buildCheckpoints value', () => {
    expect(
      parseConfig(JSON.stringify({ ...base, buildCheckpoints: 'nope' })).ok,
    ).toBe(false);
  });
});

describe('loadConfig', () => {
  let tmpRoot: string;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-config-'));
  });
  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('returns missing_config when .sidekick/config.json absent', async () => {
    const result = await loadConfig(tmpRoot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('missing_config');
  });

  it('parses .sidekick/config.json when present and valid', async () => {
    fs.mkdirSync(path.join(tmpRoot, '.sidekick'));
    fs.writeFileSync(
      path.join(tmpRoot, '.sidekick', 'config.json'),
      JSON.stringify({
        schemaVersion: 1,
        defaultBranch: 'master',
        gates: { typecheck: 't', lint: 'l', test: 'te' },
      }),
    );
    const result = await loadConfig(tmpRoot);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.defaultBranch).toBe('master');
  });
});
