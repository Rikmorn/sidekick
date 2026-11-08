import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { defaultMemoryFolder, projectKey } from './memory-default.js';
import {
  applyAction,
  type LinkDeps,
  type LinkOptions,
  moveFolder,
  runLink,
} from './memory-link.js';
import {
  CREATION_PATHS,
  createStore,
  STORE_README,
  writeMarker,
} from './memory-store.js';
import { execRunner } from './pm-data.js';
import type { ClaudeRunner } from './profile-launch.js';

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

const TODAY = '2026-11-01';
const SETTINGS_REL = path.join('.claude', 'settings.local.json');
// Bytes no text encoding round-trips, so a lossy copy shows.
const BINARY = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x0a]);

interface Row {
  sessionId: string;
  cwd: string;
  state?: string;
}

const listing =
  (rows: Row[]): ClaudeRunner =>
  () => ({
    code: 0,
    stdout: JSON.stringify(rows),
    stderr: '',
    timedOut: false,
  });

interface World {
  top: string;
  store: string;
  configDir: string;
  memory: string;
  deps: LinkDeps;
}

/** A repo whose settings file git ignores, a config dir with its default memory folder, and a store path. */
function world(
  over: { top?: string; store?: string; env?: NodeJS.ProcessEnv } = {},
): World {
  const top = over.top ?? repo();
  fs.appendFileSync(
    path.join(top, '.git', 'info', 'exclude'),
    `${SETTINGS_REL}\n`,
  );
  const home = tmp();
  const configDir = path.join(home, '.claude');
  const store = over.store ?? path.join(tmp(), 'store');
  const memory = defaultMemoryFolder(top, configDir);
  fs.mkdirSync(memory, { recursive: true });
  fs.writeFileSync(path.join(memory, 'MEMORY.md'), '- [notes](notes.md)\n');
  fs.writeFileSync(path.join(memory, 'notes.md'), 'a note\n');
  fs.writeFileSync(
    path.join(configDir, '.claude.json'),
    JSON.stringify({ projects: { [top]: {} } }),
  );
  const env = {
    SIDEKICK_MEMORY_STORE: store,
    CLAUDE_CONFIG_DIR: configDir,
    ...over.env,
  };
  const deps: LinkDeps = {
    env,
    home,
    configDir,
    runGit: execRunner,
    runClaude: listing([]),
    today: () => TODAY,
  };
  return { top, store, configDir, memory, deps };
}

const opts = (
  repoPath: string,
  over: Partial<LinkOptions> = {},
): LinkOptions => ({
  repo: repoPath,
  family: undefined,
  name: undefined,
  force: false,
  dryRun: false,
  ...over,
});

interface Run {
  code: number;
  out: string[];
  err: string[];
}

function link(w: World, o: LinkOptions, deps: LinkDeps = w.deps): Run {
  const out: string[] = [];
  const err: string[] = [];
  const code = runLink(
    o,
    deps,
    (l) => out.push(l),
    (l) => err.push(l),
  );
  return { code, out, err };
}

function settingsOf(top: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(top, SETTINGS_REL), 'utf-8'));
}

function committed(store: string): string[] {
  return git(store, 'show', '--name-only', '--format=', 'HEAD')
    .split('\n')
    .filter((line) => line !== '')
    .sort();
}

// Every file under each folder, by path, with its bytes; folders as entries too.
function snapshot(...roots: string[]): Map<string, string> {
  const files = new Map<string, string>();
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.set(full, 'dir');
        visit(full);
      } else {
        files.set(full, fs.readFileSync(full).toString('base64'));
      }
    }
  };
  for (const root of roots) if (fs.existsSync(root)) visit(root);
  return files;
}

const archived = (w: World): string =>
  path.join(
    w.store,
    'archive',
    'default-folders',
    `${projectKey(w.top)}-${TODAY}`,
  );

