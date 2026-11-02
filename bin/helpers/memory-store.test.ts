import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  CREATION_PATHS,
  commitPaths,
  createStore,
  findMarkers,
  folderNameIssue,
  MARKER_FILE,
  readMarker,
  STORE_README,
  storeRoot,
  storeState,
  writeMarker,
} from './memory-store.js';
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
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mem-store-')));
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

function git(cwd: string, ...args: string[]): string {
  return execRunner('git', args, cwd).stdout;
}

describe('storeRoot', () => {
  test('uses SIDEKICK_MEMORY_STORE when set and non-empty', () => {
    expect(storeRoot({ SIDEKICK_MEMORY_STORE: '/x/store' }, '/home/me')).toBe(
      '/x/store',
    );
  });

  test('falls back to sk-memory-store under home', () => {
    expect(storeRoot({}, '/home/me')).toBe('/home/me/sk-memory-store');
    expect(storeRoot({ SIDEKICK_MEMORY_STORE: '' }, '/home/me')).toBe(
      '/home/me/sk-memory-store',
    );
  });
});

describe('folderNameIssue', () => {
  test('accepts an ordinary name', () => {
    expect(folderNameIssue('my repo')).toBeUndefined();
  });

  test.each([
    ['sources', 'reserved'],
    ['archive', 'reserved'],
    ['.hidden', 'start with'],
    ['', 'empty'],
    ['a/b', 'separator'],
    ['a\\b', 'separator'],
  ])('refuses %j', (name, fragment) => {
    expect(folderNameIssue(name)).toContain(fragment);
  });
});

describe('markers', () => {
  test('round trips the root', () => {
    writeMarker(tmp, '/some/repo');
    expect(readMarker(tmp)).toEqual({ kind: 'marker', root: '/some/repo' });
  });

  test('reports none when absent', () => {
    expect(readMarker(tmp)).toEqual({ kind: 'none' });
  });

  test('reports invalid JSON and a wrong shape', () => {
    fs.writeFileSync(path.join(tmp, MARKER_FILE), '{nope');
    expect(readMarker(tmp).kind).toBe('invalid');
    fs.writeFileSync(path.join(tmp, MARKER_FILE), '{"root":3}');
    expect(readMarker(tmp).kind).toBe('invalid');
  });
});

describe('findMarkers', () => {
  test('finds a family repo and a no-family repo, and skips reserved and dot folders', () => {
    const solo = path.join(tmp, 'solo');
    const fam = path.join(tmp, 'fam', 'api');
    fs.mkdirSync(solo);
    fs.mkdirSync(fam, { recursive: true });
    fs.mkdirSync(path.join(tmp, 'sources'));
    fs.mkdirSync(path.join(tmp, '.git'));
    fs.writeFileSync(path.join(tmp, 'README.md'), 'x');
    writeMarker(solo, '/r/solo');
    writeMarker(fam, '/r/api');
    // a marker inside a reserved folder is ignored
    writeMarker(path.join(tmp, 'sources'), '/r/ignored');
    const found = findMarkers(tmp).sort((a, b) =>
      a.folder.localeCompare(b.folder),
    );
    expect(found).toEqual([
      { folder: fam, root: '/r/api', family: 'fam' },
      { folder: solo, root: '/r/solo', family: undefined },
    ]);
  });

  test('skips an invalid marker', () => {
    const bad = path.join(tmp, 'bad');
    fs.mkdirSync(bad);
    fs.writeFileSync(path.join(bad, MARKER_FILE), 'nope');
    expect(findMarkers(tmp)).toEqual([]);
  });

  test('returns nothing for an absent store', () => {
    expect(findMarkers(path.join(tmp, 'missing'))).toEqual([]);
  });
});

