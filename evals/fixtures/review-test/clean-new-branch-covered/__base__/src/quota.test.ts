import { describe, expect, it } from 'bun:test';
import { remaining } from './quota.js';

describe('remaining', () => {
  it('reports the headroom', () => {
    expect(remaining({ used: 2, limit: 10 })).toBe(8);
  });

  it('never goes negative', () => {
    expect(remaining({ used: 12, limit: 10 })).toBe(0);
  });
});
