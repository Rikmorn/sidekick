import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  git,
  type RecordedCall,
  recording,
  removeTemps,
  repo,
} from './fixtures/worker/repo.js';
import { execRunner, MAX_OUTPUT } from './pm-data.js';
import { type Landing, landedIn } from './worker-landed.js';

afterEach(removeTemps);

const lines = (): string =>
  `${Array.from({ length: 20 }, (_, i) => i + 1).join('\n')}\n`;

/** Replaces the whole line `from` with `to` in `file`. */
function edit(top: string, file: string, from: string, to: string): void {
  const full = path.join(top, file);
  const next = fs
    .readFileSync(full, 'utf-8')
    .split('\n')
    .map((line) => (line === from ? to : line))
    .join('\n');
  fs.writeFileSync(full, next);
}

function commit(top: string, message: string): void {
  git(top, 'commit', '-q', '-am', message);
}

function addFile(top: string, file: string, content: string): void {
  fs.writeFileSync(path.join(top, file), content);
  git(top, '--literal-pathspecs', 'add', '--', file);
  git(top, 'commit', '-q', '-m', `add ${file}`);
}

/** The edits on lines 6 and 13 that sit beside the branch's lines 5 and 12. */
function editBeside(top: string, file = 'f'): void {
  edit(top, file, '6', 'SIX');
  edit(top, file, '13', 'THIRTEEN');
  commit(top, 'beside');
}

/**
 * The C1 fixture: `main` holds a 20-line `f`, branch `w` edits line 5, then
 * line 12 and adds `g.txt`, and `main` moves on with `o.txt`. Leaves `main`
 * checked out.
 */
function fixture(): string {
  const top = repo();
  git(top, 'branch', '-M', 'main');
  addFile(top, 'f', lines());
  git(top, 'switch', '-q', '-c', 'w');
  edit(top, 'f', '5', 'five');
  commit(top, 'c1');
  edit(top, 'f', '12', 'twelve');
  fs.writeFileSync(path.join(top, 'g.txt'), 'new\n');
  git(top, 'add', 'g.txt');
  commit(top, 'c2');
  git(top, 'switch', '-q', 'main');
  addFile(top, 'o.txt', 'other\n');
  return top;
}

function landing(top: string, cap?: number): Landing {
  const refs = {
    target: git(top, 'rev-parse', 'main'),
    head: git(top, 'rev-parse', 'w'),
  };
  return cap === undefined
    ? landedIn(execRunner, top, refs)
    : landedIn(execRunner, top, refs, { cap });
}

function squash(top: string): void {
  git(top, 'merge', '-q', '--squash', 'w');
  git(top, 'commit', '-q', '-m', 'sq');
}

function pickBranch(top: string): void {
  git(top, 'cherry-pick', 'w~1', 'w');
}

