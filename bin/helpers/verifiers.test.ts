import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runVerifiersCli } from './verifiers.js';

describe('runVerifiersCli', () => {
  let repoRoot: string;
  let claudeHome: string;
  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-verifiers-'));
    claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-home-'));
  });
  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(claudeHome, { recursive: true, force: true });
  });

  const writeConfig = (config: unknown) => {
    fs.mkdirSync(path.join(repoRoot, '.sidekick'), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, '.sidekick', 'config.json'),
      typeof config === 'string' ? config : JSON.stringify(config),
    );
  };
  const writeAgent = (home: string, name: string) => {
    const dir = path.join(home, 'agents');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\nname: ${name}\n---\n`);
  };
  const run = (surface: string) =>
    runVerifiersCli({ repoRoot, claudeHome, surface });
  const parse = (surface: string) => {
    const { stdout, exitCode } = run(surface);
    expect(exitCode).toBe(0);
    return JSON.parse(stdout) as {
      surface: string;
      members: Array<{
        dimension: string;
        agent: string;
        tier: string;
        builtin: boolean;
      }>;
      warnings: string[];
    };
  };

  describe('bundled defaults (no config)', () => {
    it('returns the PLAN quorum: structural + crossref + coherence, binding', () => {
      const result = parse('plan');
      expect(result.members.map((m) => [m.dimension, m.agent])).toEqual([
        ['structural', 'sk-structural-checker'],
        ['crossref', 'sk-crossref-checker'],
        ['coherence', 'sk-coherence-checker'],
      ]);
      expect(result.members.every((m) => m.tier === 'binding')).toBe(true);
      expect(result.members.every((m) => m.builtin)).toBe(true);
    });

    it('returns the RFC quorum: structural + coherence', () => {
      const result = parse('rfc');
      expect(result.members.map((m) => m.agent)).toEqual([
        'sk-structural-checker',
        'sk-coherence-checker',
      ]);
    });

    it('returns the decision quorum: structural + coherence', () => {
      const result = parse('decision');
      expect(result.members.map((m) => m.agent)).toEqual([
        'sk-structural-checker',
        'sk-coherence-checker',
      ]);
    });

    it('returns the six review dimensions, advisory', () => {
      const result = parse('review');
      expect(result.members.map((m) => m.dimension)).toEqual([
        'correctness',
        'security',
        'maintainability',
        'test',
        'goal',
        'architecture',
      ]);
      expect(result.members.every((m) => m.tier === 'advisory')).toBe(true);
      expect(result.members.find((m) => m.dimension === 'goal')?.agent).toBe(
        'sk-goal-verifier',
      );
    });

    it('notes the missing config without erroring — bundled-only is a valid state', () => {
      const result = parse('review');
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toMatch(/no \.sidekick\/config\.json/i);
    });

    it('rejects an unknown surface with exit 1', () => {
      const { stdout, exitCode } = run('ui');
      expect(exitCode).toBe(1);
      expect(JSON.parse(stdout).error).toMatch(/surface/);
    });
  });

  describe('operator entries', () => {
    const entry = {
      dimension: 'ui-color',
      agent: 'my-ui-color-verifier',
      surfaces: ['review'],
    };

    it('appends a valid operator entry after the builtins', () => {
      writeConfig({
        schemaVersion: 1,
        defaultBranch: 'main',
        verifiers: [entry],
      });
      writeAgent(path.join(repoRoot, '.claude'), 'my-ui-color-verifier');
      const result = parse('review');
      const last = result.members[result.members.length - 1];
      expect(last).toEqual({
        dimension: 'ui-color',
        agent: 'my-ui-color-verifier',
        tier: 'advisory',
        builtin: false,
      });
      expect(result.warnings).toEqual([]);
    });

    it('mounts a multi-surface entry on each of its surfaces', () => {
      writeConfig({
        schemaVersion: 1,
        defaultBranch: 'main',
        verifiers: [{ ...entry, surfaces: ['rfc', 'plan'] }],
      });
      writeAgent(path.join(repoRoot, '.claude'), 'my-ui-color-verifier');
      expect(parse('rfc').members.map((m) => m.dimension)).toContain(
        'ui-color',
      );
      expect(parse('plan').members.map((m) => m.dimension)).toContain(
        'ui-color',
      );
      expect(parse('review').members.map((m) => m.dimension)).not.toContain(
        'ui-color',
      );
    });

    it('resolves the agent from the user-level claude home too', () => {
      writeConfig({
        schemaVersion: 1,
        defaultBranch: 'main',
        verifiers: [entry],
      });
      writeAgent(claudeHome, 'my-ui-color-verifier');
      const result = parse('review');
      expect(result.members.map((m) => m.dimension)).toContain('ui-color');
      expect(result.warnings).toEqual([]);
    });

    it('skips an entry whose agent definition resolves nowhere', () => {
      writeConfig({
        schemaVersion: 1,
        defaultBranch: 'main',
        verifiers: [entry],
      });
      const result = parse('review');
      expect(result.members.map((m) => m.dimension)).not.toContain('ui-color');
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toMatch(/my-ui-color-verifier/);
      expect(result.warnings[0]).toMatch(/no agent definition/i);
    });

    it('never displaces a builtin — colliding dimension is skipped with a warning', () => {
      writeConfig({
        schemaVersion: 1,
        defaultBranch: 'main',
        verifiers: [
          { dimension: 'structural', agent: 'my-checker', surfaces: ['plan'] },
        ],
      });
      writeAgent(path.join(repoRoot, '.claude'), 'my-checker');
      const result = parse('plan');
      const structural = result.members.filter(
        (m) => m.dimension === 'structural',
      );
      expect(structural).toEqual([
        {
          dimension: 'structural',
          agent: 'sk-structural-checker',
          tier: 'binding',
          builtin: true,
        },
      ]);
      expect(result.warnings[0]).toMatch(/non-displaceable|builtin/i);
    });

    it('allows a builtin dimension name on a surface where no builtin holds it', () => {
      // "structural" is bundled on rfc/plan/decision, not on review.
      writeConfig({
        schemaVersion: 1,
        defaultBranch: 'main',
        verifiers: [
          {
            dimension: 'structural',
            agent: 'my-checker',
            surfaces: ['review'],
          },
        ],
      });
      writeAgent(path.join(repoRoot, '.claude'), 'my-checker');
      const result = parse('review');
      expect(result.members.map((m) => m.dimension)).toContain('structural');
      expect(result.warnings).toEqual([]);
    });

    it('propagates parse-layer warnings (e.g. a binding-tier entry)', () => {
      writeConfig({
        schemaVersion: 1,
        defaultBranch: 'main',
        verifiers: [{ ...entry, tier: 'binding' }],
      });
      const result = parse('review');
      expect(result.members.every((m) => m.builtin)).toBe(true);
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toMatch(/binding/);
    });

    it('degrades to bundled-only on an unparseable config, loudly', () => {
      writeConfig('{not json');
      const result = parse('plan');
      expect(result.members.every((m) => m.builtin)).toBe(true);
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toMatch(/invalid/i);
      expect(result.warnings[0]).toMatch(/operator verifiers unavailable/i);
    });
  });
});
