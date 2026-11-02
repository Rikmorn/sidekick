import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { main } from '../cli.js';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { deadlineRunner, snapshotStore } from './memory-snapshot.js';
import { createStore } from './memory-store.js';
import { execRunner } from './pm-data.js';

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

function runVerb(argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = main(
    ['memory', 'snapshot', ...argv],
    {
      env: {},
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
    ['no arguments', []],
    ['a missing session', ['--store', '/nowhere', '--source', 'x']],
    ['an unknown flag', ['--bogus']],
  ])('%s exits 0 silently', (_label, argv) => {
    expect(runVerb(argv)).toEqual({ code: 0, out: [], err: [] });
  });
});
