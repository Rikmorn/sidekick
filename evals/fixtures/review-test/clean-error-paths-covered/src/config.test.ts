import { describe, expect, it } from 'bun:test';
import { DEFAULT_RETRY, describeRetry, parseRetry } from './config.js';

describe('describeRetry', () => {
  it('renders the retry policy', () => {
    expect(describeRetry(DEFAULT_RETRY)).toBe('3 attempts, 5000ms timeout');
  });

  it('renders a single-attempt policy', () => {
    expect(describeRetry({ attempts: 1, timeoutMs: 250 })).toBe(
      '1 attempts, 250ms timeout',
    );
  });
});

describe('parseRetry', () => {
  it('parses a well-formed policy', () => {
    expect(parseRetry('5/2000')).toEqual({
      ok: true,
      config: { attempts: 5, timeoutMs: 2000 },
    });
  });

  it('accepts the minimum of one attempt and one millisecond', () => {
    expect(parseRetry('1/1')).toEqual({
      ok: true,
      config: { attempts: 1, timeoutMs: 1 },
    });
  });

  it('rejects a value without exactly two parts', () => {
    expect(parseRetry('5')).toEqual({
      ok: false,
      reason: 'expected "<attempts>/<timeoutMs>"',
    });
    expect(parseRetry('5/2000/1')).toEqual({
      ok: false,
      reason: 'expected "<attempts>/<timeoutMs>"',
    });
  });

  it('rejects attempts that are zero, negative, fractional, or unparseable', () => {
    const reason = 'attempts must be a positive integer';
    expect(parseRetry('0/2000')).toEqual({ ok: false, reason });
    expect(parseRetry('-1/2000')).toEqual({ ok: false, reason });
    expect(parseRetry('2.5/2000')).toEqual({ ok: false, reason });
    expect(parseRetry('x/2000')).toEqual({ ok: false, reason });
  });

  it('rejects a timeout that is zero, negative, or unparseable', () => {
    const reason = 'timeoutMs must be a positive integer';
    expect(parseRetry('5/0')).toEqual({ ok: false, reason });
    expect(parseRetry('5/-1')).toEqual({ ok: false, reason });
    expect(parseRetry('5/soon')).toEqual({ ok: false, reason });
  });
});
