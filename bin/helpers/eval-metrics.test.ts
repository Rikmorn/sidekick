import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EvalCase } from './eval-case.js';
import {
  expectedVerdict,
  loadMetricsRegistry,
  parseMetricsRegistry,
} from './eval-metrics.js';

const validRegistry = () => ({
  schemaVersion: 1,
  subjects: {
    'agent:sk-coherence-checker': { class: 'verifier' },
    'skill:sk-build': { class: 'orchestrator' },
  },
  metrics: [
    {
      name: 'quality',
      applies_to: ['verifier', 'orchestrator'],
      feeds_from: ['structured', 'judge'],
      computation: {
        verifier: 'label-match-rate',
        orchestrator: 'mechanical-pass-rate',
      },
      bias: 'same-family judging; seeded corpora can flatter.',
      thresholds: { default: 0.8 },
    },
    {
      name: 'adherence',
      applies_to: ['verifier', 'orchestrator'],
      feeds_from: ['code', 'structured'],
      computation: 'deliverable-shape-rate',
      bias: 'mechanical shape only; well-formed can still be wrong.',
      thresholds: {
        default: 0.9,
        per_subject: { 'agent:sk-coherence-checker': 0.95 },
      },
    },
  ],
});

const parse = (mutate: (r: ReturnType<typeof validRegistry>) => unknown) => {
  const r = validRegistry();
  const v = mutate(r) ?? r;
  return parseMetricsRegistry(JSON.stringify(v));
};

describe('parseMetricsRegistry', () => {
  it('accepts a valid registry', () => {
    const res = parse(() => undefined);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.registry.metrics.map((m) => m.name)).toEqual([
        'quality',
        'adherence',
      ]);
    }
  });

  it('rejects invalid JSON and a non-object root', () => {
    expect(parseMetricsRegistry('nope').ok).toBe(false);
    expect(parseMetricsRegistry('[]').ok).toBe(false);
  });

  it('rejects a missing or empty bias field', () => {
    const missing = parse((r) => {
      delete (r.metrics[0] as Record<string, unknown>).bias;
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.errors.join(' ')).toContain('bias');
    }
    const empty = parse((r) => {
      r.metrics[0].bias = '  ';
    });
    expect(empty.ok).toBe(false);
  });

  it('rejects an unknown subject class', () => {
    const res = parse((r) => {
      (r.subjects as Record<string, unknown>)['agent:sk-x'] = {
        class: 'wizard',
      };
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(' ')).toContain('wizard');
  });

  it('rejects a malformed subject id key', () => {
    const res = parse((r) => {
      (r.subjects as Record<string, unknown>)['sk-no-prefix'] = {
        class: 'verifier',
      };
    });
    expect(res.ok).toBe(false);
  });

  it('rejects unknown computation names', () => {
    const res = parse((r) => {
      r.metrics[1].computation = 'vibes';
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(' ')).toContain('vibes');
  });

  it('rejects unknown fields at top level and in metric entries', () => {
    const top = parse((r) => {
      (r as Record<string, unknown>).extra = 1;
    });
    expect(top.ok).toBe(false);
    const entry = parse((r) => {
      (r.metrics[0] as Record<string, unknown>).extra = 1;
    });
    expect(entry.ok).toBe(false);
  });

  it('rejects duplicate metric names', () => {
    const res = parse((r) => {
      r.metrics.push({ ...r.metrics[0] });
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(' ')).toContain('duplicate');
  });

  it('rejects a per-class computation map that does not cover applies_to', () => {
    const res = parse((r) => {
      r.metrics[0].computation = { verifier: 'label-match-rate' };
    });
    expect(res.ok).toBe(false);
  });

  it('rejects unknown assertion types in feeds_from', () => {
    const res = parse((r) => {
      r.metrics[0].feeds_from = ['vibes'];
    });
    expect(res.ok).toBe(false);
  });

  it('rejects out-of-range thresholds and unknown per_subject ids', () => {
    const range = parse((r) => {
      r.metrics[0].thresholds = { default: 1.5 };
    });
    expect(range.ok).toBe(false);
    const unknown = parse((r) => {
      r.metrics[1].thresholds = {
        default: 0.9,
        per_subject: { 'agent:not-registered': 0.5 },
      };
    });
    expect(unknown.ok).toBe(false);
  });

  it('collects multiple errors rather than stopping at the first', () => {
    const res = parse((r) => {
      r.metrics[0].bias = '';
      r.metrics[1].computation = 'vibes';
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('loadMetricsRegistry', () => {
  it('reports absent when the file does not exist', () => {
    const res = loadMetricsRegistry('/nonexistent-root');
    expect(res.status).toBe('absent');
  });

  it('the committed registry parses clean', () => {
    const repoRoot = path.resolve(import.meta.dir, '..', '..');
    expect(fs.existsSync(path.join(repoRoot, 'evals', 'metrics.json'))).toBe(
      true,
    );
    const res = loadMetricsRegistry(repoRoot);
    expect(res.status).toBe('ok');
  });
});

describe('expectedVerdict', () => {
  const base: EvalCase = {
    schemaVersion: 1,
    caseId: 'c',
    suite: 's',
    subject: { kind: 'agent', name: 'a' },
    manual: false,
    k: 1,
    assertions: [],
  };

  it('prefers an explicit label', () => {
    expect(
      expectedVerdict({
        ...base,
        label: { expected_verdict: 'fail' },
        assertions: [
          {
            type: 'structured',
            target: 'artifact',
            path: 'verdict',
            op: 'equals',
            value: 'pass',
          },
        ],
      }),
    ).toBe('fail');
  });

  it('falls back to a verdict-equals structured assertion', () => {
    expect(
      expectedVerdict({
        ...base,
        assertions: [
          {
            type: 'structured',
            target: 'artifact',
            path: 'verdict',
            op: 'equals',
            value: 'fail',
          },
        ],
      }),
    ).toBe('fail');
  });

  it('returns null when neither label nor verdict assertion exists', () => {
    expect(expectedVerdict(base)).toBe(null);
    expect(
      expectedVerdict({
        ...base,
        assertions: [
          {
            type: 'structured',
            target: 'artifact',
            path: 'verdict',
            op: 'matches',
            value: 'pass|fail',
          },
        ],
      }),
    ).toBe(null);
  });
});
