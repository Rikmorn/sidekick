import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  discoverCases,
  extractDeliverable,
  parseCase,
  resolveFixtureDir,
} from './eval-case.js';

const CTX = { caseId: 'c1', suite: 's1' };

const base = {
  schemaVersion: 1,
  subject: { kind: 'agent', name: 'sk-coherence-checker' },
  fixture: 'evals/fixtures/coherence/x',
  prompt: 'artifact_path: {{WORKSPACE}}/RFC.md, artifact_type: rfc',
  assertions: [
    { type: 'structured', path: 'verdict', op: 'equals', value: 'pass' },
  ],
};

describe('parseCase', () => {
  it('parses a minimal agent case, defaulting manual=false and k=1', () => {
    const r = parseCase(JSON.stringify(base), CTX);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.caseId).toBe('c1');
      expect(r.value.suite).toBe('s1');
      expect(r.value.manual).toBe(false);
      expect(r.value.k).toBe(1);
      expect(r.value.subject).toEqual({
        kind: 'agent',
        name: 'sk-coherence-checker',
      });
      expect(r.value.assertions[0]).toEqual({
        type: 'structured',
        target: 'artifact',
        path: 'verdict',
        op: 'equals',
        value: 'pass',
      });
    }
  });

  it('parses a skill case using invocation as the prompt', () => {
    const r = parseCase(
      JSON.stringify({
        schemaVersion: 1,
        subject: { kind: 'skill', invocation: '/sk-design foo --auto low' },
        assertions: [],
      }),
      CTX,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.subject).toEqual({
        kind: 'skill',
        invocation: '/sk-design foo --auto low',
      });
    }
  });

  it('parses a manual case and a label', () => {
    const r = parseCase(
      JSON.stringify({
        ...base,
        manual: true,
        label: { expected_verdict: 'fail' },
        k: 3,
      }),
      CTX,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.manual).toBe(true);
      expect(r.value.k).toBe(3);
      expect(r.value.label).toEqual({ expected_verdict: 'fail' });
    }
  });

  it('rejects a bad schemaVersion', () => {
    const r = parseCase(JSON.stringify({ ...base, schemaVersion: 2 }), CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/schemaVersion/);
  });

  it('rejects an unknown subject kind', () => {
    const r = parseCase(
      JSON.stringify({ ...base, subject: { kind: 'tool', name: 'x' } }),
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/subject/);
  });

  it('rejects an agent subject missing a name', () => {
    const r = parseCase(
      JSON.stringify({ ...base, subject: { kind: 'agent' } }),
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/name/);
  });

  it('rejects an agent case with no prompt', () => {
    const { prompt, ...noPrompt } = base;
    const r = parseCase(JSON.stringify(noPrompt), CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/prompt/);
  });

  it('rejects a structured assertion with an unknown op', () => {
    const r = parseCase(
      JSON.stringify({
        ...base,
        assertions: [{ type: 'structured', path: 'v', op: 'gt', value: 1 }],
      }),
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/op/);
  });

  it('defaults judge n=3 and threshold=0.66', () => {
    const r = parseCase(
      JSON.stringify({
        ...base,
        assertions: [{ type: 'judge', rubric: 'is it good?' }],
      }),
      CTX,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.assertions[0]).toMatchObject({
        type: 'judge',
        n: 3,
        threshold: 0.66,
      });
    }
  });

  it('rejects a code assertion missing cmd', () => {
    const r = parseCase(
      JSON.stringify({ ...base, assertions: [{ type: 'code' }] }),
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cmd/);
  });

  it('rejects an invalid k', () => {
    const r = parseCase(JSON.stringify({ ...base, k: 0 }), CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/k/);
  });
});

describe('extractDeliverable', () => {
  it('extracts the LAST json fence', () => {
    const text =
      'reasoning\n```json\n{"a":1}\n```\nmore\n```json\n{"verdict":"pass"}\n```';
    const r = extractDeliverable(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ verdict: 'pass' });
  });

  it('handles a single-line fence', () => {
    const r = extractDeliverable('x ```json {"v":true} ``` y');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ v: true });
  });

  it('returns no_json_fence when absent', () => {
    const r = extractDeliverable('no fence here');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('no_json_fence');
  });

  it('returns unparseable_json on malformed content', () => {
    const r = extractDeliverable('```json\n{not json}\n```');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unparseable_json');
  });
});

describe('discoverCases', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-evalcase-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const writeCase = (suite: string, id: string, obj: unknown) => {
    const dir = path.join(root, 'evals', 'cases', suite, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'case.json'), JSON.stringify(obj));
  };

  it('discovers all cases under a suite, sorted by id', () => {
    writeCase('s1', 'b-case', base);
    writeCase('s1', 'a-case', base);
    const { cases, errors } = discoverCases(root, 's1');
    expect(errors).toEqual([]);
    expect(cases.map((c) => c.caseId)).toEqual(['a-case', 'b-case']);
    expect(cases.every((c) => c.suite === 's1')).toBe(true);
  });

  it('discovers a single case by its case.json path', () => {
    writeCase('s1', 'only', base);
    const p = path.join(root, 'evals', 'cases', 's1', 'only', 'case.json');
    const { cases } = discoverCases(root, p);
    expect(cases.map((c) => c.caseId)).toEqual(['only']);
  });

  it('collects a parse error without aborting the suite', () => {
    writeCase('s1', 'good', base);
    writeCase('s1', 'bad', { schemaVersion: 2 });
    const { cases, errors } = discoverCases(root, 's1');
    expect(cases.map((c) => c.caseId)).toEqual(['good']);
    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/bad/);
  });

  it('returns an empty result for an unknown suite', () => {
    const { cases, errors } = discoverCases(root, 'nope');
    expect(cases).toEqual([]);
    expect(errors.length).toBe(1);
  });
});

describe('resolveFixtureDir', () => {
  it('joins a repo-relative fixture onto the repo root', () => {
    expect(resolveFixtureDir('/repo', 'smokes/fixtures/x')).toBe(
      path.join('/repo', 'smokes/fixtures/x'),
    );
  });
  it('returns null when no fixture is given', () => {
    expect(resolveFixtureDir('/repo', undefined)).toBe(null);
  });
});
