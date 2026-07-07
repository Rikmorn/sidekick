import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  computeCalibrationStats,
  hashCorpus,
  resolveAgentFile,
  runCalibrate,
} from './eval-calibrate.js';
import type { ClaudeRunner } from './eval-run.js';
import { hashRfcContent } from './hash-rfc.js';

describe('computeCalibrationStats', () => {
  it('perfect predictions → all metrics 1', () => {
    const s = computeCalibrationStats([
      { caseId: 'a', expected: 'pass', predictions: ['pass'] },
      { caseId: 'b', expected: 'fail', predictions: ['fail'] },
    ]);
    expect(s.accuracy).toBe(1);
    expect(s.fail_precision).toBe(1);
    expect(s.fail_recall).toBe(1);
    expect(s.unanimity_rate).toBe(1);
    expect(s.cases).toBe(2);
  });

  it('a false positive lowers fail precision', () => {
    const s = computeCalibrationStats([
      { caseId: 'a', expected: 'pass', predictions: ['fail'] }, // FP
      { caseId: 'b', expected: 'fail', predictions: ['fail'] }, // TP
    ]);
    expect(s.fail_precision).toBe(0.5); // TP 1 / (TP 1 + FP 1)
    expect(s.fail_recall).toBe(1);
  });

  it('a missed fail lowers recall', () => {
    const s = computeCalibrationStats([
      { caseId: 'a', expected: 'fail', predictions: ['pass'] }, // FN
      { caseId: 'b', expected: 'fail', predictions: ['fail'] }, // TP
    ]);
    expect(s.fail_recall).toBe(0.5);
    expect(s.fail_precision).toBe(1);
  });

  it('unanimity is per-case agreement across k runs', () => {
    const s = computeCalibrationStats([
      { caseId: 'a', expected: 'fail', predictions: ['fail', 'fail'] }, // unanimous
      { caseId: 'b', expected: 'fail', predictions: ['fail', 'pass'] }, // split
    ]);
    expect(s.unanimity_rate).toBe(0.5);
  });

  it('an error prediction counts against accuracy and recall', () => {
    const s = computeCalibrationStats([
      { caseId: 'a', expected: 'fail', predictions: ['error'] }, // FN + error
    ]);
    expect(s.accuracy).toBe(0);
    expect(s.fail_recall).toBe(0);
    expect(s.errors).toBe(1);
  });
});

describe('hashCorpus', () => {
  it('is order-independent (sorted by case id)', () => {
    const a = hashCorpus([
      { caseId: 'x', content: '1' },
      { caseId: 'y', content: '2' },
    ]);
    const b = hashCorpus([
      { caseId: 'y', content: '2' },
      { caseId: 'x', content: '1' },
    ]);
    expect(a).toBe(b);
  });
  it('changes when content changes', () => {
    expect(hashCorpus([{ caseId: 'x', content: '1' }])).not.toBe(
      hashCorpus([{ caseId: 'x', content: '2' }]),
    );
  });
});

describe('resolveAgentFile', () => {
  let repoRoot: string;
  let claudeHome: string;
  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-cal-repo-'));
    claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-cal-home-'));
  });
  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(claudeHome, { recursive: true, force: true });
  });

  it('prefers the repo-level agent, then the user level', () => {
    expect(resolveAgentFile('v', repoRoot, claudeHome)).toBe(null);
    fs.mkdirSync(path.join(claudeHome, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(claudeHome, 'agents', 'v.md'), 'home');
    expect(resolveAgentFile('v', repoRoot, claudeHome)).toBe(
      path.join(claudeHome, 'agents', 'v.md'),
    );
    fs.mkdirSync(path.join(repoRoot, '.claude', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, '.claude', 'agents', 'v.md'), 'repo');
    expect(resolveAgentFile('v', repoRoot, claudeHome)).toBe(
      path.join(repoRoot, '.claude', 'agents', 'v.md'),
    );
  });
});

