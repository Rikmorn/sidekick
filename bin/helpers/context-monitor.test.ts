import { describe, expect, test } from 'bun:test';
import {
  nextLatch,
  parseTail,
  resolveWindow,
  warningText,
} from './context-monitor.js';

const entry = (o: {
  side?: boolean;
  i?: number;
  r?: number;
  c?: number;
  type?: string;
}) =>
  JSON.stringify({
    type: o.type ?? 'assistant',
    isSidechain: o.side ?? false,
    message: {
      usage: {
        input_tokens: o.i ?? 2,
        cache_read_input_tokens: o.r ?? 1000,
        cache_creation_input_tokens: o.c ?? 10,
      },
    },
  });

describe('parseTail', () => {
  test('the newest main-thread assistant entry wins', () => {
    expect(parseTail([entry({ r: 5 }), entry({ r: 100 })].join('\n'))).toBe(
      112,
    );
  });

  test('skips sidechain entries, other types, and a zero sum', () => {
    const text = [
      entry({ r: 700 }),
      entry({ side: true, r: 9 }),
      entry({ type: 'user' }),
      entry({ i: 0, r: 0, c: 0 }),
    ].join('\n');
    expect(parseTail(text)).toBe(712);
  });

  test('a zero-sum newest entry yields the next older figure', () => {
    const text = [entry({ r: 300 }), entry({ i: 0, r: 0, c: 0 })].join('\n');
    expect(parseTail(text)).toBe(312);
  });

  test('skips a partial first line', () => {
    expect(parseTail(`ge_tokens":3}}}\n${entry({ r: 1 })}`)).toBe(13);
  });

  test('skips lines that are not JSON objects', () => {
    const text = [entry({ r: 8 }), 'null', '42', '[1]', '{"type":'].join('\n');
    expect(parseTail(text)).toBe(20);
  });

  test('skips an entry with a missing or non-numeric usage field', () => {
    const withUsage = (usage: unknown) =>
      JSON.stringify({
        type: 'assistant',
        isSidechain: false,
        message: { usage },
      });
    const older = entry({ r: 50 });
    const cases = [
      withUsage({ input_tokens: 5, cache_read_input_tokens: 5 }),
      withUsage({
        input_tokens: '5',
        cache_read_input_tokens: 5,
        cache_creation_input_tokens: 5,
      }),
      withUsage(null),
      '{"type":"assistant","isSidechain":false}',
    ];
    for (const bad of cases) {
      expect(parseTail([older, bad].join('\n'))).toBe(62);
    }
  });

  test('skips an entry whose isSidechain is not false', () => {
    const noFlag = JSON.stringify({
      type: 'assistant',
      message: {
        usage: {
          input_tokens: 1,
          cache_read_input_tokens: 1,
          cache_creation_input_tokens: 1,
        },
      },
    });
    expect(parseTail([entry({ r: 50 }), noFlag].join('\n'))).toBe(62);
  });

  test('undefined with no usable entry', () => {
    expect(parseTail('')).toBeUndefined();
    expect(parseTail(entry({ type: 'user' }))).toBeUndefined();
    expect(parseTail(entry({ side: true }))).toBeUndefined();
    expect(parseTail(entry({ i: 0, r: 0, c: 0 }))).toBeUndefined();
  });
});

describe('resolveWindow', () => {
  test('auto-compact window first, then the plugin option', () => {
    expect(
      resolveWindow({
        CLAUDE_CODE_AUTO_COMPACT_WINDOW: '400000',
        CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW: '1000000',
      }),
    ).toBe(400000);
    expect(
      resolveWindow({ CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW: '1000000' }),
    ).toBe(1000000);
    expect(resolveWindow({})).toBeUndefined();
  });

  test.each([
    '1e6',
    '1,000,000',
    '0',
    '-5',
    '',
    ' 7',
    '12.5',
  ])('skips junk %p in the first variable', (junk) => {
    expect(
      resolveWindow({
        CLAUDE_CODE_AUTO_COMPACT_WINDOW: junk,
        CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW: '200000',
      }),
    ).toBe(200000);
  });

  test('junk in both variables gives undefined', () => {
    expect(
      resolveWindow({
        CLAUDE_CODE_AUTO_COMPACT_WINDOW: '0',
        CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW: 'abc',
      }),
    ).toBeUndefined();
  });
});

describe('nextLatch', () => {
  test('below the first level: silent, clears', () => {
    expect(nextLatch('critical', 600, 1000)).toEqual({ latch: undefined });
    expect(nextLatch(undefined, 600, 1000)).toEqual({ latch: undefined });
  });

  test('each level once', () => {
    expect(nextLatch(undefined, 650, 1000)).toEqual({
      speak: 'warning',
      latch: 'warning',
    });
    expect(nextLatch('warning', 700, 1000)).toEqual({ latch: 'warning' });
    expect(nextLatch('warning', 750, 1000)).toEqual({
      speak: 'critical',
      latch: 'critical',
    });
    expect(nextLatch('critical', 900, 1000)).toEqual({ latch: 'critical' });
  });

  test('straight to critical speaks critical only', () => {
    expect(nextLatch(undefined, 800, 1000)).toEqual({
      speak: 'critical',
      latch: 'critical',
    });
  });

  test('a drop below the first level re-arms the warning', () => {
    const cleared = nextLatch('critical', 600, 1000);
    expect(nextLatch(cleared.latch, 660, 1000)).toEqual({
      speak: 'warning',
      latch: 'warning',
    });
  });

  test('a drop from critical into the warning band keeps the critical latch', () => {
    expect(nextLatch('critical', 700, 1000)).toEqual({ latch: 'critical' });
  });

  test('a figure above the window proves the window wrong: silent, latch kept', () => {
    expect(nextLatch('warning', 1001, 1000)).toEqual({ latch: 'warning' });
    expect(nextLatch(undefined, 1001, 1000)).toEqual({ latch: undefined });
  });

  test('a figure equal to the window is critical', () => {
    expect(nextLatch(undefined, 1000, 1000)).toEqual({
      speak: 'critical',
      latch: 'critical',
    });
  });
});

describe('warningText', () => {
  test('pins the warning', () => {
    expect(warningText('warning', 670000, 1000000)).toBe(
      'sidekick: context is 67% full (670,000 of 1,000,000 tokens). There is no need to stop. Where it fits, finish the current step before starting a new one.',
    );
  });

  test('pins critical', () => {
    expect(warningText('critical', 760000, 1000000)).toBe(
      'sidekick: context is 76% full (760,000 of 1,000,000 tokens). There is no need to stop. Where it fits, finish the current step before starting a new one. At the next natural pause, tell the user that context is running low.',
    );
  });

  test('floors the percentage without float artefacts', () => {
    expect(warningText('warning', 57, 100)).toContain('57% full');
    expect(warningText('warning', 699999, 1000000)).toContain('69% full');
  });
});
