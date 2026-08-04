import { describe, expect, it } from 'bun:test';
import { parseVersion } from './version.js';

describe('parseVersion', () => {
  it('parses a release version', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('returns null for a non-version string', () => {
    expect(parseVersion('not-a-version')).toBeNull();
  });
});
