import { expect, test } from 'claude-code/testing';
import { cut, scrollHint, width, wrapRows } from './lines';

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

test('wrapRows breaks at the last space that fits', () => {
  expect(wrapRows('in progress: none at all', 12)).toEqual([
    'in progress:',
    'none at all',
  ]);
});

test('wrapRows breaks a word longer than the row hard', () => {
  expect(wrapRows('https://github.com/x', 8)).toEqual([
    'https://',
    'github.c',
    'om/x',
  ]);
});

test('wrapRows keeps an empty line as one empty row', () => {
  expect(wrapRows('', 10)).toEqual(['']);
});

test('wrapRows gives no rows below one column', () => {
  expect(wrapRows('abc', 0)).toEqual([]);
});

test('scrollHint is undefined while the rows fit', () => {
  expect(scrollHint(11, 11, false)).toBeUndefined();
});

test('scrollHint counts its own row among the hidden ones', () => {
  expect(scrollHint(12, 11, false)).toBe(
    '+2 rows · ctrl+x tab to focus, then ↓',
  );
  expect(scrollHint(12, 11, true)).toBe('+2 rows · ↓ to scroll');
});
