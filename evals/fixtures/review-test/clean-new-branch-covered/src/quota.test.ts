import { describe, expect, it } from 'bun:test';
import { remaining } from './quota.js';

describe('remaining', () => {
  it('reports the headroom', () => {
    expect(remaining({ used: 2, limit: 10 })).toBe(8);
  });

  it('never goes negative', () => {
    expect(remaining({ used: 12, limit: 10 })).toBe(0);
  });

  it('is zero exactly at the limit', () => {
    expect(remaining({ used: 10, limit: 10 })).toBe(0);
  });

  it('is unbounded on an unmetered plan', () => {
    expect(remaining({ used: 0, limit: null })).toBe(Number.POSITIVE_INFINITY);
  });

  it('stays unbounded on an unmetered plan with heavy use', () => {
    expect(remaining({ used: 10_000, limit: null })).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});