describe('runLink: a first link', () => {
  test('creates the store, copies, sets the key, archives the default folder, and commits', () => {
    const w = world();
    const name = path.basename(w.top);
    const run = link(w, opts(w.top));
    expect(run.err).toEqual([]);
    expect(run.code).toBe(0);
    const folder = path.join(w.store, name);
    expect(
      JSON.parse(fs.readFileSync(path.join(folder, '.sidekick.json'), 'utf-8')),
    ).toEqual({ root: w.top });
    expect(fs.readFileSync(path.join(folder, 'notes.md'), 'utf-8')).toBe(
      'a note\n',
    );
    expect(settingsOf(w.top)).toEqual({ autoMemoryDirectory: folder });
    expect(fs.existsSync(w.memory)).toBe(false);
    expect(fs.readFileSync(path.join(archived(w), 'notes.md'), 'utf-8')).toBe(
      'a note\n',
    );
    expect(git(w.store, 'log', '--format=%s')).toBe(
      `link ${name}\nchore: create the memory store`,
    );
    expect(git(w.store, 'status', '--porcelain')).toBe('');
  });

  test('keeps every other entry of the settings file', () => {
    const w = world();
    const before = {
      permissions: { allow: ['Bash(ls)'] },
      env: { A: '1' },
    };
    fs.mkdirSync(path.join(w.top, '.claude'));
    fs.writeFileSync(path.join(w.top, SETTINGS_REL), JSON.stringify(before));
    expect(link(w, opts(w.top)).code).toBe(0);
    expect(settingsOf(w.top)).toEqual({
      ...before,
      autoMemoryDirectory: path.join(w.store, path.basename(w.top)),
    });
  });

  test('copies a default folder with sessions/ and a binary file, byte for byte', () => {
    const w = world();
    fs.mkdirSync(path.join(w.memory, 'sessions'));
    fs.writeFileSync(
      path.join(w.memory, 'sessions', '2026-11-01-a.md'),
      'session\n',
    );
    fs.writeFileSync(path.join(w.memory, 'image.png'), BINARY);
    expect(link(w, opts(w.top)).code).toBe(0);
    const folder = path.join(w.store, path.basename(w.top));
    expect(fs.readFileSync(path.join(folder, 'image.png')).equals(BINARY)).toBe(
      true,
    );
    expect(
      fs.readFileSync(path.join(archived(w), 'image.png')).equals(BINARY),
    ).toBe(true);
    expect(
      fs.readFileSync(
        path.join(folder, 'sessions', '2026-11-01-a.md'),
        'utf-8',
      ),
    ).toBe('session\n');
    expect(committed(w.store)).toContain(
      `${path.basename(w.top)}/sessions/2026-11-01-a.md`,
    );
  });

  test('the store commit holds only the paths link wrote', () => {
    const w = world();
    const other = world({ store: w.store });
    expect(link(other, opts(other.top, { family: 'fam' })).code).toBe(0);
    fs.writeFileSync(path.join(w.store, 'fam', 'index.md'), 'family notes\n');
    fs.writeFileSync(path.join(w.store, 'stray.md'), 'a session wrote this\n');
    expect(link(w, opts(w.top, { family: 'fam' })).code).toBe(0);
    const name = path.basename(w.top);
    const archive = `archive/default-folders/${projectKey(w.top)}-${TODAY}`;
    expect(committed(w.store)).toEqual(
      [
        `${archive}/MEMORY.md`,
        `${archive}/notes.md`,
        `fam/${name}/.sidekick.json`,
        `fam/${name}/MEMORY.md`,
        `fam/${name}/notes.md`,
      ].sort(),
    );
    expect(git(w.store, 'log', '-1', '--format=%s')).toBe(`link fam/${name}`);
    expect(git(w.store, 'status', '--porcelain')).toBe(
      '?? fam/index.md\n?? stray.md',
    );
  });

  test('prints the user-settings entry when nothing covers the store, and not when an entry does', () => {
    const w = world();
    const run = link(w, opts(w.top));
    expect(run.out.join('\n')).toContain(JSON.stringify(w.store));
    const covered = world();
    fs.writeFileSync(
      path.join(covered.configDir, 'settings.json'),
      JSON.stringify({
        permissions: { additionalDirectories: [path.dirname(covered.store)] },
      }),
    );
    const quiet = link(covered, opts(covered.top));
    expect(quiet.out.join('\n')).not.toContain('additionalDirectories');
  });
});

describe('runLink: a key set by hand', () => {
  test('a key equal to the folder, with no store and no marker, links as a first link', () => {
    const w = world();
    const folder = path.join(w.store, path.basename(w.top));
    fs.mkdirSync(path.join(w.top, '.claude'));
    fs.writeFileSync(
      path.join(w.top, SETTINGS_REL),
      JSON.stringify({ autoMemoryDirectory: folder }),
    );
    const run = link(w, opts(w.top));
    expect(run.err).toEqual([]);
    expect(run.code).toBe(0);
    expect(run.out.join('\n')).not.toContain('came back');
    expect(fs.readFileSync(path.join(folder, 'notes.md'), 'utf-8')).toBe(
      'a note\n',
    );
    expect(fs.readFileSync(path.join(folder, 'MEMORY.md'), 'utf-8')).toBe(
      '- [notes](notes.md)\n',
    );
    expect(fs.existsSync(w.memory)).toBe(false);
    expect(fs.readFileSync(path.join(archived(w), 'notes.md'), 'utf-8')).toBe(
      'a note\n',
    );
    expect(settingsOf(w.top)).toEqual({ autoMemoryDirectory: folder });
    expect(committed(w.store)).toEqual(linkPaths(w));
  });
});

