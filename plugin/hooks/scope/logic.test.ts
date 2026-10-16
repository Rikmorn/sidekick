import { expect, test } from 'claude-code/testing';
import { hiddenOf, isOffered, isPartHidden } from './logic';

function hiding(hide: unknown): Record<string, unknown> {
  return { sidekick: { hide } };
}

test('settings without a hide key hide nothing', () => {
  for (const flag of [{}, { sidekick: { profile: 'p' } }, { sidekick: 'x' }]) {
    const hidden = hiddenOf(flag);
    expect(hidden.agents.size).toBe(0);
    expect(hidden.mods.size).toBe(0);
  }
});

test('a well-formed hide key hides the agents and mod parts it names', () => {
  const flag = hiding({ agents: ['Explore'], mods: ['desk'] });
  const hidden = hiddenOf(flag);
  expect([...hidden.agents]).toEqual(['Explore']);
  expect([...hidden.mods]).toEqual(['desk']);
  expect(isPartHidden(flag, 'desk')).toBe(true);
  expect(isPartHidden(flag, 'board')).toBe(false);
});

test('a malformed list hides nothing for that list and never throws', () => {
  const cases: unknown[] = [
    { agents: 'Explore', mods: 'desk' },
    { agents: [1], mods: [2] },
    { agents: [], mods: ['gauge'] },
    null,
    ['desk'],
    'desk',
  ];
  for (const hide of cases) {
    const hidden = hiddenOf(hiding(hide));
    expect(hidden.agents.size).toBe(0);
    expect(hidden.mods.size).toBe(0);
    expect(isPartHidden(hiding(hide), 'desk')).toBe(false);
  }
});

test('one bad entry leaves the good ones in the same list hidden', () => {
  const hidden = hiddenOf(
    hiding({ agents: ['Explore', 3, 'Plan'], mods: ['gauge', 'board'] }),
  );
  expect([...hidden.agents]).toEqual(['Explore', 'Plan']);
  expect([...hidden.mods]).toEqual(['board']);
});

test('an agent is withheld only on an exact name match', () => {
  const hidden = hiddenOf(hiding({ agents: ['Explore'] }));
  expect(isOffered(hidden, 'Explore')).toBe(false);
  expect(isOffered(hidden, 'explore')).toBe(true);
  expect(isOffered(hidden, 'Plan')).toBe(true);
});
