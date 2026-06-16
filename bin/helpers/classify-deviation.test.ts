import { describe, expect, it } from 'bun:test';
import {
  classifyDeviation,
  runClassifyDeviationCli,
} from './classify-deviation.js';

describe('classifyDeviation', () => {
  it('proceeds for a clean amendment (1 D-NN, no goal change, <=150 words)', () => {
    const r = classifyDeviation({
      claimed_type: 'amendment',
      d_nn_affected: ['D-02'],
      goal_change: false,
      description: 'Special-case Infinity/NaN handling.',
    });
    expect(r.verdict).toBe('proceed');
    expect(r.route).toBe('amendment');
    expect(r.signal).toEqual({
      d_nn_count: 1,
      goal_change: false,
      word_count: 3,
    });
  });

  it('flags a mismatch when an amendment affects >=2 D-NN', () => {
    const r = classifyDeviation({
      claimed_type: 'amendment',
      d_nn_affected: ['D-01', 'D-02'],
      goal_change: false,
      description: 'two decisions touched',
    });
    expect(r.verdict).toBe('mismatch');
    expect(r.route).toBe('amendment');
  });

  it('flags a mismatch when an amendment changes a goal', () => {
    const r = classifyDeviation({
      claimed_type: 'amendment',
      d_nn_affected: ['D-01'],
      goal_change: true,
      description: 'small change',
    });
    expect(r.verdict).toBe('mismatch');
  });

  it('flags a mismatch when an amendment description exceeds 150 words', () => {
    const r = classifyDeviation({
      claimed_type: 'amendment',
      d_nn_affected: ['D-01'],
      goal_change: false,
      description: Array.from({ length: 151 }, (_, i) => `w${i}`).join(' '),
    });
    expect(r.signal.word_count).toBe(151);
    expect(r.verdict).toBe('mismatch');
  });

  it('proceeds for redesign and decision_opportunity regardless of signal', () => {
    expect(
      classifyDeviation({
        claimed_type: 'redesign',
        d_nn_affected: ['D-01', 'D-02', 'D-03'],
        goal_change: true,
        description: 'x',
      }),
    ).toMatchObject({ verdict: 'proceed', route: 'redesign' });
    expect(
      classifyDeviation({
        claimed_type: 'decision_opportunity',
        d_nn_affected: [],
        goal_change: false,
        description: 'x',
      }),
    ).toMatchObject({ verdict: 'proceed', route: 'decision' });
  });

  it('counts words by whitespace, ignoring extra spaces/newlines', () => {
    const r = classifyDeviation({
      claimed_type: 'amendment',
      d_nn_affected: ['D-01'],
      goal_change: false,
      description: '  one   two\nthree  ',
    });
    expect(r.signal.word_count).toBe(3);
  });
});

describe('runClassifyDeviationCli', () => {
  it('parses stdin JSON and returns the result JSON', () => {
    const out = runClassifyDeviationCli(
      JSON.stringify({
        type: 'amendment',
        d_nn_affected: ['D-02'],
        goal_change: false,
        description: 'one two three',
      }),
    );
    expect(JSON.parse(out)).toMatchObject({
      verdict: 'proceed',
      route: 'amendment',
    });
  });

  it('accepts the executor deviation block shape (type key) and bare claimed_type', () => {
    const a = JSON.parse(
      runClassifyDeviationCli(
        JSON.stringify({
          type: 'redesign',
          d_nn_affected: ['D-01'],
          goal_change: false,
          description: 'x',
        }),
      ),
    );
    expect(a.route).toBe('redesign');
  });

  it('returns an error JSON on malformed stdin', () => {
    const out = runClassifyDeviationCli('not json');
    expect(JSON.parse(out)).toMatchObject({ error: 'invalid_input' });
  });

  it('returns an error JSON on an unknown claimed_type', () => {
    const out = runClassifyDeviationCli(
      JSON.stringify({
        type: 'whoops',
        d_nn_affected: [],
        goal_change: false,
        description: 'x',
      }),
    );
    expect(JSON.parse(out)).toMatchObject({ error: 'invalid_input' });
  });
});