describe('runCalibrate (injected runner)', () => {
  let repoRoot: string;
  let claudeHome: string;
  const AGENT = 'sk-coherence-checker';
  const AGENT_BODY = '---\nname: sk-coherence-checker\n---\nbody';

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-calrun-repo-'));
    claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-calrun-home-'));
    fs.mkdirSync(path.join(repoRoot, '.claude', 'agents'), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, '.claude', 'agents', `${AGENT}.md`),
      AGENT_BODY,
    );
    const fixtureDir = path.join(repoRoot, 'evals', 'fixtures', 'f');
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.writeFileSync(path.join(fixtureDir, 'RFC.md'), '# rfc\n');
  });
  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(claudeHome, { recursive: true, force: true });
  });

  const writeCase = (id: string, expected: 'pass' | 'fail') => {
    const dir = path.join(repoRoot, 'evals', 'cases', 'cal', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'case.json'),
      JSON.stringify({
        schemaVersion: 1,
        subject: { kind: 'agent', name: AGENT },
        fixture: 'evals/fixtures/f',
        prompt: `case:${id} artifact_path: {{WORKSPACE}}/RFC.md`,
        label: { expected_verdict: expected },
      }),
    );
  };

  const envelope = (verdict: string) =>
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      api_error_status: null,
      num_turns: 2,
      result: `\`\`\`json\n${JSON.stringify({ verdict })}\n\`\`\``,
      total_cost_usd: 0.1,
      modelUsage: { 'claude-opus-4-8[1m]': { costUSD: 0.1 } },
    });

  // Fake claude that returns a verdict per case (found by the `case:<id>` marker).
  const fakeClaude =
    (verdictByCase: Record<string, string>): ClaudeRunner =>
    (argv) => {
      const joined = argv.join(' ');
      const id = Object.keys(verdictByCase).find((k) =>
        joined.includes(`case:${k}`),
      );
      return { stdout: envelope(verdictByCase[id ?? '']), exitCode: 0 };
    };

  const NOW = () => '2026-07-07T00:00:00.000Z';

  it('writes a certificate when all thresholds are met', () => {
    writeCase('clean', 'pass');
    writeCase('seeded', 'fail');
    const res = runCalibrate({
      repoRoot,
      claudeHome,
      verifier: AGENT,
      suite: 'cal',
      k: 1,
      minCases: 2,
      deps: { claude: fakeClaude({ clean: 'pass', seeded: 'fail' }), now: NOW },
    });
    expect(res.exitCode).toBe(0);
    expect(res.certificateWritten).toBe(true);
    const certPath = path.join(
      repoRoot,
      '.sidekick',
      'calibrations',
      `${AGENT}.json`,
    );
    expect(fs.existsSync(certPath)).toBe(true);
    const cert = JSON.parse(fs.readFileSync(certPath, 'utf-8'));
    expect(cert.verifier).toBe(AGENT);
    expect(cert.agent_file_hash).toBe(hashRfcContent(AGENT_BODY));
    expect(cert.stats.accuracy).toBe(1);
    expect(cert.k).toBe(1);
    expect(cert.created).toBe('2026-07-07T00:00:00.000Z');
    expect(typeof cert.corpus_hash).toBe('string');
  });

  it('does NOT write a certificate when precision is below threshold', () => {
    writeCase('clean', 'pass');
    writeCase('seeded', 'fail');
    // verifier cries fail on the clean case → a false positive, precision 0.5
    const res = runCalibrate({
      repoRoot,
      claudeHome,
      verifier: AGENT,
      suite: 'cal',
      k: 1,
      minCases: 2,
      deps: { claude: fakeClaude({ clean: 'fail', seeded: 'fail' }), now: NOW },
    });
    expect(res.exitCode).toBe(0);
    expect(res.certificateWritten).toBe(false);
    expect(
      fs.existsSync(
        path.join(repoRoot, '.sidekick', 'calibrations', `${AGENT}.json`),
      ),
    ).toBe(false);
    expect(res.stats?.fail_precision).toBe(0.5);
  });

  it('does NOT write a certificate when case count is below min-cases', () => {
    writeCase('clean', 'pass');
    writeCase('seeded', 'fail');
    const res = runCalibrate({
      repoRoot,
      claudeHome,
      verifier: AGENT,
      suite: 'cal',
      k: 1,
      minCases: 20, // only 2 cases present
      deps: { claude: fakeClaude({ clean: 'pass', seeded: 'fail' }), now: NOW },
    });
    expect(res.certificateWritten).toBe(false);
    expect(res.belowMinCases).toBe(true);
  });

  it('errors when the verifier agent file cannot be resolved', () => {
    writeCase('clean', 'pass');
    fs.rmSync(path.join(repoRoot, '.claude', 'agents', `${AGENT}.md`));
    const res = runCalibrate({
      repoRoot,
      claudeHome,
      verifier: AGENT,
      suite: 'cal',
      k: 1,
      minCases: 1,
      deps: { claude: fakeClaude({ clean: 'pass' }), now: NOW },
    });
    expect(res.exitCode).toBe(1);
    expect(res.error).toMatch(/agent/i);
  });
});
