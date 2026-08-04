import { describe, expect, it } from 'bun:test';
import { toSlug } from './slug.js';

describe('toSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(toSlug('Hello World')).toBe('hello-world');
  });

  it('collapses punctuation runs and trims edge hyphens', () => {
    expect(toSlug('  A -- b!! ')).toBe('a-b');
  });

  it('returns empty for punctuation-only input', () => {
    expect(toSlug('!!!')).toBe('');
  });
});
