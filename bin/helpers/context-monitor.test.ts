import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CONTEXT_LIMIT_VAR } from '../../plugin/hooks/gauge/contract.js';
import {
  nextLatch,
  parseTail,
  postToolBatchContext,
  resolveLimit,
  warningText,
} from './context-monitor.js';

const entry = (o: {
  side?: boolean;
  i?: number;
  r?: number;
  c?: number;
  type?: string;
  model?: string;
}) =>
  JSON.stringify({
    type: o.type ?? 'assistant',
    isSidechain: o.side ?? false,
    message: {
      ...(o.model === undefined ? {} : { model: o.model }),
      usage: {
        input_tokens: o.i ?? 2,
        cache_read_input_tokens: o.r ?? 1000,
        cache_creation_input_tokens: o.c ?? 10,
      },
    },
  });

describe('parseTail', () => {
  test('the newest main-thread assistant entry wins', () => {
    expect(
      parseTail([entry({ r: 5 }), entry({ r: 100 })].join('\n'))?.tokens,
    ).toBe(112);
  });

  test('skips sidechain entries, other types, and a zero sum', () => {
    const text = [
      entry({ r: 700 }),
      entry({ side: true, r: 9 }),
      entry({ type: 'user' }),
      entry({ i: 0, r: 0, c: 0 }),
    ].join('\n');
    expect(parseTail(text)?.tokens).toBe(712);
  });

  test('a zero-sum newest entry yields the next older figure', () => {
    const text = [entry({ r: 300 }), entry({ i: 0, r: 0, c: 0 })].join('\n');
    expect(parseTail(text)?.tokens).toBe(312);
  });

  test('skips a partial first line', () => {
    expect(parseTail(`ge_tokens":3}}}\n${entry({ r: 1 })}`)?.tokens).toBe(13);
  });

  test('skips lines that are not JSON objects', () => {
    const text = [entry({ r: 8 }), 'null', '42', '[1]', '{"type":'].join('\n');
    expect(parseTail(text)?.tokens).toBe(20);
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
      expect(parseTail([older, bad].join('\n'))?.tokens).toBe(62);
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
    expect(parseTail([entry({ r: 50 }), noFlag].join('\n'))?.tokens).toBe(62);
  });

  test('undefined with no usable entry', () => {
    expect(parseTail('')).toBeUndefined();
    expect(parseTail(entry({ type: 'user' }))).toBeUndefined();
    expect(parseTail(entry({ side: true }))).toBeUndefined();
    expect(parseTail(entry({ i: 0, r: 0, c: 0 }))).toBeUndefined();
  });
});

describe('parseTail model', () => {
  test('returns the newest main-thread entry model beside its figure', () => {
    const text = [
      entry({ r: 5, model: 'claude-old' }),
      entry({ r: 100, model: 'claude-opus-5-5' }),
      entry({ side: true, r: 9, model: 'claude-haiku' }),
    ].join('\n');
    expect(parseTail(text)).toEqual({ tokens: 112, model: 'claude-opus-5-5' });
  });

  test('model is undefined when that entry has none, even if an older one does', () => {
    const text = [entry({ r: 5, model: 'claude-old' }), entry({ r: 100 })].join(
      '\n',
    );
    expect(parseTail(text)).toEqual({ tokens: 112, model: undefined });
  });
});

const MODEL = 'claude-opus-5-5';
const gauge = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    session: 'aaa',
    model: MODEL,
    kind: 'compaction',
    tokens: 500000,
    ...over,
  });

