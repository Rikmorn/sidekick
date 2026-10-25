import { describe, expect, test } from 'bun:test';
import {
  buildSnapshot,
  type ChildFacts,
  type ListingRow,
  parseListingRows,
  type SnapshotInput,
  staleRecordNames,
} from './desk-snapshot.js';
import type { WorkerRecord } from './worker-record.js';

// Rows follow the measured shapes in docs/research/control-centre/2026-10-15-desk-probes.md
// §The listing, state by state.
const bg = (over: ListingRow): ListingRow => ({
  id: 'aaaa0001',
  kind: 'background',
  cwd: '/x/sidekick',
  pid: 100,
  sessionId: 'aaaa0001-0000-0000-0000-000000000000',
  name: 'bg',
  ...over,
});
const inter = (over: ListingRow): ListingRow => ({
  kind: 'interactive',
  cwd: '/x/sidekick',
  pid: 200,
  sessionId: 'bbbb0001-0000-0000-0000-000000000000',
  name: 'inter',
  ...over,
});
// The row once its process has exited: the listing gives it no pid.
const exited = ({ pid: _pid, ...row }: ListingRow): ListingRow => row;

const record = (name: string, job: string | null = null): WorkerRecord => ({
  version: 2,
  name,
  main: null,
  job,
  brief: '/b.md',
  dispatchedAt: '2026-10-15T00:00:00Z',
});

const facts = (over: Partial<ChildFacts> = {}): ChildFacts => ({
  worktreeExists: true,
  unintegrated: 0,
  uncommitted: false,
  ...over,
});

const build = (over: Partial<SnapshotInput>) => {
  const snapshot = buildSnapshot({
    rows: [],
    records: [],
    facts: new Map(),
    freshInteractive: new Set(),
    warnings: [],
    ...over,
  });
  if (!snapshot.ok) throw new Error('expected an ok snapshot');
  return snapshot;
};

