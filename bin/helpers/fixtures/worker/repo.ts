/**
 * Test-only. Temporary folders and git repos for the `sidekick worker` tests.
 * `tsc` checks this file and has no `bun:test` types, so each test file
 * registers the cleanup itself, with `afterEach(removeTemps)`.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

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

/** Runs git in `cwd` and returns its output, trimmed. */
export const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();

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
