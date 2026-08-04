import { describe, expect, it } from 'bun:test';
import { apiKey, bearerToken, type Request } from './headers.js';

const req = (headers: Record<string, string>): Request => ({ headers });

describe('bearerToken', () => {
  it('reads the lowercase header name', () => {
    expect(bearerToken(req({ authorization: 'Bearer abc' }))).toBe('abc');
  });

  it('reads the capitalised header name and lowercase scheme', () => {
    expect(bearerToken(req({ Authorization: 'bearer abc' }))).toBe('abc');
  });

  it('trims padding around the header value', () => {
    expect(bearerToken(req({ authorization: '  Bearer abc  ' }))).toBe('abc');
  });

  it('is null for another scheme', () => {
    expect(bearerToken(req({ authorization: 'Basic abc' }))).toBeNull();
  });

  it('is null when absent, blank, or carrying an empty token', () => {
    expect(bearerToken(req({}))).toBeNull();
    expect(bearerToken(req({ authorization: '   ' }))).toBeNull();
    expect(bearerToken(req({ authorization: 'Bearer   ' }))).toBeNull();
  });
});

describe('apiKey', () => {
  it('reads either header casing and trims the value', () => {
    expect(apiKey(req({ 'x-api-key': ' k1 ' }))).toBe('k1');
    expect(apiKey(req({ 'X-Api-Key': 'k2' }))).toBe('k2');
  });

  it('is null when absent or blank', () => {
    expect(apiKey(req({}))).toBeNull();
    expect(apiKey(req({ 'x-api-key': '   ' }))).toBeNull();
  });
});
