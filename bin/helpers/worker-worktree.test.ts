import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, removeTemps, repo, tmp } from './fixtures/worker/repo.js';
import { execRunner } from './pm-data.js';
import type { WorktreeEntry } from './worker-repo.js';
import {
  type Candidate,
  type FindInput,
  findWorktree,
  locateWorktree,
  nativeBranch,
} from './worker-worktree.js';

afterEach(removeTemps);

const entry = (
  p: string,
  branch?: string,
  rest?: Partial<WorktreeEntry>,
): WorktreeEntry => ({
  path: p,
  head: 'abc',
  branch: branch === undefined ? undefined : `refs/heads/${branch}`,
  locked: undefined,
  prunable: undefined,
  ...rest,
});

const MAIN = '/r/main';
const NO_NAME = { via: 'name', why: 'no worktree has worktree-w1 checked out' };
const input = (over: Partial<FindInput>): FindInput => ({
  name: 'w1',
  mainTop: MAIN,
  briefTop: undefined,
  worktrees: [entry(MAIN, 'master'), entry('/r/w1', 'w1')],
  candidates: [],
  ...over,
});

describe('nativeBranch', () => {
  test('is the branch Claude Code gives a --worktree folder', () => {
    expect(nativeBranch('w1')).toBe('worktree-w1');
  });
});

