import { describe, expect, test } from 'bun:test';
import type { Drift } from './pm.js';
import type { Milestone } from './pm-data.js';
import type { GlanceInput, StatusUpdate, UpdateStatus } from './pm-glance.js';
import { glanceState } from './pm-glance.js';
import type { Plans } from './pm-plans.js';

const CREATED = '2026-10-13T13:04:27Z';

function milestone(created_at = CREATED): Milestone {
  return {
    number: 9,
    title: 'R9',
    description: '',
    due_on: null,
    open_issues: 3,
    closed_issues: 1,
    state: 'open',
    created_at,
  };
}

const quiet: Drift = {
  unpushed: { count: 0, basis: 'upstream' },
  stale_in_progress: [],
  open_pr: null,
  in_progress_split: [],
};

function update(status: UpdateStatus, startDate = '2026-10-13'): StatusUpdate {
  return { status, startDate };
}

function input(over: Partial<GlanceInput> = {}): GlanceInput {
  return {
    milestone: milestone(),
    openCount: 1,
    plans: null,
    drift: quiet,
    status: { ok: true, updates: [update('ON_TRACK')] },
    ...over,
  };
}

const withUpdate = (status: UpdateStatus): Partial<GlanceInput> => ({
  status: { ok: true, updates: [update(status)] },
});

const stale = (number: number) => ({
  number,
  title: 't',
  item_id: 'i',
  age_days: 9,
  assignees: [],
  milestone: null,
});

describe('floor table', () => {
  const rows: Array<[Partial<GlanceInput>, string, string]> = [
    [withUpdate('ON_TRACK'), 'good', 'on track'],
    [withUpdate('COMPLETE'), 'good', 'complete'],
    [withUpdate('AT_RISK'), 'warning', 'at risk'],
    [withUpdate('OFF_TRACK'), 'bad', 'off track'],
    [withUpdate('INACTIVE'), 'unknown', 'inactive'],
    [{ status: { ok: true, updates: [] } }, 'unknown', 'no update'],
    [{ status: { ok: false } }, 'unknown', 'status unread'],
    [{ milestone: null, openCount: 0 }, 'unknown', 'no milestone'],
    [{ milestone: null, openCount: 2 }, 'unknown', 'pick a milestone'],
  ];
  for (const [over, level, word] of rows) {
    test(word, () => {
      expect(glanceState(input(over))).toEqual({ level, word, detail: null });
    });
  }
});

describe('which update counts', () => {
  test('skips a newer update with another startDate', () => {
    const state = glanceState(
      input({
        status: {
          ok: true,
          updates: [update('OFF_TRACK', '2026-10-20'), update('AT_RISK')],
        },
      }),
    );
    expect(state.word).toBe('at risk');
  });
  test('the newest matching update wins', () => {
    const state = glanceState(
      input({
        status: { ok: true, updates: [update('COMPLETE'), update('AT_RISK')] },
      }),
    );
    expect(state.word).toBe('complete');
  });
  test('23:30Z matches the UTC day', () => {
    const state = glanceState(
      input({ milestone: milestone('2026-10-13T23:30:00Z') }),
    );
    expect(state.word).toBe('on track');
  });
  test('00:30Z the next day does not match', () => {
    const state = glanceState(
      input({ milestone: milestone('2026-10-14T00:30:00Z') }),
    );
    expect(state.word).toBe('no update');
  });
  test('only other days reads no update', () => {
    const state = glanceState(
      input({
        status: { ok: true, updates: [update('ON_TRACK', '2026-10-01')] },
      }),
    );
    expect(state.word).toBe('no update');
  });
});

describe('drift short forms', () => {
  const detail = (drift: Drift) => glanceState(input({ drift })).detail;
  test('unpushed', () => {
    expect(
      detail({ ...quiet, unpushed: { count: 3, basis: 'upstream' } }),
    ).toBe('3 unpushed');
  });
  test('stale takes the first', () => {
    expect(
      detail({ ...quiet, stale_in_progress: [stale(233), stale(240)] }),
    ).toBe('stale #233');
  });
  test('open PR', () => {
    expect(detail({ ...quiet, open_pr: { number: 12, title: 'x' } })).toBe(
      'open PR #12',
    );
  });
  test('split', () => {
    expect(detail({ ...quiet, in_progress_split: ['R9', 'R10'] })).toBe(
      'split',
    );
  });
  test('plans header', () => {
    const plans: Plans = {
      parse: 'malformed',
      reason: 'bad',
      list: [],
      unplanned: [],
    };
    expect(glanceState(input({ plans })).detail).toBe('plans header');
  });
  test('well-formed plans are no drift', () => {
    const plans: Plans = { parse: 'ok', list: [], unplanned: [] };
    expect(glanceState(input({ plans })).detail).toBeNull();
  });
  test('+1 and +2 count the further kinds', () => {
    const two: Drift = {
      ...quiet,
      unpushed: { count: 3, basis: 'upstream' },
      open_pr: { number: 12, title: 'x' },
    };
    expect(detail(two)).toBe('3 unpushed +1');
    expect(detail({ ...two, in_progress_split: ['a', 'b'] })).toBe(
      '3 unpushed +2',
    );
  });
  test('null and zero unpushed are no drift', () => {
    expect(
      glanceState(
        input({
          drift: { ...quiet, unpushed: { count: null, basis: 'none' } },
        }),
      ),
    ).toEqual({ level: 'good', word: 'on track', detail: null });
    expect(glanceState(input())).toEqual({
      level: 'good',
      word: 'on track',
      detail: null,
    });
  });
});

describe('lifting rule', () => {
  const drift: Drift = { ...quiet, unpushed: { count: 3, basis: 'upstream' } };
  test('on track lifts to a drift warning', () => {
    expect(glanceState(input({ drift }))).toEqual({
      level: 'warning',
      word: 'drift',
      detail: '3 unpushed',
    });
  });
  test('at risk keeps its word and gains the detail', () => {
    expect(glanceState(input({ ...withUpdate('AT_RISK'), drift }))).toEqual({
      level: 'warning',
      word: 'at risk',
      detail: '3 unpushed',
    });
  });
  test('off track stays bad', () => {
    expect(glanceState(input({ ...withUpdate('OFF_TRACK'), drift }))).toEqual({
      level: 'bad',
      word: 'off track',
      detail: '3 unpushed',
    });
  });
  test('no update lifts to a drift warning', () => {
    expect(
      glanceState(input({ status: { ok: true, updates: [] }, drift })),
    ).toEqual({ level: 'warning', word: 'drift', detail: '3 unpushed' });
  });
});