describe('landedIn, the C1 landings', () => {
  const landedHow = (top: string, how: string): void => {
    const result = landing(top);
    expect(result.kind).toBe('landed');
    if (result.kind === 'landed') expect(result.how).toBe(how);
  };

  test('fast-forward', () => {
    const top = fixture();
    git(top, 'rebase', '-q', 'main', 'w');
    git(top, 'switch', '-q', 'main');
    git(top, 'merge', '-q', '--ff-only', 'w');
    landedHow(top, 'ancestor');
  });

  test('merge', () => {
    const top = fixture();
    git(top, 'merge', '-q', '--no-ff', '-m', 'm', 'w');
    landedHow(top, 'ancestor');
  });

  test('rebase', () => {
    const top = fixture();
    pickBranch(top);
    landedHow(top, 'tip');
  });

  test('squash', () => {
    const top = fixture();
    squash(top);
    landedHow(top, 'tip');
  });

  test('rebase, then an edit beside', () => {
    const top = fixture();
    pickBranch(top);
    editBeside(top);
    landedHow(top, 'history');
  });

  test('squash, then an edit beside', () => {
    const top = fixture();
    squash(top);
    editBeside(top);
    landedHow(top, 'history');
  });

  test('squash after a far move', () => {
    const top = fixture();
    edit(top, 'f', '1', 'ONE');
    commit(top, 'before');
    squash(top);
    landedHow(top, 'tip');
  });

  test('squash, a move near the lines, then an edit beside', () => {
    const top = fixture();
    edit(top, 'f', '7', 'SEVEN');
    commit(top, 'near');
    squash(top);
    editBeside(top);
    landedHow(top, 'history');
  });

  test('rebase, a move near the lines, then an edit beside', () => {
    const top = fixture();
    edit(top, 'f', '7', 'SEVEN');
    commit(top, 'near');
    pickBranch(top);
    editBeside(top);
    landedHow(top, 'history');
  });

  test('rebased, then reverted', () => {
    const top = fixture();
    pickBranch(top);
    git(top, 'revert', '--no-edit', 'HEAD', 'HEAD~1');
    landedHow(top, 'history');
  });

  test('squash with whitespace changed is not landed', () => {
    const top = fixture();
    git(top, 'merge', '-q', '--squash', 'w');
    edit(top, 'f', 'five', 'five  ');
    commit(top, 'sq');
    expect(landing(top).kind).toBe('not landed');
  });

  test('landed with a changed line is not landed', () => {
    const top = fixture();
    git(top, 'merge', '-q', '--squash', 'w');
    edit(top, 'f', 'twelve', 'TWELVE');
    commit(top, 'sq');
    expect(landing(top).kind).toBe('not landed');
  });

  test('a branch nothing landed is not landed', () => {
    const top = fixture();
    expect(landing(top).kind).toBe('not landed');
  });

  test('a branch with only its first commit landed is not landed', () => {
    const top = fixture();
    git(top, 'cherry-pick', 'w~1');
    expect(landing(top).kind).toBe('not landed');
  });
});

describe('landedIn, further cases', () => {
  test('a merge=ours attribute does not fake a landing', () => {
    // The branch changes only `f`, so a faked clean merge would equal the
    // target's tree.
    const top = repo();
    git(top, 'branch', '-M', 'main');
    addFile(top, 'f', lines());
    git(top, 'switch', '-q', '-c', 'w');
    edit(top, 'f', '5', 'five');
    commit(top, 'c1');
    git(top, 'switch', '-q', 'main');
    git(top, 'config', 'merge.ours.driver', 'true');
    fs.writeFileSync(path.join(top, '.gitattributes'), '* merge=ours\n');
    git(top, 'add', '.gitattributes');
    edit(top, 'f', '6', 'SIX');
    commit(top, 'attrs and a conflicting edit');
    expect(landing(top).kind).toBe('not landed');
  });

  test('the cap stops the walk and says so', () => {
    const top = fixture();
    squash(top);
    for (const line of ['13', '6', '4']) {
      edit(top, 'f', line, `x${line}`);
      commit(top, `edit ${line}`);
    }
    expect(landing(top, 2)).toEqual({
      kind: 'not landed',
      walked: 2,
      capped: true,
    });
  });

  test('a squash joined to the target by a merge commit is found', () => {
    const top = fixture();
    git(top, 'switch', '-q', '-c', 'side');
    squash(top);
    git(top, 'switch', '-q', 'main');
    edit(top, 'o.txt', 'other', 'other2');
    commit(top, 'target moves');
    git(top, 'merge', '-q', '--no-ff', '-m', 'join', 'side');
    editBeside(top);
    const result = landing(top);
    expect(result.kind).toBe('landed');
    if (result.kind === 'landed') expect(result.how).toBe('history');
  });

  test('a file named with pathspec magic is matched literally', () => {
    const top = repo();
    git(top, 'branch', '-M', 'main');
    const name = ':a b*.txt';
    addFile(top, name, lines());
    git(top, 'switch', '-q', '-c', 'w');
    edit(top, name, '5', 'five');
    commit(top, 'c1');
    git(top, 'switch', '-q', 'main');
    addFile(top, 'o.txt', 'other\n');
    squash(top);
    editBeside(top, name);
    const result = landing(top);
    expect(result.kind).toBe('landed');
    if (result.kind === 'landed') expect(result.how).toBe('history');
  });

  test('a rename squashed and then edited beside is found', () => {
    const top = repo();
    git(top, 'branch', '-M', 'main');
    addFile(top, 'f', lines());
    git(top, 'switch', '-q', '-c', 'w');
    git(top, 'mv', 'f', 'h');
    edit(top, 'h', '5', 'five');
    commit(top, 'rename');
    git(top, 'switch', '-q', 'main');
    addFile(top, 'o.txt', 'other\n');
    squash(top);
    editBeside(top, 'h');
    expect(landing(top).kind).toBe('landed');
  });

  test('a target on an orphan branch has no merge base', () => {
    const top = fixture();
    git(top, 'switch', '-q', '--orphan', 'orphan');
    git(top, 'commit', '-q', '--allow-empty', '-m', 'root');
    git(top, 'branch', '-f', 'main', 'orphan');
    expect(landing(top)).toEqual({
      kind: 'not landed',
      walked: 0,
      capped: false,
    });
  });
});

