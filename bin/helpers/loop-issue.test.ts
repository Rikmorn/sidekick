import { describe, expect, test } from 'bun:test';
import { fetchUnitIssue, renderUnitFile } from './loop-issue.js';
import { type Runner, type RunResult, TIMED_OUT } from './pm-data.js';

const ME = 'operator';
const ORIGIN = 'https://github.com/acme/widgets.git';

type Person = { login: string } | null;
type Comment = {
  author: Person;
  editor: Person;
  lastEditedAt: string | null;
  body: string;
  createdAt: string;
};
type IssueShape = {
  state: string;
  title: string;
  body: string;
  url: string;
  author: Person;
  editor: Person;
  lastEditedAt: string | null;
  renames: { totalCount: number; nodes: { actor?: Person }[] };
  comments: { totalCount: number; nodes: Comment[] };
};

const who = (login: string): Person => ({ login });
const issueOf = (over: Partial<IssueShape> = {}): IssueShape => ({
  state: 'OPEN',
  title: 'Add the thing',
  body: 'Do the thing.',
  url: 'https://github.com/acme/widgets/issues/7',
  author: who(ME),
  editor: null,
  lastEditedAt: null,
  renames: { totalCount: 0, nodes: [] },
  comments: { totalCount: 0, nodes: [] },
  ...over,
});
const comment = (over: Partial<Comment> = {}): Comment => ({
  author: who(ME),
  editor: null,
  lastEditedAt: null,
  body: 'A note.',
  createdAt: '2026-11-15T10:00:00Z',
  ...over,
});

const respond = (
  issue: IssueShape | null,
  repository: { issue: IssueShape | null } | null = { issue },
): RunResult => ({
  code: 0,
  stdout: JSON.stringify({
    data: { viewer: { login: ME }, repository },
  }),
  stderr: '',
});

const stub = (
  gh: RunResult,
): { run: Runner; calls: { cmd: string; args: string[] }[] } => {
  const calls: { cmd: string; args: string[] }[] = [];
  const run: Runner = (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === 'git') return { code: 0, stdout: `${ORIGIN}\n`, stderr: '' };
    return gh;
  };
  return { run, calls };
};

const fetchWith = (issue: IssueShape | null) =>
  fetchUnitIssue(stub(respond(issue)).run, '/repo', 7);

