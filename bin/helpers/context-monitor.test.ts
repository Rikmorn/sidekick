import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CONTEXT_LIMIT_VAR } from '../../plugin/hooks/gauge/contract.js';
import {
  CANARY_TEXT,
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
  // The gauge's value for a session: with it the canary stays quiet.
  const gaugeEnv = (sessionId: string) => ({
    [CONTEXT_LIMIT_VAR]: gauge({
      session: sessionId,
      kind: 'window',
      tokens: 1000,
    }),
  });

  function fixture(sessionId = 'aaa') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-ctx-'));
    const transcript = path.join(dir, `${sessionId}.jsonl`);
    const monitor = { env: gaugeEnv(sessionId), tmpdir: dir };
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

  // A usage entry on the gauge's model, so the gauge's value applies.
  const usage = (r: number) => entry({ r, model: MODEL });
  const readLatch = (file: string) =>
    JSON.parse(fs.readFileSync(file, 'utf-8'));

  test('speaks once per level', () => {
    const f = fixture();
    f.append(usage(638));
    expect(postToolBatchContext(f.event(), f.monitor)).toEqual({
      context: warningText('warning', 650, W(1000)),
    });
    expect(postToolBatchContext(f.event(), f.monitor)).toEqual({});
    f.append(usage(748));
    expect(postToolBatchContext(f.event(), f.monitor)).toEqual({
      context: warningText('critical', 760, W(1000)),
    });
    expect(postToolBatchContext(f.event(), f.monitor)).toEqual({});
  });

  test('passes SIDEKICK_WORKER through, and ignores an empty one', () => {
    const f = fixture();
    f.append(usage(748));
    const worker = {
      ...f.monitor,
      env: { ...f.monitor.env, SIDEKICK_WORKER: BRIEF },
    };
    expect(postToolBatchContext(f.event(), worker).context).toBe(
      warningText('critical', 760, W(1000), BRIEF),
    );
    fs.rmSync(f.latchFile);
    const empty = {
      ...f.monitor,
      env: { ...f.monitor.env, SIDEKICK_WORKER: '' },
    };
    expect(postToolBatchContext(f.event(), empty).context).toBe(
      warningText('critical', 760, W(1000)),
    );
  });

  test('measures against the gauge value, and falls back when it names another session', () => {
    const f = fixture();
    f.append(usage(638));
    const env = {
      [CONTEXT_LIMIT_VAR]: gauge({
        session: 'aaa',
        tokens: 1000,
        kind: 'compaction',
      }),
      CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW: '100000',
    };
    expect(postToolBatchContext(f.event(), { ...f.monitor, env }).context).toBe(
      warningText('warning', 650, { tokens: 1000, kind: 'compaction' }),
    );
    fs.rmSync(f.latchFile);
    const foreign = {
      ...env,
      [CONTEXT_LIMIT_VAR]: gauge({ session: 'old', tokens: 1000 }),
    };
    expect(
      postToolBatchContext(f.event(), { ...f.monitor, env: foreign }).context,
    ).toBeUndefined();
  });

  test('stays silent for a subagent, a bad session id, a missing transcript, or bad JSON', () => {
    const f = fixture();
    f.append(usage(638));
    const bare = { env: {}, tmpdir: f.dir };
    const speaks = (stdin: string, monitor = bare) =>
      postToolBatchContext(stdin, monitor);
    expect(speaks(f.event({ agent_id: 'sub1' }))).toEqual({});
    expect(speaks(f.event({ session_id: '../x' }))).toEqual({});
    expect(speaks(f.event({ session_id: 'a'.repeat(129) }))).toEqual({});
    expect(speaks(f.event({ session_id: 'a b' }))).toEqual({});
    expect(speaks('not json')).toEqual({});
    expect(fs.existsSync(f.latchFile)).toBe(false);
    // With the gauge's value present, a missing transcript leaves nothing to say.
    expect(
      speaks(
        f.event({ transcript_path: path.join(f.dir, 'nope.jsonl') }),
        f.monitor,
      ),
    ).toEqual({});
  });

  test('re-arms after compaction', () => {
    const f = fixture();
    f.append(usage(738));
    expect(postToolBatchContext(f.event(), f.monitor).context).toBeDefined();
    expect(fs.existsSync(f.latchFile)).toBe(true);
    f.append(usage(88));
    expect(postToolBatchContext(f.event(), f.monitor)).toEqual({});
    expect(fs.existsSync(f.latchFile)).toBe(false);
    f.append(usage(638));
    expect(postToolBatchContext(f.event(), f.monitor).context).toBe(
      warningText('warning', 650, W(1000)),
    );
  });

  test('keeps a latch file per session', () => {
    const a = fixture('aaa');
    const b = fixture('bbb');
    // Both sessions share one tmpdir, and each has its own gauge value.
    const sharedFor = (id: string) => ({
      env: gaugeEnv(id),
      tmpdir: a.dir,
    });
    a.append(usage(638));
    b.append(usage(638));
    expect(
      postToolBatchContext(a.event(), sharedFor('aaa')).context,
    ).toBeDefined();
    expect(
      postToolBatchContext(b.event(), sharedFor('bbb')).context,
    ).toBeDefined();
    expect(
      postToolBatchContext(a.event(), sharedFor('aaa')).context,
    ).toBeUndefined();
    expect(
      postToolBatchContext(b.event(), sharedFor('bbb')).context,
    ).toBeUndefined();
  });

  test('gives silence when the newest main-thread entry is past 2 MB from the end', () => {
    const f = fixture();
    const filler = JSON.stringify({ type: 'user', text: 'x'.repeat(990) });
    f.append(usage(638));
    f.append(...Array.from({ length: 2150 }, () => filler));
    expect(fs.statSync(f.transcript).size).toBeGreaterThan(2 * 1024 * 1024);
    expect(postToolBatchContext(f.event(), f.monitor)).toEqual({});
  });

  test('records the level in the latch file', () => {
    const f = fixture();
    f.append(usage(638));
    postToolBatchContext(f.event(), f.monitor);
    expect(readLatch(f.latchFile)).toEqual({ level: 'warning' });
  });

  test('treats a malformed latch file as no latch', () => {
    const f = fixture();
    f.append(usage(638));
    fs.writeFileSync(f.latchFile, 'garbage');
    expect(postToolBatchContext(f.event(), f.monitor).context).toBeDefined();
  });

  test('never writes through a symlink planted at the latch path', () => {
    const f = fixture();
    f.append(usage(638));
    const target = path.join(f.dir, 'victim.txt');
    fs.writeFileSync(target, 'keep me');
    fs.symlinkSync(target, f.latchFile);
    expect(postToolBatchContext(f.event(), f.monitor)).toEqual({});
    expect(fs.readFileSync(target, 'utf-8')).toBe('keep me');
  });

  describe('the canary', () => {
    const modelMismatch = (f: ReturnType<typeof fixture>) => ({
      ...f.monitor,
      env: {
        [CONTEXT_LIMIT_VAR]: gauge({
          session: 'aaa',
          model: 'claude-haiku-4-5',
          kind: 'window',
          tokens: 1000,
        }),
      },
    });

    test('is the verbatim text', () => {
      expect(CANARY_TEXT).toBe(
        'sidekick: its mods are not running in this session, so the identity row, the exact compaction point, and the desk are missing. Unless an admin setting turns mods off here, run bun run check:mods in the sidekick repo.',
      );
    });

    test.each([
      ['unset', {}],
      ['malformed', { [CONTEXT_LIMIT_VAR]: '{"session":' }],
      ['another session', { [CONTEXT_LIMIT_VAR]: gauge({ session: 'old' }) }],
    ])('speaks once when the variable is %s', (_name, env) => {
      const f = fixture();
      f.append(usage(10));
      const monitor = { ...f.monitor, env };
      expect(postToolBatchContext(f.event(), monitor)).toEqual({
        notice: CANARY_TEXT,
      });
      expect(postToolBatchContext(f.event(), monitor)).toEqual({});
      expect(readLatch(f.latchFile)).toEqual({ canary: true });
    });

    test('speaks without a transcript figure or any limit source', () => {
      const f = fixture();
      const monitor = { env: {}, tmpdir: f.dir };
      expect(postToolBatchContext(f.event(), monitor)).toEqual({
        notice: CANARY_TEXT,
      });
      expect(postToolBatchContext(f.event(), monitor)).toEqual({});
    });

    test('speaks again in a new session id', () => {
      const a = fixture('aaa');
      const b = fixture('bbb');
      const shared = { env: {}, tmpdir: a.dir };
      expect(postToolBatchContext(a.event(), shared).notice).toBe(CANARY_TEXT);
      expect(postToolBatchContext(b.event(), shared).notice).toBe(CANARY_TEXT);
      expect(postToolBatchContext(a.event(), shared).notice).toBeUndefined();
    });

    test("is silent when the value is this session's", () => {
      const f = fixture();
      f.append(usage(10));
      expect(postToolBatchContext(f.event(), f.monitor)).toEqual({});
      expect(fs.existsSync(f.latchFile)).toBe(false);
    });

    test("is silent when the value is this session's but its model differs from the transcript's", () => {
      const f = fixture();
      f.append(usage(10));
      expect(postToolBatchContext(f.event(), modelMismatch(f))).toEqual({});
    });

    test('never speaks for a subagent, even with no value', () => {
      const f = fixture();
      const monitor = { env: {}, tmpdir: f.dir };
      expect(
        postToolBatchContext(f.event({ agent_id: 'sub1' }), monitor),
      ).toEqual({});
      expect(fs.existsSync(f.latchFile)).toBe(false);
    });

    test('shares a batch with a warning', () => {
      const f = fixture();
      f.append(usage(638));
      const monitor = {
        env: { CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW: '1000' },
        tmpdir: f.dir,
      };
      expect(postToolBatchContext(f.event(), monitor)).toEqual({
        context: warningText('warning', 650, W(1000)),
        notice: CANARY_TEXT,
      });
      expect(readLatch(f.latchFile)).toEqual({
        level: 'warning',
        canary: true,
      });
    });

    test('a drop below the first level clears the level and keeps the canary', () => {
      const f = fixture();
      const monitor = {
        env: { CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW: '1000' },
        tmpdir: f.dir,
      };
      f.append(usage(638));
      postToolBatchContext(f.event(), monitor);
      f.append(usage(88));
      expect(postToolBatchContext(f.event(), monitor)).toEqual({});
      expect(readLatch(f.latchFile)).toEqual({ canary: true });
      f.append(usage(638));
      expect(postToolBatchContext(f.event(), monitor)).toEqual({
        context: warningText('warning', 650, W(1000)),
      });
    });

    test('writes the latch at mode 0600', () => {
      const f = fixture();
      postToolBatchContext(f.event(), { env: {}, tmpdir: f.dir });
      expect(fs.statSync(f.latchFile).mode & 0o777).toBe(0o600);
    });

    test('never writes through a symlink planted at the latch path', () => {
      const f = fixture();
      const target = path.join(f.dir, 'victim.txt');
      fs.writeFileSync(target, 'keep me');
      fs.symlinkSync(target, f.latchFile);
      expect(
        postToolBatchContext(f.event(), { env: {}, tmpdir: f.dir }),
      ).toEqual({});
      expect(fs.readFileSync(target, 'utf-8')).toBe('keep me');
    });

    test('reads the old latch shape and a junk one', () => {
      const f = fixture();
      const monitor = { env: {}, tmpdir: f.dir };
      fs.writeFileSync(f.latchFile, JSON.stringify({ level: 'warning' }));
      expect(postToolBatchContext(f.event(), monitor).notice).toBe(CANARY_TEXT);
      expect(readLatch(f.latchFile)).toEqual({
        level: 'warning',
        canary: true,
      });
      fs.writeFileSync(f.latchFile, JSON.stringify({ level: 3, canary: 'x' }));
      expect(postToolBatchContext(f.event(), monitor).notice).toBe(CANARY_TEXT);
    });
  });
});
