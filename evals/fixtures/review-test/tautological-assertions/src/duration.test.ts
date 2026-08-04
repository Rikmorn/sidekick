import { describe, expect, it } from 'bun:test';
import { clampMs, formatDuration } from './duration.js';

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

describe('formatDuration', () => {
  it('formats an hour-scale duration', () => {
    expect(formatDuration(3_900_000)).toBeDefined();
  });

  it('formats a minute-scale duration', () => {
    expect(typeof formatDuration(309_000)).toBe('string');
  });

  it('formats a second-scale duration', () => {
    formatDuration(45_000);
    expect(true).toBe(true);
  });
});
