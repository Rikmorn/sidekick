import { expect, test } from 'claude-code/testing';
import {
  cut,
  ELLIPSIS,
  fit,
  hiddenRows,
  scrollHint,
  scrollKeys,
  width,
  wrapRows,
} from './lines';

test('width counts columns: a dash or an ellipsis is one, an emoji two', () => {
  expect(width('a—b')).toBe(3);
  expect(width(ELLIPSIS)).toBe(1);
  expect(width('💀')).toBe(2);
  expect(width('a💀b')).toBe(4);
});

test('cut keeps the code points that fit in the columns', () => {
  expect(cut('héllo', 2)).toBe('hé');
});

test('cut leaves out an emoji that would cross the edge', () => {
  expect(cut('a💀b', 2)).toBe('a');
  expect(cut('a💀b', 3)).toBe('a💀');
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

test('wrapRows draws no blank row for a trailing space', () => {
  expect(wrapRows('abc def ', 7)).toEqual(['abc def']);
});

test('wrapRows draws no blank row for a line led by two spaces', () => {
  expect(wrapRows('  abcdefghij', 5)).toEqual(['  abc', 'defgh', 'ij']);
  expect(wrapRows('  ab cdef', 5)).toEqual(['  ab', 'cdef']);
});

test('wrapRows leaves no row led by a space after a hard break', () => {
  expect(wrapRows('abcde   fghij', 5)).toEqual(['abcde', 'fghij']);
});

test('wrapRows gives a line of spaces one row, not a blank tail', () => {
  expect(wrapRows('       ', 3)).toEqual(['   ']);
});

test('wrapRows gives no rows below one column', () => {
  expect(wrapRows('abc', 0)).toEqual([]);
});

test('scrollHint is undefined while the rows fit', () => {
  expect(scrollHint(11, 11, false)).toBeUndefined();
});

test('hiddenRows is 0 while the rows fit, and counts the hint row once they do not', () => {
  expect(hiddenRows(11, 11)).toBe(0);
  expect(hiddenRows(12, 11)).toBe(2);
});

test('scrollKeys names the keys by whether the pane holds the keyboard', () => {
  expect(scrollKeys(true)).toBe('↓ to scroll');
  expect(scrollKeys(false)).toBe('ctrl+x tab to focus, then ↓');
});

test('scrollHint counts its own row among the hidden ones', () => {
  expect(scrollHint(12, 11, false)).toBe(
    '+2 rows · ctrl+x tab to focus, then ↓',
  );
  expect(scrollHint(12, 11, true)).toBe('+2 rows · ↓ to scroll');
});

test('fit keeps text that fits, and cuts the rest to the room with an ellipsis', () => {
  expect(fit('abcd', 4)).toBe('abcd');
  expect(fit('abcde', 4)).toBe(`abc${ELLIPSIS}`);
});

test('fit counts an emoji as two columns, and never returns text wider than its room', () => {
  expect(fit('💀💀', 4)).toBe('💀💀');
  expect(fit('💀💀💀', 4)).toBe(`💀${ELLIPSIS}`);
  expect(width(fit('a💀💀', 4))).toBeLessThanOrEqual(4);
});

test('fit at room 1 keeps only the ellipsis, and at room 0 or less keeps nothing', () => {
  expect(fit('abc', 1)).toBe(ELLIPSIS);
  expect(fit('abc', 0)).toBe('');
  expect(fit('abc', -2)).toBe('');
});
