import { expect, test } from 'claude-code/testing';
import { cut, width } from './lines';

test('width counts code points, so a dash is one column', () => {
  expect(width('a—b')).toBe(3);
});

test('cut keeps the first columns code points', () => {
  expect(cut('héllo', 2)).toBe('hé');
});

test('cut returns the text whole when it already fits', () => {
  expect(cut('ab', 10)).toBe('ab');
});

test('cut to zero columns gives the empty string', () => {
  expect(cut('abc', 0)).toBe('');
});
