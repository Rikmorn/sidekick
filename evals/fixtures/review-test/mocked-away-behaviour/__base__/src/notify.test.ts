import { describe, expect, it } from 'bun:test';
import { notify, type Transport } from './notify.js';

const transport = (results: boolean[]): Transport => ({
  send: async () => results.shift() ?? false,
});

describe('notify', () => {
  it('reports a delivered message', async () => {
    expect(await notify(transport([true]), 'hi')).toBe(true);
  });

  it('reports a rejected message', async () => {
    expect(await notify(transport([false]), 'hi')).toBe(false);
  });
});
