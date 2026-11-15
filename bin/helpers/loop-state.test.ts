import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ARMED_FILE,
  type Armed,
  currentArmed,
  type HashInput,
  LOCK_FILE,
  type LoopState,
  launchHash,
  readArmed,
  readState,
  removeState,
  STATE_FILE,
  takeLock,
  writeArmed,
  writeState,
} from './loop-state.js';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-test-loop-state-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const state = (over: Partial<LoopState> = {}): LoopState => ({
  v: 1,
  launch: 'launch-1',
  job: null,
  session: 'loop-fixer',
  launchedAt: '2026-11-15T10:00:00.000Z',
  startedAt: '2026-11-15T10:00:00.000Z',
  hash: 'abc',
  record: false,
  states: { build: 'act', ship: 'record' },
  schedule: '*/10 * * * *',
  tick: '/sidekick:loop-tick',
  ...over,
});

const armed = (over: Partial<Armed> = {}): Armed => ({
  v: 1,
  launch: 'launch-1',
  at: '2026-11-15T10:01:00.000Z',
  tick: 'cron-a',
  renewal: 'cron-b',
  renewalAt: '2026-11-21T10:02:00.000Z',
  ...over,
});

const leftovers = (dir: string, keep: string[]): string[] =>
  fs.readdirSync(dir).filter((f) => !keep.includes(f));

describe('state.json', () => {
  test('round-trips', () => {
    expect(writeState(tmp, state({ job: 'job1' }))).toEqual([]);
    expect(readState(tmp)).toEqual({
      kind: 'ok',
      value: state({ job: 'job1' }),
    });
  });
  test('a missing file reads absent', () => {
    expect(readState(tmp)).toEqual({ kind: 'absent' });
  });
  test('a torn file reads broken, naming the path', () => {
    fs.writeFileSync(path.join(tmp, STATE_FILE), '{"v":1,');
    const r = readState(tmp);
    expect(r.kind).toBe('broken');
    if (r.kind === 'broken')
      expect(r.issue).toContain(path.join(tmp, STATE_FILE));
  });
  test('a foreign file reads broken, naming the path', () => {
    fs.writeFileSync(path.join(tmp, STATE_FILE), '{"v":2,"hello":1}');
    const r = readState(tmp);
    expect(r.kind).toBe('broken');
    if (r.kind === 'broken')
      expect(r.issue).toContain(path.join(tmp, STATE_FILE));
  });
  test('a field a newer writer added still reads', () => {
    fs.writeFileSync(
      path.join(tmp, STATE_FILE),
      JSON.stringify({ ...state(), extra: 'x' }),
    );
    expect(readState(tmp)).toEqual({ kind: 'ok', value: state() });
  });
  test('a write leaves no temporary file', () => {
    writeState(tmp, state());
    writeState(tmp, state({ job: 'j' }));
    expect(leftovers(tmp, [STATE_FILE])).toEqual([]);
  });
  test('a failed rename returns an issue and leaves no temporary file', () => {
    fs.mkdirSync(path.join(tmp, STATE_FILE));
    const issues = writeState(tmp, state());
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain(path.join(tmp, STATE_FILE));
    expect(leftovers(tmp, [STATE_FILE])).toEqual([]);
  });
  test('a write into a missing folder returns an issue', () => {
    expect(writeState(path.join(tmp, 'none'), state())).toHaveLength(1);
  });
  test('removeState removes the file, and a missing file is no issue', () => {
    writeState(tmp, state());
    expect(removeState(tmp)).toEqual([]);
    expect(readState(tmp)).toEqual({ kind: 'absent' });
    expect(removeState(tmp)).toEqual([]);
  });
  test('removeState returns an issue it cannot clear', () => {
    fs.mkdirSync(path.join(tmp, STATE_FILE));
    fs.writeFileSync(path.join(tmp, STATE_FILE, 'x'), '');
    expect(removeState(tmp)).toHaveLength(1);
  });
});

describe('armed.json', () => {
  test('round-trips, reads absent, and reads broken', () => {
    expect(readArmed(tmp)).toEqual({ kind: 'absent' });
    expect(writeArmed(tmp, armed())).toEqual([]);
    expect(readArmed(tmp)).toEqual({ kind: 'ok', value: armed() });
    fs.writeFileSync(path.join(tmp, ARMED_FILE), 'nope');
    const r = readArmed(tmp);
    expect(r.kind).toBe('broken');
    if (r.kind === 'broken')
      expect(r.issue).toContain(path.join(tmp, ARMED_FILE));
    expect(leftovers(tmp, [ARMED_FILE])).toEqual([]);
  });
  test('a field a newer writer added still reads', () => {
    fs.writeFileSync(
      path.join(tmp, ARMED_FILE),
      JSON.stringify({ ...armed(), extra: 1 }),
    );
    expect(readArmed(tmp)).toEqual({ kind: 'ok', value: armed() });
  });
});

