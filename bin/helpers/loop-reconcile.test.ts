import { describe, expect, test } from 'bun:test';
import {
  type Action,
  chooseAction,
  jobsAlive,
  type ReconcileInput,
  SIX_DAYS_MS,
} from './loop-reconcile.js';
import type { Armed, LoopState } from './loop-state.js';
import type { Job } from './worker-jobs.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const NOW = new Date('2026-11-15T12:00:00.000Z');
const BOOT = new Date('2026-11-14T08:00:00.000Z');
const ago = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();
const ahead = (ms: number): string =>
  new Date(NOW.getTime() + ms).toISOString();

const state = (over: Partial<LoopState> = {}): LoopState => ({
  v: 1,
  launch: 'launch-1',
  job: 'job1',
  session: 'loop-fixer',
  launchedAt: '2026-11-15T10:00:00.000Z',
  startedAt: '2026-11-15T10:00:00.000Z',
  hash: 'h1',
  record: false,
  states: { build: 'act' },
  schedule: '*/10 * * * *',
  tick: '/sidekick:loop-tick',
  ...over,
});

const armed = (over: Partial<Armed> = {}): Armed => ({
  v: 1,
  launch: 'launch-1',
  at: ago(2 * HOUR_MS),
  tick: 'cron-a',
  renewal: 'cron-b',
  renewalAt: ahead(5 * DAY_MS),
  ...over,
});

// A live background row, between ticks.
const live = (over: Partial<Job> = {}): Job => ({
  id: 'job1',
  kind: 'background',
  name: 'loop-fixer',
  cwd: '/repo/.claude/worktrees/loop-fixer',
  sessionId: 'sess-1',
  state: 'working',
  status: 'idle',
  pid: 4242,
  ...over,
});

// A stopped background row: no process, so no pid and no status.
const stopped = (over: Partial<Job> = {}): Job =>
  live({ pid: undefined, status: undefined, ...over });

const input = (over: Partial<ReconcileInput> = {}): ReconcileInput => ({
  name: 'fixer',
  paused: false,
  state: state(),
  armed: armed(),
  rows: [live()],
  hash: 'h1',
  now: NOW,
  bootTime: BOOT,
  stopNow: false,
  ...over,
});

const refusal = (action: Action): string => {
  if (action.kind !== 'refuse') {
    throw new Error(`expected a refusal, got ${JSON.stringify(action)}`);
  }
  return action.lines.join('\n');
};

describe('SIX_DAYS_MS', () => {
  test('is six days in milliseconds', () => {
    expect(SIX_DAYS_MS).toBe(6 * DAY_MS);
  });
});

describe('jobsAlive', () => {
  test('no arm means no live jobs', () => {
    expect(jobsAlive(undefined, NOW)).toBe(false);
  });

  test('an arm made 5 days 23 hours ago is alive, and one made 6 days ago is gone', () => {
    const at = (ms: number) => armed({ at: ago(ms) });
    expect(jobsAlive(at(5 * DAY_MS + 23 * HOUR_MS), NOW)).toBe(true);
    expect(jobsAlive(at(6 * DAY_MS), NOW)).toBe(false);
    expect(jobsAlive(at(7 * DAY_MS), NOW)).toBe(false);
  });

  test('a renewal time that has passed, or is now, means the jobs are gone', () => {
    expect(jobsAlive(armed({ renewalAt: ago(60_000) }), NOW)).toBe(false);
    expect(jobsAlive(armed({ renewalAt: NOW.toISOString() }), NOW)).toBe(false);
    expect(jobsAlive(armed({ renewalAt: ahead(60_000) }), NOW)).toBe(true);
  });
});

