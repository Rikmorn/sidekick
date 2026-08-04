import { describe, expect, it, mock } from 'bun:test';
import type { Transport } from './notify.js';

// The backoff schedule is stubbed to zero so the suite does not sleep.
const backoffMs = mock(() => 0);
mock.module('./backoff.js', () => ({ backoffMs, MAX_BACKOFF_MS: 0 }));

const { notify, notifyWithRetry } = await import('./notify.js');

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

describe('notifyWithRetry', () => {
  it('succeeds once the transport accepts', async () => {
    expect(await notifyWithRetry(transport([false, false, true]), 'hi')).toBe(
      true,
    );
  });

  it('gives up after the last attempt', async () => {
    expect(await notifyWithRetry(transport([false, false, false]), 'hi')).toBe(
      false,
    );
  });

  it('backs off between attempts', async () => {
    backoffMs.mockClear();
    await notifyWithRetry(transport([false, true]), 'hi');
    expect(backoffMs).toHaveBeenCalledTimes(1);
  });
});
