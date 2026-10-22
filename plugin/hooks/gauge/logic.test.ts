import { expect, test } from 'claude-code/testing';
import { FIXTURE_FLAG, parseContextLimit } from './contract';
import {
  limitValue,
  modesWith,
  profileOf,
  signpostText,
  UNPROFILED,
} from './logic';

test('profileOf reads the profile name from the flag', () => {
  expect(profileOf(FIXTURE_FLAG)).toBe('fixture');
});

test('profileOf is undefined when the flag names no profile', () => {
  expect(profileOf({})).toBeUndefined();
  expect(profileOf({ sidekick: {} })).toBeUndefined();
  expect(profileOf({ sidekick: { profile: '' } })).toBeUndefined();
  expect(profileOf({ sidekick: 'x' })).toBeUndefined();
});

test('the unprofiled status is the verbatim text', () => {
  expect(UNPROFILED).toBe('no profile settings in this session');
});

test('modesWith appends the profile label to a new array', () => {
  const modes = ['focus'];
  const withProfile = modesWith(modes, 'work');
  expect(withProfile).toEqual(['focus', 'profile: work']);
  expect(withProfile).not.toBe(modes);
  expect(modes).toEqual(['focus']);
});

test('modesWith copies the modes when there is no profile', () => {
  const modes = ['focus'];
  const same = modesWith(modes, undefined);
  expect(same).toEqual(['focus']);
  expect(same).not.toBe(modes);
});

test('limitValue gives kind compaction when a threshold is set', () => {
  const raw = limitValue({
    session: 's',
    model: 'm',
    window: 1000000,
    threshold: 967000,
  });
  expect(parseContextLimit(raw)).toEqual({
    session: 's',
    model: 'm',
    kind: 'compaction',
    tokens: 967000,
  });
});

test('limitValue gives kind window when auto-compaction is off', () => {
  const raw = limitValue({ session: 's', model: 'm', window: 1000000 });
  expect(parseContextLimit(raw)).toEqual({
    session: 's',
    model: 'm',
    kind: 'window',
    tokens: 1000000,
  });
});

const valid = { session: 's', model: 'm', kind: 'window', tokens: 100 };

test('parseContextLimit accepts a well-formed value', () => {
  expect(parseContextLimit(JSON.stringify(valid))).toEqual(valid);
});

test('parseContextLimit reads a malformed value as absent', () => {
  const { model: _model, ...noModel } = valid;
  const malformed: (string | undefined)[] = [
    undefined,
    '',
    '{',
    '[]',
    'null',
    JSON.stringify(noModel),
    JSON.stringify({ ...valid, session: '' }),
    JSON.stringify({ ...valid, tokens: -1 }),
    JSON.stringify({ ...valid, tokens: 0 }),
    JSON.stringify({ ...valid, tokens: 1.5 }),
    JSON.stringify({ ...valid, tokens: '100' }),
    JSON.stringify({ ...valid, kind: 'other' }),
  ];
  for (const raw of malformed) {
    expect(parseContextLimit(raw)).toBeUndefined();
  }
});

test('the signpost names the main and the way back', () => {
  expect(signpostText('Single word reply')).toBe(
    'worker of Single word reply · to go back: ←, select Single word reply, Enter',
  );
});

test('the signpost without a main points at agent view', () => {
  expect(signpostText(undefined)).toBe('worker · ← opens agent view');
});
