import { describe, expect, it } from 'bun:test';
import { hashRfcContent } from './hash-rfc.js';

describe('hashRfcContent', () => {
  // Canonical SHA-256 test vectors — proves it is real SHA-256, not some other digest.
  it('matches the SHA-256 vector for the empty string', () => {
    expect(hashRfcContent('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('matches the SHA-256 vector for "abc"', () => {
    expect(hashRfcContent('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
