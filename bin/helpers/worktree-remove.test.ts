import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner, type Runner, type RunResult } from './pm-data.js';
import type { ClaudeResult, ClaudeRunner } from './profile-launch.js';
import { recordsDir, writeRecord } from './worker-record.js';
import { refSegment } from './worker-teardown.js';
import { runWorktreeCli, WORKTREE_USAGE_LINE } from './worktree.js';
import { skipListPath } from './worktree-ignored.js';
import { parseRemoveArgs } from './worktree-remove.js';

afterEach(removeTemps);

const claudeSays = (stdout: string, code = 0): ClaudeResult => ({
  code,
  stdout,
  stderr: '',
  timedOut: false,
});

const NO_SESSIONS = claudeSays('[]');
const SESSION_LOCK = 'claude session s (pid 4242 start 2026-11-05)';

interface Fakes {
  /** What `claude agents` prints, per call. */
  listing?: (call: number) => ClaudeResult;
  /** What `claude rm` prints; it may change the repo first. */
  rm?: () => ClaudeResult;
  isAlive?: (pid: number) => boolean;
  /** Answers a git call in place of git, or runs a side effect first. */
  git?: (args: string[]) => RunResult | undefined;
}

function run(cwd: string, args: string[], fakes: Fakes = {}) {
  const events: string[] = [];
  const rmTimeouts: number[] = [];
  let listings = 0;
  const runClaude: ClaudeRunner = (claudeArgs, opts) => {
    events.push(`claude ${claudeArgs.join(' ')}`);
    if (claudeArgs[0] === 'rm') {
      rmTimeouts.push(opts.timeoutMs);
      return fakes.rm?.() ?? claudeSays('removed');
    }
    listings += 1;
    return fakes.listing?.(listings) ?? NO_SESSIONS;
  };
  const runGit: Runner = (cmd, gitArgs, at) => {
    events.push(`git ${gitArgs.join(' ')}`);
    return fakes.git?.(gitArgs) ?? execRunner(cmd, gitArgs, at);
  };
  const out: string[] = [];
  const err: string[] = [];
  const code = runWorktreeCli(
    ['remove', ...args],
    {
      cwd,
      runGit,
      runClaude,
      isAlive: fakes.isAlive ?? (() => false),
      env: {},
    },
    (l) => out.push(l),
    (l) => err.push(l),
  );
  return { code, out, err, events, rmTimeouts };
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

const backupRefs = (main: string): string[] =>
  git(main, 'for-each-ref', '--format=%(refname)', 'refs/sidekick/')
    .split('\n')
    .filter((line) => line !== '');

const branchExists = (main: string, branch: string): boolean =>
  git(main, 'branch', '--list', branch) !== '';

const listed = (main: string, dir: string): boolean =>
  git(main, 'worktree', 'list', '--porcelain').includes(`worktree ${dir}\n`);

// A refusal leaves the worktree, its branch, and the refs as they were.
function expectUntouched(main: string, dir: string, branch: string): void {
  expect(listed(main, dir)).toBe(true);
  expect(branchExists(main, branch)).toBe(true);
  expect(backupRefs(main)).toEqual([]);
}

const joined = (lines: string[]): string => lines.join('\n');

describe('worktree remove: removes', () => {
  test('a clean landed worktree, keeping a landed backup ref', () => {
    const main = repo();
    const dir = addWorktree(main, 'r10-x');
    const head = git(dir, 'rev-parse', 'HEAD');
    const { code, out, err } = run(main, ['r10-x']);
    expect(err).toEqual([]);
    expect(code).toBe(0);
    const ref = `refs/sidekick/landed/r10-x/${head}`;
    expect(backupRefs(main)).toEqual([ref]);
    expect(git(main, 'rev-parse', ref)).toBe(head);
    expect(listed(main, dir)).toBe(false);
    expect(fs.existsSync(dir)).toBe(false);
    expect(branchExists(main, 'worktree-r10-x')).toBe(false);
    expect(out).toEqual([
      `worktree ${dir} removed`,
      'branch worktree-r10-x removed',
      `restore with: git branch worktree-r10-x ${ref}`,
    ]);
  });

  test('a pushed but unlanded worktree, keeping a pushed backup ref', () => {
    const main = repo();
    const dir = addWorktree(main, 'feat');
    const head = commit(dir, 'b.txt');
    git(main, 'update-ref', 'refs/remotes/origin/feature-x', head);
    const { code, out } = run(main, ['feat']);
    expect(code).toBe(0);
    const ref = `refs/sidekick/pushed/feat/${head}`;
    expect(backupRefs(main)).toEqual([ref]);
    expect(branchExists(main, 'worktree-feat')).toBe(false);
    expect(out.at(-1)).toBe(`restore with: git branch worktree-feat ${ref}`);
  });

  test('a folder-gone, dead-locked, unlanded worktree with --discard', () => {
    const main = repo();
    const dir = addWorktree(main, 'old-y');
    commit(dir, 'b.txt');
    const head = commit(dir, 'c.txt');
    git(main, 'worktree', 'lock', '--reason', SESSION_LOCK, dir);
    fs.rmSync(dir, { recursive: true, force: true });
    const { code, out, err } = run(main, ['old-y', '--discard']);
    expect(err).toEqual([]);
    expect(code).toBe(0);
    const ref = `refs/sidekick/discarded/old-y/${head}`;
    expect(backupRefs(main)).toEqual([ref]);
    expect(git(main, 'rev-parse', ref)).toBe(head);
    expect(listed(main, dir)).toBe(false);
    expect(branchExists(main, 'worktree-old-y')).toBe(false);
    expect(out.at(-1)).toBe(`restore with: git branch worktree-old-y ${ref}`);
  });

  test('by its path, from inside another linked worktree', () => {
    const main = repo();
    const dir = addWorktree(main, 'r10-x');
    const other = addWorktree(main, 'other');
    const { code } = run(other, [dir]);
    expect(code).toBe(0);
    expect(listed(main, dir)).toBe(false);
  });

  test('a detached worktree keeps its commit and deletes no branch', () => {
    const main = repo();
    const dir = path.join(tmp(), 'det');
    git(main, 'worktree', 'add', '-q', '--detach', dir);
    const head = git(dir, 'rev-parse', 'HEAD');
    const { code, out, events } = run(main, ['det']);
    expect(code).toBe(0);
    const ref = `refs/sidekick/landed/det/${head}`;
    expect(backupRefs(main)).toEqual([ref]);
    expect(events.some((e) => e.startsWith('git update-ref -d'))).toBe(false);
    expect(out).toEqual([
      `worktree ${dir} removed`,
      `restore with: git branch det ${ref}`,
    ]);
  });

  test('a worktree on master, keeping the branch with its commits only here in a kept backup ref, with no --discard', () => {
    const main = repo();
    git(main, 'checkout', '-q', '-b', 'develop');
    git(main, 'branch', '-f', 'master', 'develop');
    const dir = path.join(tmp(), 'm1');
    git(main, 'worktree', 'add', '-q', dir, 'master');
    const head = commit(dir, 'b.txt');
    const { code, out, err } = run(main, ['m1']);
    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(listed(main, dir)).toBe(false);
    expect(fs.existsSync(dir)).toBe(false);
    expect(git(main, 'rev-parse', 'master')).toBe(head);
    const ref = `refs/sidekick/kept/m1/${head}`;
    expect(backupRefs(main)).toEqual([ref]);
    expect(out).toEqual([
      `worktree ${dir} removed`,
      'branch master kept: remove deletes only worktree-m1 or a branch sidekick worktree move made for this worktree',
      `restore with: git branch m1 ${ref}`,
    ]);
  });

  test('a worktree on feature-x, keeping the branch with its commits only here, and deleting no branch', () => {
    const main = repo();
    const dir = path.join(tmp(), 'feat');
    git(main, 'worktree', 'add', '-q', '-b', 'feature-x', dir);
    const head = commit(dir, 'b.txt');
    const { code, out, events } = run(main, ['feat']);
    expect(code).toBe(0);
    expect(listed(main, dir)).toBe(false);
    expect(git(main, 'rev-parse', 'feature-x')).toBe(head);
    expect(backupRefs(main)).toEqual([`refs/sidekick/kept/feat/${head}`]);
    expect(events.some((e) => e.startsWith('git update-ref -d'))).toBe(false);
    expect(out.at(-2)).toBe(
      'branch feature-x kept: remove deletes only worktree-feat or a branch sidekick worktree move made for this worktree',
    );
  });

  test('a worktree on a kept branch whose commits landed gets a landed backup ref', () => {
    const main = repo();
    const dir = path.join(tmp(), 'feat');
    git(main, 'worktree', 'add', '-q', '-b', 'feature-x', dir);
    const head = git(dir, 'rev-parse', 'HEAD');
    const { code } = run(main, ['feat']);
    expect(code).toBe(0);
    expect(backupRefs(main)).toEqual([`refs/sidekick/landed/feat/${head}`]);
    expect(git(main, 'rev-parse', 'feature-x')).toBe(head);
  });

  test('a kept branch claude rm deletes stays in its backup ref, written before claude rm runs', () => {
    const main = repo();
    const dir = path.join(tmp(), 'feat');
    git(main, 'worktree', 'add', '-q', '-b', 'feature-x', dir);
    const head = commit(dir, 'b.txt');
    const row = { id: 'job1', kind: 'background', state: 'done', cwd: dir };
    const { code, events } = run(main, ['feat'], {
      listing: () => claudeSays(JSON.stringify([row])),
      rm: () => {
        git(main, 'worktree', 'remove', dir);
        git(main, 'update-ref', '-d', 'refs/heads/feature-x');
        return claudeSays('removed job1');
      },
    });
    expect(code).toBe(0);
    const ref = `refs/sidekick/kept/feat/${head}`;
    const backup = events.indexOf(`git update-ref ${ref} ${head} `);
    expect(backup).toBeGreaterThan(-1);
    expect(events.indexOf('claude rm job1')).toBeGreaterThan(backup);
    expect(branchExists(main, 'feature-x')).toBe(false);
    expect(git(main, 'rev-parse', ref)).toBe(head);
  });

  test('a worktree on a kept branch whose commits remove cannot place, with no --discard', () => {
    const main = repo();
    git(main, 'checkout', '-q', '--detach');
    const dir = path.join(tmp(), 'feat');
    git(main, 'worktree', 'add', '-q', '-b', 'feature-x', dir);
    const head = commit(dir, 'b.txt');
    const rows: string[] = [];
    const env = {
      cwd: main,
      runGit: execRunner,
      runClaude: () => NO_SESSIONS,
      isAlive: () => false,
      env: {},
    };
    runWorktreeCli(
      ['list'],
      env,
      (l) => rows.push(l),
      () => {},
    );
    expect(rows.find((l) => l.startsWith('feat · '))).toContain(
      'commits unknown',
    );
    const { code, err } = run(main, ['feat']);
    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(listed(main, dir)).toBe(false);
    expect(git(main, 'rev-parse', 'feature-x')).toBe(head);
    expect(backupRefs(main)).toEqual([`refs/sidekick/kept/feat/${head}`]);
  });

  test("the branch's config section goes with the branch", () => {
    const main = repo();
    addWorktree(main, 'cfg');
    git(main, 'config', 'branch.worktree-cfg.remote', 'origin');
    expect(run(main, ['cfg']).code).toBe(0);
    expect(() =>
      git(main, 'config', '--get', 'branch.worktree-cfg.remote'),
    ).toThrow();
  });
});

describe('worktree remove: refuses', () => {
  test('an unlanded worktree without --discard, naming the count and the flag', () => {
    const main = repo();
    const dir = addWorktree(main, 'old-y');
    commit(dir, 'b.txt');
    commit(dir, 'c.txt');
    git(main, 'worktree', 'lock', '--reason', SESSION_LOCK, dir);
    fs.rmSync(dir, { recursive: true, force: true });
    const { code, err } = run(main, ['old-y']);
    expect(code).toBe(1);
    expect(joined(err)).toContain('2 commits');
    expect(joined(err)).toContain('--discard');
    expectUntouched(main, dir, 'worktree-old-y');
  });

  test('a worktree held by a live lock, naming its pid', () => {
    const main = repo();
    const dir = addWorktree(main, 's');
    git(main, 'worktree', 'lock', '--reason', SESSION_LOCK, dir);
    const { code, err } = run(main, ['s'], { isAlive: (pid) => pid === 4242 });
    expect(code).toBe(1);
    expect(joined(err)).toContain('held by pid 4242');
    expectUntouched(main, dir, 'worktree-s');
  });

  test('a worktree locked by something other than a claude session, though its pid is dead', () => {
    const main = repo();
    const dir = addWorktree(main, 's');
    const reason = 'backup job (pid 4242 start 2026-11-05)';
    git(main, 'worktree', 'lock', '--reason', reason, dir);
    const { code, err, events } = run(main, ['s']);
    expect(code).toBe(1);
    expect(joined(err)).toContain(`held by lock: ${reason}`);
    expect(events.some((e) => e.startsWith('git worktree unlock'))).toBe(false);
    expectUntouched(main, dir, 'worktree-s');
  });

  test('a worktree a current session sits in, with no lock', () => {
    const main = repo();
    const dir = addWorktree(main, 'hand');
    const row = { sessionId: 'abc123', pid: 99, cwd: path.join(dir, 'sub') };
    const { code, err } = run(main, ['hand'], {
      listing: () => claudeSays(JSON.stringify([row])),
    });
    expect(code).toBe(1);
    expect(joined(err)).toContain('held by session abc123');
    expectUntouched(main, dir, 'worktree-hand');
  });

  test('a current session that lists no cwd, since it may sit in the worktree', () => {
    const main = repo();
    const dir = addWorktree(main, 'hand');
    const row = { sessionId: 'abc123', pid: 99, kind: 'interactive' };
    const { code, err } = run(main, ['hand'], {
      listing: () => claudeSays(JSON.stringify([row])),
    });
    expect(code).toBe(1);
    expect(joined(err)).toContain(
      'held, unknown: a current session lists no cwd: abc123',
    );
    expectUntouched(main, dir, 'worktree-hand');
  });

  test('a listing row whose pid is not a number, since its session may sit in the worktree', () => {
    const main = repo();
    const dir = addWorktree(main, 'hand');
    const row = {
      sessionId: 'abc123',
      pid: '99',
      kind: 'interactive',
      cwd: dir,
    };
    const { code, err } = run(main, ['hand'], {
      listing: () => claudeSays(JSON.stringify([row])),
    });
    expect(code).toBe(1);
    expect(joined(err)).toContain(
      `held, unknown: claude agents gave a partial listing: the listing's entry 0 has a pid that is not a number: "99"`,
    );
    expectUntouched(main, dir, 'worktree-hand');
  });

  test("a worker's worktree, naming finish", () => {
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
    const { code, err } = run(main, ['w1']);
    expect(code).toBe(1);
    expect(joined(err)).toContain('sidekick worker finish');
    expectUntouched(main, dir, 'worktree-w1');
  });

  test('a worktree with an untracked file, naming it', () => {
    const main = repo();
    const dir = addWorktree(main, 'feat');
    fs.writeFileSync(path.join(dir, 'notes.md'), 'n\n');
    const { code, err } = run(main, ['feat']);
    expect(code).toBe(1);
    expect(joined(err)).toContain('notes.md');
    expectUntouched(main, dir, 'worktree-feat');
  });

  test('a worktree with a new ignored script, naming it and the skip list', () => {
    const main = repo();
    fs.writeFileSync(path.join(main, '.gitignore'), '*.sh\n');
    git(main, 'add', '.gitignore');
    git(main, 'commit', '-q', '-m', 'ignore');
    const dir = addWorktree(main, 'feat');
    fs.writeFileSync(path.join(dir, 'scratch.sh'), 'echo\n');
    const { code, err } = run(main, ['feat']);
    expect(code).toBe(1);
    expect(joined(err)).toContain('scratch.sh');
    expect(joined(err)).toContain(skipListPath(path.join(main, '.git')));
    expectUntouched(main, dir, 'worktree-feat');
  });

  test('more than 20 dirty files, counting the rest', () => {
    const main = repo();
    const dir = addWorktree(main, 'many');
    for (let i = 0; i < 25; i++) {
      fs.writeFileSync(
        path.join(dir, `f${String(i).padStart(2, '0')}.txt`),
        'x',
      );
    }
    const { code, err } = run(main, ['many']);
    expect(code).toBe(1);
    expect(joined(err)).toContain(', and 5 more');
  });

  test('the main checkout', () => {
    const main = repo();
    addWorktree(main, 'one');
    const { code, err } = run(main, [main]);
    expect(code).toBe(1);
    expect(joined(err)).toContain('main checkout');
    expect(fs.existsSync(main)).toBe(true);
    expect(backupRefs(main)).toEqual([]);
  });

  test("the worktree holding the command's own cwd, naming ExitWorktree with keep", () => {
    const main = repo();
    const dir = addWorktree(main, 'here');
    const sub = path.join(dir, 'sub');
    fs.mkdirSync(sub);
    const { code, err } = run(sub, ['here']);
    expect(code).toBe(1);
    expect(joined(err)).toContain('ExitWorktree');
    expect(joined(err)).toContain('keep');
    expectUntouched(main, dir, 'worktree-here');
  });

  test('a worktree with another worktree nested inside it', () => {
    const main = repo();
    const outer = addWorktree(main, 'outer');
    const inner = path.join(outer, 'inner');
    git(main, 'worktree', 'add', '-q', '-b', 'inner', inner);
    const { code, err } = run(main, ['outer']);
    expect(code).toBe(1);
    expect(joined(err)).toContain(inner);
    expectUntouched(main, outer, 'worktree-outer');
    expect(listed(main, inner)).toBe(true);
  });

  // git status in a folder with no .git entry reads the main checkout, which
  // ignores .claude/, so nothing there looks dirty.
  test('a worktree whose folder holds no .git entry, before any ref or unlock, even with --discard', () => {
    const main = repo();
    fs.writeFileSync(path.join(main, '.gitignore'), '.claude/\n');
    git(main, 'add', '.gitignore');
    git(main, 'commit', '-q', '-m', 'ignore');
    const dir = path.join(main, '.claude', 'worktrees', 'p1');
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    git(main, 'worktree', 'add', '-q', '-b', 'worktree-p1', dir);
    commit(dir, 'b.txt');
    git(main, 'worktree', 'lock', '--reason', SESSION_LOCK, dir);
    fs.rmSync(path.join(dir, '.git'));
    const { code, err } = run(main, ['p1', '--discard']);
    expect(code).toBe(1);
    expect(joined(err)).toContain(`${dir} holds no .git entry`);
    expectUntouched(main, dir, 'worktree-p1');
    expect(git(main, 'worktree', 'list', '--porcelain')).toContain(
      `locked ${SESSION_LOCK}`,
    );
  });

  test('when claude agents fails, even for a folder gone', () => {
    const main = repo();
    const dir = addWorktree(main, 'old-y');
    fs.rmSync(dir, { recursive: true, force: true });
    const { code, err } = run(main, ['old-y', '--discard'], {
      listing: () => claudeSays('', 1),
    });
    expect(code).toBe(1);
    expect(joined(err)).toContain('claude agents failed');
    expectUntouched(main, dir, 'worktree-old-y');
  });

  test('a worker record that does not parse, beside a removable worktree', () => {
    const main = repo();
    const dir = addWorktree(main, 'r10-x');
    const records = recordsDir(path.join(main, '.git'));
    fs.mkdirSync(records, { recursive: true });
    const broken = path.join(records, 'broken.json');
    fs.writeFileSync(broken, '{not json');
    const { code, out, err } = run(main, ['r10-x']);
    expect(code).toBe(1);
    expect(joined(err)).toContain('a worker record would not read');
    expect(joined(err)).toContain(broken);
    expect(out).toEqual([]);
    expectUntouched(main, dir, 'worktree-r10-x');
  });

  test('a worker record that does not parse, beside a folder gone', () => {
    const main = repo();
    const dir = addWorktree(main, 'old-y');
    fs.rmSync(dir, { recursive: true, force: true });
    const records = recordsDir(path.join(main, '.git'));
    fs.mkdirSync(records, { recursive: true });
    const broken = path.join(records, 'broken.json');
    fs.writeFileSync(broken, '{not json');
    const { code, err } = run(main, ['old-y', '--discard']);
    expect(code).toBe(1);
    expect(joined(err)).toContain('a worker record would not read');
    expect(joined(err)).toContain(broken);
    expectUntouched(main, dir, 'worktree-old-y');
  });

  test('a worker record that stops parsing after the checks', () => {
    const main = repo();
    const dir = addWorktree(main, 'r10-x');
    const records = recordsDir(path.join(main, '.git'));
    const broken = path.join(records, 'broken.json');
    const { code, err } = run(main, ['r10-x'], {
      git: (args) => {
        if (args[0] === 'update-ref' && args[1].startsWith('refs/sidekick/')) {
          fs.mkdirSync(records, { recursive: true });
          fs.writeFileSync(broken, '{not json');
        }
        return undefined;
      },
    });
    expect(code).toBe(1);
    expect(joined(err)).toContain(broken);
    expect(listed(main, dir)).toBe(true);
    expect(branchExists(main, 'worktree-r10-x')).toBe(true);
  });

  test('a lock written after the checks, before the removal', () => {
    const main = repo();
    const dir = addWorktree(main, 'race');
    const head = git(dir, 'rev-parse', 'HEAD');
    const { code, err } = run(main, ['race'], {
      isAlive: (pid) => pid === 4242,
      git: (args) => {
        if (args[0] === 'update-ref' && args[1].startsWith('refs/sidekick/')) {
          const wrote = execRunner('git', args, main);
          git(main, 'worktree', 'lock', '--reason', SESSION_LOCK, dir);
          return wrote;
        }
        return undefined;
      },
    });
    expect(code).toBe(1);
    expect(joined(err)).toContain('pid 4242');
    expect(listed(main, dir)).toBe(true);
    expect(fs.existsSync(dir)).toBe(true);
    expect(branchExists(main, 'worktree-race')).toBe(true);
    // The backup ref stays: it is written before any deletion.
    expect(backupRefs(main)).toEqual([`refs/sidekick/landed/race/${head}`]);
  });

  test('a live lock written during the last files check, keeping the lock and the backup ref', () => {
    const main = repo();
    const dir = addWorktree(main, 'relock');
    const head = git(dir, 'rev-parse', 'HEAD');
    git(main, 'worktree', 'lock', '--reason', SESSION_LOCK, dir);
    const lockFile = path.join(main, '.git', 'worktrees', 'relock', 'locked');
    const live = 'claude session s2 (pid 5151 start 2026-11-05)';
    // Each files check runs two git status calls: the checks, the re-check
    // after the backup ref, and the last one right before git's removal. The
    // lock turns live at the first status of the last check.
    const LAST_CHECK_STARTS = 5;
    let statuses = 0;
    let writtenAt = 0;
    const { code, err, events } = run(main, ['relock'], {
      isAlive: (pid) => pid === 5151,
      git: (args) => {
        if (!args.includes('status')) return undefined;
        statuses += 1;
        if (statuses === LAST_CHECK_STARTS) {
          fs.writeFileSync(lockFile, live);
          writtenAt = statuses;
        }
        return undefined;
      },
    });
    // The write fell in the last files check: its second status came after it.
    expect(writtenAt).toBe(LAST_CHECK_STARTS);
    expect(statuses).toBe(writtenAt + 1);
    expect(code).toBe(1);
    const ref = `refs/sidekick/landed/relock/${head}`;
    expect(err).toEqual([
      `${dir} is locked by a live session (pid 5151)`,
      'fix what git names, then run remove again',
      `the backup ref ${ref} keeps ${head}`,
    ]);
    expect(events.some((e) => e.startsWith('git worktree unlock'))).toBe(false);
    expect(fs.readFileSync(lockFile, 'utf8')).toBe(live);
    expect(listed(main, dir)).toBe(true);
    expect(fs.existsSync(dir)).toBe(true);
    expect(branchExists(main, 'worktree-relock')).toBe(true);
    expect(backupRefs(main)).toEqual([ref]);
  });

  test('a session that starts in the worktree after the checks', () => {
    const main = repo();
    const dir = addWorktree(main, 'race');
    const row = { sessionId: 'late1', pid: 99, cwd: dir };
    const { code, err } = run(main, ['race'], {
      listing: (call) => claudeSays(call === 1 ? '[]' : JSON.stringify([row])),
    });
    expect(code).toBe(1);
    expect(joined(err)).toContain('late1');
    expect(listed(main, dir)).toBe(true);
  });

  test('a name that matches no worktree', () => {
    const main = repo();
    addWorktree(main, 'one');
    const { code, err } = run(main, ['nope']);
    expect(code).toBe(1);
    expect(joined(err)).toContain('nope');
  });

  test('a name that matches two worktrees, naming both paths', () => {
    const main = repo();
    const a = path.join(tmp(), 'twin');
    const b = path.join(tmp(), 'twin');
    git(main, 'worktree', 'add', '-q', '-b', 'twin-a', a);
    git(main, 'worktree', 'add', '-q', '-b', 'twin-b', b);
    const { code, err } = run(main, ['twin']);
    expect(code).toBe(1);
    expect(joined(err)).toContain(a);
    expect(joined(err)).toContain(b);
    expect(listed(main, a)).toBe(true);
    expect(listed(main, b)).toBe(true);
  });

  test('no target, two targets, or an unknown flag print the usage line', () => {
    const main = repo();
    for (const args of [[], ['a', 'b'], ['a', '--force']]) {
      const { code, err } = run(main, args);
      expect(code).toBe(1);
      expect(err[0]).toStartWith('usage: ');
    }
  });
});

describe('worktree remove: folder names a ref cannot hold as they are', () => {
  const RESTORE = 'restore with: git branch ';

  // Removes a detached worktree in a folder named `name`, then runs its
  // restore line in a shell, which must create `branch` at the head; returns
  // the line.
  function removeAndRestore(
    name: string,
    segment: string,
    branch = segment,
  ): string {
    const main = repo();
    const dir = path.join(tmp(), name);
    git(main, 'worktree', 'add', '-q', '--detach', dir);
    const head = git(dir, 'rev-parse', 'HEAD');
    const { code, out, err } = run(main, [name]);
    expect(err).toEqual([]);
    expect(code).toBe(0);
    const ref = `refs/sidekick/landed/${segment}/${head}`;
    expect(backupRefs(main)).toEqual([ref]);
    expect(listed(main, dir)).toBe(false);
    const line = out.at(-1) ?? '';
    expect(line).toStartWith(RESTORE);
    const command = line.slice('restore with: '.length);
    execFileSync('/bin/sh', ['-c', command], { cwd: main });
    expect(git(main, 'rev-parse', `refs/heads/${branch}`)).toBe(head);
    return line;
  }

  test('my tree', () => {
    expect(removeAndRestore('my tree', 'my%20tree')).toStartWith(
      `${RESTORE}my%20tree refs/sidekick/landed/my%20tree/`,
    );
  });

  test('x.lock', () => {
    expect(removeAndRestore('x.lock', 'x%2Elock')).toStartWith(
      `${RESTORE}x%2Elock refs/sidekick/landed/x%2Elock/`,
    );
  });

  test('HEAD, which git refuses as a branch, restores as restored-HEAD', () => {
    const main = repo();
    expect(refSegment('HEAD')).toBe('HEAD');
    expect(() => git(main, 'check-ref-format', '--branch', 'HEAD')).toThrow();
    const line = removeAndRestore('HEAD', 'HEAD', 'restored-HEAD');
    expect(line).toStartWith(
      `${RESTORE}restored-HEAD refs/sidekick/landed/HEAD/`,
    );
    const branch = line.slice(RESTORE.length).split(' ')[0];
    expect(git(main, 'check-ref-format', '--branch', branch)).toBe(branch);
  });

  test('an ordinary detached name keeps its form', () => {
    expect(removeAndRestore('det', 'det')).toStartWith(
      `${RESTORE}det refs/sidekick/landed/det/`,
    );
  });

  test('a&b, on its own branch, quotes the restore line', () => {
    const main = repo();
    const dir = addWorktree(main, 'a&b');
    const head = git(dir, 'rev-parse', 'HEAD');
    const { code, out } = run(main, ['a&b']);
    expect(code).toBe(0);
    const ref = `refs/sidekick/landed/a%26b/${head}`;
    expect(backupRefs(main)).toEqual([ref]);
    expect(branchExists(main, 'worktree-a&b')).toBe(false);
    expect(out.at(-1)).toBe(`${RESTORE}'worktree-a&b' ${ref}`);
  });

  test('every encoded name passes git check-ref-format, in a ref and as a branch', () => {
    const main = repo();
    const names = [
      'my tree',
      'x.lock',
      'a&b',
      '.x',
      'x.',
      'a..b',
      '..',
      '.lock',
      '-x',
      '@',
      'a@{b',
      'a:b~c^d?e*f[g\\h',
      'tab\there',
      'ü',
      '%41',
      "it's",
    ];
    for (const name of names) {
      const segment = refSegment(name);
      expect(() =>
        git(main, 'check-ref-format', `refs/sidekick/kept/${segment}/x`),
      ).not.toThrow();
      expect(() =>
        git(main, 'check-ref-format', '--branch', segment),
      ).not.toThrow();
    }
    expect(new Set(names.map(refSegment)).size).toBe(names.length);
  });

  test('every encoded name passes as a branch behind the restored- prefix, HEAD included', () => {
    const main = repo();
    const names = ['HEAD', 'my tree', '.x', 'x.', 'a..b', '-x', '@', 'ü'];
    for (const name of names) {
      const branch = `restored-${refSegment(name)}`;
      expect(git(main, 'check-ref-format', '--branch', branch)).toBe(branch);
    }
  });

  test("a name already in the safe form stays as it is, as a worker's does", () => {
    for (const name of ['r10-p9-dispatch', 'w1', 'r10-x', 'v1.2_rc-3']) {
      expect(refSegment(name)).toBe(name);
    }
  });
});

describe('worktree remove: re-runs and sessions', () => {
  test('a re-run after git refused finds the backup ref written and completes', () => {
    const main = repo();
    const dir = addWorktree(main, 'again');
    const head = git(dir, 'rev-parse', 'HEAD');
    const ref = `refs/sidekick/landed/again/${head}`;
    const first = run(main, ['again'], {
      git: (args) =>
        args[0] === 'worktree' && args[1] === 'remove'
          ? { code: 128, stdout: '', stderr: 'fatal: refused for the test' }
          : undefined,
    });
    expect(first.code).toBe(1);
    expect(joined(first.err)).toContain('refused for the test');
    expect(joined(first.err)).toContain(ref);
    expect(backupRefs(main)).toEqual([ref]);
    expect(listed(main, dir)).toBe(true);

    const second = run(main, ['again']);
    expect(second.err).toEqual([]);
    expect(second.code).toBe(0);
    expect(backupRefs(main)).toEqual([ref]);
    expect(listed(main, dir)).toBe(false);
    expect(branchExists(main, 'worktree-again')).toBe(false);
  });

  test('a detached HEAD that moves after the checks refuses, keeping the new commit', () => {
    const main = repo();
    const dir = path.join(tmp(), 'det');
    git(main, 'worktree', 'add', '-q', '--detach', dir);
    const checked = git(dir, 'rev-parse', 'HEAD');
    let late = '';
    const { code, err } = run(main, ['det'], {
      git: (args) => {
        if (args[0] === 'update-ref' && args[1].startsWith('refs/sidekick/')) {
          const wrote = execRunner('git', args, main);
          late = commit(dir, 'late.txt');
          return wrote;
        }
        return undefined;
      },
    });
    expect(code).toBe(1);
    expect(joined(err)).toContain(checked);
    expect(joined(err)).toContain(late);
    expect(joined(err)).toContain('run remove again');
    expect(listed(main, dir)).toBe(true);
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(late);
  });

  test('a HEAD that moves while claude rm runs refuses before git removes', () => {
    const main = repo();
    const dir = addWorktree(main, 'bg');
    const row = { id: 'job1', kind: 'background', state: 'done', cwd: dir };
    let late = '';
    const { code, err, events } = run(main, ['bg'], {
      listing: () => claudeSays(JSON.stringify([row])),
      rm: () => {
        late = commit(dir, 'late.txt');
        return claudeSays('kept job1');
      },
    });
    expect(code).toBe(1);
    expect(joined(err)).toContain(late);
    expect(events.some((e) => e.startsWith('git worktree remove'))).toBe(false);
    expect(listed(main, dir)).toBe(true);
    expect(git(main, 'rev-parse', 'worktree-bg')).toBe(late);
  });

  // A tracked `.gitignore` that ignores `*.sh`, then the worktree `bg` with an
  // exited background session in it, so claude rm runs.
  function ignoringWorktree(): { main: string; dir: string; row: object } {
    const main = repo();
    fs.writeFileSync(path.join(main, '.gitignore'), '*.sh\n');
    git(main, 'add', '.gitignore');
    git(main, 'commit', '-q', '-m', 'ignore');
    const dir = addWorktree(main, 'bg');
    const row = { id: 'job1', kind: 'background', state: 'done', cwd: dir };
    return { main, dir, row };
  }

  test('an ignored file written after the checks refuses before claude rm runs', () => {
    const { main, dir, row } = ignoringWorktree();
    const head = git(dir, 'rev-parse', 'HEAD');
    const late = path.join(dir, 'late.sh');
    const { code, err, events } = run(main, ['bg'], {
      listing: () => claudeSays(JSON.stringify([row])),
      git: (args) => {
        if (args[0] === 'update-ref' && args[1].startsWith('refs/sidekick/')) {
          const wrote = execRunner('git', args, main);
          fs.writeFileSync(late, 'echo\n');
          return wrote;
        }
        return undefined;
      },
    });
    expect(code).toBe(1);
    expect(err[0]).toBe(`${dir} holds files its removal would lose: late.sh`);
    expect(joined(err)).toContain(skipListPath(path.join(main, '.git')));
    expect(events).not.toContain('claude rm job1');
    expect(fs.existsSync(late)).toBe(true);
    expect(listed(main, dir)).toBe(true);
    expect(branchExists(main, 'worktree-bg')).toBe(true);
    expect(backupRefs(main)).toEqual([`refs/sidekick/landed/bg/${head}`]);
  });

  test('an ignored file written while claude rm runs refuses before git removes', () => {
    const { main, dir, row } = ignoringWorktree();
    const late = path.join(dir, 'late.sh');
    const { code, err, events } = run(main, ['bg'], {
      listing: () => claudeSays(JSON.stringify([row])),
      rm: () => {
        fs.writeFileSync(late, 'echo\n');
        return claudeSays('removed job1');
      },
    });
    expect(code).toBe(1);
    expect(err[0]).toBe(`${dir} holds files its removal would lose: late.sh`);
    expect(joined(err)).toContain(skipListPath(path.join(main, '.git')));
    expect(err).toContain(
      'claude rm removed session job1 before this; remove itself deleted no worktree and no branch',
    );
    expect(events).toContain('claude rm job1');
    expect(events.some((e) => e.startsWith('git worktree remove'))).toBe(false);
    expect(fs.existsSync(late)).toBe(true);
    expect(listed(main, dir)).toBe(true);
    expect(branchExists(main, 'worktree-bg')).toBe(true);
  });

  test('a worktree claude rm leaves unreadable says the session went and the worktree stays', () => {
    const main = repo();
    const dir = addWorktree(main, 'bg');
    const head = git(dir, 'rev-parse', 'HEAD');
    const row = { id: 'job1', kind: 'background', state: 'done', cwd: dir };
    const { code, err } = run(main, ['bg'], {
      listing: () => claudeSays(JSON.stringify([row])),
      rm: () => {
        fs.rmSync(path.join(dir, '.git'));
        return claudeSays('removed job1');
      },
    });
    expect(code).toBe(1);
    expect(err).toEqual([
      `${dir} is held, unknown: ${dir} holds no .git entry, so git cannot read its files, so remove kept the worktree`,
      'claude rm removed session job1 before this; remove itself deleted no worktree and no branch',
      `the backup ref refs/sidekick/landed/bg/${head} keeps ${head}`,
    ]);
    expect(listed(main, dir)).toBe(true);
    expect(branchExists(main, 'worktree-bg')).toBe(true);
  });

  test('a claude rm that removes nothing leaves the refusal without a sessions line', () => {
    const { main, dir, row } = ignoringWorktree();
    const late = path.join(dir, 'late.sh');
    const { code, err } = run(main, ['bg'], {
      listing: () => claudeSays(JSON.stringify([row])),
      rm: () => {
        fs.writeFileSync(late, 'echo\n');
        return claudeSays('kept job1');
      },
    });
    expect(code).toBe(1);
    expect(err[0]).toBe(`${dir} holds files its removal would lose: late.sh`);
    expect(err.some((l) => l.startsWith('claude rm removed'))).toBe(false);
  });

  test('a session in a worktree nested inside another linked worktree is left to git', () => {
    const main = repo();
    const outer = addWorktree(main, 'outer-w');
    const inner = path.join(outer, 'inner');
    git(main, 'worktree', 'add', '-q', '-b', 'inner', inner);
    const row = { id: 'job1', kind: 'background', state: 'done', cwd: inner };
    const { code, out, events } = run(main, [inner], {
      listing: () => claudeSays(JSON.stringify([row])),
    });
    expect(code).toBe(0);
    expect(events.filter((e) => e.startsWith('claude rm'))).toEqual([]);
    expect(listed(main, inner)).toBe(false);
    expect(listed(main, outer)).toBe(true);
    expect(fs.existsSync(path.join(outer, 'a.txt'))).toBe(true);
    const note = out.find((l) => l.startsWith('claude rm job1 skipped'));
    expect(note).toContain(outer);
    expect(note).toContain('stays listed in claude agents');
  });

  test('an exited background session in the worktree goes first, by claude rm with no limit', () => {
    const main = repo();
    const dir = addWorktree(main, 'bg');
    const row = { id: 'job1', kind: 'background', state: 'done', cwd: dir };
    const { code, out, events, rmTimeouts } = run(main, ['bg'], {
      listing: () => claudeSays(JSON.stringify([row])),
    });
    expect(code).toBe(0);
    const rm = events.indexOf('claude rm job1');
    const gitRemove = events.findIndex((e) =>
      e.startsWith('git worktree remove'),
    );
    expect(rm).toBeGreaterThan(-1);
    expect(gitRemove).toBeGreaterThan(rm);
    // spawnSync reads a timeout of 0 as no limit.
    expect(rmTimeouts).toEqual([0]);
    expect(out[0]).toBe('session job1 removed');
    expect(listed(main, dir)).toBe(false);
  });

  test('an exited background session whose cwd is a subfolder of the worktree is left alone, and git removes the worktree', () => {
    const main = repo();
    const dir = addWorktree(main, 'bg');
    const sub = path.join(dir, 'sub');
    fs.mkdirSync(sub);
    const row = { id: 'job1', kind: 'background', state: 'done', cwd: sub };
    const { code, events } = run(main, ['bg'], {
      listing: () => claudeSays(JSON.stringify([row])),
    });
    expect(code).toBe(0);
    expect(events.filter((e) => e.startsWith('claude rm'))).toEqual([]);
    expect(listed(main, dir)).toBe(false);
  });

  test('a claude rm that does not say removed is a note, and git removes the worktree', () => {
    const main = repo();
    const dir = addWorktree(main, 'bg');
    const row = { id: 'job1', kind: 'background', state: 'stopped', cwd: dir };
    const { code, out } = run(main, ['bg'], {
      listing: () => claudeSays(JSON.stringify([row])),
      rm: () => claudeSays('kept job1: something odd'),
    });
    expect(code).toBe(0);
    expect(joined(out)).toContain('kept job1: something odd');
    expect(listed(main, dir)).toBe(false);
  });

  test('a working background row holds the worktree and is never removed', () => {
    const main = repo();
    const dir = addWorktree(main, 'bg');
    const row = { id: 'job1', kind: 'background', state: 'working', cwd: dir };
    const { code, events } = run(main, ['bg'], {
      listing: () => claudeSays(JSON.stringify([row])),
    });
    expect(code).toBe(1);
    expect(events).not.toContain('claude rm job1');
    expectUntouched(main, dir, 'worktree-bg');
  });

  test('the backup ref is written before the worktree and the branch go', () => {
    const main = repo();
    addWorktree(main, 'order');
    const { code, events } = run(main, ['order']);
    expect(code).toBe(0);
    const at = (prefix: string): number =>
      events.findIndex((e) => e.startsWith(prefix));
    const backup = at('git update-ref refs/sidekick/');
    expect(backup).toBeGreaterThan(-1);
    expect(at('git worktree remove')).toBeGreaterThan(backup);
    expect(at('git update-ref -d refs/heads/')).toBeGreaterThan(
      at('git worktree remove'),
    );
  });

  test('no git call runs --force, prune, or clean', () => {
    const main = repo();
    const dir = addWorktree(main, 'old-y');
    commit(dir, 'b.txt');
    git(main, 'worktree', 'lock', '--reason', SESSION_LOCK, dir);
    fs.rmSync(dir, { recursive: true, force: true });
    const { code, events } = run(main, ['old-y', '--discard']);
    expect(code).toBe(0);
    const gitCalls = events.filter((e) => e.startsWith('git '));
    expect(
      gitCalls.filter((e) => /--force|\bprune\b|\bclean\b/.test(e)),
    ).toEqual([]);
  });
});

describe('worktree remove: --into, and the branch move made', () => {
  const KEPT_RULE = 'or a branch sidekick worktree move made for this worktree';
  const MARK = 'sidekickWorktree';

  // A worktree on a new branch, marked for the worktree `markFor` as
  // sidekick worktree move marks a branch it makes.
  function addMarked(
    main: string,
    name: string,
    branch: string,
    markFor = name,
  ): string {
    const dir = path.join(tmp(), name);
    git(main, 'worktree', 'add', '-q', '-b', branch, dir);
    git(main, 'config', `branch.${branch}.${MARK}`, markFor);
    return dir;
  }

  const markGone = (main: string, branch: string): void => {
    expect(() =>
      git(main, 'config', '--get', `branch.${branch}.${MARK}`),
    ).toThrow();
  };

  // Squashes `branch` into `target`, a branch no checkout holds, through a
  // worktree made for it and removed after.
  function squashInto(main: string, target: string, branch: string): void {
    const at = path.join(tmp(), 'squash');
    git(main, 'worktree', 'add', '-q', at, target);
    git(at, 'merge', '-q', '--squash', branch);
    git(at, 'commit', '-q', '-m', `squash ${branch}`);
    git(main, 'worktree', 'remove', at);
  }

  test('parses --into beside --discard, and without it', () => {
    expect(parseRemoveArgs(['ff', '--into', 'main', '--discard'])).toEqual({
      target: 'ff',
      discard: true,
      into: 'main',
    });
    expect(parseRemoveArgs(['ff'])).toEqual({
      target: 'ff',
      discard: false,
      into: undefined,
    });
  });

  test('--into a branch no checkout holds, after a fast-forward, deletes the marked branch behind a landed ref', () => {
    const main = repo();
    git(main, 'branch', 'target');
    const dir = addMarked(main, 'ff', 'feat');
    const head = commit(dir, 'b.txt');
    git(main, 'branch', '-f', 'target', 'feat');
    const before = run(main, ['ff']);
    expect(before.code).toBe(1);
    expect(before.err[0]).toBe(
      'feat has 1 commit found in no landed branch and no remote-tracking ref, as of the last fetch, so remove took nothing',
    );
    expectUntouched(main, dir, 'feat');
    const { code, out, err } = run(main, ['ff', '--into', 'target']);
    expect(err).toEqual([]);
    expect(code).toBe(0);
    const ref = `refs/sidekick/landed/ff/${head}`;
    expect(backupRefs(main)).toEqual([ref]);
    expect(git(main, 'rev-parse', ref)).toBe(head);
    expect(listed(main, dir)).toBe(false);
    expect(branchExists(main, 'feat')).toBe(false);
    markGone(main, 'feat');
    expect(out).toEqual([
      'feat landed in target',
      `worktree ${dir} removed`,
      'branch feat removed',
      `restore with: git branch feat ${ref}`,
    ]);
  });

  test('--into a branch no checkout holds, after a squash merge into it, deletes the marked branch behind a landed ref', () => {
    const main = repo();
    git(main, 'branch', 'target');
    const dir = addMarked(main, 'sq', 'feat');
    commit(dir, 'b.txt');
    const head = commit(dir, 'c.txt');
    squashInto(main, 'target', 'feat');
    const { code, out, err } = run(main, ['sq', '--into', 'target']);
    expect(err).toEqual([]);
    expect(code).toBe(0);
    const ref = `refs/sidekick/landed/sq/${head}`;
    expect(backupRefs(main)).toEqual([ref]);
    expect(listed(main, dir)).toBe(false);
    expect(branchExists(main, 'feat')).toBe(false);
    markGone(main, 'feat');
    expect(out[0]).toBe('feat landed in target');
  });

  test('--into, not landed, refuses naming the target and the count, and --discard deletes behind a discarded ref', () => {
    const main = repo();
    git(main, 'branch', 'target');
    const dir = addMarked(main, 'nl', 'feat');
    commit(dir, 'b.txt');
    const head = commit(dir, 'c.txt');
    const refused = run(main, ['nl', '--into', 'target']);
    expect(refused.code).toBe(1);
    expect(refused.err).toEqual([
      'feat has 2 commits found in no landed branch, not in target, and in no remote-tracking ref, as of the last fetch, so remove took nothing',
      'run remove again with --discard to remove it anyway, keeping them in a backup ref only',
    ]);
    expectUntouched(main, dir, 'feat');
    const { code, out, err } = run(main, [
      'nl',
      '--into',
      'target',
      '--discard',
    ]);
    expect(err).toEqual([]);
    expect(code).toBe(0);
    const ref = `refs/sidekick/discarded/nl/${head}`;
    expect(backupRefs(main)).toEqual([ref]);
    expect(branchExists(main, 'feat')).toBe(false);
    markGone(main, 'feat');
    expect(out).toEqual([
      `worktree ${dir} removed`,
      'branch feat removed',
      `restore with: git branch feat ${ref}`,
    ]);
  });

  test('--discard beside --into keeps a landed ref when the work landed', () => {
    const main = repo();
    const dir = addMarked(main, 'both', 'feat');
    const head = commit(dir, 'b.txt');
    git(main, 'branch', 'target', head);
    const { code } = run(main, ['both', '--into', 'target', '--discard']);
    expect(code).toBe(0);
    expect(backupRefs(main)).toEqual([`refs/sidekick/landed/both/${head}`]);
  });

  test('--into origin/feat, a remote-tracking ref, landed', () => {
    const main = repo();
    const dir = addMarked(main, 'rt', 'work');
    const head = commit(dir, 'b.txt');
    git(main, 'update-ref', 'refs/remotes/origin/feat', head);
    const { code, out, err } = run(main, ['rt', '--into', 'origin/feat']);
    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(backupRefs(main)).toEqual([`refs/sidekick/landed/rt/${head}`]);
    expect(branchExists(main, 'work')).toBe(false);
    markGone(main, 'work');
    expect(out[0]).toBe('work landed in origin/feat');
  });

  test("an --into target at the main checkout's commit is the one named", () => {
    const main = repo();
    git(main, 'branch', 'target');
    addMarked(main, 'same', 'feat');
    const { code, out } = run(main, ['same', '--into', 'target']);
    expect(code).toBe(0);
    expect(out[0]).toBe('feat landed in target');
  });

  test('--into a name no local branch or remote-tracking ref has refuses before any check, naming the way on', () => {
    const main = repo();
    const dir = addMarked(main, 'np', 'feat');
    commit(dir, 'b.txt');
    const trunk = git(main, 'rev-parse', '--abbrev-ref', 'HEAD');
    for (const into of ['nope', `${trunk}~0`]) {
      const { code, err, events } = run(main, ['np', '--into', into]);
      expect(code).toBe(1);
      expect(err).toEqual([
        `--into ${into} names no local branch and no remote-tracking ref, so remove took nothing`,
        'name a local branch, such as main, or a remote-tracking ref, such as origin/main',
      ]);
      expect(events.some((e) => e.startsWith('claude '))).toBe(false);
      expectUntouched(main, dir, 'feat');
    }
    expect(git(main, 'config', '--get', `branch.feat.${MARK}`)).toBe('np');
  });

  test('--into the branch the worktree is on refuses, since that branch holds its head', () => {
    const main = repo();
    const dir = addMarked(main, 'own', 'feat');
    commit(dir, 'b.txt');
    const { code, err } = run(main, ['own', '--into', 'feat']);
    expect(code).toBe(1);
    expect(err).toEqual([
      `--into feat is the branch ${dir} is on, which holds its head whether or not the work landed, so it cannot show the work landed there: name the branch it should land in`,
    ]);
    expectUntouched(main, dir, 'feat');
  });

  test('a marked branch whose commits are pushed is deleted behind a pushed ref', () => {
    const main = repo();
    const dir = addMarked(main, 'pu', 'feat');
    const head = commit(dir, 'b.txt');
    git(main, 'update-ref', 'refs/remotes/origin/feat', head);
    const { code, out, err } = run(main, ['pu']);
    expect(err).toEqual([]);
    expect(code).toBe(0);
    const ref = `refs/sidekick/pushed/pu/${head}`;
    expect(backupRefs(main)).toEqual([ref]);
    expect(branchExists(main, 'feat')).toBe(false);
    markGone(main, 'feat');
    expect(out).toEqual([
      `worktree ${dir} removed`,
      'branch feat removed',
      `restore with: git branch feat ${ref}`,
    ]);
  });

  test('an unmarked branch is kept, with the kept line', () => {
    const main = repo();
    const dir = path.join(tmp(), 'plain');
    git(main, 'worktree', 'add', '-q', '-b', 'plain-b', dir);
    const head = commit(dir, 'b.txt');
    const { code, out } = run(main, ['plain']);
    expect(code).toBe(0);
    expect(listed(main, dir)).toBe(false);
    expect(git(main, 'rev-parse', 'plain-b')).toBe(head);
    expect(backupRefs(main)).toEqual([`refs/sidekick/kept/plain/${head}`]);
    expect(out).toContain(
      `branch plain-b kept: remove deletes only worktree-plain ${KEPT_RULE}`,
    );
  });

  test('a branch marked for another worktree is kept, with the kept line and its mark', () => {
    const main = repo();
    const dir = addMarked(main, 'mine', 'theirs', 'elsewhere');
    const head = commit(dir, 'b.txt');
    const { code, out } = run(main, ['mine']);
    expect(code).toBe(0);
    expect(listed(main, dir)).toBe(false);
    expect(git(main, 'rev-parse', 'theirs')).toBe(head);
    expect(backupRefs(main)).toEqual([`refs/sidekick/kept/mine/${head}`]);
    expect(out).toContain(
      `branch theirs kept: remove deletes only worktree-mine ${KEPT_RULE}`,
    );
    expect(git(main, 'config', '--get', `branch.theirs.${MARK}`)).toBe(
      'elsewhere',
    );
  });

  test('a marked feat/x.y that landed is deleted with its whole config section', () => {
    const main = repo();
    addMarked(main, 'fx', 'feat/x.y');
    git(main, 'config', 'branch.feat/x.y.remote', 'origin');
    const { code, out, err } = run(main, ['fx']);
    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(branchExists(main, 'feat/x.y')).toBe(false);
    expect(out).toContain('branch feat/x.y removed');
    expect(() =>
      git(main, 'config', '--local', '--get-regexp', '^branch\\.feat/x\\.y\\.'),
    ).toThrow();
  });

  test('--into without a value, empty, or twice, and two targets, print the usage line', () => {
    expect(WORKTREE_USAGE_LINE).toContain(
      'remove <name|path> [--into <target>] [--discard]',
    );
    const main = repo();
    const cases = [
      ['x', '--into'],
      ['x', '--into='],
      ['x', '--into', '--discard'],
      ['x', '--into', 'a', '--into', 'b'],
      ['a', 'b', '--into', 'main'],
    ];
    for (const args of cases) {
      const { code, err } = run(main, args);
      expect(code).toBe(1);
      expect(err).toEqual([`usage: ${WORKTREE_USAGE_LINE}`]);
    }
  });
});
