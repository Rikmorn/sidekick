import { describe, expect, it } from 'bun:test';
import { isAllowed } from './rate-limit.js';

describe('isAllowed', () => {
  it('allows a request under the limit', () => {
    expect(isAllowed({ used: 4, limit: 5 })).toBe(true);
  });

  it('rejects a request at the limit', () => {
    expect(isAllowed({ used: 5, limit: 5 })).toBe(false);
  });

  it('rejects a request over the limit', () => {
    expect(isAllowed({ used: 9, limit: 5 })).toBe(false);
  });
});
