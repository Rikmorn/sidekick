import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner, type Runner, type RunResult } from './pm-data.js';
import type { ClaudeResult, ClaudeRunner } from './profile-launch.js';
import { recordsDir, writeRecord } from './worker-record.js';
import { runWorktreeCli } from './worktree.js';
import { skipListPath } from './worktree-ignored.js';

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
    { cwd, runGit, runClaude, isAlive: fakes.isAlive ?? (() => false) },
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

  test('a worktree on master, keeping the branch with its commits only here, with no ref and no --discard', () => {
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
    expect(backupRefs(main)).toEqual([]);
    expect(out).toEqual([
      `worktree ${dir} removed`,
      'branch master kept: remove deletes only worktree-m1, the branch made for this worktree',
    ]);
  });

  test('a worktree on feature-x, keeping the branch with its commits only here', () => {
    const main = repo();
    const dir = path.join(tmp(), 'feat');
    git(main, 'worktree', 'add', '-q', '-b', 'feature-x', dir);
    const head = commit(dir, 'b.txt');
    const { code, out, events } = run(main, ['feat']);
    expect(code).toBe(0);
    expect(listed(main, dir)).toBe(false);
    expect(git(main, 'rev-parse', 'feature-x')).toBe(head);
    expect(backupRefs(main)).toEqual([]);
    expect(events.some((e) => e.startsWith('git update-ref'))).toBe(false);
    expect(out.at(-1)).toBe(
      'branch feature-x kept: remove deletes only worktree-feat, the branch made for this worktree',
    );
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
    expect(backupRefs(main)).toEqual([]);
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
    expect(events).toContain('claude rm job1');
    expect(events.some((e) => e.startsWith('git worktree remove'))).toBe(false);
    expect(fs.existsSync(late)).toBe(true);
    expect(listed(main, dir)).toBe(true);
    expect(branchExists(main, 'worktree-bg')).toBe(true);
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