describe('chooseAction: the pause rows, read first', () => {
  test('a paused loop with a pid and status idle is stopped, keeping its row', () => {
    expect(chooseAction(input({ paused: true }))).toEqual({
      kind: 'pause',
      job: 'job1',
    });
  });

  test.each([
    'busy',
    'waiting',
  ])('a paused loop whose status is %s refuses, naming --now', (status) => {
    const lines = refusal(
      chooseAction(input({ paused: true, rows: [live({ status })] })),
    );
    expect(lines).toContain('job1');
    expect(lines).toContain('paused');
    expect(lines).toContain(status);
    expect(lines).toContain('--now');
  });

  test.each([
    'busy',
    'waiting',
  ])('with --now, a paused loop whose status is %s is stopped', (status) => {
    expect(
      chooseAction(
        input({ paused: true, stopNow: true, rows: [live({ status })] }),
      ),
    ).toEqual({ kind: 'pause', job: 'job1' });
  });

  test('a paused loop with no pid, or no row, is left off', () => {
    expect(chooseAction(input({ paused: true, rows: [stopped()] }))).toEqual({
      kind: 'off',
    });
    expect(chooseAction(input({ paused: true, rows: [] }))).toEqual({
      kind: 'off',
    });
    expect(
      chooseAction(input({ paused: true, rows: [], state: undefined })),
    ).toEqual({ kind: 'off' });
  });

  test('the pause wins over a changed definition, a lost arm, and a boot', () => {
    const changed = { hash: 'h2', armed: undefined, bootTime: NOW };
    expect(chooseAction(input({ paused: true, ...changed }))).toEqual({
      kind: 'pause',
      job: 'job1',
    });
    expect(
      chooseAction(input({ paused: true, ...changed, rows: [stopped()] })),
    ).toEqual({ kind: 'off' });
  });

  test('a paused loop never reads the hash, which a paused prepare does not compute', () => {
    for (const rows of [[live()], [stopped()], []]) {
      expect(chooseAction(input({ paused: true, rows, hash: '' }))).toEqual(
        chooseAction(input({ paused: true, rows, hash: 'h1' })),
      );
    }
  });

  test('a paused loop with no state.json and a live row by name is stopped', () => {
    expect(
      chooseAction(input({ paused: true, state: undefined, armed: undefined })),
    ).toEqual({ kind: 'pause', job: 'job1' });
  });
});

