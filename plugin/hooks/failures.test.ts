import { expect, test } from 'claude-code/testing';
import { firstLine, reasonOf, settle } from './failures';

test('reasonOf gives an error its message and any other value its string', () => {
  expect(reasonOf(new Error('boom'))).toBe('boom');
  expect(reasonOf('plain')).toBe('plain');
});

test('firstLine skips leading blank lines and trims the line it finds', () => {
  expect(firstLine('\n  \n  first  \nsecond')).toBe('first');
});

test('firstLine gives nothing for text that is all blank', () => {
  expect(firstLine('')).toBeUndefined();
  expect(firstLine(' \n\t\n')).toBeUndefined();
});

test('settle gives the value of a call that resolves', async () => {
  expect(await settle(Promise.resolve(7))).toEqual({ value: 7 });
});

test('settle gives the reason of a call that rejects', async () => {
  expect(await settle(Promise.reject(new Error('refused')))).toEqual({
    reason: 'refused',
  });
});
