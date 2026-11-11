/**
 * Test-only. Temporary folders, git repos, and the recording runner for the `sidekick worker` tests.
 * `tsc` checks this file and has no `bun:test` types, so each test file
 * registers the cleanup itself, with `afterEach(removeTemps)`.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  execRunner,
  MAX_OUTPUT,
  type Runner,
  type RunOptions,
} from '../../pm-data.js';

const made: string[] = [];

/**
 * A new temporary folder, as a physical path: git prints `/private/var/...`
 * where `os.tmpdir()` gives `/var/...` on macOS.
 */
export function tmp(): string {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sk-worker-')),
  );
  made.push(dir);
  return dir;
}

/** Removes every folder `tmp` made since the last call. */
export function removeTemps(): void {
  for (const dir of made.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A new temporary folder whose `.git` is a file holding `garbage`. There
 * `git rev-parse` fails with `fatal: invalid gitfile format: <folder>/.git`,
 * a failure other than being outside every repository.
 */
export function brokenGitFile(): string {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, '.git'), 'garbage');
  return dir;
}

/**
 * Runs git in `cwd` and returns its output, trimmed. git's stderr goes to the
 * thrown error, not the terminal, so a test that expects git to fail prints
 * nothing.
 */
export const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    maxBuffer: MAX_OUTPUT,
    stdio: 'pipe',
  }).trim();

/**
 * A repo holding one commit of `a.txt`, with its identity and signing set
 * locally. Its excludes file does not exist, so the user's global ignore rules
 * never reach a test.
 */
export function repo(): string {
  const top = tmp();
  git(top, 'init', '-q');
  git(top, 'config', 'user.name', 'test');
  git(top, 'config', 'user.email', 'test@example.com');
  git(top, 'config', 'commit.gpgsign', 'false');
  git(
    top,
    'config',
    'core.excludesFile',
    path.join(top, '.git', 'no-excludes'),
  );
  fs.writeFileSync(path.join(top, 'a.txt'), 'a\n');
  git(top, 'add', 'a.txt');
  git(top, 'commit', '-q', '-m', 'init');
  return top;
}

/**
 * A linked worktree whose git dir under the main checkout is gone. There
 * `git rev-parse` fails with `fatal: not a git repository: <gitDir>`, which is
 * not one of git's outside-every-repository messages.
 */
export function danglingWorktree(): { dir: string; gitDir: string } {
  const main = repo();
  const dir = path.join(tmp(), 'wt');
  git(main, 'worktree', 'add', '-q', '-b', 'wt', dir);
  const gitDir = path.join(main, '.git', 'worktrees', 'wt');
  fs.rmSync(gitDir, { recursive: true, force: true });
  return { dir, gitDir };
}

/**
 * A repo whose second commit tracks `.gitignore` with the given lines, plus a
 * linked worktree on a new branch `side`. `commonDir` is the repo's `.git`.
 */
export function repoWithWorktree(gitignore: string): {
  main: string;
  worktree: string;
  commonDir: string;
} {
  const main = repo();
  fs.writeFileSync(path.join(main, '.gitignore'), gitignore);
  git(main, 'add', '.gitignore');
  git(main, 'commit', '-q', '-m', 'ignore');
  const worktree = path.join(tmp(), 'side');
  git(main, 'worktree', 'add', '-q', '-b', 'side', worktree);
  return { main, worktree, commonDir: path.join(main, '.git') };
}

/** One call a `recording` runner saw. */
export interface RecordedCall {
  args: string[];
  opts: RunOptions | undefined;
}

/** A runner that runs real git through `execRunner` and keeps each call's arguments and options. */
export function recording(): { runGit: Runner; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const runGit: Runner = (cmd, args, cwd, opts) => {
    calls.push({ args, opts });
    return execRunner(cmd, args, cwd, opts);
  };
  return { runGit, calls };
}