describe('runLink: paths', () => {
  test('a repo path and a store path with spaces stay whole in the key, the marker, and the commands', () => {
    const top = path.join(tmp(), 'my repo');
    fs.renameSync(repo(), top);
    const store = path.join(tmp(), 'AI Memory Store');
    const w = world({ top, store });
    const forced = link(w, opts(top), {
      ...w.deps,
      runClaude: listing([{ sessionId: 'o', cwd: top }]),
    });
    expect(forced.code).toBe(1);
    expect(forced.err.join('\n')).toContain(
      `sidekick memory link '${top}' --force`,
    );
    expect(link(w, opts(top)).code).toBe(0);
    const folder = path.join(store, 'my repo');
    expect(settingsOf(top)).toEqual({ autoMemoryDirectory: folder });
    expect(
      JSON.parse(fs.readFileSync(path.join(folder, '.sidekick.json'), 'utf-8')),
    ).toEqual({ root: top });
    expect(fs.readFileSync(path.join(folder, 'notes.md'), 'utf-8')).toBe(
      'a note\n',
    );
  });

  test('a linked worktree or a subdirectory resolves to the main checkout and its name', () => {
    for (const pick of ['worktree', 'subdirectory'] as const) {
      const w = world();
      const start =
        pick === 'worktree' ? path.join(tmp(), 'wt') : path.join(w.top, 'sub');
      if (pick === 'worktree') git(w.top, 'worktree', 'add', '-q', start);
      else fs.mkdirSync(start);
      expect(link(w, opts(start)).code).toBe(0);
      const folder = path.join(w.store, path.basename(w.top));
      expect(settingsOf(w.top)).toEqual({ autoMemoryDirectory: folder });
      expect(fs.existsSync(path.join(start, SETTINGS_REL))).toBe(false);
      expect(
        JSON.parse(
          fs.readFileSync(path.join(folder, '.sidekick.json'), 'utf-8'),
        ),
      ).toEqual({ root: w.top });
    }
  });
});

describe('runLink: --dry-run', () => {
  test('prints each step and leaves every folder byte-identical, with or without a store', () => {
    for (const withStore of [false, true]) {
      const w = world();
      if (withStore) {
        const other = world({ store: w.store });
        expect(link(other, opts(other.top)).code).toBe(0);
        // A stale stat inside link's pathspec makes a plain `git status`
        // rewrite the store's index.
        const later = new Date(Date.now() + 60_000);
        fs.utimesSync(path.join(archived(other), 'notes.md'), later, later);
      }
      const roots = [w.top, path.dirname(w.configDir), path.dirname(w.store)];
      const before = snapshot(...roots);
      const run = link(w, opts(w.top, { dryRun: true }));
      expect(run.code).toBe(0);
      expect(
        run.out.filter((l) => l.startsWith('Would ')).length,
      ).toBeGreaterThan(0);
      expect(snapshot(...roots)).toEqual(before);
    }
  });

  test('after a store creation that stopped part-way, prints its steps and leaves every folder byte-identical', () => {
    const w = world();
    fs.mkdirSync(w.store);
    git(w.store, 'init', '-q');
    const roots = [w.top, path.dirname(w.configDir), path.dirname(w.store)];
    const before = snapshot(...roots);
    const run = link(w, opts(w.top, { dryRun: true }));
    expect(run.err).toEqual([]);
    expect(run.code).toBe(0);
    expect(run.out).toContain(`Would create the store at ${w.store}`);
    expect(snapshot(...roots)).toEqual(before);
  });

  test('a refusal under --dry-run prints it and exits 1', () => {
    const w = world({ env: { CLAUDE_CODE_REMOTE_MEMORY_DIR: '/r' } });
    const run = link(w, opts(w.top, { dryRun: true }));
    expect(run.code).toBe(1);
    expect(run.err.join('\n')).toContain('CLAUDE_CODE_REMOTE_MEMORY_DIR');
  });
});

