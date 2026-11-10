import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  git,
  recording,
  removeTemps,
  repoWithWorktree,
} from './fixtures/worker/repo.js';
import { execRunner } from './pm-data.js';
import { statusEntriesIn } from './worker-listing.js';
import { flaggedEntries } from './worktree-flagged.js';

afterEach(removeTemps);

const NAMES = [
  'skip.txt',
  'hide.txt',
  'both.txt',
  'plain.txt',
  'with space.txt',
  'new\nline.txt',
];

// A repo with a linked worktree whose branch tracks each of NAMES.
function fixture(): { main: string; worktree: string } {
  const { main, worktree } = repoWithWorktree('');
  for (const name of NAMES) {
    fs.writeFileSync(path.join(worktree, name), 'v1\n');
  }
  git(worktree, 'add', '.');
  git(worktree, 'commit', '-q', '-m', 'files');
  return { main, worktree };
}

const flagsOf = (main: string, worktree: string) => {
  const result = flaggedEntries(execRunner, main, worktree);
  if ('issue' in result) throw new Error(result.issue);
  return result;
};

describe('flaggedEntries', () => {
  test('puts an S path in skipWorktree, and present h and s paths in assumed', () => {
    const { main, worktree } = fixture();
    git(worktree, 'update-index', '--skip-worktree', 'skip.txt');
    git(worktree, 'update-index', '--assume-unchanged', 'hide.txt');
    git(worktree, 'update-index', '--skip-worktree', 'both.txt');
    git(worktree, 'update-index', '--assume-unchanged', 'both.txt');
    expect(git(worktree, 'ls-files', '-v', 'both.txt')).toStartWith('s ');
    const flagged = flagsOf(main, worktree);
    expect([...flagged.skipWorktree]).toEqual(['skip.txt']);
    expect(flagged.assumed).toEqual(['both.txt', 'hide.txt']);
  });

  test('leaves a missing h path out of assumed, and keeps a missing S path', () => {
    const { main, worktree } = fixture();
    git(worktree, 'update-index', '--skip-worktree', 'skip.txt');
    git(worktree, 'update-index', '--assume-unchanged', 'hide.txt');
    fs.rmSync(path.join(worktree, 'skip.txt'));
    fs.rmSync(path.join(worktree, 'hide.txt'));
    const flagged = flagsOf(main, worktree);
    expect([...flagged.skipWorktree]).toEqual(['skip.txt']);
    expect(flagged.assumed).toEqual([]);
  });

  test('returns a path holding a space or a newline whole', () => {
    const { main, worktree } = fixture();
    git(worktree, 'update-index', '--assume-unchanged', 'with space.txt');
    git(worktree, 'update-index', '--skip-worktree', 'new\nline.txt');
    const flagged = flagsOf(main, worktree);
    expect(flagged.assumed).toEqual(['with space.txt']);
    expect([...flagged.skipWorktree]).toEqual(['new\nline.txt']);
  });

  test('returns two empty collections when nothing is flagged', () => {
    const { main, worktree } = fixture();
    const flagged = flagsOf(main, worktree);
    expect(flagged.skipWorktree.size).toBe(0);
    expect(flagged.assumed).toEqual([]);
  });

  test("gives git's message when the listing fails", () => {
    const { main } = fixture();
    const result = flaggedEntries(execRunner, main, path.join(main, 'gone'));
    expect('issue' in result && result.issue).not.toBe('');
  });
});

describe('statusEntriesIn with skipWorktree', () => {
  test('lists an edited S file, and omits an mtime-only change and a missing S file', () => {
    const { worktree } = fixture();
    git(worktree, 'update-index', '--skip-worktree', 'skip.txt');
    git(worktree, 'update-index', '--skip-worktree', 'both.txt');
    git(worktree, 'update-index', '--skip-worktree', 'plain.txt');
    fs.writeFileSync(path.join(worktree, 'skip.txt'), 'edited\n');
    fs.writeFileSync(path.join(worktree, 'plain.txt'), 'v1\n');
    fs.rmSync(path.join(worktree, 'both.txt'));
    const result = statusEntriesIn(execRunner, worktree, worktree, {
      skipWorktree: true,
    });
    expect('entries' in result && result.entries).toEqual([
      { code: ' M', path: 'skip.txt' },
    ]);
  });

  test('leaves the real index as it was', () => {
    const { worktree } = fixture();
    git(worktree, 'update-index', '--skip-worktree', 'skip.txt');
    git(worktree, 'update-index', '--assume-unchanged', 'hide.txt');
    fs.writeFileSync(path.join(worktree, 'skip.txt'), 'edited\n');
    const before = git(worktree, 'ls-files', '-v');
    statusEntriesIn(execRunner, worktree, worktree, { skipWorktree: true });
    expect(git(worktree, 'ls-files', '-v')).toBe(before);
  });

  test("without the option, runs today's exact arguments", () => {
    const { worktree } = fixture();
    const { runGit, calls } = recording();
    statusEntriesIn(runGit, worktree, worktree);
    expect(calls.map((c) => c.args)).toEqual([
      ['-C', worktree, 'status', '--porcelain', '-z', '--untracked-files=all'],
    ]);
  });

  test('with the option, runs the sparse arguments under no optional locks', () => {
    const { worktree } = fixture();
    const { runGit, calls } = recording();
    statusEntriesIn(runGit, worktree, worktree, { skipWorktree: true });
    expect(calls.map((c) => c.args)).toEqual([
      [
        '--no-optional-locks',
        '-c',
        'core.sparseCheckout=true',
        '-c',
        'sparse.expectFilesOutsideOfPatterns=false',
        '-C',
        worktree,
        'status',
        '--porcelain',
        '-z',
        '--untracked-files=all',
      ],
    ]);
  });
});