describe('currentArmed', () => {
  test('gives the arm whose launch matches', () => {
    expect(currentArmed(state(), { kind: 'ok', value: armed() })).toEqual(
      armed(),
    );
  });
  test('drops an arm of another launch', () => {
    expect(
      currentArmed(state(), { kind: 'ok', value: armed({ launch: 'old' }) }),
    ).toBeUndefined();
  });
  test('gives no arm for absent or broken', () => {
    expect(currentArmed(state(), { kind: 'absent' })).toBeUndefined();
    expect(
      currentArmed(state(), { kind: 'broken', issue: 'x' }),
    ).toBeUndefined();
  });
});

describe('launchHash', () => {
  const write = (file: string, text: string): void => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  let input: HashInput;
  beforeEach(() => {
    write(path.join(tmp, 'profile', 'profile.json'), '{}');
    write(path.join(tmp, 'profile', 'sub', 'a.txt'), 'a');
    write(path.join(tmp, 'plug', '.claude-plugin', 'plugin.json'), '{}');
    write(path.join(tmp, 'plug', 'skills', 's.md'), 's');
    input = {
      loopJson: '{"schedule":"* * * * *","tick":"/x"}',
      record: false,
      args: ['--bg', 'a'],
      profileDir: path.join(tmp, 'profile'),
      pluginDirs: [path.join(tmp, 'plug')],
    };
  });
  const hash = (over: Partial<HashInput> = {}): string =>
    launchHash({ ...input, ...over });

  test('is SHA-256 hex and stable', () => {
    expect(hash()).toMatch(/^[0-9a-f]{64}$/);
    expect(hash()).toBe(hash());
  });
  test('changes when loop.json changes in schedule alone', () => {
    expect(
      hash({ loopJson: input.loopJson.replace('* * * * *', '0 * * * *') }),
    ).not.toBe(hash());
  });
  test('changes when record flips with identical args', () => {
    expect(hash({ record: true })).not.toBe(hash());
  });
  test('changes with the args', () => {
    expect(hash({ args: ['--bg', 'b'] })).not.toBe(hash());
  });
  test('cannot confuse two different argument lists or inputs', () => {
    expect(hash({ args: ['a b'] })).not.toBe(hash({ args: ['a', 'b'] }));
    expect(hash({ args: ['ab', ''] })).not.toBe(hash({ args: ['a', 'b'] }));
    expect(hash({ loopJson: 'x', args: ['y'] })).not.toBe(
      hash({ loopJson: 'xy', args: [] }),
    );
  });
  test('changes when a file in the profile folder changes', () => {
    const before = hash();
    write(path.join(tmp, 'profile', 'sub', 'a.txt'), 'b');
    expect(hash()).not.toBe(before);
  });
  test('changes when a file in a plugin folder changes or is added', () => {
    const before = hash();
    write(path.join(tmp, 'plug', 'skills', 's.md'), 'changed');
    const mid = hash();
    expect(mid).not.toBe(before);
    write(path.join(tmp, 'plug', 'skills', 'new.md'), '');
    expect(hash()).not.toBe(mid);
  });
  test('a file moved to another path changes it', () => {
    const before = hash();
    fs.renameSync(
      path.join(tmp, 'profile', 'sub', 'a.txt'),
      path.join(tmp, 'profile', 'sub', 'b.txt'),
    );
    expect(hash()).not.toBe(before);
  });
  test('holds when only .git, node_modules, or .claude-plugin/types change, or a link is added', () => {
    const before = hash();
    write(path.join(tmp, 'plug', '.git', 'HEAD'), 'x');
    write(path.join(tmp, 'plug', 'node_modules', 'm', 'i.js'), 'x');
    write(path.join(tmp, 'plug', 'skills', 'node_modules', 'i.js'), 'x');
    write(path.join(tmp, 'plug', '.claude-plugin', 'types', 't.d.ts'), 'x');
    write(path.join(tmp, 'profile', '.git', 'HEAD'), 'x');
    fs.symlinkSync(
      path.join(tmp, 'plug', 'skills', 's.md'),
      path.join(tmp, 'plug', 'link.md'),
    );
    fs.symlinkSync(tmp, path.join(tmp, 'profile', 'dirlink'));
    expect(hash()).toBe(before);
    write(path.join(tmp, 'plug', '.claude-plugin', 'types', 't.d.ts'), 'y');
    expect(hash()).toBe(before);
  });
  test('holds when a .DS_Store appears in a profile or plugin folder, at any depth', () => {
    const before = hash();
    write(path.join(tmp, 'profile', '.DS_Store'), 'x');
    write(path.join(tmp, 'plug', '.DS_Store'), 'x');
    write(path.join(tmp, 'plug', 'skills', '.DS_Store'), 'x');
    expect(hash()).toBe(before);
    write(path.join(tmp, 'plug', 'skills', '.DS_Store'), 'y');
    expect(hash()).toBe(before);
  });
  test('file order on disk cannot change it', () => {
    const one = fs.mkdtempSync(path.join(tmp, 'o-'));
    for (const f of ['b', 'a', 'c']) write(path.join(one, f), f);
    const two = fs.mkdtempSync(path.join(tmp, 'p-'));
    for (const f of ['c', 'a', 'b']) write(path.join(two, f), f);
    expect(hash({ profileDir: two })).toBe(hash({ profileDir: one }));
  });
  test('an unreadable subfolder does not hide edits to the other files', () => {
    const locked = path.join(tmp, 'profile', 'locked');
    write(path.join(locked, 'x.txt'), 'x');
    fs.chmodSync(locked, 0o000);
    try {
      const before = hash();
      expect(hash()).toBe(before);
      write(path.join(tmp, 'profile', 'sub', 'a.txt'), 'edited');
      expect(hash()).not.toBe(before);
      expect(before).not.toBe(hash({ profileDir: path.join(tmp, 'gone') }));
    } finally {
      fs.chmodSync(locked, 0o755);
    }
  });
  test('a missing folder hashes as missing, deterministically', () => {
    const gone = path.join(tmp, 'gone');
    expect(hash({ profileDir: gone })).toBe(hash({ profileDir: gone }));
    expect(hash({ profileDir: gone })).not.toBe(hash());
    const empty = fs.mkdtempSync(path.join(tmp, 'e-'));
    expect(hash({ profileDir: gone })).not.toBe(hash({ profileDir: empty }));
  });
});

