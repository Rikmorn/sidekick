import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner } from './pm-data.js';
import type { ClaudeResult, ClaudeRunner } from './profile-launch.js';
import { recordsDir, writeRecord } from './worker-record.js';
import { runWorktreeCli, WORKTREE_USAGE_LINE } from './worktree.js';
import { skipListPath } from './worktree-ignored.js';

afterEach(removeTemps);

const NO_SESSIONS: ClaudeResult = {
  code: 0,
  stdout: '[]',
  stderr: '',
  timedOut: false,
};

function run(
  cwd: string,
  args: string[],
  claude: ClaudeResult = NO_SESSIONS,
  isAlive: (pid: number) => boolean = () => false,
) {
  const calls: { args: string[]; timeoutMs: number }[] = [];
  const runClaude: ClaudeRunner = (claudeArgs, opts) => {
    calls.push({ args: claudeArgs, timeoutMs: opts.timeoutMs });
    return claude;
  };
  const out: string[] = [];
  const err: string[] = [];
  const code = runWorktreeCli(
    args,
    { cwd, runGit: execRunner, runClaude, isAlive },
    (l) => out.push(l),
    (l) => err.push(l),
  );
  return { code, out, err, calls };
}

function addWorktree(main: string, name: string): string {
  const dir = path.join(tmp(), name);
  git(main, 'worktree', 'add', '-q', '-b', `worktree-${name}`, dir);
  return dir;
}

function commit(dir: string, file: string): string {
  fs.writeFileSync(path.join(dir, file), `${file}\n`);
  git(dir, 'add', file);
  git(dir, 'commit', '-q', '-m', file);
  return git(dir, 'rev-parse', 'HEAD');
}

const lineFor = (out: string[], name: string): string => {
  const line = out.find((l) => l.startsWith(`${name} · `));
  if (line === undefined) throw new Error(`no line for ${name}: ${out}`);
  return line;
};

describe('worktree list: one line per state', () => {
  test('a removable worktree names where its commits landed', () => {
    const main = repo();
    const dir = addWorktree(main, 'r10-x');
    const branch = git(main, 'branch', '--show-current');
    const { code, out } = run(main, ['list']);
    expect(code).toBe(0);
    expect(lineFor(out, 'r10-x')).toBe(
      `r10-x · removable · landed in ${branch} · worktree-r10-x · ${dir}`,
    );
    expect(out.at(-1)).toBe('remove one with: sidekick worktree remove <name>');
  });

  test('a folder gone with unlanded commits counts them', () => {
    const main = repo();
    const dir = addWorktree(main, 'old-y');
    commit(dir, 'b.txt');
    commit(dir, 'c.txt');
    commit(dir, 'd.txt');
    fs.rmSync(dir, { recursive: true, force: true });
    const { out } = run(main, ['list']);
    expect(lineFor(out, 'old-y')).toBe(
      `old-y · folder gone · only here, 3 commits · worktree-old-y · ${dir}`,
    );
    expect(out.at(-1)).toBe('remove one with: sidekick worktree remove <name>');
  });

  test('a dirty worktree names its files and where the commits were pushed', () => {
    const main = repo();
    const dir = addWorktree(main, 'feat');
    const head = commit(dir, 'b.txt');
    git(main, 'update-ref', 'refs/remotes/origin/feature-x', head);
    fs.writeFileSync(path.join(dir, 'scratch.sh'), 'echo\n');
    fs.writeFileSync(path.join(dir, 'notes.md'), 'n\n');
    const { out } = run(main, ['list']);
    const line = lineFor(out, 'feat');
    expect(line).toStartWith('feat · dirty: ');
    expect(line).toContain('scratch.sh');
    expect(line).toContain('notes.md');
    expect(line).toEndWith(
      ` · pushed to origin/feature-x · worktree-feat · ${dir}`,
    );
    expect(out.some((l) => l.startsWith('remove one with'))).toBe(false);
  });

  test('more than 20 untracked files give an exact count of the rest', () => {
    const main = repo();
    const dir = addWorktree(main, 'many');
    for (let i = 0; i < 25; i++) {
      fs.writeFileSync(
        path.join(dir, `f${String(i).padStart(2, '0')}.txt`),
        'x',
      );
    }
    const line = lineFor(run(main, ['list']).out, 'many');
    expect(line).toContain(', and 5 more · ');
    expect(line).not.toContain('at least');
    expect(line.split(', ').filter((p) => p.endsWith('.txt'))).toHaveLength(20);
  });

  test('more than 20 new ignored files give a lower bound', () => {
    const main = repo();
    fs.writeFileSync(path.join(main, '.gitignore'), '*.sh\n');
    git(main, 'add', '.gitignore');
    git(main, 'commit', '-q', '-m', 'ignore');
    const dir = addWorktree(main, 'many');
    for (let i = 0; i < 25; i++) {
      fs.writeFileSync(
        path.join(dir, `s${String(i).padStart(2, '0')}.sh`),
        'x',
      );
    }
    const line = lineFor(run(main, ['list']).out, 'many');
    expect(line).toContain(', and at least 1 more · ');
  });

  test("a worker's worktree points at finish and skips the commits", () => {
    const main = repo();
    const dir = path.join(main, '.claude', 'worktrees', 'w1');
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    git(main, 'worktree', 'add', '-q', '-b', 'worktree-w1', dir);
    writeRecord(path.join(main, '.git'), {
      version: 2,
      main: null,
      name: 'w1',
      job: null,
      brief: 'brief.md',
      dispatchedAt: '2026-11-05T00:00:00Z',
    });
    const { out } = run(main, ['list']);
    expect(lineFor(out, 'w1')).toBe(
      `w1 · a worker's: sidekick worker finish · worktree-w1 · ${dir}`,
    );
  });

  test('a lock naming a live pid holds the worktree', () => {
    const main = repo();
    const dir = addWorktree(main, 's');
    git(
      main,
      'worktree',
      'lock',
      '--reason',
      'claude session s (pid 4242 start 2026-11-05)',
      dir,
    );
    const { out } = run(main, ['list'], NO_SESSIONS, (pid) => pid === 4242);
    expect(lineFor(out, 's')).toBe(
      `s · held by pid 4242 · worktree-s · ${dir}`,
    );
    expect(out.some((l) => l.startsWith('remove one with'))).toBe(false);
  });

  test('a detached worktree says detached', () => {
    const main = repo();
    const dir = path.join(tmp(), 'det');
    git(main, 'worktree', 'add', '-q', '--detach', dir);
    const { out } = run(main, ['list']);
    expect(lineFor(out, 'det')).toEndWith(` · detached · ${dir}`);
  });
});

