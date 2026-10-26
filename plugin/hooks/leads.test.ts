import { expect, test } from 'claude-code/testing';
import { branchAt, trunkOf } from './leads';

test('branchAt takes the last item the end lead and the rest the middle lead', () => {
  expect(branchAt(0, 3)).toBe('├ ');
  expect(branchAt(1, 3)).toBe('├ ');
  expect(branchAt(2, 3)).toBe('└ ');
  expect(branchAt(0, 1)).toBe('└ ');
});

test('trunkOf carries the line down under a middle lead and a space under an end lead', () => {
  expect(trunkOf('')).toBe('');
  expect(trunkOf('├ ')).toBe('│ ');
  expect(trunkOf('└ ')).toBe('  ');
});
