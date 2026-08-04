import { describe, expect, it } from 'bun:test';
import { clampMs } from './duration.js';

describe('clampMs', () => {
  it('floors positive values', () => {
    expect(clampMs(1500.9)).toBe(1500);
  });

  it('clamps negatives to zero', () => {
    expect(clampMs(-1)).toBe(0);
  });

  it('clamps non-finite values to zero', () => {
    expect(clampMs(Number.NaN)).toBe(0);
    expect(clampMs(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
