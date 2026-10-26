import { describe, expect, test } from 'bun:test';
import { pickups } from './fixtures/pm/pickups.js';
import type { BriefInput } from './pm-brief.js';
import { driftEntries, nextMove, pickupView } from './pm-view.js';

const pick = (name: keyof typeof pickups): BriefInput => pickups[name];

describe('pickupView', () => {
  test('the board and the milestone carry the brief’s facts', () => {
    const v = pickupView(pick('r9'));
    expect(v.board).toEqual({ owner: 'Rikmorn', repo: 'sidekick', project: 2 });
    expect(v.milestone).toEqual({
      title: 'R9 — Control centre',
      outcome: 'Outcome: GSD no longer loads, and nothing it provided is lost.',
      counts: { open: 5, closed: 23 },
    });
    expect(v.openMilestones).toEqual([
      { number: 9, title: 'R9 — Control centre' },
    ]);
    expect(v.otherOpen).toEqual([]);
  });

  test('no active milestone gives a null milestone and every open one as other', () => {
    const v = pickupView(pick('noMilestoneSeveralOpen'));
    expect(v.milestone).toBeNull();
    expect(v.otherOpen).toEqual(['R6 — PM layer', 'R7 — Something else']);
  });

  test('a milestone with no prose has a null outcome', () => {
    const p = pick('emptyMilestone');
    const m = p.milestone;
    if (m === null) throw new Error('fixture has a milestone');
    const v = pickupView({ ...p, milestone: { ...m, description: '' } });
    expect(v.milestone?.outcome).toBeNull();
  });

  test('the plans keep header order, states, and ages on In Progress issues only', () => {
    const v = pickupView(pick('r9'));
    if (v.plans.parse !== 'ok') throw new Error('R9 parses');
    expect(v.plans.list.map((pl) => pl.state).slice(-4)).toEqual([
      'running',
      'next',
      'later',
      'later',
    ]);
    const guide = v.plans.list.find((pl) => pl.name.startsWith('The control'));
    expect(
      guide?.issues.map((i) => [i.number, i.open, i.status, i.ageDays]),
    ).toEqual([
      [240, true, 'In Progress', 0],
      [253, false, 'Done', null],
      [254, false, 'Done', null],
      [251, true, 'In Progress', 0],
    ]);
  });

  test('a plan issue with no card keeps a null title, status, and age', () => {
    const v = pickupView(pick('planIssueWithNoCard'));
    if (v.plans.parse !== 'ok') throw new Error('fixture parses');
    const running = v.plans.list[0];
    expect(running?.issues[1]).toEqual({
      number: 42,
      title: null,
      open: true,
      status: null,
      ageDays: null,
    });
  });

  test('In Progress cards group by plan in header order, and those in no plan stay loose', () => {
    const v = pickupView(pick('planIssueWithNoCard'));
    expect(
      v.inProgress.byPlan.map((g) => [g.name, g.cards.map((c) => c.number)]),
    ).toEqual([['Running', [40]]]);
    expect(v.inProgress.loose.map((c) => c.number)).toEqual([45, 46]);
  });

  test('without a parsed header every In Progress card is loose', () => {
    const v = pickupView(pick('everyDrift'));
    expect(v.inProgress.byPlan).toEqual([]);
    expect(v.inProgress.loose.map((c) => c.number)).toEqual([240, 241]);
  });

  test('unplanned is the header’s unplanned issues less those In Progress', () => {
    const v = pickupView(pick('planIssueWithNoCard'));
    expect(v.unplanned.map((i) => i.number)).toEqual([44]);
  });

  test('unplanned is empty when the header does not parse', () => {
    expect(pickupView(pick('malformedHeader')).unplanned).toEqual([]);
  });

  test('the tiers are uncapped', () => {
    const v = pickupView(pick('overflowNoHeader'));
    expect(v.tier1.map((c) => c.number)).toEqual([11, 12, 13, 14, 15, 16, 17]);
    expect(v.tier2.map((c) => c.number)).toEqual([21, 22, 23, 24, 25, 26]);
  });

  test('a malformed header keeps its reason', () => {
    expect(pickupView(pick('malformedHeader')).plans).toEqual({
      parse: 'malformed',
      reason: 'the plans header lists no plans',
    });
  });

  test('no header and no plans carry parse none', () => {
    expect(pickupView(pick('emptyMilestone')).plans).toEqual({ parse: 'none' });
    expect(pickupView(pick('noMilestoneNoneOpen')).plans).toEqual({
      parse: 'none',
    });
  });

  test('next equals nextMove for every fixture', () => {
    for (const p of Object.values(pickups)) {
      expect(pickupView(p).next).toBe(nextMove(p));
    }
  });
});

describe('driftEntries', () => {
  test('every kind present gives both forms, in the brief’s order', () => {
    const p = pick('everyDrift');
    expect(pickupView(p).drift).toEqual([
      { full: '3 unpushed', short: '3 unpushed' },
      { full: 'stale: #240 (9 d), #241 (2 d)', short: 'stale #240' },
      { full: 'open PR #12', short: 'open PR #12' },
      { full: 'In Progress split: R9, R10', short: 'split' },
      { full: 'plans header: plan 2 repeats #240', short: 'plans header' },
    ]);
  });

  test('a quiet repo has no entries', () => {
    expect(pickupView(pick('r9')).drift).toEqual([]);
  });

  test('driftEntries takes the drift and the plans alone', () => {
    const p = pick('everyDrift');
    expect(driftEntries(p.drift, p.plans)).toEqual(pickupView(p).drift);
  });

  test('a null unpushed count is no entry', () => {
    const p = pick('r9');
    const entries = driftEntries(
      { ...p.drift, unpushed: { count: null, basis: 'none' } },
      null,
    );
    expect(entries).toEqual([]);
  });
});