describe('findWorktree', () => {
  test('finds by the transcript and carries its branch, whatever the worktree holds now', () => {
    const candidates: Candidate[] = [
      { via: 'transcript', cwd: '/r/w1', gitBranch: 'feature' },
    ];
    expect(findWorktree(input({ candidates }))).toEqual({
      kind: 'found',
      path: '/r/w1',
      branch: 'feature',
      locked: undefined,
      prunable: undefined,
      via: 'transcript',
    });
  });

  test('uses the worktree branch, short, when the transcript names none', () => {
    const candidates: Candidate[] = [
      { via: 'transcript', cwd: '/r/w1', gitBranch: undefined },
    ];
    const found = findWorktree(input({ candidates }));
    expect(found.kind === 'found' && found.branch).toBe('w1');
  });

  test('finds by the listing', () => {
    const found = findWorktree(
      input({ candidates: [{ via: 'listing', cwd: '/r/w1' }] }),
    );
    expect(found).toMatchObject({
      kind: 'found',
      path: '/r/w1',
      via: 'listing',
    });
  });

  test('finds by worktree-<name> with no candidate, branch included', () => {
    const found = findWorktree(
      input({
        worktrees: [entry(MAIN, 'master'), entry('/r/x', 'worktree-w1')],
      }),
    );
    expect(found).toMatchObject({
      kind: 'found',
      path: '/r/x',
      branch: 'worktree-w1',
      via: 'name',
    });
  });

  test('carries the lock reason', () => {
    const found = findWorktree(
      input({
        worktrees: [
          entry(MAIN, 'master'),
          entry('/r/w1', 'w1', { locked: 'why' }),
        ],
        candidates: [{ via: 'listing', cwd: '/r/w1' }],
      }),
    );
    expect(found).toMatchObject({ kind: 'found', locked: 'why' });
  });

  test("the operator's path is the only candidate, and no name fallback runs", () => {
    const found = findWorktree(
      input({
        worktrees: [
          entry(MAIN, 'master'),
          entry('/r/w1', 'w1'),
          entry('/r/x', 'worktree-w1'),
        ],
        candidates: [{ via: 'operator', cwd: '/elsewhere' }],
      }),
    );
    expect(found).toEqual({
      kind: 'not found',
      tried: [
        {
          via: 'operator',
          cwd: '/elsewhere',
          why: 'is in no worktree git lists',
        },
      ],
    });
  });

  test("the operator's path is found when it is a worktree", () => {
    const found = findWorktree(
      input({ candidates: [{ via: 'operator', cwd: '/r/w1' }] }),
    );
    expect(found).toMatchObject({
      kind: 'found',
      via: 'operator',
      path: '/r/w1',
    });
  });

  test('matches a subfolder of the worktree', () => {
    const found = findWorktree(
      input({ candidates: [{ via: 'listing', cwd: '/r/w1/src/deep' }] }),
    );
    expect(found).toMatchObject({ kind: 'found', path: '/r/w1' });
  });

  test('never matches by a bare string prefix', () => {
    const found = findWorktree(
      input({
        worktrees: [entry(MAIN, 'master'), entry('/r/w1', 'w1')],
        candidates: [{ via: 'listing', cwd: '/r/w10' }],
      }),
    );
    expect(found.kind).toBe('not found');
    const longer = findWorktree(
      input({
        worktrees: [
          entry(MAIN, 'master'),
          entry('/r/w1', 'w1'),
          entry('/r/w10', 'w10'),
        ],
        candidates: [{ via: 'listing', cwd: '/r/w10/a' }],
      }),
    );
    expect(longer).toMatchObject({ kind: 'found', path: '/r/w10' });
  });

  test('a candidate in a worktree nested under the main checkout matches the nested one', () => {
    const nested = `${MAIN}/.claude/worktrees/w1`;
    const found = findWorktree(
      input({
        worktrees: [entry(MAIN, 'master'), entry(nested, 'worktree-w1')],
        candidates: [{ via: 'listing', cwd: `${nested}/src` }],
      }),
    );
    expect(found).toMatchObject({ kind: 'found', path: nested });
  });

  test('rejects the main checkout', () => {
    const found = findWorktree(
      input({
        worktrees: [entry(MAIN, 'master')],
        candidates: [{ via: 'listing', cwd: `${MAIN}/src` }],
      }),
    );
    expect(found).toEqual({
      kind: 'not found',
      tried: [
        { via: 'listing', cwd: `${MAIN}/src`, why: 'is the main checkout' },
        NO_NAME,
      ],
    });
  });

  test("rejects the brief's checkout", () => {
    const found = findWorktree(
      input({
        worktrees: [entry(MAIN, 'master'), entry('/r/b', 'b')],
        briefTop: '/r/b',
        candidates: [{ via: 'transcript', cwd: '/r/b', gitBranch: 'b' }],
      }),
    );
    expect(found).toEqual({
      kind: 'not found',
      tried: [
        {
          via: 'transcript',
          cwd: '/r/b',
          why: "is the brief's checkout /r/b",
        },
        NO_NAME,
      ],
    });
  });

  test('a prunable match is found, and its reason reaches the result', () => {
    const reason = 'gitdir file points to non-existent location';
    const found = findWorktree(
      input({
        worktrees: [
          entry(MAIN, 'master'),
          entry('/r/w1', 'w1', { prunable: reason }),
        ],
        candidates: [{ via: 'listing', cwd: '/r/w1' }],
      }),
    );
    expect(found).toMatchObject({ kind: 'found', prunable: reason });
  });

  test('a prunable match found by name is flagged too', () => {
    const found = findWorktree(
      input({
        worktrees: [
          entry(MAIN, 'master'),
          entry('/r/x', 'worktree-w1', { prunable: '' }),
        ],
      }),
    );
    expect(found).toMatchObject({ kind: 'found', via: 'name', prunable: '' });
  });

  test('a prunable main checkout is still rejected', () => {
    const found = findWorktree(
      input({
        worktrees: [entry(MAIN, 'master', { prunable: '' })],
        candidates: [{ via: 'listing', cwd: MAIN }],
      }),
    );
    expect(found.kind).toBe('not found');
  });

  test('a detached match with no transcript branch is not found', () => {
    const found = findWorktree(
      input({
        worktrees: [entry(MAIN, 'master'), entry('/r/w1')],
        candidates: [{ via: 'listing', cwd: '/r/w1' }],
      }),
    );
    expect(found).toEqual({
      kind: 'not found',
      tried: [
        {
          via: 'listing',
          cwd: '/r/w1',
          why: 'is detached, and the transcript names no branch',
        },
        NO_NAME,
      ],
    });
  });

  test('a detached match at the operator path is not found, with no word of a transcript', () => {
    const found = findWorktree(
      input({
        worktrees: [entry(MAIN, 'master'), entry('/r/w1')],
        candidates: [{ via: 'operator', cwd: '/r/w1' }],
      }),
    );
    expect(found).toEqual({
      kind: 'not found',
      tried: [{ via: 'operator', cwd: '/r/w1', why: 'is detached' }],
    });
  });

  test('a detached match with a transcript branch is found under that branch', () => {
    const found = findWorktree(
      input({
        worktrees: [entry(MAIN, 'master'), entry('/r/w1')],
        candidates: [{ via: 'transcript', cwd: '/r/w1', gitBranch: 'w1' }],
      }),
    );
    expect(found).toMatchObject({ kind: 'found', branch: 'w1' });
  });

  test('falls through a rejected candidate to the next', () => {
    const found = findWorktree(
      input({
        candidates: [
          { via: 'transcript', cwd: '/nowhere', gitBranch: undefined },
          { via: 'listing', cwd: '/r/w1' },
        ],
      }),
    );
    expect(found).toMatchObject({ kind: 'found', via: 'listing' });
  });

  test('not found names every candidate in order, then the name', () => {
    const found = findWorktree(
      input({
        candidates: [
          { via: 'transcript', cwd: '/a', gitBranch: undefined },
          { via: 'listing', cwd: '/b' },
        ],
        worktrees: [entry(MAIN, 'master')],
      }),
    );
    expect(found).toEqual({
      kind: 'not found',
      tried: [
        { via: 'transcript', cwd: '/a', why: 'is in no worktree git lists' },
        { via: 'listing', cwd: '/b', why: 'is in no worktree git lists' },
        NO_NAME,
      ],
    });
  });
});