describe('worktree list: the frame', () => {
  test('the main checkout gets no row', () => {
    const main = repo();
    addWorktree(main, 'one');
    const { out } = run(main, ['list']);
    expect(out.filter((l) => l.includes(` · ${main}`))).toEqual([]);
  });

  test('no linked worktrees prints one line and no hint', () => {
    const main = repo();
    const { code, out } = run(main, ['list']);
    expect(code).toBe(0);
    expect(out).toEqual(['no linked worktrees']);
  });

  test('backup refs follow the rows, with their commit dates', () => {
    const main = repo();
    addWorktree(main, 'one');
    const head = git(main, 'rev-parse', 'HEAD');
    const ref = `refs/sidekick/landed/gone/${head}`;
    git(main, 'update-ref', ref, head);
    const date = git(main, 'log', '-1', '--format=%cs', head);
    const { out } = run(main, ['list']);
    const at = out.indexOf('backup refs:');
    expect(at).toBeGreaterThan(out.findIndex((l) => l.startsWith('one · ')));
    expect(out[at + 1]).toBe(`${ref} · commit dated ${date}`);
  });

  test('no backup refs prints no heading', () => {
    const main = repo();
    addWorktree(main, 'one');
    expect(run(main, ['list']).out).not.toContain('backup refs:');
  });

  test('a failing claude agents prints its warning first and holds clean rows', () => {
    const main = repo();
    addWorktree(main, 'one');
    const failed: ClaudeResult = {
      code: 1,
      stdout: '',
      stderr: 'boom',
      timedOut: false,
    };
    const { code, out } = run(main, ['list'], failed);
    expect(code).toBe(0);
    expect(out[0]).toStartWith(
      'claude agents failed, so every worktree that would otherwise read folder gone, dirty, or removable reads held, unknown: ',
    );
    expect(out[0]).toContain('boom');
    expect(lineFor(out, 'one')).toContain(
      'held, unknown: claude agents failed',
    );
  });

  test('a failing claude agents holds a folder gone too, and prints no hint', () => {
    const main = repo();
    const dir = addWorktree(main, 'old-y');
    fs.rmSync(dir, { recursive: true, force: true });
    const failed: ClaudeResult = {
      code: 1,
      stdout: '',
      stderr: 'boom',
      timedOut: false,
    };
    const { out } = run(main, ['list'], failed);
    expect(lineFor(out, 'old-y')).toBe(
      `old-y · held, unknown: claude agents failed · worktree-old-y · ${dir}`,
    );
    expect(out.some((l) => l.startsWith('remove one with'))).toBe(false);
  });

  test('a listing entry that is not an object holds a clean worktree and prints no hint', () => {
    const main = repo();
    const dir = addWorktree(main, 'one');
    const partial: ClaudeResult = { ...NO_SESSIONS, stdout: '[1]' };
    const { out } = run(main, ['list'], partial);
    const warning = "the listing's entry 0 is not an object";
    expect(out[0]).toBe(
      `claude agents gave a partial listing, so every worktree that would otherwise read folder gone, dirty, or removable reads held, unknown: ${warning}`,
    );
    expect(lineFor(out, 'one')).toBe(
      `one · held, unknown: claude agents gave a partial listing: ${warning} · worktree-one · ${dir}`,
    );
    expect(out.some((l) => l.startsWith('remove one with'))).toBe(false);
  });

  test('a listing row whose pid is not a number holds a clean worktree and prints no hint', () => {
    const main = repo();
    const dir = addWorktree(main, 'one');
    const row = {
      sessionId: 'abc123',
      pid: '99',
      kind: 'interactive',
      cwd: dir,
    };
    const partial: ClaudeResult = {
      ...NO_SESSIONS,
      stdout: JSON.stringify([row]),
    };
    const { out } = run(main, ['list'], partial);
    const warning = `the listing's entry 0 has a pid that is not a number: "99"`;
    expect(out[0]).toBe(
      `claude agents gave a partial listing, so every worktree that would otherwise read folder gone, dirty, or removable reads held, unknown: ${warning}`,
    );
    expect(lineFor(out, 'one')).toBe(
      `one · held, unknown: claude agents gave a partial listing: ${warning} · worktree-one · ${dir}`,
    );
    expect(out.some((l) => l.startsWith('remove one with'))).toBe(false);
  });

  test('an unreadable worker record holds a clean worktree, naming the record, and prints no hint', () => {
    const main = repo();
    const dir = addWorktree(main, 'one');
    const records = recordsDir(path.join(main, '.git'));
    fs.mkdirSync(records, { recursive: true });
    const broken = path.join(records, 'broken.json');
    fs.writeFileSync(broken, '{not json');
    const { out } = run(main, ['list']);
    expect(out[0]).toStartWith(broken);
    const line = lineFor(out, 'one');
    expect(line).toStartWith(
      `one · held, unknown: a worker record would not read: ${broken}`,
    );
    expect(line).toEndWith(` · worktree-one · ${dir}`);
    expect(out.some((l) => l.startsWith('remove one with'))).toBe(false);
  });

  test('the listing runs with a time limit', () => {
    const main = repo();
    const { calls } = run(main, ['list']);
    expect(calls).toHaveLength(1);
    expect(calls[0].timeoutMs).toBe(5_000);
    expect(calls[0].args).toContain('agents');
  });

  test('an unreadable skip list prints its warning before the rows', () => {
    const main = repo();
    addWorktree(main, 'one');
    const skips = skipListPath(path.join(main, '.git'));
    fs.mkdirSync(skips, { recursive: true });
    const { out } = run(main, ['list']);
    expect(out[0]).toContain(skips);
  });

  test('outside a repository it fails', () => {
    const { code, err } = run(tmp(), ['list']);
    expect(code).toBe(1);
    expect(err).toHaveLength(1);
  });
});

describe('worktree: usage', () => {
  test('an unknown verb prints the usage line and returns 1', () => {
    const { code, out, err } = run(repo(), ['frobnicate']);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual([`usage: ${WORKTREE_USAGE_LINE}`]);
  });

  test('no verb prints the usage line', () => {
    expect(run(repo(), []).err).toEqual([`usage: ${WORKTREE_USAGE_LINE}`]);
  });

  test('list takes no arguments', () => {
    const { code, err } = run(repo(), ['list', 'extra']);
    expect(code).toBe(1);
    expect(err).toEqual([`usage: ${WORKTREE_USAGE_LINE}`]);
  });
});
