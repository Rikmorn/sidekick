import type { AgentOfferInput, On, Settings } from 'claude-code';
import { expect, mock, test } from 'claude-code/testing';

const REFUSAL = 'refused by a plugin above';

function offer(agent: string): AgentOfferInput {
  return {
    agent,
    description: 'an agent',
    source: 'built-in',
    provider: { plugin: 'engine', tier: 'core' },
  };
}

// What lies beneath the plugin: the flag settings, a refusal, or a throw.
function answerBeneath(
  on: On,
  flag: Settings | 'refuse' | 'throw',
): { debug: string[] } {
  const seen: { debug: string[] } = { debug: [] };
  mock.env(on, {});
  mock.clock(on);
  on('ui.log', (_$, e) => {
    if (e.to === 'debug') seen.debug.push(e.text);
    return { value: undefined };
  });
  on('agent.offer', () => ({ isOffered: true }));
  on('settings.read', () => {
    if (flag === 'refuse') return { deny: REFUSAL };
    if (flag === 'throw') throw new Error('settings exploded');
    return { value: flag };
  });
  return seen;
}

test('a hidden agent is withheld, and any other passes through', async ($, on) => {
  answerBeneath(on, { sidekick: { hide: { agents: ['Explore'] } } });
  expect(await $.agent.offer(offer('Explore'))).toEqual({ isOffered: false });
  expect(await $.agent.offer(offer('Plan'))).toEqual({ isOffered: true });
});

test('settings without a hide key offer every agent', async ($, on) => {
  answerBeneath(on, {});
  expect(await $.agent.offer(offer('Explore'))).toEqual({ isOffered: true });
});

test('a malformed hide key offers every agent', async ($, on) => {
  answerBeneath(on, { sidekick: { hide: { agents: 'Explore' } } });
  expect(await $.agent.offer(offer('Explore'))).toEqual({ isOffered: true });
});

test('a refused settings read offers every agent and names the failure', async ($, on) => {
  const seen = answerBeneath(on, 'refuse');
  expect(await $.agent.offer(offer('Explore'))).toEqual({ isOffered: true });
  expect(seen.debug).toContainEqual(
    expect.stringMatching(
      /^sidekick scope: agent\.offer failed: .*refused by a plugin above$/,
    ),
  );
});

test('a settings read that throws offers every agent', async ($, on) => {
  answerBeneath(on, 'throw');
  expect(await $.agent.offer(offer('Explore'))).toEqual({ isOffered: true });
});
