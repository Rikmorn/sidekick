import { expect, test } from 'claude-code/testing';
import { parseSessionAnswer } from './contract';

const valid = [
  { version: 1, name: 'x', held: true },
  { version: 1, name: null, held: false },
  { version: 1, name: 'x', held: null },
];

test('parseSessionAnswer accepts each valid shape', () => {
  for (const answer of valid) {
    expect(parseSessionAnswer(JSON.stringify(answer))).toEqual(answer);
  }
});

test('parseSessionAnswer rejects a wrong version, a bad name, a bad held, and non-JSON', () => {
  const invalid = [
    { version: 2, name: 'x', held: true },
    { version: 1, name: 3, held: true },
    { version: 1, name: 'x', held: 'yes' },
    { version: 1, name: 'x' },
    [],
  ];
  for (const answer of invalid) {
    expect(parseSessionAnswer(JSON.stringify(answer))).toBeUndefined();
  }
  expect(parseSessionAnswer('not json')).toBeUndefined();
});