describe('chooseAction: the table', () => {
  test('no row launches fresh, removing nothing', () => {
    const fresh = { kind: 'launch', remove: undefined, reason: 'new' };
    expect(chooseAction(input({ rows: [] }))).toEqual(fresh);
    expect(
      chooseAction(input({ rows: [], state: undefined, armed: undefined })),
    ).toEqual(fresh);
  });

  test('no state.json with a stopped row by name removes that row, then launches fresh', () => {
    expect(
      chooseAction(
        input({ state: undefined, armed: undefined, rows: [stopped()] }),
      ),
    ).toEqual({ kind: 'launch', remove: 'job1', reason: 'new' });
  });

  test('a pid and an unchanged definition leave it, armed', () => {
    expect(chooseAction(input())).toEqual({
      kind: 'leave',
      job: 'job1',
      armed: true,
    });
  });

  test('a pid and a changed definition, between ticks, relaunch', () => {
    expect(chooseAction(input({ hash: 'h2' }))).toEqual({
      kind: 'relaunch',
      job: 'job1',
    });
  });

  test.each([
    'busy',
    'waiting',
  ])('a pid and a changed definition, with status %s, refuse naming --now', (status) => {
    const lines = refusal(
      chooseAction(input({ hash: 'h2', rows: [live({ status })] })),
    );
    expect(lines).toContain('job1');
    expect(lines).toContain('definition changed');
    expect(lines).toContain(status);
    expect(lines).toContain('--now');
  });

  test.each([
    'busy',
    'waiting',
  ])('with --now, a pid and a changed definition, with status %s, relaunch', (status) => {
    expect(
      chooseAction(
        input({ hash: 'h2', stopNow: true, rows: [live({ status })] }),
      ),
    ).toEqual({ kind: 'relaunch', job: 'job1' });
  });

  test('no pid, unchanged, jobs alive, and started since the boot respawn', () => {
    expect(chooseAction(input({ rows: [stopped()] }))).toEqual({
      kind: 'respawn',
      job: 'job1',
    });
  });

  test('no pid, unchanged, and no current arm remove the row, then launch fresh', () => {
    expect(
      chooseAction(input({ rows: [stopped()], armed: undefined })),
    ).toEqual({ kind: 'launch', remove: 'job1', reason: 'jobs-gone' });
  });

  test('no pid, unchanged, and a renewal time in the past give jobs-gone', () => {
    expect(
      chooseAction(
        input({ rows: [stopped()], armed: armed({ renewalAt: ago(60_000) }) }),
      ),
    ).toEqual({ kind: 'launch', remove: 'job1', reason: 'jobs-gone' });
  });

  test('no pid, unchanged: an arm at 5 days 23 hours respawns, and one at 6 days launches fresh', () => {
    const at = (ms: number) =>
      chooseAction(
        input({
          rows: [stopped()],
          state: state({ startedAt: ago(7 * DAY_MS) }),
          bootTime: new Date(NOW.getTime() - 8 * DAY_MS),
          armed: armed({ at: ago(ms) }),
        }),
      );
    expect(at(5 * DAY_MS + 23 * HOUR_MS)).toEqual({
      kind: 'respawn',
      job: 'job1',
    });
    expect(at(6 * DAY_MS)).toEqual({
      kind: 'launch',
      remove: 'job1',
      reason: 'jobs-gone',
    });
  });

  test('no pid, unchanged, and a boot after startedAt launch fresh as rebooted', () => {
    const afterStart = new Date('2026-11-15T11:00:00.000Z');
    expect(
      chooseAction(input({ rows: [stopped()], bootTime: afterStart })),
    ).toEqual({ kind: 'launch', remove: 'job1', reason: 'rebooted' });
  });

  test('a boot at the very time of startedAt counts as a boot since it', () => {
    const atStart = new Date('2026-11-15T10:00:00.000Z');
    expect(
      chooseAction(input({ rows: [stopped()], bootTime: atStart })),
    ).toEqual({ kind: 'launch', remove: 'job1', reason: 'rebooted' });
  });

  test('a boot since startedAt reads as rebooted even when the jobs are gone too', () => {
    expect(
      chooseAction(
        input({ rows: [stopped()], bootTime: NOW, armed: undefined }),
      ),
    ).toEqual({ kind: 'launch', remove: 'job1', reason: 'rebooted' });
  });

  test('no pid and a changed definition remove the row, then launch fresh', () => {
    expect(chooseAction(input({ rows: [stopped()], hash: 'h2' }))).toEqual({
      kind: 'launch',
      remove: 'job1',
      reason: 'changed',
    });
  });

  test('removing the pause changes the hash, so the stopped row is removed and the loop launches fresh', () => {
    expect(
      chooseAction(input({ paused: false, rows: [stopped()], hash: 'h2' })),
    ).toEqual({ kind: 'launch', remove: 'job1', reason: 'changed' });
  });
});

describe('chooseAction: leave and the arm', () => {
  test.each([
    ['no current arm', undefined],
    ['an arm made six days ago', armed({ at: ago(6 * DAY_MS) })],
    ['a renewal time in the past', armed({ renewalAt: ago(60_000) })],
  ])('a live, unchanged loop with %s is left, not armed', (_label, arm) => {
    expect(chooseAction(input({ armed: arm }))).toEqual({
      kind: 'leave',
      job: 'job1',
      armed: false,
    });
  });

  test('leave ignores the status, and --now', () => {
    for (const status of ['busy', 'waiting', undefined, 'dozing']) {
      for (const stopNow of [false, true]) {
        expect(
          chooseAction(input({ stopNow, rows: [live({ status })] })),
        ).toEqual({ kind: 'leave', job: 'job1', armed: true });
      }
    }
  });
});