describe('fetchUnitIssue', () => {
  test('an issue by the viewer, last edited by the viewer, passes', () => {
    const { run, calls } = stub(
      respond(
        issueOf({
          editor: who(ME),
          lastEditedAt: '2026-11-15T09:00:00Z',
          comments: { totalCount: 1, nodes: [comment()] },
        }),
      ),
    );
    const r = fetchUnitIssue(run, '/repo', 7);
    expect(r).toEqual({
      issue: {
        number: 7,
        title: 'Add the thing',
        body: 'Do the thing.',
        url: 'https://github.com/acme/widgets/issues/7',
        comments: [
          { author: ME, body: 'A note.', createdAt: '2026-11-15T10:00:00Z' },
        ],
        dropped: 0,
      },
    });
    const gh = calls.find((c) => c.cmd === 'gh');
    expect(gh?.args.slice(0, 2)).toEqual(['api', 'graphql']);
    expect(gh?.args).toContain('owner=acme');
    expect(gh?.args).toContain('repo=widgets');
    expect(gh?.args).toContain('number=7');
    expect(gh?.args.join(' ')).not.toContain('acme/widgets/issues');
  });

  test('an issue by another author refuses', () => {
    const r = fetchWith(issueOf({ author: who('mallory') }));
    expect(r).toEqual({ issues: [expect.stringContaining('author')] });
  });

  test('a deleted author refuses', () => {
    const r = fetchWith(issueOf({ author: null }));
    expect('issues' in r).toBe(true);
  });

  test('an issue with no editor but an edit time refuses', () => {
    const r = fetchWith(issueOf({ editor: null, lastEditedAt: '2026-11-15' }));
    expect(r).toEqual({ issues: [expect.stringContaining('last edited')] });
  });

  test('a rename by another account, or a deleted one, refuses', () => {
    for (const actor of [who('mallory'), null, undefined]) {
      const r = fetchWith(
        issueOf({ renames: { totalCount: 1, nodes: [{ actor }] } }),
      );
      expect(r).toEqual({ issues: [expect.stringContaining('renamed')] });
    }
  });

  test('a rename by the viewer passes', () => {
    const r = fetchWith(
      issueOf({ renames: { totalCount: 1, nodes: [{ actor: who(ME) }] } }),
    );
    expect('issue' in r).toBe(true);
  });

  test('a renames list shorter than its count refuses, since it cannot vouch for the renames it leaves out', () => {
    for (const nodes of [[], [{ actor: who(ME) }]]) {
      const r = fetchWith(issueOf({ renames: { totalCount: 2, nodes } }));
      expect(r).toEqual({
        issues: [
          `issue #7 lists ${nodes.length} of its 2 title renames, so dispatch cannot tell who made the rest`,
        ],
      });
    }
  });

  test('more than 100 renames refuses, naming the cap', () => {
    const r = fetchWith(
      issueOf({
        renames: { totalCount: 101, nodes: [{ actor: who(ME) }] },
      }),
    );
    expect(r).toEqual({
      issues: [expect.stringContaining('100 title renames')],
    });
  });

  test('a comment with no editor but an edit time is dropped', () => {
    const r = fetchWith(
      issueOf({
        comments: {
          totalCount: 2,
          nodes: [
            comment({ body: 'edited', lastEditedAt: '2026-11-15' }),
            comment({ body: 'plain' }),
          ],
        },
      }),
    );
    if (!('issue' in r)) throw new Error(r.issues.join('; '));
    expect(r.issue.comments.map((c) => c.body)).toEqual(['plain']);
    expect(r.issue.dropped).toBe(1);
  });

  test('a key in the title refuses', () => {
    const r = fetchWith(issueOf({ title: `ghp_${'a'.repeat(36)}` }));
    if (!('issues' in r)) throw new Error('expected refusal');
    expect(r.issues[0]).toContain('title');
    expect(r.issues.join('\n')).not.toContain('aaaa');
  });

  test('a null repository refuses', () => {
    const r = fetchUnitIssue(stub(respond(null, null)).run, '/repo', 7);
    expect(r).toEqual({ issues: [expect.stringContaining('no issue')] });
  });

  test('an issue last edited by another account refuses', () => {
    const r = fetchWith(issueOf({ editor: who('mallory') }));
    expect(r).toEqual({ issues: [expect.stringContaining('last edited')] });
  });

  test('comments by or last edited by others are dropped and counted', () => {
    const r = fetchWith(
      issueOf({
        comments: {
          totalCount: 5,
          nodes: [
            comment({ body: 'kept' }),
            comment({ author: who('mallory'), body: 'other author' }),
            comment({ editor: who('mallory'), body: 'other editor' }),
            comment({ author: null, body: 'deleted author' }),
            comment({ editor: who(ME), body: 'kept edited' }),
          ],
        },
      }),
    );
    if (!('issue' in r)) throw new Error(r.issues.join('; '));
    expect(r.issue.comments.map((c) => c.body)).toEqual([
      'kept',
      'kept edited',
    ]);
    expect(r.issue.dropped).toBe(3);
  });

  test('a closed issue refuses', () => {
    const r = fetchWith(issueOf({ state: 'CLOSED' }));
    expect(r).toEqual({ issues: [expect.stringContaining('closed')] });
  });

  test('a missing issue refuses', () => {
    const r = fetchWith(null);
    expect(r).toEqual({ issues: [expect.stringContaining('no issue')] });
  });

  test('more than 100 comments refuses, naming the cap', () => {
    const r = fetchWith(issueOf({ comments: { totalCount: 101, nodes: [] } }));
    expect(r).toEqual({ issues: [expect.stringContaining('100')] });
  });

  test('every reason is named', () => {
    const r = fetchWith(
      issueOf({ state: 'CLOSED', author: who('m'), editor: who('m') }),
    );
    if (!('issues' in r)) throw new Error('expected refusal');
    expect(r.issues.length).toBe(3);
  });

  test('a key in the text refuses, naming the check and not the text', () => {
    const key = `ghp_${'a'.repeat(36)}`;
    const r = fetchWith(issueOf({ body: `token ${key}` }));
    if (!('issues' in r)) throw new Error('expected refusal');
    expect(r.issues.length).toBe(1);
    expect(r.issues[0]).toContain('body');
    expect(r.issues.join('\n')).not.toContain(key);
    const c = fetchWith(
      issueOf({
        comments: { totalCount: 1, nodes: [comment({ body: key })] },
      }),
    );
    if (!('issues' in c)) throw new Error('expected refusal');
    expect(c.issues[0]).toContain('comment');
    expect(c.issues.join('\n')).not.toContain(key);
  });

  test('a key in a dropped comment does not refuse', () => {
    const key = `ghp_${'a'.repeat(36)}`;
    const r = fetchWith(
      issueOf({
        comments: {
          totalCount: 1,
          nodes: [comment({ author: who('m'), body: key })],
        },
      }),
    );
    expect('issue' in r).toBe(true);
  });

  test('a gh failure or timeout refuses with its text', () => {
    const failed = fetchUnitIssue(
      stub({ code: 1, stdout: '', stderr: 'boom' }).run,
      '/repo',
      7,
    );
    expect(failed).toEqual({ issues: [expect.stringContaining('boom')] });
    const timed = fetchUnitIssue(
      stub({ code: TIMED_OUT, stdout: '', stderr: 'timed out' }).run,
      '/repo',
      7,
    );
    expect(timed).toEqual({ issues: [expect.stringContaining('timed out')] });
    const silent = fetchUnitIssue(
      stub({ code: TIMED_OUT, stdout: '', stderr: '' }).run,
      '/repo',
      7,
    );
    expect(silent).toEqual({ issues: [expect.stringContaining('timed out')] });
  });

  test('a response that does not parse refuses', () => {
    const r = fetchUnitIssue(
      stub({ code: 0, stdout: '{"data":{}}', stderr: '' }).run,
      '/repo',
      7,
    );
    expect(r).toEqual({ issues: [expect.stringContaining('unexpected')] });
    const bad = fetchUnitIssue(
      stub({ code: 0, stdout: 'not json', stderr: '' }).run,
      '/repo',
      7,
    );
    expect('issues' in bad).toBe(true);
  });

  test('an origin that is not GitHub refuses', () => {
    const run: Runner = () => ({ code: 0, stdout: 'ssh://x/y', stderr: '' });
    expect('issues' in fetchUnitIssue(run, '/repo', 7)).toBe(true);
  });
});

describe('renderUnitFile', () => {
  test('the unit file names the issue, its url, and how many comments were dropped', () => {
    const text = renderUnitFile({
      number: 7,
      title: 'Add the thing',
      body: 'Do the thing.',
      url: 'https://github.com/acme/widgets/issues/7',
      comments: [{ author: ME, body: 'A note.', createdAt: '2026-11-15' }],
      dropped: 2,
    });
    expect(text).toContain('#7');
    expect(text).toContain('Add the thing');
    expect(text).toContain('https://github.com/acme/widgets/issues/7');
    expect(text).toContain('Do the thing.');
    expect(text).toContain('A note.');
    expect(text).toContain(ME);
    expect(text).toContain('2 comments');
  });
});