describe('runLink: re-runs', () => {
  test('a second run finds the repo already linked and commits nothing', () => {
    const w = world();
    expect(link(w, opts(w.top)).code).toBe(0);
    const head = git(w.store, 'rev-parse', 'HEAD');
    const again = link(w, opts(w.top));
    expect(again.code).toBe(0);
    expect(again.out.join('\n')).toContain('already linked');
    expect(git(w.store, 'rev-parse', 'HEAD')).toBe(head);
  });

  test('a default folder that reappears is archived as it is, its new files listed, and nothing copied', () => {
    const w = world();
    expect(link(w, opts(w.top)).code).toBe(0);
    fs.mkdirSync(w.memory, { recursive: true });
    fs.writeFileSync(path.join(w.memory, 'new.md'), 'written after the link\n');
    const again = link(w, opts(w.top));
    expect(again.code).toBe(0);
    const second = `${archived(w)}-2`;
    expect(again.out.join('\n')).toContain(path.join(second, 'new.md'));
    expect(
      fs.existsSync(path.join(w.store, path.basename(w.top), 'new.md')),
    ).toBe(false);
    expect(fs.existsSync(w.memory)).toBe(false);
    expect(committed(w.store)).toEqual([
      `archive/default-folders/${projectKey(w.top)}-${TODAY}-2/new.md`,
    ]);
  });

  test('a run that stopped after copying skips the copies, and its commit takes them', () => {
    const w = world();
    const folder = stoppedAfterCopying(w);
    const run = link(w, opts(w.top));
    expect(run.code).toBe(0);
    expect(run.out.join('\n')).not.toContain('Copied');
    const name = path.basename(w.top);
    const archive = `archive/default-folders/${projectKey(w.top)}-${TODAY}`;
    expect(committed(w.store)).toEqual(
      [
        `${archive}/MEMORY.md`,
        `${archive}/notes.md`,
        `${name}/.sidekick.json`,
        `${name}/MEMORY.md`,
        `${name}/notes.md`,
      ].sort(),
    );
    expect(settingsOf(w.top)).toEqual({ autoMemoryDirectory: folder });
  });

  test('a re-run after a failed commit commits the staged copies, and leaves a later session write out', () => {
    const w = world();
    const failing: LinkDeps['runGit'] = (cmd, args, cwd) =>
      args.includes('commit') && args.some((a) => a.startsWith('link '))
        ? { code: 1, stdout: '', stderr: 'gpg failed to sign the data' }
        : execRunner(cmd, args, cwd);
    const first = link(w, opts(w.top), { ...w.deps, runGit: failing });
    expect(first.code).toBe(1);
    expect(first.err.join('\n')).toContain('gpg failed to sign the data');
    const name = path.basename(w.top);
    expect(git(w.store, 'status', '--porcelain')).toContain(
      `A  ${name}/MEMORY.md`,
    );
    fs.writeFileSync(
      path.join(w.store, name, 'session.md'),
      'a session wrote this\n',
    );
    expect(link(w, opts(w.top)).code).toBe(0);
    expect(committed(w.store)).toEqual(linkPaths(w));
    expect(git(w.store, 'status', '--porcelain')).toBe(`?? ${name}/session.md`);
  });

  test("a re-run after the store's first commit failed commits the store's own files, then links", () => {
    // A failed add leaves the files untracked; a failed commit leaves them staged.
    for (const step of ['add', 'commit']) {
      const w = world();
      const failing: LinkDeps['runGit'] = (cmd, args, cwd) =>
        args.includes(step) && args.includes('README.md')
          ? { code: 1, stdout: '', stderr: 'gpg failed to sign the data' }
          : execRunner(cmd, args, cwd);
      const first = link(w, opts(w.top), { ...w.deps, runGit: failing });
      expect(first.code).toBe(1);
      expect(first.err[0]).toContain('create the store');
      const again = link(w, opts(w.top));
      expect(again.err).toEqual([]);
      expect(again.code).toBe(0);
      const name = path.basename(w.top);
      expect(git(w.store, 'log', '--format=%s')).toBe(
        `link ${name}\nchore: create the memory store`,
      );
      expect(
        git(w.store, 'show', '--name-only', '--format=', 'HEAD~1')
          .split('\n')
          .sort(),
      ).toEqual([...CREATION_PATHS].sort());
      expect(committed(w.store)).toEqual(linkPaths(w));
      expect(git(w.store, 'status', '--porcelain')).toBe('');
    }
  });

  test('a re-run after the store creation stopped right after git init finishes the store, then links', () => {
    const w = world();
    // The README write fails once git init has run, as on a full disk.
    const stopsAfterInit: LinkDeps['runGit'] = (cmd, args, cwd) => {
      const r = execRunner(cmd, args, cwd);
      if (args[0] === 'init') fs.chmodSync(cwd, 0o555);
      return r;
    };
    try {
      const first = link(w, opts(w.top), { ...w.deps, runGit: stopsAfterInit });
      expect(first.code).toBe(1);
      expect(first.err[0]).toContain('create the store');
      expect(first.err[0]).toContain('README.md');
    } finally {
      if (fs.existsSync(w.store)) fs.chmodSync(w.store, 0o755);
    }
    expect(fs.readdirSync(w.store)).toEqual(['.git']);
    const again = link(w, opts(w.top));
    expect(again.err).toEqual([]);
    expect(again.code).toBe(0);
    expectCreatedThenLinked(w);
  });

  test('a re-run after the store creation stopped once the README was written writes the rest of the store files', () => {
    const w = world();
    fs.mkdirSync(w.store);
    git(w.store, 'init', '-q');
    fs.writeFileSync(path.join(w.store, 'README.md'), STORE_README);
    const again = link(w, opts(w.top));
    expect(again.err).toEqual([]);
    expect(again.code).toBe(0);
    expectCreatedThenLinked(w);
    expect(fs.readFileSync(path.join(w.store, '.gitignore'), 'utf-8')).toBe(
      '.DS_Store\n',
    );
  });

  test('a re-run after the store creation stopped, with the README and a file link did not write, refuses and names it; once it is moved out, the re-run finishes', () => {
    const w = world();
    fs.mkdirSync(w.store);
    git(w.store, 'init', '-q');
    fs.writeFileSync(path.join(w.store, 'README.md'), STORE_README);
    fs.writeFileSync(path.join(w.store, 'notes.md'), 'mine\n');
    const roots = [w.top, path.dirname(w.configDir), path.dirname(w.store)];
    const before = snapshot(...roots);
    const refused = link(w, opts(w.top));
    expect(refused.code).toBe(1);
    expect(refused.err).toEqual([
      'link refused, and wrote nothing:',
      `- ${w.store} is a store whose creation stopped part-way, and it also holds notes.md, which link did not write. Move them out of ${w.store}, then run link again to finish the store.`,
    ]);
    expect(snapshot(...roots)).toEqual(before);
    fs.renameSync(path.join(w.store, 'notes.md'), path.join(tmp(), 'notes.md'));
    const again = link(w, opts(w.top));
    expect(again.err).toEqual([]);
    expect(again.code).toBe(0);
    expectCreatedThenLinked(w);
  });

  test('a re-run after the store creation stopped, with only .DS_Store files beside the store files, finishes, and they stay untracked and ignored', () => {
    for (const written of [[], ['README.md']]) {
      const w = world();
      fs.mkdirSync(w.store);
      git(w.store, 'init', '-q');
      for (const rel of written) {
        fs.writeFileSync(path.join(w.store, rel), STORE_README);
      }
      fs.writeFileSync(path.join(w.store, '.DS_Store'), 'finder\n');
      fs.mkdirSync(path.join(w.store, 'archive'));
      fs.writeFileSync(path.join(w.store, 'archive', '.DS_Store'), 'finder\n');
      const again = link(w, opts(w.top));
      expect(again.err).toEqual([]);
      expect(again.code).toBe(0);
      expectCreatedThenLinked(w);
      expect(
        git(w.store, 'ls-files', '--', '.DS_Store', 'archive/.DS_Store'),
      ).toBe('');
      expect(git(w.store, 'check-ignore', '-v', '--', '.DS_Store')).toBe(
        '.gitignore:1:.DS_Store\t.DS_Store',
      );
    }
  });

  test('an existing store with no .gitignore is unaffected by a link', () => {
    const w = world();
    expect(createStore(w.store, execRunner).ok).toBe(true);
    git(w.store, 'rm', '-q', '.gitignore');
    git(w.store, 'commit', '-q', '-m', 'drop the ignore file');
    expect(link(w, opts(w.top)).code).toBe(0);
    expect(committed(w.store)).toEqual(linkPaths(w));
    expect(fs.existsSync(path.join(w.store, '.gitignore'))).toBe(false);
    expect(git(w.store, 'status', '--porcelain')).toBe('');
  });

  test("a hand-added, uncommitted .gitignore in an existing store is committed by a link as the store's own file", () => {
    const w = world();
    expect(createStore(w.store, execRunner).ok).toBe(true);
    git(w.store, 'rm', '-q', '.gitignore');
    git(w.store, 'commit', '-q', '-m', 'drop the ignore file');
    fs.writeFileSync(path.join(w.store, '.gitignore'), '.DS_Store\n*.tmp\n');
    expect(link(w, opts(w.top)).code).toBe(0);
    expect(git(w.store, 'status', '--porcelain')).toBe('');
    expect(
      git(w.store, 'show', '--name-only', '--format=', 'HEAD~1').trim(),
    ).toBe('.gitignore');
    expect(committed(w.store)).toEqual(linkPaths(w));
  });

  test("a committed store README edited by hand stays the operator's, uncommitted", () => {
    const w = world();
    expect(link(w, opts(w.top)).code).toBe(0);
    const head = git(w.store, 'rev-parse', 'HEAD');
    fs.appendFileSync(path.join(w.store, 'README.md'), 'my own note\n');
    const again = link(w, opts(w.top));
    expect(again.code).toBe(0);
    expect(again.out.join('\n')).toContain('already linked');
    expect(git(w.store, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(w.store, 'status', '--porcelain')).toBe('M README.md');
  });

  test('a re-run after a failed archive commits the untracked copies with the archive', () => {
    const w = world();
    expect(createStore(w.store, execRunner).ok).toBe(true);
    const archives = path.join(w.store, 'archive', 'default-folders');
    fs.mkdirSync(archives);
    fs.chmodSync(archives, 0o555);
    const first = link(w, opts(w.top));
    fs.chmodSync(archives, 0o755);
    expect(first.code).toBe(1);
    expect(first.err[0]).toContain('move');
    expect(fs.existsSync(w.memory)).toBe(true);
    const name = path.basename(w.top);
    expect(git(w.store, 'status', '--porcelain')).toContain(`?? ${name}/`);
    expect(link(w, opts(w.top)).code).toBe(0);
    expect(fs.existsSync(w.memory)).toBe(false);
    expect(committed(w.store)).toEqual(linkPaths(w));
    expect(git(w.store, 'status', '--porcelain')).toBe('');
  });
});

// The store's first commit holds exactly its own files, and the link's commit follows it.
function expectCreatedThenLinked(w: World): void {
  expect(git(w.store, 'log', '--format=%s')).toBe(
    `link ${path.basename(w.top)}\nchore: create the memory store`,
  );
  expect(
    git(w.store, 'show', '--name-only', '--format=', 'HEAD~1')
      .split('\n')
      .sort(),
  ).toEqual([...CREATION_PATHS].sort());
  expect(committed(w.store)).toEqual(linkPaths(w));
  expect(git(w.store, 'status', '--porcelain')).toBe('');
}

// Every path a link of the world's two default files writes in the store, sorted.
function linkPaths(w: World): string[] {
  const name = path.basename(w.top);
  const archive = `archive/default-folders/${projectKey(w.top)}-${TODAY}`;
  return [
    `${archive}/MEMORY.md`,
    `${archive}/notes.md`,
    `${name}/.sidekick.json`,
    `${name}/MEMORY.md`,
    `${name}/notes.md`,
  ].sort();
}

/** The state a link leaves when it stops after its copies: a store, the marker, and the copies, none committed. */
function stoppedAfterCopying(w: World): string {
  expect(createStore(w.store, execRunner).ok).toBe(true);
  const folder = path.join(w.store, path.basename(w.top));
  fs.mkdirSync(folder);
  writeMarker(folder, w.top);
  for (const file of ['MEMORY.md', 'notes.md']) {
    fs.copyFileSync(path.join(w.memory, file), path.join(folder, file));
  }
  return folder;
}

describe('runLink: refusals write nothing', () => {
  test('a differing file in the store refuses, names it, and leaves every folder as it was', () => {
    const w = world();
    const folder = stoppedAfterCopying(w);
    fs.writeFileSync(path.join(folder, 'notes.md'), 'a different note\n');
    const roots = [w.top, path.dirname(w.configDir), path.dirname(w.store)];
    const before = snapshot(...roots);
    const run = link(w, opts(w.top));
    expect(run.code).toBe(1);
    expect(run.err.join('\n')).toContain(path.join(folder, 'notes.md'));
    expect(snapshot(...roots)).toEqual(before);
  });

  test('a stopped store creation beside a file link did not write refuses, and leaves every folder as it was', () => {
    const w = world();
    fs.mkdirSync(w.store);
    git(w.store, 'init', '-q');
    fs.writeFileSync(path.join(w.store, 'notes.md'), 'mine\n');
    const roots = [w.top, path.dirname(w.configDir), path.dirname(w.store)];
    const before = snapshot(...roots);
    const run = link(w, opts(w.top));
    expect(run.code).toBe(1);
    expect(run.err.join('\n')).toContain('SIDEKICK_MEMORY_STORE');
    expect(snapshot(...roots)).toEqual(before);
  });

  test('a repo whose git worktree list fails refuses in its own words, without the desk wording', () => {
    const w = world();
    const run = link(w, opts(w.top), {
      ...w.deps,
      runGit: (cmd, args, cwd) =>
        args[0] === 'worktree'
          ? { code: 128, stdout: '', stderr: 'fatal: worktrees broken\n' }
          : execRunner(cmd, args, cwd),
    });
    expect(run.code).toBe(1);
    expect(run.err).toEqual([
      'link refused, and wrote nothing:',
      `- ${w.top} has no main checkout, since git worktree list failed there: fatal: worktrees broken; fix what git reports, then run the command again`,
    ]);
    expect(run.err.join('\n')).not.toContain('no children show');
  });

  test('another open session refuses, and --force links and reports it', () => {
    const w = world();
    const deps = {
      ...w.deps,
      runClaude: listing([{ sessionId: 'other', cwd: w.top }]),
    };
    const refused = link(w, opts(w.top), deps);
    expect(refused.code).toBe(1);
    expect(fs.existsSync(w.store)).toBe(false);
    const forced = link(w, opts(w.top, { force: true }), deps);
    expect(forced.code).toBe(0);
    expect(forced.out.join('\n')).toContain('other');
  });

  test('a stopped session in the repo does not refuse, and a done one still does', () => {
    const w = world();
    const withRow = (state: string): LinkDeps => ({
      ...w.deps,
      runClaude: listing([{ sessionId: 'bg', cwd: w.top, state }]),
    });
    const done = link(w, opts(w.top), withRow('done'));
    expect(done.code).toBe(1);
    expect(done.err.join('\n')).toContain('Other sessions are open');
    const stopped = link(w, opts(w.top), withRow('stopped'));
    expect(stopped.err).toEqual([]);
    expect(stopped.code).toBe(0);
    expect(stopped.out.join('\n')).not.toContain('bg in');
  });

  test('the session running link is told to restart', () => {
    const w = world();
    const deps = {
      ...w.deps,
      env: { ...w.deps.env, CLAUDE_CODE_SESSION_ID: 'me' },
      runClaude: listing([{ sessionId: 'me', cwd: w.top }]),
    };
    const run = link(w, opts(w.top), deps);
    expect(run.code).toBe(0);
    expect(run.out.join('\n')).toContain('restart');
  });
});

describe('applyAction: the archive', () => {
  // A default folder and a repo folder: a.md copied, b.md changed since, c.md new.
  function folders(): { from: string; copies: string; to: string } {
    const base = tmp();
    const from = path.join(base, 'memory');
    const copies = path.join(base, 'store', 'odin');
    fs.mkdirSync(from);
    fs.mkdirSync(copies, { recursive: true });
    fs.writeFileSync(path.join(from, 'a.md'), 'a');
    fs.writeFileSync(path.join(copies, 'a.md'), 'a');
    fs.writeFileSync(path.join(from, 'b.md'), 'b, written after the copy');
    fs.writeFileSync(path.join(copies, 'b.md'), 'b');
    fs.writeFileSync(path.join(from, 'c.md'), 'c, new since the copy');
    return { from, copies, to: path.join(base, 'store', 'archive', 'x') };
  }

  test('lists each file that changed after the copy, or that the copy lacks, as kept in the archive only', () => {
    const f = folders();
    const applied = applyAction(
      { kind: 'archiveDefault', ...f, reappeared: false },
      execRunner,
    );
    if (!applied.ok) throw new Error(applied.issue);
    expect(applied.lines.slice(1)).toEqual([
      'These files changed after the copy, so their latest version is kept in the archive only:',
      `  ${path.join(f.to, 'b.md')}`,
      `  ${path.join(f.to, 'c.md')}`,
    ]);
    expect(fs.existsSync(f.from)).toBe(false);
    expect(fs.readFileSync(path.join(f.to, 'b.md'), 'utf-8')).toBe(
      'b, written after the copy',
    );
  });

  test('a file whose only change since the copy is a stamp is not listed', () => {
    const f = folders();
    const doc = (stamp: string): string => `---\nname: s\n${stamp}---\nBody.\n`;
    fs.writeFileSync(path.join(f.from, 's.md'), doc('modified: 2026-11-02\n'));
    fs.writeFileSync(
      path.join(f.copies, 's.md'),
      doc('modified: 2026-11-01\n'),
    );
    const applied = applyAction(
      { kind: 'archiveDefault', ...f, reappeared: false },
      execRunner,
    );
    if (!applied.ok) throw new Error(applied.issue);
    expect(applied.lines.join('\n')).not.toContain('s.md');
  });

  test('a reappeared folder asks for a merge by hand of the same files', () => {
    const f = folders();
    const applied = applyAction(
      { kind: 'archiveDefault', ...f, reappeared: true },
      execRunner,
    );
    if (!applied.ok) throw new Error(applied.issue);
    expect(applied.lines[1]).toContain('came back after the link');
    expect(applied.lines.slice(2)).toEqual([
      `  ${path.join(f.to, 'b.md')}`,
      `  ${path.join(f.to, 'c.md')}`,
    ]);
  });
});

describe('runLink: a failed read', () => {
  test('names the error, says nothing was written, and says to run it again', () => {
    const w = world();
    const run = link(w, opts(w.top), {
      ...w.deps,
      runClaude: () => {
        throw new Error('the listing crashed');
      },
    });
    expect(run.code).toBe(1);
    expect(run.err).toEqual([
      'link could not read what it needs, and wrote nothing: the listing crashed',
      'Fix that, then run the same command again.',
    ]);
    expect(fs.existsSync(w.store)).toBe(false);
  });
});

describe('runLink: a failed step', () => {
  test('stops the run, names the step, and says to run it again', () => {
    const w = world();
    const run = link(w, opts(w.top), {
      ...w.deps,
      runGit: (cmd, args, cwd) =>
        args[0] === 'init'
          ? { code: 1, stdout: '', stderr: 'init refused' }
          : execRunner(cmd, args, cwd),
    });
    expect(run.code).toBe(1);
    expect(run.err[0]).toContain('create the store');
    expect(run.err[0]).toContain('init refused');
    expect(run.err[1]).toContain('run the same command again');
    expect(fs.existsSync(path.join(w.top, SETTINGS_REL))).toBe(false);
  });

  test('still prints the session notes, after the failure lines', () => {
    const w = world();
    const lines: string[] = [];
    const code = runLink(
      opts(w.top, { force: true }),
      {
        ...w.deps,
        env: { ...w.deps.env, CLAUDE_CODE_SESSION_ID: 'me' },
        runClaude: listing([
          { sessionId: 'me', cwd: w.top },
          { sessionId: 'other', cwd: w.top },
        ]),
        runGit: (cmd, args, cwd) =>
          args.includes('commit') && args.some((a) => a.startsWith('link '))
            ? { code: 1, stdout: '', stderr: 'gpg failed to sign the data' }
            : execRunner(cmd, args, cwd),
      },
      (l) => lines.push(`out: ${l}`),
      (l) => lines.push(`err: ${l}`),
    );
    expect(code).toBe(1);
    const failed = lines.findIndex((l) => l.includes('gpg failed'));
    const forced = lines.findIndex((l) =>
      l.startsWith('out: Passed over with --force: other'),
    );
    const self = lines.findIndex(
      (l) => l.startsWith('out: This session (me') && l.includes('Restart it'),
    );
    expect(failed).toBeGreaterThanOrEqual(0);
    expect(forced).toBeGreaterThan(failed);
    expect(self).toBeGreaterThan(failed);
  });
});

describe('moveFolder', () => {
  const crossDevice = (): never => {
    throw Object.assign(new Error('cross-device link'), { code: 'EXDEV' });
  };

  // A default folder of two files, one in a subfolder, and where it moves to.
  function folders(): { from: string; to: string } {
    const base = tmp();
    const from = path.join(base, 'from');
    fs.mkdirSync(path.join(from, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(from, 'MEMORY.md'), 'index');
    fs.writeFileSync(path.join(from, 'sub', 'a.md'), 'a');
    return { from, to: path.join(base, 'archive', 'to') };
  }

  // A copy that writes one file into `to`, then fails, as a full disk would.
  const failsPartWay = (_from: string, to: string): never => {
    fs.writeFileSync(path.join(to, 'MEMORY.md'), 'ind');
    throw new Error('ENOSPC: no space left on device, write');
  };

  test('copies then removes when rename fails across filesystems, keeping links as written', () => {
    const { from, to } = folders();
    fs.symlinkSync('sub/a.md', path.join(from, 'link.md'));
    moveFolder(from, to, { rename: crossDevice });
    expect(fs.existsSync(from)).toBe(false);
    expect(fs.readFileSync(path.join(to, 'sub', 'a.md'), 'utf-8')).toBe('a');
    expect(fs.readlinkSync(path.join(to, 'link.md'))).toBe('sub/a.md');
  });

  test('any other rename failure is thrown', () => {
    const { from, to } = folders();
    const denied = (): never => {
      throw Object.assign(new Error('denied'), { code: 'EACCES' });
    };
    expect(() => moveFolder(from, to, { rename: denied })).toThrow('denied');
    expect(fs.existsSync(from)).toBe(true);
  });

  test('a cross-device copy that fails part-way leaves the folder whole and removes the partial copy', () => {
    const { from, to } = folders();
    const before = snapshot(from);
    const removed: string[] = [];
    const remove = (target: string): void => {
      removed.push(target);
      fs.rmSync(target, { recursive: true });
    };
    expect(() =>
      moveFolder(from, to, { rename: crossDevice, copy: failsPartWay, remove }),
    ).toThrow(
      `copying across filesystems failed, so link left ${from} intact and removed its partial copy at ${to}: ENOSPC: no space left on device, write`,
    );
    expect(snapshot(from)).toEqual(before);
    expect(fs.existsSync(to)).toBe(false);
    expect(removed).toEqual([to]);
  });

  test('a partial copy that cannot be removed is named, with the folder left whole', () => {
    const { from, to } = folders();
    const before = snapshot(from);
    const stuck = (): never => {
      throw new Error('EACCES: permission denied, rmdir');
    };
    expect(() =>
      moveFolder(from, to, {
        rename: crossDevice,
        copy: failsPartWay,
        remove: stuck,
      }),
    ).toThrow(
      `copying across filesystems failed, so link left ${from} intact: ENOSPC: no space left on device, write. link could not remove its partial copy either, so delete ${to} by hand: EACCES: permission denied, rmdir`,
    );
    expect(snapshot(from)).toEqual(before);
    expect(fs.readdirSync(to)).toEqual(['MEMORY.md']);
  });

  test('a folder already at the destination is left alone, and nothing is copied', () => {
    const { from, to } = folders();
    fs.mkdirSync(to, { recursive: true });
    fs.writeFileSync(path.join(to, 'theirs.md'), 'not link');
    const before = snapshot(from, to);
    const copied: string[] = [];
    const copy = (_from: string, into: string): void => {
      copied.push(into);
    };
    expect(() => moveFolder(from, to, { rename: crossDevice, copy })).toThrow(
      `${to} already exists, so link copied nothing into it and left ${from} intact. A re-run picks another archive name.`,
    );
    expect(snapshot(from, to)).toEqual(before);
    expect(copied).toEqual([]);
  });

  test.skipIf(process.getuid?.() === 0)(
    'a destination it cannot create stops the move before any copy',
    () => {
      const { from, to } = folders();
      const parent = path.dirname(to);
      fs.mkdirSync(parent);
      fs.chmodSync(parent, 0o555);
      const before = snapshot(from);
      try {
        expect(() => moveFolder(from, to, { rename: crossDevice })).toThrow(
          `link could not create ${to}, so it copied nothing and left ${from} intact: EACCES`,
        );
      } finally {
        fs.chmodSync(parent, 0o755);
      }
      expect(snapshot(from)).toEqual(before);
      expect(fs.existsSync(to)).toBe(false);
    },
  );

  test('a copy whose source cannot then be removed says the copy holds every file', () => {
    const { from, to } = folders();
    const before = snapshot(from);
    // Removes one file, then fails, as a read-only subfolder would.
    const stopsPartWay = (target: string): never => {
      fs.rmSync(path.join(target, 'MEMORY.md'));
      throw new Error('EACCES: permission denied, unlink');
    };
    expect(() =>
      moveFolder(from, to, { rename: crossDevice, remove: stopsPartWay }),
    ).toThrow(
      `link copied every file to ${to}, then could not remove ${from}: EACCES: permission denied, unlink. Keep ${to}, which holds them all; a re-run moves what is left of ${from} beside it.`,
    );
    expect(relative(snapshot(to), to)).toEqual(relative(before, from));
  });

  // A snapshot's entries by their path inside `root`, sorted.
  const relative = (files: Map<string, string>, root: string): string[][] =>
    [...files]
      .map(([file, bytes]) => [path.relative(root, file), bytes])
      .sort(([a], [b]) => (a < b ? -1 : 1));
});