describe('resolveLimit', () => {
  const both = {
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: '400000',
    CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW: '1000000',
  };

  test("the gauge's value wins when session and model match, over both fallbacks", () => {
    const env = { ...both, [CONTEXT_LIMIT_VAR]: gauge() };
    expect(resolveLimit(env, 'aaa', MODEL)).toEqual({
      tokens: 500000,
      kind: 'compaction',
    });
    const window = { [CONTEXT_LIMIT_VAR]: gauge({ kind: 'window' }), ...both };
    expect(resolveLimit(window, 'aaa', MODEL)).toEqual({
      tokens: 500000,
      kind: 'window',
    });
  });

  test('a value naming another session falls through (a child process, or after /clear)', () => {
    const env = { ...both, [CONTEXT_LIMIT_VAR]: gauge({ session: 'old' }) };
    expect(resolveLimit(env, 'aaa', MODEL)).toEqual({
      tokens: 367000,
      kind: 'compaction',
    });
  });

  test('a value naming another model falls through', () => {
    const env = { ...both, [CONTEXT_LIMIT_VAR]: gauge() };
    expect(resolveLimit(env, 'aaa', 'claude-sonnet-5-5')).toEqual({
      tokens: 367000,
      kind: 'compaction',
    });
  });

  test('a transcript without a model falls through', () => {
    const env = { ...both, [CONTEXT_LIMIT_VAR]: gauge() };
    expect(resolveLimit(env, 'aaa', undefined)).toEqual({
      tokens: 367000,
      kind: 'compaction',
    });
  });

  test.each([
    'not json',
    '{"session":"aaa"',
    '[]',
    'null',
    gauge({ tokens: -1 }),
    gauge({ tokens: 1.5 }),
    gauge({ kind: 'other' }),
    '',
  ])('a malformed gauge value %p falls through without throwing', (raw) => {
    const env = { ...both, [CONTEXT_LIMIT_VAR]: raw };
    expect(resolveLimit(env, 'aaa', MODEL)).toEqual({
      tokens: 367000,
      kind: 'compaction',
    });
  });

  test('the compaction window is raised to the floor, less the margin (#225)', () => {
    expect(
      resolveLimit({ CLAUDE_CODE_AUTO_COMPACT_WINDOW: '400000' }, 'aaa', MODEL),
    ).toEqual({ tokens: 367000, kind: 'compaction' });
    expect(
      resolveLimit({ CLAUDE_CODE_AUTO_COMPACT_WINDOW: '60000' }, 'aaa', MODEL),
    ).toEqual({ tokens: 67000, kind: 'compaction' });
  });

  test('the option gives a window', () => {
    expect(
      resolveLimit(
        { CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW: '1000000' },
        'aaa',
        MODEL,
      ),
    ).toEqual({ tokens: 1000000, kind: 'window' });
    expect(resolveLimit({}, 'aaa', MODEL)).toBeUndefined();
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
      resolveLimit(
        {
          CLAUDE_CODE_AUTO_COMPACT_WINDOW: junk,
          CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW: '200000',
        },
        'aaa',
        MODEL,
      ),
    ).toEqual({ tokens: 200000, kind: 'window' });
  });

  test('junk in both variables gives undefined', () => {
    expect(
      resolveLimit(
        {
          CLAUDE_CODE_AUTO_COMPACT_WINDOW: '0',
          CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW: 'abc',
        },
        'aaa',
        MODEL,
      ),
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

const W = (tokens: number) => ({ tokens, kind: 'window' as const });
const BRIEF = '/repo/docs/superpowers/plans/x-brief.md';
const WORKER_CRITICAL =
  "sidekick: context is 76% full (760,000 of 1,000,000 tokens). There is no need to stop. Where it fits, finish the current step before starting a new one. This session is a worker that no one watches: do not stop to tell the user. Keep superpowers' ledger current, and after a compaction re-read the brief at `/repo/docs/superpowers/plans/x-brief.md`.";

describe('warningText', () => {
  test('pins the warning', () => {
    expect(warningText('warning', 670000, W(1000000))).toBe(
      'sidekick: context is 67% full (670,000 of 1,000,000 tokens). There is no need to stop. Where it fits, finish the current step before starting a new one.',
    );
  });

  test('pins critical', () => {
    expect(warningText('critical', 760000, W(1000000))).toBe(
      'sidekick: context is 76% full (760,000 of 1,000,000 tokens). There is no need to stop. Where it fits, finish the current step before starting a new one. At the next natural pause, tell the user that context is running low.',
    );
  });

  test('a worker at critical gets the worker text', () => {
    expect(warningText('critical', 760000, W(1000000), BRIEF)).toBe(
      WORKER_CRITICAL,
    );
  });

  test('a worker at the warning level gets the unchanged text', () => {
    expect(warningText('warning', 670000, W(1000000), BRIEF)).toBe(
      warningText('warning', 670000, W(1000000)),
    );
  });

  test('kind compaction says how far to compaction', () => {
    expect(
      warningText('warning', 680000, { tokens: 1000000, kind: 'compaction' }),
    ).toStartWith(
      'sidekick: context is 68% of the way to compaction (680,000 of 1,000,000 tokens).',
    );
  });

  test('floors the percentage without float artefacts', () => {
    expect(warningText('warning', 57, W(100))).toContain('57% full');
    expect(warningText('warning', 699999, W(1000000))).toContain('69% full');
  });
});

describe('postToolBatchContext', () => {
  const WINDOW_ENV = { CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW: '1000' };

  function fixture(sessionId = 'aaa') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-ctx-'));
    const transcript = path.join(dir, `${sessionId}.jsonl`);
    const monitor = { env: WINDOW_ENV, tmpdir: dir };
    const event = (extra: Record<string, unknown> = {}) =>
      JSON.stringify({
        session_id: sessionId,
        transcript_path: transcript,
        tool_calls: [],
        ...extra,
      });
    const append = (...lines: string[]) =>
      fs.appendFileSync(transcript, `${lines.join('\n')}\n`);
    const latchFile = path.join(dir, `sidekick-ctx-${sessionId}.json`);
    return { dir, transcript, monitor, event, append, latchFile };
  }

  test('speaks once per level', () => {
    const f = fixture();
    f.append(entry({ r: 638 }));
    expect(postToolBatchContext(f.event(), f.monitor)).toBe(
      warningText('warning', 650, W(1000)),
    );
    expect(postToolBatchContext(f.event(), f.monitor)).toBeUndefined();
    f.append(entry({ r: 748 }));
    expect(postToolBatchContext(f.event(), f.monitor)).toBe(
      warningText('critical', 760, W(1000)),
    );
    expect(postToolBatchContext(f.event(), f.monitor)).toBeUndefined();
  });

  test('passes SIDEKICK_WORKER through, and ignores an empty one', () => {
    const f = fixture();
    f.append(entry({ r: 748 }));
    const worker = {
      ...f.monitor,
      env: { ...WINDOW_ENV, SIDEKICK_WORKER: BRIEF },
    };
    expect(postToolBatchContext(f.event(), worker)).toBe(
      warningText('critical', 760, W(1000), BRIEF),
    );
    fs.rmSync(f.latchFile);
    const empty = { ...f.monitor, env: { ...WINDOW_ENV, SIDEKICK_WORKER: '' } };
    expect(postToolBatchContext(f.event(), empty)).toBe(
      warningText('critical', 760, W(1000)),
    );
  });

  test('measures against the gauge value, and falls back when it names another session', () => {
    const f = fixture();
    f.append(entry({ r: 638, model: MODEL }));
    const env = {
      [CONTEXT_LIMIT_VAR]: gauge({ tokens: 1000, kind: 'compaction' }),
      CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW: '100000',
    };
    expect(postToolBatchContext(f.event(), { ...f.monitor, env })).toBe(
      warningText('warning', 650, { tokens: 1000, kind: 'compaction' }),
    );
    fs.rmSync(f.latchFile);
    const foreign = {
      ...env,
      [CONTEXT_LIMIT_VAR]: gauge({ session: 'old', tokens: 1000 }),
    };
    expect(
      postToolBatchContext(f.event(), { ...f.monitor, env: foreign }),
    ).toBeUndefined();
  });

  test('stays silent for a subagent, a bad session id, no window, no transcript, or bad JSON', () => {
    const f = fixture();
    f.append(entry({ r: 638 }));
    const speaks = (stdin: string, monitor = f.monitor) =>
      postToolBatchContext(stdin, monitor);
    expect(speaks(f.event({ agent_id: 'sub1' }))).toBeUndefined();
    expect(speaks(f.event({ session_id: '../x' }))).toBeUndefined();
    expect(speaks(f.event({ session_id: 'a'.repeat(129) }))).toBeUndefined();
    expect(speaks(f.event({ session_id: 'a b' }))).toBeUndefined();
    expect(speaks(f.event(), { env: {}, tmpdir: f.dir })).toBeUndefined();
    expect(
      speaks(f.event({ transcript_path: path.join(f.dir, 'nope.jsonl') })),
    ).toBeUndefined();
    expect(speaks('not json')).toBeUndefined();
    expect(fs.existsSync(f.latchFile)).toBe(false);
  });

  test('re-arms after compaction', () => {
    const f = fixture();
    f.append(entry({ r: 738 }));
    expect(postToolBatchContext(f.event(), f.monitor)).toBeDefined();
    expect(fs.existsSync(f.latchFile)).toBe(true);
    f.append(entry({ r: 88 }));
    expect(postToolBatchContext(f.event(), f.monitor)).toBeUndefined();
    expect(fs.existsSync(f.latchFile)).toBe(false);
    f.append(entry({ r: 638 }));
    expect(postToolBatchContext(f.event(), f.monitor)).toBe(
      warningText('warning', 650, W(1000)),
    );
  });

  test('keeps a latch file per session', () => {
    const a = fixture('aaa');
    const dir = a.dir;
    const b = fixture('bbb');
    // Both sessions share one tmpdir.
    const shared = { env: WINDOW_ENV, tmpdir: dir };
    a.append(entry({ r: 638 }));
    b.append(entry({ r: 638 }));
    expect(postToolBatchContext(a.event(), shared)).toBeDefined();
    expect(postToolBatchContext(b.event(), shared)).toBeDefined();
    expect(postToolBatchContext(a.event(), shared)).toBeUndefined();
    expect(postToolBatchContext(b.event(), shared)).toBeUndefined();
  });

  test('gives silence when the newest main-thread entry is past 2 MB from the end', () => {
    const f = fixture();
    const filler = JSON.stringify({ type: 'user', text: 'x'.repeat(990) });
    f.append(entry({ r: 638 }));
    f.append(...Array.from({ length: 2150 }, () => filler));
    expect(fs.statSync(f.transcript).size).toBeGreaterThan(2 * 1024 * 1024);
    expect(postToolBatchContext(f.event(), f.monitor)).toBeUndefined();
  });

  test('records the level in the latch file', () => {
    const f = fixture();
    f.append(entry({ r: 638 }));
    postToolBatchContext(f.event(), f.monitor);
    expect(JSON.parse(fs.readFileSync(f.latchFile, 'utf-8'))).toEqual({
      level: 'warning',
    });
  });

  test('treats a malformed latch file as no latch', () => {
    const f = fixture();
    f.append(entry({ r: 638 }));
    fs.writeFileSync(f.latchFile, 'garbage');
    expect(postToolBatchContext(f.event(), f.monitor)).toBeDefined();
  });

  test('never writes through a symlink planted at the latch path', () => {
    const f = fixture();
    f.append(entry({ r: 638 }));
    const target = path.join(f.dir, 'victim.txt');
    fs.writeFileSync(target, 'keep me');
    fs.symlinkSync(target, f.latchFile);
    expect(postToolBatchContext(f.event(), f.monitor)).toBeUndefined();
    expect(fs.readFileSync(target, 'utf-8')).toBe('keep me');
  });
});