describe('chooseAction: finding the row', () => {
  test('the row is found by state.job, whatever its name', () => {
    expect(chooseAction(input({ rows: [live({ name: 'renamed' })] }))).toEqual({
      kind: 'leave',
      job: 'job1',
      armed: true,
    });
  });

  test('a row by name stands in when state.job is gone from the listing', () => {
    expect(
      chooseAction(
        input({ state: state({ job: 'gone' }), rows: [live({ id: 'job2' })] }),
      ),
    ).toEqual({ kind: 'leave', job: 'job2', armed: true });
  });

  test('a row by name stands in when state.job is null', () => {
    expect(
      chooseAction(
        input({ state: state({ job: null }), rows: [live({ id: 'job2' })] }),
      ),
    ).toEqual({ kind: 'leave', job: 'job2', armed: true });
  });

  test('rows of other loops and sessions are not the loop', () => {
    const others = [
      live({ id: 'job7', name: 'loop-other' }),
      live({ id: undefined, name: 'loop-fixer-2', kind: 'interactive' }),
    ];
    expect(chooseAction(input({ rows: others }))).toEqual({
      kind: 'launch',
      remove: undefined,
      reason: 'new',
    });
  });

  test('two rows by that name refuse, listing both ids', () => {
    const rows = [live({ id: 'job2' }), stopped({ id: 'job3' })];
    for (const st of [undefined, state({ job: null }), state()]) {
      const lines = refusal(chooseAction(input({ state: st, rows })));
      expect(lines).toContain('job2');
      expect(lines).toContain('job3');
      expect(lines).not.toContain('--now');
    }
  });

  test('a paused loop whose candidates are all stopped is off, however many there are', () => {
    const byName = [stopped({ id: 'job2' }), stopped({ id: 'job3' })];
    const jobAndName = [stopped({ name: 'renamed' }), stopped({ id: 'job2' })];
    for (const [st, rows] of [
      [undefined, byName],
      [state({ job: null }), byName],
      [state(), jobAndName],
    ] as const) {
      for (const stopNow of [false, true]) {
        expect(
          chooseAction(input({ paused: true, stopNow, state: st, rows })),
        ).toEqual({ kind: 'off' });
      }
    }
  });

  test.each([
    ['live', live({ id: 'job3' })],
    [
      'with a pid that is not a number',
      stopped({ id: 'job3', pidMalformed: true }),
    ],
    ['interactive', stopped({ id: undefined, kind: 'interactive' })],
  ])('a paused loop with several candidates, one %s, refuses, listing them', (_label, other) => {
    const rows = [stopped({ id: 'job2' }), other];
    for (const stopNow of [false, true]) {
      const lines = refusal(
        chooseAction(input({ paused: true, stopNow, state: undefined, rows })),
      );
      expect(lines).toContain('job2');
      expect(lines).toContain(other.id ?? 'interactive');
      expect(lines).not.toContain('--now');
    }
  });

  test('a row for state.job beside another row by that name refuses, listing both', () => {
    const rows = [live({ name: 'renamed' }), stopped({ id: 'job2' })];
    for (const paused of [false, true]) {
      for (const stopNow of [false, true]) {
        const lines = refusal(chooseAction(input({ paused, stopNow, rows })));
        expect(lines).toContain('job1');
        expect(lines).toContain('job2');
        expect(lines).toContain('state.json');
        expect(lines).not.toContain('--now');
      }
    }
  });
});

describe('chooseAction: no state.json and a live row by name', () => {
  const noState = { state: undefined, armed: undefined };

  test('between ticks, the row counts as changed and relaunches', () => {
    expect(chooseAction(input({ ...noState, hash: 'h1' }))).toEqual({
      kind: 'relaunch',
      job: 'job1',
    });
  });

  test.each([
    'busy',
    'waiting',
  ])('with status %s, it refuses naming --now, and --now relaunches', (status) => {
    const rows = [live({ status })];
    const lines = refusal(chooseAction(input({ ...noState, rows })));
    expect(lines).toContain('job1');
    expect(lines).toContain('state.json');
    expect(lines).toContain('--now');
    expect(chooseAction(input({ ...noState, rows, stopNow: true }))).toEqual({
      kind: 'relaunch',
      job: 'job1',
    });
  });
});