describe('locateWorktree', () => {
  function fixture() {
    const main = repo();
    const worktree = path.join(path.dirname(main), `${path.basename(main)}.w1`);
    git(main, 'worktree', 'add', '-q', '-b', 'w1', worktree);
    const configDir = tmp();
    const sessionId = 'sess-1';
    const folder = path.join(configDir, 'projects', '-some-folder');
    fs.mkdirSync(folder, { recursive: true });
    const lines = [
      { type: 'queue-operation' },
      { cwd: fs.realpathSync(worktree), gitBranch: 'w1' },
    ];
    fs.writeFileSync(
      path.join(folder, `${sessionId}.jsonl`),
      lines.map((l) => `${JSON.stringify(l)}\n`).join(''),
    );
    return { main, worktree: fs.realpathSync(worktree), configDir, sessionId };
  }
  const base = (f: ReturnType<typeof fixture>) => ({
    runGit: execRunner,
    configDir: f.configDir,
    name: 'w1',
    mainTop: f.main,
    briefTop: undefined,
    sessionId: undefined,
    listingCwd: undefined,
    operatorPath: undefined,
  });

  test("finds ../<repo>.w1 through the session's transcript", () => {
    const f = fixture();
    expect(locateWorktree({ ...base(f), sessionId: f.sessionId })).toEqual({
      kind: 'found',
      path: f.worktree,
      branch: 'w1',
      locked: undefined,
      prunable: undefined,
      via: 'transcript',
    });
  });

  test('resolves a candidate written through a symlink', () => {
    const f = fixture();
    const link = path.join(tmp(), 'link');
    fs.symlinkSync(f.worktree, link);
    const found = locateWorktree({
      ...base(f),
      listingCwd: path.join(link, 'sub'),
    });
    expect(found).toMatchObject({
      kind: 'found',
      path: f.worktree,
      via: 'listing',
    });
  });

  test('a rejected operator path stops the search', () => {
    const f = fixture();
    const found = locateWorktree({ ...base(f), operatorPath: f.main });
    expect(found).toEqual({
      kind: 'not found',
      tried: [{ via: 'operator', cwd: f.main, why: 'is the main checkout' }],
    });
  });

  test('falls back to the name when the transcript is missing', () => {
    const f = fixture();
    git(f.main, 'branch', '-m', 'w1', 'worktree-w1');
    expect(
      locateWorktree({ ...base(f), sessionId: 'no-such-session' }),
    ).toMatchObject({ kind: 'found', via: 'name', branch: 'worktree-w1' });
  });

  test("reports git's message when the listing fails", () => {
    const result = locateWorktree({ ...base(fixture()), mainTop: tmp() });
    expect(result).toHaveProperty('issue');
  });
});
