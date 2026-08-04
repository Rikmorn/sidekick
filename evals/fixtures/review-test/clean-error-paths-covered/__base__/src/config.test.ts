import { describe, expect, it } from 'bun:test';
import { DEFAULT_RETRY, describeRetry } from './config.js';

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