describe('parseListingRows', () => {
  test('keeps known fields and drops a field of the wrong type', () => {
    const { rows, warnings } = parseListingRows([
      { id: 'a', pid: 'x', name: 'n', state: 'done', extra: 1 },
    ]);
    expect(rows).toEqual([{ id: 'a', name: 'n', state: 'done' }]);
    expect(warnings).toEqual([]);
  });

  test('skips an entry that is not an object, with a warning', () => {
    const { rows, warnings } = parseListingRows([{ name: 'a' }, 7, null]);
    expect(rows).toEqual([{ name: 'a' }]);
    expect(warnings).toHaveLength(2);
  });

  test('reads a listing that is not an array as no rows, with a warning', () => {
    const { rows, warnings } = parseListingRows({ rows: [] });
    expect(rows).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});

describe('classification', () => {
  test('a background blocked row on a permission prompt waits with that reason', () => {
    const row = bg({
      state: 'blocked',
      status: 'waiting',
      waitingFor: 'permission prompt',
    });
    expect(build({ rows: [row] }).waiting).toEqual([
      {
        name: 'bg',
        repo: 'sidekick',
        reason: 'permission prompt',
        child: false,
      },
    ]);
  });

  test('a background blocked idle row without waitingFor waits as blocked', () => {
    const row = bg({ state: 'blocked', status: 'idle' });
    expect(build({ rows: [row] }).waiting[0]?.reason).toBe('blocked');
  });

  test('a background blocked row without waitingFor waits as blocked whatever its status', () => {
    const row = bg({ state: 'blocked', status: 'waiting' });
    expect(build({ rows: [row] }).waiting[0]?.reason).toBe('blocked');
  });

  test('an interactive waiting row waits with its waitingFor', () => {
    const row = inter({ status: 'waiting', waitingFor: 'input needed' });
    expect(build({ rows: [row] }).waiting[0]?.reason).toBe('input needed');
  });

  test('a background done row with a pid adds one to finished', () => {
    const snapshot = build({
      rows: [bg({ state: 'done', status: 'idle' })],
    });
    expect(snapshot.finished).toBe(1);
    expect(snapshot.waiting).toEqual([]);
  });

  test('an interactive idle row finishes only when its transcript is fresh', () => {
    const row = inter({ status: 'idle' });
    expect(build({ rows: [row] }).finished).toBe(0);
    const fresh = new Set([row.sessionId ?? '']);
    expect(build({ rows: [row], freshInteractive: fresh }).finished).toBe(1);
  });

  test('a busy row is neither waiting nor finished, and is listed in others', () => {
    const snapshot = build({
      rows: [bg({ state: 'working', status: 'busy' })],
    });
    expect(snapshot.waiting).toEqual([]);
    expect(snapshot.finished).toBe(0);
    expect(snapshot.others).toEqual([
      { name: 'bg', repo: 'sidekick', kind: 'background', state: 'working' },
    ]);
  });

  test.each([
    'done',
    'stopped',
    'failed',
  ])('a background %s row without a pid is not current: not counted, not waiting, and not in others', (state) => {
    const snapshot = build({ rows: [exited(bg({ state }))] });
    expect(snapshot.finished).toBe(0);
    expect(snapshot.waiting).toEqual([]);
    expect(snapshot.others).toEqual([]);
  });

  test('an interactive row without a pid is not current', () => {
    const row = exited(
      inter({ status: 'waiting', waitingFor: 'input needed' }),
    );
    const snapshot = build({ rows: [row] });
    expect(snapshot.waiting).toEqual([]);
    expect(snapshot.others).toEqual([]);
  });

  test('a blocked non-child without a pid is current: it waits, with its waitingFor, else blocked', () => {
    const asked = exited(bg({ state: 'blocked', waitingFor: 'input needed' }));
    expect(build({ rows: [asked] }).waiting).toEqual([
      { name: 'bg', repo: 'sidekick', reason: 'input needed', child: false },
    ]);
    const bare = exited(bg({ state: 'blocked' }));
    const snapshot = build({ rows: [bare] });
    expect(snapshot.waiting).toEqual([
      { name: 'bg', repo: 'sidekick', reason: 'blocked', child: false },
    ]);
    expect(snapshot.others).toEqual([
      {
        name: 'bg',
        repo: 'sidekick',
        kind: 'background',
        state: 'blocked',
        reason: 'blocked',
      },
    ]);
    expect(snapshot.finished).toBe(0);
  });

  test('a working row without a pid is current: listed in others, never waiting, never counted', () => {
    const between = exited(bg({ state: 'working' }));
    const asking = exited(bg({ state: 'working', status: 'waiting' }));
    for (const row of [between, asking]) {
      const snapshot = build({ rows: [row] });
      expect(snapshot.others).toEqual([
        { name: 'bg', repo: 'sidekick', kind: 'background', state: 'working' },
      ]);
      expect(snapshot.waiting).toEqual([]);
      expect(snapshot.finished).toBe(0);
    }
  });

  // The agent-view docs give `pid` and `status` only while the process is
  // alive, so a row without a pid lacks a status with no shape change.
  test('a current row without a pid or a status adds no warning', () => {
    const rows = [
      exited(bg({ state: 'blocked' })),
      exited(bg({ id: 'b', state: 'working' })),
    ];
    expect(build({ rows }).warnings).toEqual([]);
  });

  test('the others list carries the reason of a waiting row', () => {
    const row = inter({ status: 'waiting', waitingFor: 'input needed' });
    expect(build({ rows: [row] }).others).toEqual([
      {
        name: 'inter',
        repo: 'sidekick',
        kind: 'interactive',
        state: 'waiting',
        reason: 'input needed',
      },
    ]);
  });
});

describe('unknown values and shape changes', () => {
  test('an unknown state is kept raw and warned about by value', () => {
    const snapshot = build({
      rows: [bg({ state: 'paused', status: 'idle' })],
    });
    expect(snapshot.others[0]?.state).toBe('paused');
    expect(snapshot.warnings.some((w) => w.includes('"paused"'))).toBe(true);
  });

  test('an unknown status and an unknown kind are warned about', () => {
    const snapshot = build({
      rows: [inter({ status: 'dozing', kind: 'remote' })],
    });
    expect(snapshot.warnings.some((w) => w.includes('"dozing"'))).toBe(true);
    expect(snapshot.warnings.some((w) => w.includes('"remote"'))).toBe(true);
  });

  test('a row with a pid and without status warns that the shape changed', () => {
    const snapshot = build({ rows: [inter({})] });
    expect(snapshot.warnings.some((w) => w.includes('shape changed'))).toBe(
      true,
    );
  });

  test('a background row without state warns that the shape changed', () => {
    const snapshot = build({ rows: [bg({ status: 'idle' })] });
    expect(snapshot.warnings.some((w) => w.includes('shape changed'))).toBe(
      true,
    );
  });

  test('known rows add no warning, and input warnings are carried', () => {
    const quiet = build({ rows: [bg({ state: 'working', status: 'busy' })] });
    expect(quiet.warnings).toEqual([]);
    expect(build({ warnings: ['from the input'] }).warnings).toEqual([
      'from the input',
    ]);
  });
});

describe('self', () => {
  test('the row whose sessionId is self appears nowhere', () => {
    const row = bg({ state: 'blocked', status: 'waiting', waitingFor: 'x' });
    const snapshot = build({ rows: [row], self: row.sessionId });
    expect(snapshot.waiting).toEqual([]);
    expect(snapshot.others).toEqual([]);
  });

  test('a record joined to the self row is left out too', () => {
    const row = bg({ state: 'working', status: 'busy', name: 'w1' });
    const snapshot = build({
      rows: [row],
      records: [record('w1')],
      self: row.sessionId,
    });
    expect(snapshot.children).toEqual([]);
  });
});

describe('children', () => {
  test('a record joins its row by job id, and the row is not in others', () => {
    const row = bg({ id: 'job1', name: 'renamed', state: 'working' });
    const snapshot = build({
      rows: [row],
      records: [record('w1', 'job1')],
      facts: new Map([
        ['w1', facts({ tokens: 5, plan: 'P', lastCommit: 'c' })],
      ]),
    });
    expect(snapshot.children).toEqual([
      {
        name: 'w1',
        state: 'working',
        tokens: 5,
        plan: 'P',
        lastCommit: 'c',
        unintegrated: 0,
        uncommitted: false,
      },
    ]);
    expect(snapshot.others).toEqual([]);
  });

  test('a record with a job does not join by name', () => {
    const row = bg({ id: 'other', name: 'w1', state: 'working' });
    const snapshot = build({ rows: [row], records: [record('w1', 'job1')] });
    expect(snapshot.children[0]?.state).toBe('gone');
    expect(snapshot.others).toHaveLength(1);
  });

  test('a record without a job joins by name, preferring the current row', () => {
    const old = bg({ id: 'old', name: 'w1', state: 'done', pid: undefined });
    delete old.pid;
    const live = bg({ id: 'new', name: 'w1', state: 'working' });
    const snapshot = build({ rows: [old, live], records: [record('w1')] });
    expect(snapshot.children[0]?.state).toBe('working');
    const reversed = build({ rows: [live, old], records: [record('w1')] });
    expect(reversed.children[0]?.state).toBe('working');
  });

  test('a current row without a pid is preferred over an old row of the same name', () => {
    const old = exited(bg({ id: 'old', name: 'w1', state: 'done' }));
    const blocked = exited(bg({ id: 'new', name: 'w1', state: 'blocked' }));
    const snapshot = build({ rows: [old, blocked], records: [record('w1')] });
    expect(snapshot.children[0]?.state).toBe('blocked');
  });

  test('a record without a job and without a current row takes the first listed', () => {
    const first = bg({ id: 'o1', name: 'w1', state: 'stopped' });
    const second = bg({ id: 'o2', name: 'w1', state: 'done' });
    delete first.pid;
    delete second.pid;
    const snapshot = build({
      rows: [first, second],
      records: [record('w1')],
    });
    expect(snapshot.children[0]?.state).toBe('stopped');
  });

  test('a waiting child is in waiting with child true, ahead of others', () => {
    const other = bg({
      id: 'o',
      name: 'other',
      state: 'blocked',
      status: 'waiting',
      waitingFor: 'input needed',
    });
    const child = bg({
      id: 'job1',
      name: 'w1',
      cwd: '/x/sidekick/.claude/worktrees/w1',
      state: 'blocked',
      status: 'waiting',
      waitingFor: 'permission prompt',
    });
    const snapshot = build({
      rows: [other, child],
      records: [record('w1', 'job1')],
    });
    expect(snapshot.waiting).toEqual([
      {
        name: 'w1',
        repo: 'sidekick',
        reason: 'permission prompt',
        child: true,
      },
      { name: 'other', repo: 'sidekick', reason: 'input needed', child: false },
    ]);
    expect(snapshot.children[0]).toMatchObject({
      state: 'blocked',
      reason: 'permission prompt',
    });
  });

  test('a blocked child without a pid waits with child true, its reason waitingFor, else blocked', () => {
    const child = (over: ListingRow) =>
      exited(bg({ id: 'job1', name: 'w1', state: 'blocked', ...over }));
    const asked = build({
      rows: [child({ waitingFor: 'permission prompt' })],
      records: [record('w1', 'job1')],
    });
    expect(asked.waiting).toEqual([
      {
        name: 'w1',
        repo: 'sidekick',
        reason: 'permission prompt',
        child: true,
      },
    ]);
    const bare = build({ rows: [child({})], records: [record('w1', 'job1')] });
    expect(bare.waiting).toEqual([
      { name: 'w1', repo: 'sidekick', reason: 'blocked', child: true },
    ]);
    expect(bare.children).toEqual([
      {
        name: 'w1',
        state: 'blocked',
        reason: 'blocked',
        unintegrated: 0,
        uncommitted: false,
      },
    ]);
    expect(bare.others).toEqual([]);
  });

  test('a working child without a pid ranks with the working, and does not wait', () => {
    const rows = [
      bg({ id: 'j1', name: 'done1', state: 'done' }),
      exited(bg({ id: 'j2', name: 'loop1', state: 'working' })),
    ];
    const snapshot = build({
      rows,
      records: ['done1', 'loop1'].map((n) => record(n)),
    });
    expect(snapshot.children.map((c) => c.name)).toEqual(['loop1', 'done1']);
    expect(snapshot.waiting).toEqual([]);
  });

  test('a done child shows its raw state in children and is not counted as finished', () => {
    const child = bg({ id: 'job1', name: 'w1', state: 'done', status: 'idle' });
    const snapshot = build({ rows: [child], records: [record('w1', 'job1')] });
    expect(snapshot.children[0]?.state).toBe('done');
    expect(snapshot.finished).toBe(0);
  });

  test.each([
    'done',
    'stopped',
    'failed',
  ])('a %s child without a pid still shows as a child, uncounted', (state) => {
    const child = exited(bg({ id: 'job1', name: 'w1', state }));
    const snapshot = build({
      rows: [child],
      records: [record('w1', 'job1')],
    });
    expect(snapshot.children.map((c) => [c.name, c.state])).toEqual([
      ['w1', state],
    ]);
    expect(snapshot.finished).toBe(0);
    expect(snapshot.waiting).toEqual([]);
  });

  test('a fresh idle interactive child is not counted as finished', () => {
    const child = inter({ name: 'w1', status: 'idle' });
    const snapshot = build({
      rows: [child],
      records: [record('w1')],
      freshInteractive: new Set([child.sessionId ?? '']),
    });
    expect(snapshot.finished).toBe(0);
  });

  test('children order waiting, then working, then the rest', () => {
    const rows = [
      bg({ id: 'j1', name: 'done1', state: 'done' }),
      bg({ id: 'j2', name: 'busy1', state: 'working', status: 'busy' }),
      bg({ id: 'j3', name: 'wait1', state: 'blocked', status: 'waiting' }),
      bg({ id: 'j4', name: 'busy2', state: 'working', status: 'busy' }),
    ];
    const snapshot = build({
      rows,
      records: ['done1', 'busy1', 'wait1', 'busy2'].map((n) => record(n)),
    });
    expect(snapshot.children.map((c) => c.name)).toEqual([
      'wait1',
      'busy1',
      'busy2',
      'done1',
    ]);
  });

  test('a record with no row reads gone, with its facts', () => {
    const snapshot = build({
      records: [record('w1', 'job1')],
      facts: new Map([
        ['w1', facts({ unintegrated: 3, uncommitted: true, lastCommit: 'c' })],
      ]),
    });
    expect(snapshot.children).toEqual([
      {
        name: 'w1',
        state: 'gone',
        lastCommit: 'c',
        unintegrated: 3,
        uncommitted: true,
      },
    ]);
  });

  test('a record with no facts reads as clean', () => {
    const snapshot = build({ records: [record('w1')] });
    expect(snapshot.children[0]).toEqual({
      name: 'w1',
      state: 'gone',
      unintegrated: 0,
      uncommitted: false,
    });
  });
});

describe('names and repo', () => {
  test('a row without a name shows the first eight characters of its sessionId, else its id', () => {
    const noName = bg({ state: 'working' });
    delete noName.name;
    expect(build({ rows: [noName] }).others[0]?.name).toBe('aaaa0001');
    const onlyId = bg({ state: 'working', id: 'zz9' });
    delete onlyId.name;
    delete onlyId.sessionId;
    expect(build({ rows: [onlyId] }).others[0]?.name).toBe('zz9');
  });

  test('repo is the last folder of cwd, minus a trailing worktree path', () => {
    const rows = [
      bg({ id: '1', name: 'a', cwd: '/x/sidekick/.claude/worktrees/p7-desk' }),
      bg({ id: '2', name: 'b', cwd: '/x/odin/docs/designs' }),
      bg({ id: '3', name: 'c', cwd: '/x/furnace/' }),
    ].map((r) => ({ ...r, state: 'working' }));
    expect(build({ rows }).others.map((o) => o.repo)).toEqual([
      'sidekick',
      'designs',
      'furnace',
    ]);
  });

  test('the snapshot carries repo only when the input has one', () => {
    expect(build({ repo: 'sidekick' }).repo).toBe('sidekick');
    expect('repo' in build({})).toBe(false);
  });
});

describe('staleRecordNames', () => {
  const gone = new Map([['w1', facts({ worktreeExists: false })]]);

  test('returns a record whose job is absent and whose worktree is gone', () => {
    expect(staleRecordNames([], [record('w1', 'job1')], gone)).toEqual(['w1']);
  });

  test('keeps a record whose job is present', () => {
    const rows = [bg({ id: 'job1', pid: undefined })];
    expect(staleRecordNames(rows, [record('w1', 'job1')], gone)).toEqual([]);
  });

  test('keeps a record whose worktree exists', () => {
    const exists = new Map([['w1', facts()]]);
    expect(staleRecordNames([], [record('w1', 'job1')], exists)).toEqual([]);
  });

  test('keeps a record with no facts', () => {
    expect(staleRecordNames([], [record('w1', 'job1')], new Map())).toEqual([]);
  });

  test('treats a null-job record as absent when no row shares its name', () => {
    const rows = [bg({ id: 'x', name: 'other' })];
    expect(staleRecordNames(rows, [record('w1')], gone)).toEqual(['w1']);
    const named = [bg({ id: 'x', name: 'w1' })];
    expect(staleRecordNames(named, [record('w1')], gone)).toEqual([]);
  });

  // Pruning asks only whether a row is listed, current or not.
  test.each([
    'blocked',
    'working',
    'done',
    'stopped',
    'failed',
  ])('keeps a record whose row is listed without a pid, in state %s', (state) => {
    const byJob = [exited(bg({ id: 'job1', state }))];
    expect(staleRecordNames(byJob, [record('w1', 'job1')], gone)).toEqual([]);
    const byName = [exited(bg({ id: 'x', name: 'w1', state }))];
    expect(staleRecordNames(byName, [record('w1')], gone)).toEqual([]);
  });
});
