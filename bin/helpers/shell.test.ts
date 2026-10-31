import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { shellArg, shellQuote } from './shell.js';

// What `sh` makes of the text: the quoted value spliced into a printf command.
const throughSh = (quoted: string): string =>
  execFileSync('sh', ['-c', `printf %s ${quoted}`], { encoding: 'utf-8' });

const AWKWARD = [
  'a b',
  "it's",
  'cost $HOME',
  'a"b',
  'back\\slash',
  '`id`',
  '$(id)',
  'semi;colon',
  'glob*?',
  '~tilde',
  '#hash',
  'main@{1 minute ago}',
  'new\nline',
  '',
  "'",
];

describe('shellQuote', () => {
  test('wraps in single quotes and escapes an inner quote', () => {
    expect(shellQuote('a b')).toBe("'a b'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });

  test.each(AWKWARD)('round-trips %j through sh', (value) => {
    expect(throughSh(shellQuote(value))).toBe(value);
  });
});

describe('shellArg', () => {
  test.each([
    '/Users/a/docs/x-brief.md',
    'worktree-w1',
    'refs/sidekick/landed/w1/abc123',
    'main@v1.2+3',
    '213245a1',
    'k=v:w,x%y_z',
  ])('leaves %j bare', (value) => {
    expect(shellArg(value)).toBe(value);
    expect(throughSh(shellArg(value))).toBe(value);
  });

  test.each([
    ['a space', 'a b'],
    ['a single quote', "it's"],
    ['a dollar sign', '$HOME'],
    ['an empty string', ''],
    ['a brace', '{a}'],
  ])('quotes a value with %s', (_what, value) => {
    expect(shellArg(value)).toBe(shellQuote(value));
  });

  test.each(AWKWARD)('round-trips %j through sh', (value) => {
    expect(throughSh(shellArg(value))).toBe(value);
  });
});