/**
 * `main` holds each of `names`; branch `w` edits line 5 of each; `main` takes
 * the branch as a squash and then edits beside it.
 */
function squashedNames(names: string[]): string {
  const top = repo();
  git(top, 'branch', '-M', 'main');
  for (const name of names) addFile(top, name, lines());
  git(top, 'switch', '-q', '-c', 'w');
  for (const name of names) edit(top, name, '5', 'five');
  commit(top, 'c1');
  git(top, 'switch', '-q', 'main');
  addFile(top, 'o.txt', 'other\n');
  squash(top);
  for (const name of names) {
    edit(top, name, '6', 'SIX');
    edit(top, name, '13', 'THIRTEEN');
  }
  commit(top, 'beside');
  return top;
}

function recordedLanding(top: string): {
  result: Landing;
  calls: RecordedCall[];
} {
  const { runGit, calls } = recording();
  const refs = {
    target: git(top, 'rev-parse', 'main'),
    head: git(top, 'rev-parse', 'w'),
  };
  return { result: landedIn(runGit, top, refs), calls };
}

const callWith = (
  calls: RecordedCall[],
  verb: string,
): RecordedCall | undefined => calls.find((call) => call.args.includes(verb));

const foundInHistory = (result: Landing): void => {
  expect(result.kind).toBe('landed');
  if (result.kind === 'landed') expect(result.how).toBe('history');
};

describe('landedIn, paths on stdin', () => {
  test('a name holding a star is found', () => {
    foundInHistory(recordedLanding(squashedNames(['a*b'])).result);
  });

  test('a name holding a newline is found', () => {
    foundInHistory(recordedLanding(squashedNames(['a\nb'])).result);
  });

  test('ordinary names go on stdin and none on argv', () => {
    const { result, calls } = recordedLanding(squashedNames(['f', 'g h.txt']));
    foundInHistory(result);
    const call = callWith(calls, 'log');
    expect(call?.args).toContain('--stdin');
    expect(call?.args).not.toContain('f');
    expect(call?.args).not.toContain('g h.txt');
    expect(call?.opts?.input).toBe('--\nf\ng h.txt\n');
  });

  test('a change set whose every name holds a newline passes no --stdin', () => {
    const { result, calls } = recordedLanding(squashedNames(['a\nb', 'c\nd']));
    foundInHistory(result);
    const call = callWith(calls, 'log');
    expect(call?.args).not.toContain('--stdin');
    expect(call?.opts?.input).toBeUndefined();
    expect(call?.args.slice(-3)).toEqual(['--', 'a\nb', 'c\nd']);
  });

  test('a name ending in a carriage return goes on argv and is found', () => {
    const { result, calls } = recordedLanding(squashedNames(['cr\r']));
    foundInHistory(result);
    expect(callWith(calls, 'log')?.args).toContain('cr\r');
    expect(callWith(calls, 'log')?.args).not.toContain('--stdin');
  });

  test('a mix splits by what stdin can carry', () => {
    const { result, calls } = recordedLanding(squashedNames(['f', 'a\nb']));
    foundInHistory(result);
    const call = callWith(calls, 'log');
    expect(call?.args).toContain('--stdin');
    expect(call?.args.slice(-2)).toEqual(['--', 'a\nb']);
    expect(call?.opts?.input).toBe('--\nf\n');
  });

  test('the branch diff takes the largest output the runtime holds', () => {
    const { calls } = recordedLanding(squashedNames(['f']));
    expect(callWith(calls, 'diff')?.opts?.maxBuffer).toBe(MAX_OUTPUT);
  });
});
