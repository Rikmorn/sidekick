import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { main } from '../cli.js';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import {
  DEADLINE_EXIT,
  deadlineRunner,
  snapshotStore,
  startSnapshot,
} from './memory-snapshot.js';
import { createStore } from './memory-store.js';
import { execRunner, MAX_OUTPUT, TIMED_OUT } from './pm-data.js';

const IDENTITY = {
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const [name, value] of Object.entries(IDENTITY)) {
    saved[name] = process.env[name];
    process.env[name] = value;
  }
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  removeTemps();
});

function newStore(name = 'store'): string {
  const store = path.join(tmp(), name);
  expect(createStore(store, execRunner).ok).toBe(true);
  return store;
}

// The verb also lints the store, so home and the config folder are temporary.
function runVerb(argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const home = tmp();
  const code = main(
    ['memory', 'snapshot', ...argv],
    {
      env: { HOME: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude') },
      cwd: process.cwd(),
      entryFileUrl: pathToFileURL(path.join(__dirname, '..', 'cli.ts')).href,
    },
    (l) => out.push(l),
    (l) => err.push(l),
  );
  return { code, out, err };
}

describe('snapshotStore', () => {
  test('commits a change with the session trailer', () => {
    const store = newStore();
    fs.writeFileSync(path.join(store, 'note.md'), 'hello\n');
    expect(snapshotStore(store, 's-1', 'resume', execRunner)).toBe('committed');
    const body = git(store, 'log', '-1', '--format=%B');
    expect(body).toContain('memory: snapshot at resume of session s-1');
    expect(
      git(store, 'log', '-1', '--format=%(trailers:key=Session,valueonly)'),
    ).toBe('s-1');
    expect(git(store, 'status', '--porcelain')).toBe('');
  });

  test('a clean store gives clean and adds no commit', () => {
    const store = newStore();
    const head = git(store, 'rev-parse', 'HEAD');
    expect(snapshotStore(store, 's-1', 'startup', execRunner)).toBe('clean');
    expect(git(store, 'rev-parse', 'HEAD')).toBe(head);
  });

  test('a held index lock gives failed', () => {
    const store = newStore();
    fs.writeFileSync(path.join(store, 'note.md'), 'hello\n');
    fs.writeFileSync(path.join(store, '.git', 'index.lock'), '');
    expect(snapshotStore(store, 's-1', 'startup', execRunner)).toBe('failed');
  });

  test('never stages .DS_Store', () => {
    const store = newStore();
    fs.writeFileSync(path.join(store, '.DS_Store'), 'x');
    fs.mkdirSync(path.join(store, 'fam'));
    fs.writeFileSync(path.join(store, 'fam', '.DS_Store'), 'x');
    expect(snapshotStore(store, 's-1', 'startup', execRunner)).toBe('clean');
    fs.writeFileSync(path.join(store, 'fam', 'a.md'), 'a\n');
    expect(snapshotStore(store, 's-1', 'startup', execRunner)).toBe(
      'committed',
    );
    expect(git(store, 'show', '--name-only', '--format=', 'HEAD')).toBe(
      'fam/a.md',
    );
  });

  test('a store path with a space stays whole', () => {
    const store = newStore('my store');
    fs.writeFileSync(path.join(store, 'a b.md'), 'a\n');
    expect(snapshotStore(store, 's-1', 'startup', execRunner)).toBe(
      'committed',
    );
  });

  test('a folder inside another repo, but not a repo itself, gives failed and leaves the outer history', () => {
    const outer = repo();
    const inner = path.join(outer, 'store');
    fs.mkdirSync(inner);
    fs.writeFileSync(path.join(inner, 'note.md'), 'hello\n');
    const head = git(outer, 'rev-parse', 'HEAD');
    expect(snapshotStore(inner, 's-1', 'startup', execRunner)).toBe('failed');
    expect(git(outer, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(outer, 'status', '--porcelain')).toBe('?? store/');
  });

  test('a missing folder gives failed', () => {
    expect(
      snapshotStore(path.join(tmp(), 'absent'), 's-1', 'startup', execRunner),
    ).toBe('failed');
  });
});

describe('startSnapshot', () => {
  test('a caller-set GIT_DIR does not redirect the bundle to another repo', () => {
    const other = repo();
    const head = git(other, 'rev-parse', 'HEAD');
    const store = newStore();
    fs.writeFileSync(path.join(store, 'note.md'), 'hello\n');
    const bundle = path.join(
      __dirname,
      '..',
      '..',
      'plugin',
      'bin',
      'sidekick',
    );
    const r = spawnSync(
      process.execPath,
      [
        bundle,
        'memory',
        'snapshot',
        '--store',
        store,
        '--session',
        's-1',
        '--source',
        'startup',
      ],
      {
        env: { ...process.env, GIT_DIR: path.join(other, '.git') },
        encoding: 'utf-8',
      },
    );
    expect(r.status).toBe(0);
    expect(git(other, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(store, 'log', '-1', '--format=%s')).toBe(
      'memory: snapshot at startup of session s-1',
    );
  });

  test('the detached bundle commits a store whose path has a space', async () => {
    const store = newStore('my store');
    fs.writeFileSync(path.join(store, 'note.md'), 'hello\n');
    const pluginDir = path.join(__dirname, '..', '..', 'plugin');
    startSnapshot(pluginDir, store, 'spawn-1', 'startup');
    const deadline = Date.now() + 8000;
    let trailer = '';
    while (trailer === '' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      trailer = git(
        store,
        'log',
        '-1',
        '--format=%(trailers:key=Session,valueonly)',
      );
    }
    expect(trailer).toBe('spawn-1');
    expect(git(store, 'log', '-1', '--format=%s')).toBe(
      'memory: snapshot at startup of session spawn-1',
    );
  }, 10_000);
});

describe('deadlineRunner', () => {
  test('fails a call made after the deadline without running it', () => {
    let now = 0;
    const run = deadlineRunner(100, () => now);
    now = 100;
    expect(run('git', ['--version'], tmp()).code).not.toBe(0);
  });

  test('runs a call made before the deadline', () => {
    const run = deadlineRunner(5000, () => 0);
    expect(run('git', ['--version'], tmp()).code).toBe(0);
  });

  test('a call the deadline cuts mid-flight gets exit code 124, as one made after it does', () => {
    const run = deadlineRunner(200, Date.now);
    // The alias outlives the deadline; its output goes nowhere, so the kill returns at once.
    const nap = ['-c', 'alias.nap=!sleep 2 </dev/null >/dev/null 2>&1', 'nap'];
    expect(run('git', nap, tmp()).code).toBe(124);
  });

  test("DEADLINE_EXIT is the runner contract's TIMED_OUT", () => {
    expect(DEADLINE_EXIT).toBe(TIMED_OUT);
  });

  test('a call with input reaches stdin (#351)', () => {
    const run = deadlineRunner(5000, () => 0);
    const r = run('git', ['hash-object', '--stdin'], tmp(), { input: 'x\n' });
    expect(r.stdout.trim()).toBe('587be6b4c3f93f93c489c0111bba5596147a26cb');
  });

  test('a call with maxBuffer returns output past the default limit (#351)', () => {
    const cwd = repo();
    const run = deadlineRunner(20_000, Date.now);
    const blob = 'a'.repeat(2 * 1024 * 1024);
    const written = run('git', ['hash-object', '-w', '--stdin'], cwd, {
      input: blob,
    });
    expect(written.code).toBe(0);
    const read = run('git', ['cat-file', 'blob', written.stdout.trim()], cwd, {
      maxBuffer: MAX_OUTPUT,
    });
    expect(read.code).toBe(0);
    expect(read.stdout.length).toBe(blob.length);
  });

  test('a call timeout shorter than the time left cuts the call (#351)', () => {
    const run = deadlineRunner(60_000, Date.now);
    // The alias outlives the call's limit; its output goes nowhere, so the kill returns at once.
    const nap = ['-c', 'alias.nap=!sleep 2 </dev/null >/dev/null 2>&1', 'nap'];
    const started = Date.now();
    const r = run('git', nap, tmp(), { timeoutMs: 200 });
    expect(r.code).toBe(DEADLINE_EXIT);
    expect(Date.now() - started).toBeLessThan(1900);
  });

  test('a call that cannot start keeps exit code 127', () => {
    const run = deadlineRunner(5000, () => 0);
    expect(run('git', ['--version'], path.join(tmp(), 'absent')).code).toBe(
      127,
    );
  });

  test('carries the end time its calls share', () => {
    expect(deadlineRunner(5000, () => 1000).endsAt).toBe(6000);
  });
});

describe('sidekick memory snapshot', () => {
  test('commits a change, prints nothing, and exits 0', () => {
    const store = newStore();
    fs.writeFileSync(path.join(store, 'note.md'), 'hello\n');
    const r = runVerb([
      '--store',
      store,
      '--session',
      's-9',
      '--source',
      'startup',
    ]);
    expect(r).toEqual({ code: 0, out: [], err: [] });
    expect(git(store, 'log', '-1', '--format=%s')).toBe(
      'memory: snapshot at startup of session s-9',
    );
  });

  test('a held lock still exits 0 silently', () => {
    const store = newStore();
    fs.writeFileSync(path.join(store, 'note.md'), 'hello\n');
    fs.writeFileSync(path.join(store, '.git', 'index.lock'), '');
    const r = runVerb(['--store', store, '--session', 's', '--source', 'x']);
    expect(r).toEqual({ code: 0, out: [], err: [] });
  });

  test.each([
    ['an empty store', ''],
    ['a relative store', '.'],
  ])("%s never commits the caller's repo", (_label, storeArg) => {
    const outer = repo();
    fs.writeFileSync(path.join(outer, 'new.txt'), 'x\n');
    const head = git(outer, 'rev-parse', 'HEAD');
    const before = process.cwd();
    process.chdir(outer);
    try {
      const r = runVerb([
        '--store',
        storeArg,
        '--session',
        's',
        '--source',
        'x',
      ]);
      expect(r).toEqual({ code: 0, out: [], err: [] });
    } finally {
      process.chdir(before);
    }
    expect(git(outer, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(outer, 'status', '--porcelain')).toBe('?? new.txt');
  });

  test.each([
    ['no arguments', []],
    ['a missing session', ['--store', '/nowhere', '--source', 'x']],
    ['an unknown flag', ['--bogus']],
  ])('%s exits 0 silently', (_label, argv) => {
    expect(runVerb(argv)).toEqual({ code: 0, out: [], err: [] });
  });
});