describe('chooseAction: rows start cannot read', () => {
  test.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])('a pid that is not a number refuses (paused %p, --now %p), naming what to run instead', (paused, stopNow) => {
    const rows = [stopped({ pidMalformed: true })];
    const lines = refusal(chooseAction(input({ paused, stopNow, rows })));
    expect(lines).toContain('job1');
    expect(lines).toContain('not a number');
    expect(lines).toContain('claude stop job1');
    expect(lines).not.toContain('--now');
  });

  test('a pid that is not a number refuses whatever the definition and the arm say', () => {
    const rows = [stopped({ pidMalformed: true })];
    for (const over of [
      { hash: 'h2' },
      { armed: undefined },
      { state: undefined },
      { bootTime: NOW },
    ]) {
      expect(chooseAction(input({ rows, ...over })).kind).toBe('refuse');
    }
  });

  test.each([
    ['no status', undefined, 'no status'],
    ['an unknown status', 'dozing', '"dozing"'],
  ])('a pid with %s cannot be told idle: a relaunch refuses naming --now', (_label, status, phrase) => {
    const rows = [live({ status })];
    const lines = refusal(chooseAction(input({ hash: 'h2', rows })));
    expect(lines).toContain(phrase);
    expect(lines).toContain('--now');
    expect(chooseAction(input({ hash: 'h2', rows, stopNow: true }))).toEqual({
      kind: 'relaunch',
      job: 'job1',
    });
  });

  test.each([
    ['no status', undefined],
    ['an unknown status', 'dozing'],
  ])('a pid with %s cannot be told idle: a pause refuses naming --now', (_label, status) => {
    const rows = [live({ status })];
    const lines = refusal(chooseAction(input({ paused: true, rows })));
    expect(lines).toContain('--now');
    expect(chooseAction(input({ paused: true, rows, stopNow: true }))).toEqual({
      kind: 'pause',
      job: 'job1',
    });
  });

  test.each([
    ['live', 4242],
    ['without a pid', undefined],
  ])('an interactive session by that name, %s, refuses, naming what to do instead', (_label, pid) => {
    const rows = [live({ id: undefined, kind: 'interactive', pid })];
    for (const paused of [false, true]) {
      for (const stopNow of [false, true]) {
        const lines = refusal(chooseAction(input({ paused, stopNow, rows })));
        expect(lines).toContain('interactive');
        expect(lines).toContain('Close');
        expect(lines).not.toContain('--now');
      }
    }
  });
});

