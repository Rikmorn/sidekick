import { describe, expect, it } from 'bun:test';
import { parseVersion } from './version.js';

describe('parseVersion', () => {
  it('parses a release version', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('parses multi-digit components', () => {
    expect(parseVersion('10.20.30')).toEqual({
      major: 10,
      minor: 20,
      patch: 30,
    });
  });

  it('ignores surrounding whitespace', () => {
    expect(parseVersion('  2.0.1  ')).toEqual({ major: 2, minor: 0, patch: 1 });
  });

  it('returns null for a non-version string', () => {
    expect(parseVersion('not-a-version')).toBeNull();
  });
});
