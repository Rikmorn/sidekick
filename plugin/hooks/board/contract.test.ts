import { expect, test } from 'claude-code/testing';
import { GLANCE_VERSION, parseGlance } from './contract';

const full = {
  version: 1,
  board: {
    owner: 'Rikmorn',
    repo: 'sidekick',
    number: 3,
    url: 'https://github.com/users/Rikmorn/projects/3',
  },
  milestone: 'R9 control centre',
  state: { level: 'warning', word: 'at risk', detail: '#233 waits on you' },
  brief: 'Pickup: milestone 9\nIn progress: #233',
};

const notParsed = { ok: false, reason: "the pickup's output did not parse" };

test('parseGlance keeps every field of a version-1 glance', () => {
  expect(parseGlance(JSON.stringify(full))).toEqual({
    ok: true,
    glance: { ...full, version: GLANCE_VERSION },
  });
});

test('parseGlance accepts a null milestone and a null detail', () => {
  const parsed = parseGlance(
    JSON.stringify({
      ...full,
      milestone: null,
      state: { level: 'unknown', word: 'unknown', detail: null },
    }),
  );
  expect(parsed.ok).toBe(true);
  if (parsed.ok) {
    expect(parsed.glance.milestone).toBeNull();
    expect(parsed.glance.state.detail).toBeNull();
  }
});

test('parseGlance reads text that is not JSON as not parsed', () => {
  expect(parseGlance('Pickup: milestone 9')).toEqual(notParsed);
  expect(parseGlance('')).toEqual(notParsed);
});

test('parseGlance reads a truncated object as not parsed', () => {
  const text = JSON.stringify(full);
  expect(parseGlance(text.slice(0, text.length - 10))).toEqual(notParsed);
});

test('parseGlance reads another version as not parsed', () => {
  expect(parseGlance(JSON.stringify({ ...full, version: 2 }))).toEqual(
    notParsed,
  );
});

test('parseGlance reads a level outside the four as not parsed', () => {
  const state = { ...full.state, level: 'great' };
  expect(parseGlance(JSON.stringify({ ...full, state }))).toEqual(notParsed);
});

test('parseGlance reads a string board number as not parsed', () => {
  const board = { ...full.board, number: '3' };
  expect(parseGlance(JSON.stringify({ ...full, board }))).toEqual(notParsed);
});

test('parseGlance reads a missing brief as not parsed', () => {
  const { brief: _brief, ...without } = full;
  expect(parseGlance(JSON.stringify(without))).toEqual(notParsed);
});