describe('takeLock', () => {
  const alive = (pids: number[]) => (pid: number) => pids.includes(pid);
  const now = new Date('2026-11-15T10:00:00.000Z');
  const lockFile = (): string => path.join(tmp, LOCK_FILE);

  test('takes a free lock, records pid and time, and release removes it', () => {
    const lock = takeLock(tmp, { pid: 11, now, isAlive: alive([]) });
    expect(lock.kind).toBe('held');
    expect(JSON.parse(fs.readFileSync(lockFile(), 'utf8'))).toEqual({
      pid: 11,
      at: now.toISOString(),
    });
    expect(leftovers(tmp, [LOCK_FILE])).toEqual([]);
    if (lock.kind === 'held') lock.release();
    expect(fs.readdirSync(tmp)).toEqual([]);
  });
  test('takes a lock whose pid is dead', () => {
    fs.writeFileSync(lockFile(), JSON.stringify({ pid: 7, at: 'x' }));
    const lock = takeLock(tmp, { pid: 11, now, isAlive: alive([]) });
    expect(lock.kind).toBe('held');
    expect(JSON.parse(fs.readFileSync(lockFile(), 'utf8')).pid).toBe(11);
    expect(leftovers(tmp, [LOCK_FILE])).toEqual([]);
  });
  test('refuses a lock whose pid is alive, naming the pid', () => {
    fs.writeFileSync(lockFile(), JSON.stringify({ pid: 7, at: 'x' }));
    const lock = takeLock(tmp, { pid: 11, now, isAlive: alive([7]) });
    expect(lock.kind).toBe('busy');
    if (lock.kind === 'busy') expect(lock.issue).toContain('7');
    expect(JSON.parse(fs.readFileSync(lockFile(), 'utf8')).pid).toBe(7);
  });
  test('a second taker is refused while the first holds', () => {
    const first = takeLock(tmp, { pid: 11, now, isAlive: alive([11]) });
    const second = takeLock(tmp, { pid: 12, now, isAlive: alive([11, 12]) });
    expect(first.kind).toBe('held');
    expect(second.kind).toBe('busy');
  });
  test('refuses a lock it cannot read, naming the file', () => {
    fs.writeFileSync(lockFile(), 'garbage');
    const lock = takeLock(tmp, { pid: 11, now, isAlive: alive([]) });
    expect(lock.kind).toBe('busy');
    if (lock.kind === 'busy') expect(lock.issue).toContain(lockFile());
    expect(fs.readFileSync(lockFile(), 'utf8')).toBe('garbage');
  });
  test('a taker that lost the takeover puts the other lock back', () => {
    // The first look sees pid 7 dead; another taker then replaces the lock before the rename.
    fs.writeFileSync(lockFile(), JSON.stringify({ pid: 7, at: 'x' }));
    const mine = JSON.stringify({ pid: 99, at: 'y' });
    const lock = takeLock(tmp, {
      pid: 11,
      now,
      isAlive: (pid) => {
        fs.writeFileSync(lockFile(), mine);
        return pid === 99;
      },
    });
    expect(lock.kind).toBe('busy');
    expect(fs.readFileSync(lockFile(), 'utf8')).toBe(mine);
    expect(leftovers(tmp, [LOCK_FILE])).toEqual([]);
  });
  test('release leaves a lock another taker holds', () => {
    const lock = takeLock(tmp, { pid: 11, now, isAlive: alive([]) });
    fs.writeFileSync(lockFile(), JSON.stringify({ pid: 12, at: 'z' }));
    if (lock.kind === 'held') lock.release();
    expect(JSON.parse(fs.readFileSync(lockFile(), 'utf8')).pid).toBe(12);
  });
  test('refuses when the folder is missing', () => {
    const lock = takeLock(path.join(tmp, 'none'), {
      pid: 11,
      now,
      isAlive: alive([]),
    });
    expect(lock.kind).toBe('busy');
  });
});
