import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import {
  mainCheckout,
  mergeKey,
  readKey,
  readKeyAt,
  SETTINGS_KEY,
  settingsState,
} from './memory-settings.js';
import { execRunner, type Runner } from './pm-data.js';

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

const REL = path.join('.claude', 'settings.local.json');
const mine = () => true;
const notMine = () => false;

/** A repo whose own `.git/info/exclude` ignores the settings file. */
function ignoringRepo(): string {
  const top = repo();
  fs.appendFileSync(path.join(top, '.git', 'info', 'exclude'), `${REL}\n`);
  return top;
}

function writeSettings(top: string, text: string): string {
  const file = path.join(top, REL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

/** Every path under `dir` with its kind, mode, and file text, for before-and-after equality. Skips `.git`. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string) => {
    for (const name of fs.readdirSync(current).sort()) {
      if (name === '.git') continue;
      const full = path.join(current, name);
      const stat = fs.lstatSync(full);
      const rel = path.relative(dir, full);
      if (stat.isSymbolicLink()) out[rel] = `link ${fs.readlinkSync(full)}`;
      else if (stat.isDirectory()) {
        out[rel] = `dir ${stat.mode & 0o777}`;
        if ((stat.mode & 0o500) === 0o500) walk(full);
      } else
        out[rel] =
          `file ${stat.mode & 0o777} ${fs.readFileSync(full, 'utf-8')}`;
    }
  };
  walk(dir);
  return out;
}

function issueOf(result: { issue: string } | object): string {
  if (!('issue' in result)) throw new Error('expected a refusal');
  return result.issue;
}

describe('mainCheckout', () => {
  test('gives the real root and every checkout from the root, a subdirectory, and a linked worktree', () => {
    const top = repo();
    const linked = path.join(tmp(), 'linked');
    git(top, 'worktree', 'add', '-q', linked);
    fs.mkdirSync(path.join(top, 'sub'));
    const home = tmp();
    for (const start of [top, path.join(top, 'sub'), linked]) {
      const found = mainCheckout(start, execRunner, home, mine);
      expect(found).toEqual({
        root: top,
        checkouts: expect.arrayContaining([top, fs.realpathSync(linked)]),
      });
    }
  });

  test('refuses a path outside git', () => {
    const outside = tmp();
    expect(issueOf(mainCheckout(outside, execRunner, tmp(), mine))).toContain(
      outside,
    );
  });

  test('refuses a repo whose git dir is not named .git', () => {
    const work = tmp();
    const gitDir = path.join(tmp(), 'store.git');
    git(work, 'init', '-q', `--separate-git-dir=${gitDir}`);
    expect(issueOf(mainCheckout(work, execRunner, tmp(), mine))).toContain(
      '.git',
    );
  });

  test('refuses a root equal to the home folder', () => {
    const top = repo();
    expect(issueOf(mainCheckout(top, execRunner, top, mine))).toContain('home');
  });

  test('refuses a root, .git, or .claude the user does not own', () => {
    const top = repo();
    fs.mkdirSync(path.join(top, '.claude'));
    const home = tmp();
    const only = (blocked: string) => (p: string) => p !== blocked;
    for (const blocked of [
      top,
      path.join(top, '.git'),
      path.join(top, '.claude'),
    ]) {
      const issue = issueOf(mainCheckout(top, execRunner, home, only(blocked)));
      expect(issue).toContain(blocked);
    }
    expect(issueOf(mainCheckout(top, execRunner, home, notMine))).toContain(
      'own',
    );
  });

  test('passes when .claude is absent', () => {
    const top = repo();
    const seen: string[] = [];
    const found = mainCheckout(top, execRunner, tmp(), (p) => {
      seen.push(p);
      return true;
    });
    expect('root' in found).toBe(true);
    expect(seen).toEqual([top, path.join(top, '.git')]);
  });

  test('checks ownership with the process uid by default', () => {
    const top = repo();
    expect('root' in mainCheckout(top, execRunner, tmp())).toBe(true);
  });

  test('each refusal names a way forward', () => {
    const outside = tmp();
    expect(issueOf(mainCheckout(outside, execRunner, tmp(), mine))).toBe(
      `${outside} has no main checkout: it is not inside a git repository; run the command on a path inside one`,
    );
    const top = repo();
    const listFails: Runner = (cmd, args, cwd) =>
      args[0] === 'worktree'
        ? { code: 128, stdout: '', stderr: 'fatal: broken' }
        : execRunner(cmd, args, cwd);
    const listed = issueOf(mainCheckout(top, listFails, tmp(), mine));
    expect(listed).toBe(
      `${top} has no main checkout, since git worktree list failed there: fatal: broken; fix what git reports, then run the command again`,
    );
    expect(listed).not.toContain('no children show');
    const work = tmp();
    const gitDir = path.join(tmp(), 'g.git');
    git(work, 'init', '-q', `--separate-git-dir=${gitDir}`);
    expect(issueOf(mainCheckout(work, execRunner, tmp(), mine))).toBe(
      `${work} is in a repo whose git dir is ${gitDir}, not a folder named .git. Claude Code then does not find its main checkout, so sidekick cannot link the repo. To ask for support, run: gh issue create -R Rikmorn/sidekick --title 'memory link: a repo whose git dir is not .git' --body 'sidekick memory link refuses a repo whose git dir is not a folder named .git, such as one made with git init --separate-git-dir.'`,
    );
    expect(issueOf(mainCheckout(top, execRunner, top, mine))).toEndWith(
      '; run the command on a path inside another repo',
    );
    expect(issueOf(mainCheckout(top, execRunner, tmp(), notMine))).toEndWith(
      `; change the owner of ${top} to you, then run the command again`,
    );
  });

  // The first line git prints for each failure, as `git rev-parse` words it.
  const revParseFails =
    (stderr: string): Runner =>
    () => ({ code: 128, stdout: '', stderr });

  test('a git rev-parse failure other than an outside-every-repository one quotes git', () => {
    const work = tmp();
    const dubious = revParseFails(
      `fatal: detected dubious ownership in repository at '${work}'\nTo add an exception for this directory, call:\n`,
    );
    expect(issueOf(mainCheckout(work, dubious, tmp(), mine))).toBe(
      `${work} has no main checkout, since git rev-parse failed there: fatal: detected dubious ownership in repository at '${work}'; fix what git reports, then run the command again`,
    );
  });

  test('"not a git repository", a silent failure, or a path that is no folder reads as outside git', () => {
    const work = tmp();
    const outside = `${work} has no main checkout: it is not inside a git repository; run the command on a path inside one`;
    const notARepo = revParseFails(
      'fatal: not a git repository (or any of the parent directories): .git\n',
    );
    expect(issueOf(mainCheckout(work, notARepo, tmp(), mine))).toBe(outside);
    expect(issueOf(mainCheckout(work, revParseFails(''), tmp(), mine))).toBe(
      outside,
    );
    // A missing folder fails the spawn itself, so the runner speaks, not git.
    const gone = path.join(work, 'gone');
    const spawnFails = revParseFails('spawnSync git ENOENT');
    expect(issueOf(mainCheckout(gone, spawnFails, tmp(), mine))).toBe(
      `${gone} has no main checkout: it is not inside a git repository; run the command on a path inside one`,
    );
  });
});

describe('settingsState', () => {
  test('reads a missing file as an empty object', () => {
    const top = ignoringRepo();
    expect(settingsState(top, execRunner)).toEqual({
      kind: 'ready',
      file: path.join(top, REL),
      text: '',
      settings: {},
      key: undefined,
    });
  });

  test('reads a whitespace-only file as an empty object, keeping its text', () => {
    const top = ignoringRepo();
    writeSettings(top, ' \n\t\n');
    expect(settingsState(top, execRunner)).toMatchObject({
      kind: 'ready',
      text: ' \n\t\n',
      settings: {},
      key: undefined,
    });
  });

  test('reads the key and the other entries of an ignored file', () => {
    const top = ignoringRepo();
    const text =
      '{"permissions":{"allow":["Bash(ls)"]},"autoMemoryDirectory":"/s/r"}';
    writeSettings(top, text);
    expect(settingsState(top, execRunner)).toMatchObject({
      kind: 'ready',
      text,
      key: '/s/r',
      settings: { permissions: { allow: ['Bash(ls)'] } },
    });
  });

  test('refuses a file git does not ignore, naming the line to add to the main checkout .gitignore', () => {
    const top = repo();
    writeSettings(top, '{}');
    const state = settingsState(top, execRunner);
    expect(state.kind).toBe('refused');
    if (state.kind === 'refused') {
      expect(state.issue).toContain(
        `In the main checkout, add this line to '${top}/.gitignore': ${REL}`,
      );
      expect(state.issue.endsWith(`: ${REL}`)).toBe(true);
    }
  });

  test('refuses a tracked file, with the untrack command to run in the main checkout, which a worktree cannot do', () => {
    const top = ignoringRepo();
    const file = writeSettings(top, '{}');
    git(top, 'add', '-f', file);
    git(top, 'commit', '-q', '-m', 'track');
    const state = settingsState(top, execRunner);
    expect(state.kind).toBe('refused');
    if (state.kind === 'refused') {
      expect(state.issue).toContain('tracked');
      expect(state.issue).toContain(
        `In the main checkout, '${top}', untrack it with: git rm --cached -- ${REL}`,
      );
      expect(state.issue.endsWith(`git rm --cached -- ${REL}`)).toBe(true);
      expect(state.issue).not.toContain('git -C');
    }
  });

  test('refuses when git check-ignore fails, with what git said and a way forward', () => {
    const top = repo();
    const runGit: Runner = (cmd, args, cwd) =>
      args[0] === 'check-ignore'
        ? { code: 128, stdout: '', stderr: 'fatal: index file corrupt\n' }
        : execRunner(cmd, args, cwd);
    const state = settingsState(top, runGit);
    expect(state).toEqual({
      kind: 'refused',
      issue: `git check-ignore failed in ${top}: fatal: index file corrupt. Fix what git reports there, then run the command again`,
    });
    const silent: Runner = (cmd, args, cwd) =>
      args[0] === 'check-ignore'
        ? { code: 128, stdout: '', stderr: '' }
        : execRunner(cmd, args, cwd);
    expect(issueOf(settingsState(top, silent))).toContain('exit code 128');
  });

  test('refuses a settings file it cannot read, with a way forward', () => {
    const top = ignoringRepo();
    fs.mkdirSync(path.join(top, REL), { recursive: true });
    const issue = issueOf(settingsState(top, execRunner));
    expect(issue).toContain(`${path.join(top, REL)} cannot be read`);
    expect(issue).toContain(
      'make it a readable file and run the command again',
    );
  });

  test('quotes the root in a printed command when it holds a space', () => {
    const base = tmp();
    const top = path.join(base, 'my repo');
    fs.mkdirSync(top);
    git(top, 'init', '-q');
    git(top, 'config', 'core.excludesFile', path.join(base, 'no-excludes'));
    writeSettings(top, '{}');
    const state = settingsState(top, execRunner);
    expect(state.kind).toBe('refused');
    if (state.kind === 'refused')
      expect(state.issue).toContain(`'${top}/.gitignore'`);
  });

  test.each([
    ['invalid JSON', '{nope'],
    ['an array', '[]'],
    ['null', 'null'],
    ['a string', '"x"'],
  ])('refuses %s', (_name, text) => {
    const top = ignoringRepo();
    writeSettings(top, text);
    const state = settingsState(top, execRunner);
    expect(state.kind).toBe('refused');
    if (state.kind === 'refused') expect(state.issue).toContain(REL);
  });

  test('refuses a key that is not a string', () => {
    const top = ignoringRepo();
    writeSettings(top, '{"autoMemoryDirectory": 5}');
    const state = settingsState(top, execRunner);
    expect(state.kind).toBe('refused');
    if (state.kind === 'refused') expect(state.issue).toContain(SETTINGS_KEY);
  });
});

describe('mergeKey', () => {
  test('creates .claude and the file when absent', () => {
    const top = ignoringRepo();
    const file = path.join(top, REL);
    expect(mergeKey(file, '/s/r', '')).toEqual({ ok: true });
    expect(fs.readFileSync(file, 'utf-8')).toBe(
      '{\n  "autoMemoryDirectory": "/s/r"\n}\n',
    );
  });

  test('keeps a permissions block, a nested object, and the key order', () => {
    const top = ignoringRepo();
    const original = {
      permissions: { allow: ['Bash(ls)'], deny: [] },
      nested: { a: { b: [1, 2, { c: null }] } },
      model: 'x',
    };
    const file = writeSettings(top, JSON.stringify(original));
    const expected = fs.readFileSync(file, 'utf-8');
    expect(mergeKey(file, '/s/r', expected)).toEqual({ ok: true });
    const after = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(after).toEqual({ ...original, autoMemoryDirectory: '/s/r' });
    expect(Object.keys(after)).toEqual([
      ...Object.keys(original),
      SETTINGS_KEY,
    ]);
  });

  test('keeps an own __proto__ entry', () => {
    const top = ignoringRepo();
    const file = writeSettings(top, '{"__proto__":{"x":1},"a":2}');
    const expected = fs.readFileSync(file, 'utf-8');
    expect(mergeKey(file, '/s/r', expected)).toEqual({ ok: true });
    expect(fs.readFileSync(file, 'utf-8')).toContain('"__proto__"');
  });

  test('keeps the existing file permission bits and leaves no temporary file', () => {
    const top = ignoringRepo();
    const file = writeSettings(top, '{}');
    fs.chmodSync(file, 0o600);
    expect(mergeKey(file, '/s/r', '{}')).toEqual({ ok: true });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(path.dirname(file))).toEqual(['settings.local.json']);
  });

  test('skips the write of a key already equal', () => {
    const top = ignoringRepo();
    const text = '{"autoMemoryDirectory":"/s/r"}';
    const file = writeSettings(top, text);
    expect(mergeKey(file, '/s/r', text)).toEqual({ ok: true });
    expect(fs.readFileSync(file, 'utf-8')).toBe(text);
  });

  test('retries once on a file changed after it was read, keeping the new entry', () => {
    const top = ignoringRepo();
    const file = writeSettings(top, '{"a":1}');
    const stale = fs.readFileSync(file, 'utf-8');
    fs.writeFileSync(file, '{"a":1,"permissions":{"allow":["x"]}}');
    expect(mergeKey(file, '/s/r', stale)).toEqual({ ok: true });
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({
      a: 1,
      permissions: { allow: ['x'] },
      autoMemoryDirectory: '/s/r',
    });
  });

  test('retries when the file appeared after it was read as absent', () => {
    const top = ignoringRepo();
    const file = writeSettings(top, '{"a":1}');
    expect(mergeKey(file, '/s/r', '')).toEqual({ ok: true });
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({
      a: 1,
      autoMemoryDirectory: '/s/r',
    });
  });

  test('refuses, writing nothing, when the file changes again before the rename', () => {
    const top = ignoringRepo();
    const file = writeSettings(top, '{"a":1}');
    const stale = fs.readFileSync(file, 'utf-8');
    fs.writeFileSync(file, '{"a":1,"b":2}');
    const changed = '{"a":1,"b":2,"c":3}';
    const result = mergeKey(file, '/s/r', stale, () =>
      fs.writeFileSync(file, changed),
    );
    expect(result.ok).toBe(false);
    expect(fs.readFileSync(file, 'utf-8')).toBe(changed);
    expect(fs.readdirSync(path.dirname(file))).toEqual(['settings.local.json']);
  });

  test('refuses a file that stopped being a JSON object', () => {
    const top = ignoringRepo();
    const file = writeSettings(top, '[1]');
    const result = mergeKey(file, '/s/r', '{}');
    expect(result.ok).toBe(false);
    expect(fs.readFileSync(file, 'utf-8')).toBe('[1]');
  });

  test('refuses a file that now holds the key with another value', () => {
    const top = ignoringRepo();
    const text = '{"autoMemoryDirectory":"/other"}';
    const file = writeSettings(top, text);
    const result = mergeKey(file, '/s/r', '{}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue).toContain('/other');
    expect(fs.readFileSync(file, 'utf-8')).toBe(text);
  });

  test('refuses and removes its temporary file when the re-read fails after the temp write', () => {
    const top = ignoringRepo();
    const file = writeSettings(top, '{"a":1}');
    const result = mergeKey(file, '/s/r', '{"a":1}', () => {
      fs.rmSync(file);
      fs.mkdirSync(file);
    });
    expect(result.ok).toBe(false);
    expect(fs.readdirSync(path.dirname(file))).toEqual(['settings.local.json']);
  });

  test('refuses and removes its temporary file when the rename fails', () => {
    const top = ignoringRepo();
    const file = writeSettings(top, '');
    const folder = path.dirname(file);
    // The temporary file vanishes after the write, so the rename throws.
    const result = mergeKey(file, '/s/r', '', () => {
      for (const name of fs.readdirSync(folder)) {
        if (name.endsWith('.tmp')) fs.rmSync(path.join(folder, name));
      }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issue).toContain('cannot be written');
      expect(result.issue).toEndWith(
        `; check that ${folder} is writable, then run the command again`,
      );
    }
    expect(fs.readdirSync(folder)).toEqual(['settings.local.json']);
  });

  describe('a symlinked settings file', () => {
    function link(top: string, targetText?: string) {
      const store = tmp('store-');
      const target = path.join(store, 'settings.json');
      if (targetText !== undefined) fs.writeFileSync(target, targetText);
      const file = path.join(top, REL);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.symlinkSync(target, file);
      return { file, target, store };
    }

    test('keeps the link and writes the key and every other entry to its target', () => {
      const top = ignoringRepo();
      const original = { permissions: { allow: ['Bash(ls)'] }, model: 'x' };
      const { file, target } = link(top, JSON.stringify(original));
      const expected = fs.readFileSync(file, 'utf-8');
      expect(mergeKey(file, '/s/r', expected)).toEqual({ ok: true });
      expect(fs.lstatSync(file).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(file)).toBe(target);
      expect(JSON.parse(fs.readFileSync(target, 'utf-8'))).toEqual({
        ...original,
        autoMemoryDirectory: '/s/r',
      });
    });

    test('puts its temporary file in the target folder and leaves nothing behind', () => {
      const top = ignoringRepo();
      const { file, target, store } = link(top, '{"a":1}');
      let linkFolder: string[] = [];
      let storeFolder: string[] = [];
      const result = mergeKey(file, '/s/r', '{"a":1}', () => {
        linkFolder = fs.readdirSync(path.dirname(file));
        storeFolder = fs.readdirSync(store);
      });
      expect(result).toEqual({ ok: true });
      expect(linkFolder).toEqual(['settings.local.json']);
      expect(storeFolder.some((name) => name.endsWith('.tmp'))).toBe(true);
      expect(fs.readdirSync(store)).toEqual([path.basename(target)]);
      expect(fs.readdirSync(path.dirname(file))).toEqual([
        'settings.local.json',
      ]);
    });

    test('keeps the target file permission bits', () => {
      const top = ignoringRepo();
      const { file, target } = link(top, '{}');
      fs.chmodSync(target, 0o600);
      expect(mergeKey(file, '/s/r', '{}')).toEqual({ ok: true });
      expect(fs.statSync(target).mode & 0o777).toBe(0o600);
    });

    test('refuses a dangling link, naming it, and creates nothing', () => {
      const top = ignoringRepo();
      const { file, target, store } = link(top);
      const result = mergeKey(file, '/s/r', '');
      expect(result.ok).toBe(false);
      expect(issueOf(result)).toContain(file);
      expect(issueOf(result)).toContain('dangling');
      expect(fs.existsSync(target)).toBe(false);
      expect(fs.readdirSync(store)).toEqual([]);
      expect(fs.lstatSync(file).isSymbolicLink()).toBe(true);
    });

    test('refuses a symlink loop, naming it and one way forward, and leaves the folder as it was', () => {
      const top = ignoringRepo();
      const file = path.join(top, REL);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.symlinkSync(file, file);
      const before = snapshot(top);
      const result = mergeKey(file, '/s/r', '');
      expect(result.ok).toBe(false);
      const issue = issueOf(result);
      expect(issue).toContain(file);
      expect(issue).toContain('symlink loop');
      expect(issue).toEndWith('; remove the link, then run the command again');
      expect(snapshot(top)).toEqual(before);
    });
  });

  describe('a settings path that cannot be resolved', () => {
    const WAY_FORWARD =
      '; make every folder on its path a readable folder, then run the command again';

    test('refuses a parent that is a file without calling it a link, and changes nothing', () => {
      const top = ignoringRepo();
      fs.writeFileSync(path.join(top, '.claude'), 'not a folder');
      const file = path.join(top, REL);
      const before = snapshot(top);
      const result = mergeKey(file, '/s/r', '');
      expect(result.ok).toBe(false);
      const issue = issueOf(result);
      expect(issue).toContain(file);
      expect(issue).toContain('cannot be resolved');
      expect(issue).not.toContain('link');
      expect(issue).toEndWith(WAY_FORWARD);
      expect(snapshot(top)).toEqual(before);
    });

    test.skipIf(process.getuid?.() === 0)(
      'refuses a folder it cannot read, with one way forward, and changes nothing (skipped as root: permissions do not bind root)',
      () => {
        const top = ignoringRepo();
        const file = writeSettings(top, '{}');
        const folder = path.dirname(file);
        const before = snapshot(top);
        fs.chmodSync(folder, 0o000);
        try {
          const result = mergeKey(file, '/s/r', '{}');
          expect(result.ok).toBe(false);
          const issue = issueOf(result);
          expect(issue).toContain('cannot be resolved');
          expect(issue).toContain('EACCES');
          expect(issue).toEndWith(WAY_FORWARD);
        } finally {
          fs.chmodSync(folder, 0o755);
        }
        expect(snapshot(top)).toEqual(before);
      },
    );
  });

  describe('an unwritable .claude folder', () => {
    test.skipIf(process.getuid?.() === 0)(
      'refuses with the folder named, leaves no temporary file, and keeps the file (skipped as root: permissions do not bind root)',
      () => {
        const top = ignoringRepo();
        const file = writeSettings(top, '{"a":1}');
        const folder = path.dirname(file);
        const before = snapshot(top);
        fs.chmodSync(folder, 0o555);
        try {
          const result = mergeKey(file, '/s/r', '{"a":1}');
          expect(result.ok).toBe(false);
          const issue = issueOf(result);
          expect(issue).toContain('cannot be written');
          expect(issue).toEndWith(
            `; check that ${folder} is writable, then run the command again`,
          );
        } finally {
          fs.chmodSync(folder, 0o755);
        }
        expect(snapshot(top)).toEqual(before);
      },
    );

    test.skipIf(process.getuid?.() === 0)(
      'refuses when the file is absent too, and creates nothing (skipped as root: permissions do not bind root)',
      () => {
        const top = ignoringRepo();
        const folder = path.join(top, '.claude');
        fs.mkdirSync(folder);
        const before = snapshot(top);
        fs.chmodSync(folder, 0o555);
        try {
          const result = mergeKey(
            path.join(folder, 'settings.local.json'),
            '/s/r',
            '',
          );
          expect(result.ok).toBe(false);
          expect(issueOf(result)).toContain('cannot be written');
        } finally {
          fs.chmodSync(folder, 0o755);
        }
        expect(snapshot(top)).toEqual(before);
      },
    );
  });
});

// Settings text that holds no usable key; undefined means no file.
const NO_KEY: Array<[string, string | undefined]> = [
  ['a missing file', undefined],
  ['invalid JSON', '{nope'],
  ['a non-string key', '{"autoMemoryDirectory":3}'],
  ['an empty file', ''],
  ['an array', '[]'],
];

describe('readKeyAt', () => {
  test('reads the key under a folder that is not a repo, so it needs no git', () => {
    const top = tmp();
    writeSettings(top, '{"autoMemoryDirectory":"/s/r"}');
    expect(readKeyAt(top)).toBe('/s/r');
  });

  test.each(NO_KEY)('gives undefined for %s', (_name, text) => {
    const top = tmp();
    if (text !== undefined) writeSettings(top, text);
    expect(readKeyAt(top)).toBeUndefined();
  });
});

describe('readKey', () => {
  test('gives the key from the main checkout, from a linked worktree too', () => {
    const top = ignoringRepo();
    writeSettings(top, '{"autoMemoryDirectory":"/s/r"}');
    const linked = path.join(tmp(), 'linked');
    git(top, 'worktree', 'add', '-q', linked);
    expect(readKey(top, execRunner)).toBe('/s/r');
    expect(readKey(linked, execRunner)).toBe('/s/r');
  });

  test('gives undefined outside git', () => {
    expect(readKey(tmp(), execRunner)).toBeUndefined();
  });

  test.each(NO_KEY)('gives undefined for %s', (_name, text) => {
    const top = ignoringRepo();
    if (text !== undefined) writeSettings(top, text);
    expect(readKey(top, execRunner)).toBeUndefined();
  });
});
