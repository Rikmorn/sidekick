import { expect, test } from 'claude-code/testing';
import { firstLine, reasonOf, runOutcome, settle } from './failures';

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

function ranWith(exitCode: number, stdout: string, stderr: string) {
  return {
    value: {
      exitCode,
      stdout,
      stderr,
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  };
}

const RUN = { name: 'the pickup', timeoutMs: 8_000 };

test('runOutcome names the run and its timeout when the run rejects', () => {
  expect(runOutcome({ reason: 'spawn failed' }, RUN)).toEqual({
    ok: false,
    reason:
      'the pickup did not start, or did not finish within 8 s: spawn failed',
  });
});

test('runOutcome names the exit code and the first line of stderr', () => {
  const ran = ranWith(2, '', '\n boom \nmore');
  expect(runOutcome(ran, RUN)).toEqual({
    ok: false,
    reason: 'the pickup exited 2: boom',
  });
});

test('runOutcome names only the exit code when stderr is blank', () => {
  const ran = ranWith(3, 'ignored', ' \n');
  expect(runOutcome(ran, RUN)).toEqual({
    ok: false,
    reason: 'the pickup exited 3',
  });
});

test('runOutcome hands on stdout when the run exits 0', () => {
  const ran = ranWith(0, 'out', 'warn');
  expect(runOutcome(ran, RUN)).toEqual({ ok: true, stdout: 'out' });
});