describe('storeState', () => {
  test('absent', () => {
    expect(storeState(path.join(tmp, 'none'), execRunner)).toEqual({
      kind: 'absent',
    });
  });

  test('empty', () => {
    expect(storeState(tmp, execRunner)).toEqual({ kind: 'empty' });
  });

  test('a file is foreign and named', () => {
    const file = path.join(tmp, 'f');
    fs.writeFileSync(file, 'x');
    const state = storeState(file, execRunner);
    expect(state.kind).toBe('foreign');
    if (state.kind === 'foreign') expect(state.issue).toContain(file);
  });

  test('a non-empty plain folder is foreign', () => {
    fs.writeFileSync(path.join(tmp, 'notes.txt'), 'x');
    expect(storeState(tmp, execRunner).kind).toBe('foreign');
  });

  test('a git repo without the README is foreign', () => {
    git(tmp, 'init');
    fs.writeFileSync(path.join(tmp, 'a'), 'x');
    expect(storeState(tmp, execRunner).kind).toBe('foreign');
  });

  test('a store created here is a store', () => {
    const store = path.join(tmp, 'store');
    expect(createStore(store, execRunner).ok).toBe(true);
    expect(storeState(store, execRunner)).toEqual({ kind: 'store' });
  });

  test('a folder inside another git work tree is foreign, not that tree', () => {
    git(tmp, 'init');
    fs.writeFileSync(path.join(tmp, 'README.md'), 'x');
    const inner = path.join(tmp, 'inner');
    fs.mkdirSync(inner);
    fs.writeFileSync(path.join(inner, 'f'), 'x');
    expect(storeState(inner, execRunner).kind).toBe('foreign');
  });
});

describe('createStore', () => {
  test('creates a repo whose one commit holds exactly its paths', () => {
    const store = path.join(tmp, 'store');
    const result = createStore(store, execRunner);
    expect(result).toEqual({
      ok: true,
      paths: [...CREATION_PATHS],
    });
    const files = git(store, 'show', '--name-only', '--format=', 'HEAD')
      .trim()
      .split('\n')
      .sort();
    expect(files).toEqual([...CREATION_PATHS].sort());
    expect(files).toContain('.gitignore');
    expect(fs.readFileSync(path.join(store, '.gitignore'), 'utf-8')).toBe(
      '.DS_Store\n',
    );
    expect(git(store, 'rev-list', '--count', 'HEAD').trim()).toBe('1');
    expect(fs.readFileSync(path.join(store, 'README.md'), 'utf-8')).toBe(
      STORE_README,
    );
  });

  test("the README states the spec's keys and sections exactly", () => {
    const lines = STORE_README.split('\n');
    const line = (needle: string): string =>
      lines.find((l) => l.includes(needle)) ?? '';
    const record = line('session record');
    expect(record).toContain('metadata.kind');
    expect(record).toContain('metadata.session');
    expect(record).toContain('metadata.workstream');
    expect(record).not.toContain('metadata.status');
    expect(record).not.toContain('metadata.branches');
    expect(line('## Key files')).toContain(
      '## State, ## Next steps, ## Key files, ## Context',
    );
    expect(line('## Where each item went')).toContain(
      '## Done, ## Decisions, ## Findings, ## Next steps, ## Where each item went',
    );
  });

  test('works on an empty existing folder', () => {
    expect(createStore(tmp, execRunner).ok).toBe(true);
  });

  test('refuses a non-empty folder and a file without writing', () => {
    fs.writeFileSync(path.join(tmp, 'keep'), 'x');
    const refused = createStore(tmp, execRunner);
    expect(refused.ok).toBe(false);
    expect(fs.readdirSync(tmp)).toEqual(['keep']);
    const file = path.join(tmp, 'keep');
    expect(createStore(file, execRunner).ok).toBe(false);
    expect(fs.readFileSync(file, 'utf-8')).toBe('x');
  });
});

describe('commitPaths', () => {
  test('commits only the named paths', () => {
    const store = path.join(tmp, 'store');
    createStore(store, execRunner);
    fs.mkdirSync(path.join(store, 'repo'));
    fs.writeFileSync(path.join(store, 'repo', 'a.md'), 'a');
    fs.writeFileSync(path.join(store, 'other.md'), 'someone else');
    const result = commitPaths(store, ['repo/a.md'], 'add a', execRunner);
    expect(result).toEqual({ ok: true });
    const files = git(store, 'show', '--name-only', '--format=', 'HEAD').trim();
    expect(files).toBe('repo/a.md');
    expect(git(store, 'status', '--porcelain').trim()).toBe('?? other.md');
  });

  test('reads each path literally, so a name with glob characters commits only itself', () => {
    const store = path.join(tmp, 'store');
    createStore(store, execRunner);
    fs.writeFileSync(path.join(store, 'a[1].md'), 'mine');
    fs.writeFileSync(path.join(store, 'a1.md'), 'someone else');
    expect(commitPaths(store, ['a[1].md'], 'add', execRunner)).toEqual({
      ok: true,
    });
    const files = git(store, 'show', '--name-only', '--format=', 'HEAD').trim();
    expect(files).toBe('a[1].md');
  });

  test('reports a failure with the git message', () => {
    const result = commitPaths(tmp, ['nope'], 'm', execRunner);
    expect(result.ok).toBe(false);
  });
});