// Every combination of the inputs that bear on liveness, checked against what
// each action may touch: nothing removed, replaced, or doubled while it might run.
describe('chooseAction: never touches a session that might be live', () => {
  const rowSets: [string, Job[]][] = [
    ['no row', []],
    ['an idle row', [live()]],
    ['a busy row', [live({ status: 'busy' })]],
    ['a waiting row', [live({ status: 'waiting' })]],
    ['a row with no status', [live({ status: undefined })]],
    ['a row with an unknown status', [live({ status: 'dozing' })]],
    ['a stopped row', [stopped()]],
    ['a malformed pid', [stopped({ pidMalformed: true })]],
    ['an interactive row', [live({ id: undefined, kind: 'interactive' })]],
    [
      'an interactive row without a pid',
      [stopped({ id: undefined, kind: 'interactive' })],
    ],
    ['two live rows by name', [live(), live({ id: 'job2' })]],
    ['a live and a stopped row by name', [stopped(), live({ id: 'job2' })]],
    [
      'the job and a live row by name',
      [live({ name: 'x' }), live({ id: 'j' })],
    ],
    [
      'the job stopped, a live row by name',
      [stopped({ name: 'x' }), live({ id: 'j' })],
    ],
    ['a live row by name, the job gone', [live({ id: 'job2' })]],
    ['a stopped row by name, the job gone', [stopped({ id: 'job2' })]],
    ['two stopped rows by name', [stopped(), stopped({ id: 'job2' })]],
    [
      'the job stopped, a stopped row by name',
      [stopped({ name: 'x' }), stopped({ id: 'j' })],
    ],
    [
      'a stopped row and a malformed pid by name',
      [stopped(), stopped({ id: 'job2', pidMalformed: true })],
    ],
    [
      'a stopped row and an interactive one by name',
      [stopped(), stopped({ id: undefined, kind: 'interactive' })],
    ],
  ];
  const states: (LoopState | undefined)[] = [
    undefined,
    state(),
    state({ job: null }),
    state({ job: 'gone' }),
  ];
  const arms: (Armed | undefined)[] = [
    armed(),
    undefined,
    armed({ renewalAt: ago(60_000) }),
  ];
  const mightRun = (row: Job): boolean =>
    row.pid !== undefined || row.pidMalformed === true || row.id === undefined;
  const isCandidate = (st: LoopState | undefined, row: Job): boolean =>
    row.name === 'loop-fixer' || (st?.job != null && row.id === st.job);

  // What is wrong with `action` for these rows, or nothing.
  function violation(
    action: Action,
    rows: Job[],
    st: LoopState | undefined,
    stopNow: boolean,
  ): string | undefined {
    const byId = (id: string) => rows.find((r) => r.id === id);
    switch (action.kind) {
      case 'launch': {
        if (rows.some((r) => isCandidate(st, r) && mightRun(r))) {
          return 'launches beside a session that might run';
        }
        if (action.remove === undefined) return undefined;
        const target = byId(action.remove);
        return target === undefined || mightRun(target)
          ? `removes ${action.remove}, which might run`
          : undefined;
      }
      case 'respawn': {
        const target = byId(action.job);
        return target === undefined || mightRun(target)
          ? `respawns ${action.job}, which might run`
          : undefined;
      }
      case 'relaunch':
      case 'pause': {
        const target = byId(action.job);
        if (target?.pid === undefined) return `stops ${action.job}, not live`;
        return target.status === 'idle' || stopNow
          ? undefined
          : `stops ${action.job} mid-tick without --now`;
      }
      case 'leave':
        return byId(action.job)?.pid === undefined
          ? `leaves ${action.job}, not live`
          : undefined;
      case 'off':
        return rows.some((r) => isCandidate(st, r) && mightRun(r))
          ? 'reads off while a session might run'
          : undefined;
      case 'refuse':
        return action.lines.length === 0 ? 'refuses with no lines' : undefined;
      default: {
        const unhandled: never = action;
        throw new Error(`unhandled action ${JSON.stringify(unhandled)}`);
      }
    }
  }

  // The pause rule: a paused loop ends off, is stopped, or refuses, and refuses only while some candidate might run.
  function pauseViolation(
    action: Action,
    rows: Job[],
    st: LoopState | undefined,
  ): string | undefined {
    if (action.kind === 'off' || action.kind === 'pause') return undefined;
    if (action.kind !== 'refuse') return `a paused loop gives ${action.kind}`;
    return rows.some((r) => isCandidate(st, r) && mightRun(r))
      ? undefined
      : 'a paused loop refuses with nothing that might run';
  }

  test('no combination breaks the rules', () => {
    const found: string[] = [];
    for (const [label, rows] of rowSets) {
      for (const st of states) {
        for (const arm of arms) {
          for (const hash of ['h1', 'h2']) {
            for (const bootTime of [BOOT, NOW]) {
              for (const paused of [false, true]) {
                for (const stopNow of [false, true]) {
                  const action = chooseAction(
                    input({
                      rows,
                      state: st,
                      armed: arm,
                      hash,
                      bootTime,
                      paused,
                      stopNow,
                    }),
                  );
                  const why =
                    violation(action, rows, st, stopNow) ??
                    (paused ? pauseViolation(action, rows, st) : undefined);
                  if (why !== undefined) {
                    found.push(
                      `${label}, state job ${st?.job}, paused ${paused}: ${why}`,
                    );
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(found).toEqual([]);
  });
});
