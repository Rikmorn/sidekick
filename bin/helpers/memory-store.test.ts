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
import {
  execRunner,
  MAX_OUTPUT,
  type Runner,
  type RunOptions,
} from './pm-data.js';

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

// What `createStore` writes at each of its paths; a `.gitkeep` is empty.
const CREATION_CONTENT: Record<string, string> = {
  'README.md': STORE_README,
  '.gitignore': '.DS_Store\n',
};

/** What `createStore` leaves when it stops after `git init` and the paths in `written`. */
function stoppedCreation(store: string, written: readonly string[]): void {
  fs.mkdirSync(store, { recursive: true });
  git(store, 'init', '-q');
  for (const rel of written) {
    const file = path.join(store, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, CREATION_CONTENT[rel] ?? '');
  }
}

// Every path under `root`, `.git` included, with its bytes; folders and links as entries too.
function tree(root: string): Map<string, string> {
  const entries = new Map<string, string>();
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) entries.set(full, fs.readlinkSync(full));
      else if (entry.isDirectory()) {
        entries.set(full, 'dir');
        visit(full);
      } else entries.set(full, fs.readFileSync(full).toString('base64'));
    }
  };
  visit(root);
  return entries;
}

// Stopped creations that hold something else, or whose repo is not a fresh `git init`.
const NOT_FRESH: [string, (store: string) => void][] = [
  [
    'another file',
    (store) => {
      stoppedCreation(store, []);
      fs.writeFileSync(path.join(store, 'notes.md'), 'mine\n');
    },
  ],
  [
    'another file beside the README',
    (store) => {
      stoppedCreation(store, ['README.md']);
      fs.writeFileSync(path.join(store, 'notes.md'), 'mine\n');
    },
  ],
  [
    'another file inside a reserved folder',
    (store) => {
      stoppedCreation(store, ['README.md', 'sources/.gitkeep']);
      fs.writeFileSync(path.join(store, 'sources', 'notes.md'), 'mine\n');
    },
  ],
  [
    'a file at a reserved folder name',
    (store) => {
      stoppedCreation(store, ['README.md']);
      fs.writeFileSync(path.join(store, 'sources'), 'mine\n');
    },
  ],
  [
    'a README that is a link',
    (store) => {
      stoppedCreation(store, []);
      const elsewhere = path.join(tmp, 'elsewhere.md');
      fs.writeFileSync(elsewhere, 'mine\n');
      fs.symlinkSync(elsewhere, path.join(store, 'README.md'));
    },
  ],
  [
    'a repo with a commit',
    (store) => {
      stoppedCreation(store, ['README.md']);
      git(store, 'commit', '-q', '--allow-empty', '-m', 'mine');
    },
  ],
  [
    'a repo whose HEAD has no commit but another branch has',
    (store) => {
      stoppedCreation(store, []);
      git(store, 'commit', '-q', '--allow-empty', '-m', 'mine');
      git(store, 'checkout', '-q', '--orphan', 'other');
    },
  ],
  [
    'an index holding another path',
    (store) => {
      stoppedCreation(store, ['README.md']);
      fs.writeFileSync(path.join(store, 'notes.md'), 'mine\n');
      git(store, 'add', '--', 'notes.md');
      fs.rmSync(path.join(store, 'notes.md'));
    },
  ],
  [
    'a .git that is a link to a fresh git init elsewhere',
    (store) => {
      const elsewhere = path.join(tmp, 'elsewhere');
      stoppedCreation(elsewhere, []);
      fs.mkdirSync(store);
      fs.symlinkSync(path.join(elsewhere, '.git'), path.join(store, '.git'));
    },
  ],
  [
    'a .git file rather than a folder',
    (store) => {
      fs.mkdirSync(store);
      git(store, 'init', '-q', `--separate-git-dir=${path.join(tmp, 'git')}`);
      fs.writeFileSync(path.join(store, 'README.md'), STORE_README);
    },
  ],
];

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
    expect(storeState(file, execRunner)).toEqual({
      kind: 'foreign',
      issue: `${file} is a file, not a store folder. Point SIDEKICK_MEMORY_STORE at an empty or absent folder, or move what is there.`,
    });
  });

  test('a non-empty plain folder is foreign', () => {
    fs.writeFileSync(path.join(tmp, 'notes.txt'), 'x');
    expect(storeState(tmp, execRunner)).toEqual({
      kind: 'foreign',
      issue: `${tmp} holds files but is not a sidekick store (a git repo with a README.md). Point SIDEKICK_MEMORY_STORE at an empty or absent folder, or move what is there.`,
    });
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

  test.each([
    0,
    1,
    2,
    CREATION_PATHS.length,
  ])('a git init with no commit and the first %i of the store files, nothing else, is unfinished', (count) => {
    const store = path.join(tmp, 'store');
    stoppedCreation(store, CREATION_PATHS.slice(0, count));
    expect(storeState(store, execRunner)).toEqual({ kind: 'unfinished' });
  });

  test('a creation whose commit failed with its files staged is unfinished', () => {
    const store = path.join(tmp, 'store');
    stoppedCreation(store, CREATION_PATHS);
    git(store, 'add', '--', ...CREATION_PATHS);
    expect(storeState(store, execRunner)).toEqual({ kind: 'unfinished' });
  });

  test('a stopped creation with the README beside paths link did not write refuses, naming each, and how to finish', () => {
    const store = path.join(tmp, 'store');
    stoppedCreation(store, ['README.md', 'sources/.gitkeep']);
    fs.writeFileSync(path.join(store, 'notes.md'), 'mine\n');
    fs.mkdirSync(path.join(store, 'drafts'));
    fs.writeFileSync(path.join(store, 'drafts', 'a.md'), 'mine\n');
    fs.writeFileSync(path.join(store, 'sources', 'b.md'), 'mine\n');
    fs.writeFileSync(path.join(store, '.DS_Store'), 'finder\n');
    expect(storeState(store, execRunner)).toEqual({
      kind: 'cluttered',
      issue: `${store} is a store whose creation stopped part-way, and it also holds drafts/, notes.md, sources/b.md, which link did not write. Move them out of ${store}, then run link again to finish the store.`,
    });
  });

  test('a stopped creation whose index holds a path link did not stage is foreign, naming it, with a way forward that touches nothing there', () => {
    const store = path.join(tmp, 'store');
    stoppedCreation(store, ['README.md']);
    fs.writeFileSync(path.join(store, 'notes.md'), 'mine\n');
    git(store, 'add', '--', 'notes.md');
    fs.rmSync(path.join(store, 'notes.md'));
    expect(storeState(store, execRunner)).toEqual({
      kind: 'foreign',
      issue: `${store} is a git repo with no commit, and its index holds notes.md, which link did not stage. Point SIDEKICK_MEMORY_STORE at an empty or absent folder, then run link again.`,
    });
  });

  test.each([
    ['after git init', []],
    ['after the README', ['README.md']],
  ])('a stopped creation %s with .DS_Store files beside it is unfinished, since the store ignores them', (_name, written) => {
    const store = path.join(tmp, 'store');
    stoppedCreation(store, written);
    fs.writeFileSync(path.join(store, '.DS_Store'), 'finder\n');
    fs.mkdirSync(path.join(store, 'sources'), { recursive: true });
    fs.writeFileSync(path.join(store, 'sources', '.DS_Store'), 'finder\n');
    expect(storeState(store, execRunner)).toEqual({ kind: 'unfinished' });
  });

  test('a store with commits beside other paths is a store, as before', () => {
    const store = path.join(tmp, 'store');
    expect(createStore(store, execRunner).ok).toBe(true);
    fs.writeFileSync(path.join(store, 'notes.md'), 'mine\n');
    expect(storeState(store, execRunner)).toEqual({ kind: 'store' });
  });

  test.each(
    NOT_FRESH,
  )('a stopped creation with %s is not unfinished', (_name, make) => {
    const store = path.join(tmp, 'store');
    make(store);
    expect(storeState(store, execRunner).kind).not.toBe('unfinished');
  });

  test("reads a commit-less repo's index with room for every path in it", () => {
    const store = path.join(tmp, 'store');
    stoppedCreation(store, []);
    const listings: (RunOptions | undefined)[] = [];
    const runner: Runner = (cmd, args, cwd, opts) => {
      if (args.includes('ls-files')) listings.push(opts);
      return execRunner(cmd, args, cwd, opts);
    };
    expect(storeState(store, runner)).toEqual({ kind: 'unfinished' });
    expect(listings).toEqual([{ maxBuffer: MAX_OUTPUT }]);
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

  test('the README names the settings file and its two keys on one line', () => {
    const settings = STORE_README.split('\n').find((l) =>
      l.includes('settings.json'),
    );
    expect(settings).toContain('indexLineCap');
    expect(settings).toContain('indexLineLength');
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

  test.each([
    0,
    1,
    3,
    CREATION_PATHS.length,
  ])('finishes a creation that stopped after git init and %i of its files: writes the rest, then one commit of exactly its paths', (count) => {
    const store = path.join(tmp, 'store');
    stoppedCreation(store, CREATION_PATHS.slice(0, count));
    expect(createStore(store, execRunner)).toEqual({
      ok: true,
      paths: [...CREATION_PATHS],
    });
    expect(git(store, 'rev-list', '--count', 'HEAD').trim()).toBe('1');
    const files = git(store, 'show', '--name-only', '--format=', 'HEAD')
      .trim()
      .split('\n')
      .sort();
    expect(files).toEqual([...CREATION_PATHS].sort());
    for (const rel of CREATION_PATHS) {
      expect(fs.readFileSync(path.join(store, rel), 'utf-8')).toBe(
        CREATION_CONTENT[rel] ?? '',
      );
    }
    expect(git(store, 'status', '--porcelain')).toBe('');
    expect(storeState(store, execRunner)).toEqual({ kind: 'store' });
  });

  test('finishing beside .DS_Store files writes the .gitignore that keeps them untracked', () => {
    const store = path.join(tmp, 'store');
    stoppedCreation(store, ['README.md']);
    fs.writeFileSync(path.join(store, '.DS_Store'), 'finder\n');
    expect(createStore(store, execRunner).ok).toBe(true);
    expect(git(store, 'status', '--porcelain')).toBe('');
    expect(git(store, 'check-ignore', '-v', '--', '.DS_Store')).toBe(
      '.gitignore:1:.DS_Store\t.DS_Store\n',
    );
    expect(git(store, 'ls-files').trim().split('\n').sort()).toEqual(
      [...CREATION_PATHS].sort(),
    );
  });

  test('finishing keeps a store file already there as it is', () => {
    const store = path.join(tmp, 'store');
    stoppedCreation(store, []);
    fs.writeFileSync(path.join(store, 'README.md'), 'a README cut short');
    expect(createStore(store, execRunner).ok).toBe(true);
    expect(fs.readFileSync(path.join(store, 'README.md'), 'utf-8')).toBe(
      'a README cut short',
    );
    expect(git(store, 'show', 'HEAD:README.md')).toBe('a README cut short');
  });

  test.each(
    NOT_FRESH,
  )('refuses a stopped creation with %s, and leaves every path as it was', (_name, make) => {
    const store = path.join(tmp, 'store');
    make(store);
    const before = tree(tmp);
    expect(createStore(store, execRunner).ok).toBe(false);
    expect(tree(tmp)).toEqual(before);
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
    // A glob-reading add would have staged it.
    expect(git(store, 'status', '--porcelain').trim()).toBe('?? a1.md');
  });

  test('reports a failure with the git message', () => {
    const result = commitPaths(tmp, ['nope'], 'm', execRunner);
    expect(result.ok).toBe(false);
  });

  test('leaves a path someone else staged staged, and out of the commit', () => {
    const store = withStagedOther();
    fs.writeFileSync(path.join(store, 'a.md'), 'mine');
    expect(commitPaths(store, ['a.md'], 'add a', execRunner)).toEqual({
      ok: true,
    });
    const files = git(store, 'show', '--name-only', '--format=', 'HEAD').trim();
    expect(files).toBe('a.md');
    expect(git(store, 'status', '--porcelain').trim()).toBe('A  other.md');
  });

  test('reads a name with a newline in it as one path', () => {
    const store = path.join(tmp, 'store');
    createStore(store, execRunner);
    const name = 'line\nbreak.md';
    fs.writeFileSync(path.join(store, name), 'mine');
    expect(commitPaths(store, [name], 'add', execRunner)).toEqual({ ok: true });
    const files = git(store, 'show', '-z', '--name-only', '--format=', 'HEAD');
    expect(files.split('\0').filter((f) => f !== '')).toEqual([name]);
  });

  test('passes the paths on stdin, so no git argument list grows with their count', () => {
    const calls = (paths: string[]) => {
      const seen: { args: string[]; opts: RunOptions | undefined }[] = [];
      const runner: Runner = (_cmd, args, _cwd, opts) => {
        seen.push({ args, opts });
        return { code: 0, stdout: '', stderr: '' };
      };
      expect(commitPaths('/store', paths, 'm', runner)).toEqual({ ok: true });
      return seen;
    };
    const many = Array.from({ length: 10_000 }, (_, i) => `repo/n${i}.md`);
    const manyCalls = calls(many);
    const oneCalls = calls(['repo/a.md']);
    expect(manyCalls.map((c) => c.args)).toEqual(oneCalls.map((c) => c.args));
    expect(manyCalls[1].args).toContain('--quiet');
    // git add warns once per file in some configurations, as with core.autocrlf.
    expect(manyCalls.map((c) => c.opts)).toEqual([
      { input: many.join('\0'), maxBuffer: MAX_OUTPUT },
      { input: many.join('\0'), maxBuffer: MAX_OUTPUT },
    ]);
  });

  test('commits nothing when no path reaches git, even with another path staged', () => {
    const store = withStagedOther();
    fs.writeFileSync(path.join(store, 'a.md'), 'mine');
    const head = git(store, 'rev-parse', 'HEAD');
    // A runner that drops its options, as a wrapper might, sends git no paths.
    const dropsOptions: Runner = (cmd, args, cwd) => execRunner(cmd, args, cwd);
    for (const [paths, runner] of [
      [[], execRunner],
      [['a.md'], dropsOptions],
    ] satisfies [string[], Runner][]) {
      const result = commitPaths(store, paths, 'm', runner);
      expect(result.ok).toBe(false);
      expect(git(store, 'rev-parse', 'HEAD')).toBe(head);
      expect(git(store, 'status', '--porcelain').trim()).toBe(
        'A  other.md\n?? a.md',
      );
    }
  });
});

// A store whose index holds `other.md`, which no call of the test staged.
function withStagedOther(): string {
  const store = path.join(tmp, 'store');
  createStore(store, execRunner);
  fs.writeFileSync(path.join(store, 'other.md'), 'someone else');
  git(store, 'add', '--', 'other.md');
  return store;
}
