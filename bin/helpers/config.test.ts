import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadConfig,
  parseConfig,
  resolveGates,
  runGatesCli,
} from './config.js';

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

  it('accepts partial gates — missing fields are unconfigured, not errors', () => {
    const result = parseConfig(
      JSON.stringify({
        schemaVersion: 1,
        defaultBranch: 'main',
        gates: { typecheck: 'x' },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.gates).toEqual({ typecheck: 'x' });
    }
  });

  it('accepts absent gates entirely', () => {
    const result = parseConfig(
      JSON.stringify({ schemaVersion: 1, defaultBranch: 'main' }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.gates).toEqual({});
  });

  it('rejects gates that is not an object', () => {
    const result = parseConfig(
      JSON.stringify({
        schemaVersion: 1,
        defaultBranch: 'main',
        gates: 'pnpm test',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/gates/);
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

describe('resolveGates', () => {
  const parse = (gates: unknown) => {
    const r = parseConfig(
      JSON.stringify({ schemaVersion: 1, defaultBranch: 'main', gates }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };

  it('reports configured when all three gates are set', () => {
    const resolved = resolveGates(
      parse({ typecheck: 'bun run typecheck', lint: 'l', test: 't' }),
    );
    expect(resolved.configured).toBe(true);
    expect(resolved.missing).toEqual([]);
    expect(resolved.gates.typecheck).toBe('bun run typecheck');
  });

  it('reports the missing gates when partially configured', () => {
    const resolved = resolveGates(parse({ typecheck: 'x' }));
    expect(resolved.configured).toBe(false);
    expect(resolved.missing).toEqual(['lint', 'test']);
    expect(resolved.gates).toEqual({ typecheck: 'x' });
  });

  it('reports all gates missing when gates is absent', () => {
    const r = parseConfig(
      JSON.stringify({ schemaVersion: 1, defaultBranch: 'main' }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    const resolved = resolveGates(r.value);
    expect(resolved.configured).toBe(false);
    expect(resolved.missing).toEqual(['typecheck', 'lint', 'test']);
  });
});

describe('parseConfig — verifiers registry (3.1)', () => {
  const base = { schemaVersion: 1, defaultBranch: 'main' };
  const entry = {
    dimension: 'ui-color',
    agent: 'my-ui-color-verifier',
    surfaces: ['review'],
  };

  it('defaults to an empty registry with no warnings when absent', () => {
    const r = parseConfig(JSON.stringify(base));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.verifiers).toEqual([]);
      expect(r.warnings).toEqual([]);
    }
  });

  it('parses a valid entry and defaults tier to advisory', () => {
    const r = parseConfig(JSON.stringify({ ...base, verifiers: [entry] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.verifiers).toEqual([
        {
          dimension: 'ui-color',
          agent: 'my-ui-color-verifier',
          surfaces: ['review'],
          tier: 'advisory',
        },
      ]);
      expect(r.warnings).toEqual([]);
    }
  });

  it('keeps an explicit advisory tier and the optional family field', () => {
    const r = parseConfig(
      JSON.stringify({
        ...base,
        verifiers: [{ ...entry, tier: 'advisory', family: 'claude' }],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.verifiers[0].tier).toBe('advisory');
      expect(r.value.verifiers[0].family).toBe('claude');
    }
  });

  it('accepts an entry mounted on multiple surfaces', () => {
    const r = parseConfig(
      JSON.stringify({
        ...base,
        verifiers: [{ ...entry, surfaces: ['rfc', 'plan', 'decision'] }],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.verifiers[0].surfaces).toEqual([
        'rfc',
        'plan',
        'decision',
      ]);
    }
  });

  it('accepts a binding-tier entry syntactically (validated at resolve time)', () => {
    // D7 (ADR-0006): parseConfig no longer rejects binding; whether it actually
    // binds is a resolve-time certificate check in verifiers.ts.
    const r = parseConfig(
      JSON.stringify({ ...base, verifiers: [{ ...entry, tier: 'binding' }] }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.verifiers).toEqual([
        {
          dimension: 'ui-color',
          agent: 'my-ui-color-verifier',
          surfaces: ['review'],
          tier: 'binding',
        },
      ]);
      expect(r.warnings).toEqual([]);
    }
  });

  it('skips an entry with an unknown tier', () => {
    const r = parseConfig(
      JSON.stringify({ ...base, verifiers: [{ ...entry, tier: 'nonsense' }] }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.verifiers).toEqual([]);
      expect(r.warnings.length).toBe(1);
      expect(r.warnings[0]).toMatch(/tier/);
    }
  });

  it('skips an entry with an unknown surface', () => {
    const r = parseConfig(
      JSON.stringify({
        ...base,
        verifiers: [{ ...entry, surfaces: ['ui'] }],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.verifiers).toEqual([]);
      expect(r.warnings[0]).toMatch(/surfaces/);
      expect(r.warnings[0]).toMatch(/review \| rfc \| plan \| decision/);
    }
  });

  it('skips an entry with empty surfaces', () => {
    const r = parseConfig(
      JSON.stringify({ ...base, verifiers: [{ ...entry, surfaces: [] }] }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.verifiers).toEqual([]);
      expect(r.warnings.length).toBe(1);
    }
  });

  it('skips entries missing dimension or agent, naming the index', () => {
    const r = parseConfig(
      JSON.stringify({
        ...base,
        verifiers: [
          { agent: 'a', surfaces: ['review'] },
          { dimension: 'd', surfaces: ['review'] },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.verifiers).toEqual([]);
      expect(r.warnings.length).toBe(2);
      expect(r.warnings[0]).toMatch(/verifiers\[0\]/);
      expect(r.warnings[0]).toMatch(/dimension/);
      expect(r.warnings[1]).toMatch(/verifiers\[1\]/);
      expect(r.warnings[1]).toMatch(/agent/);
    }
  });

  it('skips a duplicate dimension+surface, keeping the first', () => {
    const r = parseConfig(
      JSON.stringify({
        ...base,
        verifiers: [entry, { ...entry, agent: 'other-agent' }],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.verifiers.length).toBe(1);
      expect(r.value.verifiers[0].agent).toBe('my-ui-color-verifier');
      expect(r.warnings[0]).toMatch(/duplicate/i);
    }
  });

  it('keeps valid entries alongside skipped ones', () => {
    const r = parseConfig(
      JSON.stringify({
        ...base,
        verifiers: [
          { ...entry, surfaces: ['ui'] }, // unknown surface → skipped
          { ...entry, dimension: 'ui-spacing' },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.verifiers.length).toBe(1);
      expect(r.value.verifiers[0].dimension).toBe('ui-spacing');
      expect(r.warnings.length).toBe(1);
    }
  });

  it('rejects the whole config when verifiers is not an array', () => {
    const r = parseConfig(
      JSON.stringify({ ...base, verifiers: { dimension: 'x' } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/verifiers/);
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

describe('parseConfig — fanout block', () => {
  it('defaults fanout when absent', () => {
    const result = parseConfig(
      JSON.stringify({
        schemaVersion: 1,
        defaultBranch: 'main',
        gates: { typecheck: 't', lint: 'l', test: 'x' },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fanout).toEqual({
        backend: 'auto',
        budget: 'standard',
      });
    }
  });

  it('parses an explicit fanout block', () => {
    const result = parseConfig(
      JSON.stringify({
        schemaVersion: 1,
        defaultBranch: 'main',
        gates: { typecheck: 't', lint: 'l', test: 'x' },
        fanout: { backend: 'workflow', budget: 'deep' },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fanout).toEqual({
        backend: 'workflow',
        budget: 'deep',
      });
    }
  });

  it('defaults missing fanout sub-fields individually', () => {
    const result = parseConfig(
      JSON.stringify({
        schemaVersion: 1,
        defaultBranch: 'main',
        gates: { typecheck: 't', lint: 'l', test: 'x' },
        fanout: { budget: 'quick' },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fanout).toEqual({ backend: 'auto', budget: 'quick' });
    }
  });

  it('rejects invalid fanout.backend', () => {
    const result = parseConfig(
      JSON.stringify({
        schemaVersion: 1,
        defaultBranch: 'main',
        gates: { typecheck: 't', lint: 'l', test: 'x' },
        fanout: { backend: 'cloud' },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('fanout.backend');
    }
  });

  it('rejects invalid fanout.budget', () => {
    const result = parseConfig(
      JSON.stringify({
        schemaVersion: 1,
        defaultBranch: 'main',
        gates: { typecheck: 't', lint: 'l', test: 'x' },
        fanout: { budget: 'unlimited' },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('fanout.budget');
    }
  });

  it('rejects fanout that is not an object', () => {
    const result = parseConfig(
      JSON.stringify({
        schemaVersion: 1,
        defaultBranch: 'main',
        gates: { typecheck: 't', lint: 'l', test: 'x' },
        fanout: 'workflow',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('fanout');
    }
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

describe('runGatesCli', () => {
  let tmpRoot: string;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-gates-'));
  });
  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  const write = (config: unknown) => {
    fs.mkdirSync(path.join(tmpRoot, '.sidekick'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, '.sidekick', 'config.json'),
      typeof config === 'string' ? config : JSON.stringify(config),
    );
  };

  it('prints the resolved gates for a fully configured repo', async () => {
    write({
      schemaVersion: 1,
      defaultBranch: 'main',
      gates: { typecheck: 'bun run typecheck', lint: 'l', test: 't' },
    });
    const { stdout, exitCode } = await runGatesCli({ repoRoot: tmpRoot });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.configured).toBe(true);
    expect(parsed.gates.typecheck).toBe('bun run typecheck');
  });

  it('reports unconfigured gates without failing — a valid loud state', async () => {
    write({ schemaVersion: 1, defaultBranch: 'main', gates: { lint: 'l' } });
    const { stdout, exitCode } = await runGatesCli({ repoRoot: tmpRoot });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.configured).toBe(false);
    expect(parsed.missing).toEqual(['typecheck', 'test']);
  });

  it('errors with missing_config when there is no config file', async () => {
    const { stdout, exitCode } = await runGatesCli({ repoRoot: tmpRoot });
    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout).error).toBe('missing_config');
  });

  it('errors with invalid_config and a reason on a broken file', async () => {
    write('{not json');
    const { stdout, exitCode } = await runGatesCli({ repoRoot: tmpRoot });
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBe('invalid_config');
    expect(parsed.reason).toMatch(/JSON/i);
  });
});
