import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { sessionsInRepo } from './memory-sessions.js';
import type { Job } from './worker-jobs.js';

const job = (
  sessionId: string,
  cwd?: string,
  state?: string,
  over: Partial<Job> = {},
): Job => ({
  id: undefined,
  kind: 'interactive',
  name: undefined,
  cwd,
  sessionId,
  state,
  pid: 100,
  ...over,
});

describe('sessionsInRepo', () => {
  test('counts sessions in the main checkout and in a worktree, once each', () => {
    const main = job('a', '/x/odin');
    const nested = job('b', '/x/odin/.claude/worktrees/w');
    const outside = job('c', '/x/odin-wt');
    const result = sessionsInRepo(
      [main, nested, outside],
      ['/x/odin', '/x/odin/.claude/worktrees/w'],
      undefined,
    );
    expect(result.others).toEqual([main, nested]);
  });

  test('a sibling that shares a prefix is not inside', () => {
    const result = sessionsInRepo(
      [job('a', '/x/odin2')],
      ['/x/odin'],
      undefined,
    );
    expect(result.others).toEqual([]);
  });

  test('a job with no cwd is not in the repo', () => {
    const result = sessionsInRepo([job('a')], ['/x/odin'], undefined);
    expect(result).toEqual({ self: undefined, others: [] });
  });

  test('picks self out of others', () => {
    const me = job('me', '/x/odin/src');
    const other = job('o', '/x/odin');
    const result = sessionsInRepo([other, me], ['/x/odin'], 'me');
    expect(result.self).toBe(me);
    expect(result.others).toEqual([other]);
  });

  test('self is undefined when selfId is undefined or empty', () => {
    const me = job('', '/x/odin');
    for (const id of [undefined, '']) {
      const result = sessionsInRepo([me], ['/x/odin'], id);
      expect(result.self).toBeUndefined();
      expect(result.others).toEqual([me]);
    }
  });

  test('self is undefined when the running session is outside the repo', () => {
    const me = job('me', '/elsewhere');
    const result = sessionsInRepo([me, job('o', '/x/odin')], ['/x/odin'], 'me');
    expect(result.self).toBeUndefined();
    expect(result.others).toHaveLength(1);
  });

  test('compares real paths, so a symlinked cwd is inside the checkout', () => {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'sess-')),
    );
    try {
      const real = path.join(dir, 'repo');
      fs.mkdirSync(path.join(real, 'src'), { recursive: true });
      const link = path.join(dir, 'link');
      fs.symlinkSync(real, link);
      const viaLink = job('a', path.join(link, 'src'));
      expect(sessionsInRepo([viaLink], [real], undefined).others).toEqual([
        viaLink,
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a stopped row has no process left, so it is not open', () => {
    const stopped = job('s', '/x/odin', 'stopped', { pid: undefined });
    const result = sessionsInRepo([stopped], ['/x/odin'], undefined);
    expect(result.others).toEqual([]);
  });

  test('a finished background row with no pid is not open', () => {
    const done = job('d', '/x/odin', 'done', {
      kind: 'background',
      pid: undefined,
    });
    expect(sessionsInRepo([done], ['/x/odin'], undefined).others).toEqual([]);
  });

  test('a done row with a pid still has a process, so it is open', () => {
    const done = job('d', '/x/odin', 'done', { kind: 'background', pid: 41 });
    expect(sessionsInRepo([done], ['/x/odin'], undefined).others).toEqual([
      done,
    ]);
  });

  test('a working or blocked background row without a pid is open', () => {
    const working = job('w', '/x/odin', 'working', {
      kind: 'background',
      pid: undefined,
    });
    const blocked = job('b', '/x/odin', 'blocked', {
      kind: 'background',
      pid: undefined,
    });
    expect(
      sessionsInRepo([working, blocked], ['/x/odin'], undefined).others,
    ).toEqual([working, blocked]);
  });

  test('a cwd whose folder is gone compares by its literal path', () => {
    const gone = job('a', '/nonexistent-sidekick/odin/src');
    const result = sessionsInRepo(
      [gone],
      ['/nonexistent-sidekick/odin'],
      undefined,
    );
    expect(result.others).toEqual([gone]);
  });
});
