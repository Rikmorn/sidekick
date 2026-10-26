import type { ProcessRunResult } from 'claude-code';
import { expect, test } from 'claude-code/testing';
import type { Settled } from '../failures';
import { sessionCheckOf } from './check';

function ran(
  partial: Pick<Partial<ProcessRunResult>, 'exitCode' | 'stdout' | 'stderr'>,
): Settled<ProcessRunResult> {
  return {
    value: {
      exitCode: 0,
      stdout: '',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
      ...partial,
    },
  };
}

test('a rejected run names both ways it can fail, with the timeout and the reason', () => {
  expect(sessionCheckOf({ reason: 'spawn ENOENT' })).toEqual({
    failure:
      'the session command did not start, or did not finish within 8 s: spawn ENOENT',
  });
});

test('a non-zero exit gives its code alone when stderr is blank', () => {
  expect(sessionCheckOf(ran({ exitCode: 1, stderr: ' \n' }))).toEqual({
    failure: 'the session command exited 1',
  });
});

test('a non-zero exit adds the first line of stderr', () => {
  expect(
    sessionCheckOf(ran({ exitCode: 2, stderr: '\nlisting timed out\nmore' })),
  ).toEqual({ failure: 'the session command exited 2: listing timed out' });
});

test('stdout that is not an answer is a failure', () => {
  expect(sessionCheckOf(ran({ stdout: 'not json' }))).toEqual({
    failure: 'the session command printed no answer',
  });
});

test('an answer comes back whole', () => {
  const stdout = JSON.stringify({ version: 1, name: 'calm-otter', held: true });
  expect(sessionCheckOf(ran({ stdout }))).toEqual({
    answer: { version: 1, name: 'calm-otter', held: true },
  });
});
