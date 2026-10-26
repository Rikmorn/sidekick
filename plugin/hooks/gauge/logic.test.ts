import { expect, test } from 'claude-code/testing';
import type { SelfFacts } from '../state';
import { FIXTURE_FLAG, parseContextLimit } from './contract';
import { identityRuns, limitValue, profileOf, UNPROFILED } from './logic';

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

const textOf = (self: SelfFacts | undefined, columns = 200) =>
  identityRuns(self, columns)
    .map((run) => run.text)
    .join('');

test('a main reads as its name, your main, and its profile', () => {
  const self: SelfFacts = {
    name: 'todo-app-ce',
    role: 'main',
    profile: 'main',
  };
  expect(textOf(self)).toBe('▣ todo-app-ce · your main · profile main');
  expect(identityRuns(self, 200)).toEqual([
    { text: '▣ todo-app-ce', tone: 'claude', bold: true },
    { text: ' · your main · profile ', tone: 'inactive' },
    { text: 'main', tone: 'text' },
  ]);
});

test('a worker reads as its main and the way back', () => {
  const self: SelfFacts = {
    name: 'add-greeting',
    role: 'worker',
    main: 'todo-app-ce',
    profile: 'worker',
  };
  expect(textOf(self)).toBe(
    '◐ add-greeting · worker of todo-app-ce · back: ←, select todo-app-ce, Enter · profile worker',
  );
  expect(identityRuns(self, 200)[0]).toEqual({
    text: '◐ add-greeting',
    tone: 'suggestion',
    bold: true,
  });
});

test('a worker without a main points at agent view', () => {
  const self: SelfFacts = { name: 'w', role: 'worker', profile: 'worker' };
  expect(textOf(self)).toBe(
    '◐ w · worker · ← opens agent view · profile worker',
  );
});

test('an other session reads as its name and profile', () => {
  const self: SelfFacts = { name: 'scratch', role: 'other', profile: 'p' };
  expect(textOf(self)).toBe('– scratch · profile p');
  expect(identityRuns(self, 200)[0]).toMatchObject({ tone: 'inactive' });
});

test('no profile reads no profile, all inactive', () => {
  const runs = identityRuns({ name: 'sidekick-6f', role: 'main' }, 200);
  expect(runs.map((run) => run.text).join('')).toBe(
    '▣ sidekick-6f · your main · no profile',
  );
  expect(runs.slice(1).every((run) => run.tone === 'inactive')).toBe(true);
});

test('before a name is known the row shows the role alone', () => {
  expect(textOf({ role: 'main', profile: 'main' })).toBe('▣ your main');
  expect(textOf({ role: 'worker', main: 'm' })).toBe(
    '◐ worker of m · back: ←, select m, Enter',
  );
  expect(textOf({ role: 'worker' })).toBe('◐ worker · ← opens agent view');
  expect(textOf({ role: 'other' })).toBe('– session');
});

test('no facts draw no row', () => {
  expect(identityRuns(undefined, 200)).toEqual([]);
});

test('a narrow worker row keeps the way back and loses the profile', () => {
  const self: SelfFacts = {
    name: 'add-greeting',
    role: 'worker',
    main: 'todo-app-ce',
    profile: 'worker',
  };
  const text = textOf(self, 60);
  expect(text).toBe(
    '◐ add-greeting · worker of todo-app-ce · back: ←, select tod',
  );
  expect(text).not.toContain('profile');
});
