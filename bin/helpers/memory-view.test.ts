import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeMarker } from './memory-store.js';
import {
  listRecords,
  listWorkstreams,
  recordPath,
  repoView,
  type ViewDeps,
} from './memory-view.js';
import { execRunner } from './pm-data.js';

const IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

let tmp = '';
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mem-view-')));
  saved = {};
  for (const [key, value] of Object.entries(IDENTITY)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

function mkdir(...parts: string[]): string {
  const dir = path.join(tmp, ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeRepo(...parts: string[]): string {
  const dir = mkdir(...parts);
  execRunner('git', ['init', '-q'], dir);
  execRunner('git', ['commit', '-q', '--allow-empty', '-m', 'init'], dir);
  return fs.realpathSync(dir);
}

function setKey(repo: string, key: string): void {
  fs.mkdirSync(path.join(repo, '.claude'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, '.claude', 'settings.local.json'),
    JSON.stringify({ autoMemoryDirectory: key }),
  );
}

function depsFor(store: string): ViewDeps {
  return {
    env: { SIDEKICK_MEMORY_STORE: store },
    home: path.join(tmp, 'home'),
    runGit: execRunner,
  };
}

describe('repoView', () => {
  test('linked without a family', () => {
    const store = mkdir('store');
    const repo = makeRepo('proj');
    const folder = mkdir('store', 'proj');
    writeMarker(folder, repo);
    setKey(repo, folder);
    expect(repoView(repo, depsFor(store))).toEqual({
      kind: 'linked',
      root: repo,
      store,
      repoFolder: folder,
      repoName: 'proj',
      familyFolder: undefined,
    });
  });

  test('linked inside a family folder, from a subfolder', () => {
    const store = mkdir('store');
    const repo = makeRepo('proj');
    const folder = mkdir('store', 'fam', 'proj');
    writeMarker(folder, repo);
    setKey(repo, `${folder}/`);
    const sub = mkdir('proj', 'src');
    expect(repoView(sub, depsFor(store))).toEqual({
      kind: 'linked',
      root: repo,
      store,
      repoFolder: folder,
      repoName: 'proj',
      familyFolder: path.join(store, 'fam'),
    });
  });

  test('linked from a linked worktree', () => {
    const store = mkdir('store');
    const repo = makeRepo('proj');
    const folder = mkdir('store', 'proj');
    writeMarker(folder, repo);
    setKey(repo, folder);
    const wt = path.join(tmp, 'wt');
    execRunner('git', ['worktree', 'add', '-q', '-b', 'b', wt], repo);
    const view = repoView(wt, depsFor(store));
    expect(view.kind).toBe('linked');
    if (view.kind === 'linked') expect(view.root).toBe(repo);
  });

  test('a marker names the repo but the key is missing', () => {
    const store = mkdir('store');
    const repo = makeRepo('proj');
    const folder = mkdir('store', 'proj');
    writeMarker(folder, repo);
    expect(repoView(repo, depsFor(store))).toEqual({
      kind: 'setting-missing',
      root: repo,
      folder,
      family: undefined,
    });
  });

  test('a ~/ key resolves against the home folder', () => {
    const store = mkdir('home', 'store');
    const repo = makeRepo('proj');
    const folder = mkdir('home', 'store', 'proj');
    setKey(repo, '~/store/proj');
    const view = repoView(repo, depsFor(store));
    expect(view.kind).toBe('linked');
    if (view.kind === 'linked')
      expect(view.repoFolder).toBe(fs.realpathSync(folder));
  });

  test('a relative key is none without a marker', () => {
    const store = mkdir('store');
    const repo = makeRepo('proj');
    mkdir('store', 'proj');
    setKey(repo, 'store/proj');
    expect(repoView(repo, depsFor(store))).toEqual({ kind: 'none' });
  });

  test('a marker names the repo but the key points elsewhere', () => {
    const store = mkdir('store');
    const repo = makeRepo('proj');
    const folder = mkdir('store', 'proj');
    writeMarker(folder, repo);
    setKey(repo, mkdir('elsewhere'));
    expect(repoView(repo, depsFor(store)).kind).toBe('setting-missing');
  });

  test('a key outside the store with no marker is none', () => {
    const store = mkdir('store');
    const repo = makeRepo('proj');
    setKey(repo, mkdir('elsewhere'));
    expect(repoView(repo, depsFor(store))).toEqual({ kind: 'none' });
  });

  test('the store root itself is not a repo folder', () => {
    const store = mkdir('store');
    const repo = makeRepo('proj');
    setKey(repo, store);
    expect(repoView(repo, depsFor(store))).toEqual({ kind: 'none' });
  });

  test('a cwd outside git is none', () => {
    const store = mkdir('store');
    expect(repoView(mkdir('plain'), depsFor(store))).toEqual({ kind: 'none' });
  });

  test('paths that contain a space', () => {
    const store = mkdir('my store');
    const repo = makeRepo('my proj');
    const folder = mkdir('my store', 'my proj');
    writeMarker(folder, repo);
    setKey(repo, folder);
    expect(repoView(repo, depsFor(store))).toEqual({
      kind: 'linked',
      root: repo,
      store,
      repoFolder: folder,
      repoName: 'my proj',
      familyFolder: undefined,
    });
  });
});

function put(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

const stream = (name: string, status: string, branches = ''): string =>
  `---\nname: ${name}\ndescription: about ${name}\nmetadata:\n  kind: workstream\n  status: ${status}\n${
    branches === '' ? '' : `  branches: "${branches}"\n`
  }---\n\nBody\n`;

describe('listWorkstreams', () => {
  test('reads both folders, keeps closed, skips others', () => {
    const family = mkdir('fam');
    const repo = mkdir('fam', 'proj');
    put(
      path.join(repo, 'alpha.md'),
      stream('alpha', 'open', 'sidekick:feat-a, aesir:feat-b'),
    );
    put(path.join(family, 'beta.md'), stream('beta', 'closed'));
    put(path.join(repo, 'MEMORY.md'), stream('index', 'open'));
    put(
      path.join(repo, 'note.md'),
      '---\nname: note\nmetadata:\n  kind: session\n---\n',
    );
    put(
      path.join(repo, 'noname.md'),
      '---\nmetadata:\n  kind: workstream\n  status: open\n---\n',
    );
    put(path.join(repo, 'odd.md'), stream('odd', 'paused'));
    const found = listWorkstreams(repo, family);
    expect(found.map((w) => w.name).sort()).toEqual(['alpha', 'beta']);
    expect(found.find((w) => w.name === 'alpha')).toEqual({
      name: 'alpha',
      description: 'about alpha',
      status: 'open',
      branches: [
        { repo: 'sidekick', branch: 'feat-a' },
        { repo: 'aesir', branch: 'feat-b' },
      ],
      path: path.join(repo, 'alpha.md'),
    });
    expect(found.find((w) => w.name === 'beta')?.status).toBe('closed');
  });

  test('a missing folder yields nothing', () => {
    expect(listWorkstreams(path.join(tmp, 'nope'), undefined)).toEqual([]);
  });
});

const record = (session: string, kind = 'session', body = ''): string =>
  `---\nname: r-${session}\nmetadata:\n  kind: ${kind}\n  session: ${session}\n  workstream: alpha\n---\n\n${body}`;

describe('listRecords', () => {
  test('newest first, other kinds ignored, title falls back to the id', () => {
    const repo = mkdir('proj');
    const dir = path.join(repo, 'sessions');
    put(
      path.join(dir, '2026-10-30-aaa.md'),
      record('aaa', 'session', '# Old work\n'),
    );
    put(path.join(dir, '2026-11-02-bbb.md'), record('bbb'));
    put(path.join(dir, '2026-11-01-ccc.md'), record('ccc', 'workstream'));
    const found = listRecords(repo);
    expect(found.map((r) => r.session)).toEqual(['bbb', 'aaa']);
    expect(found[0]).toEqual({
      path: path.join(dir, '2026-11-02-bbb.md'),
      date: '2026-11-02',
      session: 'bbb',
      workstream: 'alpha',
      title: 'bbb',
    });
    expect(found[1]?.title).toBe('Old work');
  });

  test('same date sorts by modification time, newest first', () => {
    const repo = mkdir('proj');
    const older = path.join(repo, 'sessions', '2026-11-02-old.md');
    const newer = path.join(repo, 'sessions', '2026-11-02-new.md');
    put(older, record('old'));
    put(newer, record('new'));
    fs.utimesSync(older, new Date(1000), new Date(1000));
    fs.utimesSync(newer, new Date(2000), new Date(2000));
    expect(listRecords(repo).map((r) => r.session)).toEqual(['new', 'old']);
  });

  test('no sessions folder yields nothing', () => {
    expect(listRecords(mkdir('proj'))).toEqual([]);
  });
});

describe('recordPath', () => {
  test('an existing record from an earlier day wins', () => {
    const repo = mkdir('proj');
    const earlier = path.join(repo, 'sessions', '2026-10-30-abc.md');
    put(earlier, record('abc'));
    expect(recordPath(repo, 'abc', '2026-11-02')).toEqual({
      path: earlier,
      exists: true,
    });
  });

  test('otherwise the path is dated today', () => {
    const repo = mkdir('proj');
    expect(recordPath(repo, 'abc', '2026-11-02')).toEqual({
      path: path.join(repo, 'sessions', '2026-11-02-abc.md'),
      exists: false,
    });
  });
});
