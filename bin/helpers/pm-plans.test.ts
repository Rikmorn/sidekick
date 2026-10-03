import { describe, expect, test } from 'bun:test';
import { fixture } from './fixtures/pm/runner.js';
import type { Item, Milestone } from './pm-data.js';
import { parsePlansClause, planView } from './pm-plans.js';

const item = (p: Partial<Item> & { number: number }): Item => ({
  itemId: `PVTI_${p.number}`,
  status: 'Backlog',
  title: `t${p.number}`,
  state: 'OPEN',
  stateReason: null,
  updatedAt: '2026-09-01T00:00:00Z',
  url: '',
  milestone: 'R9',
  labels: [],
  assignees: [],
  repo: 'Rikmorn/sidekick',
  ...p,
});
const ms = (description: string): Milestone => ({
  number: 9,
  title: 'R9',
  description,
  due_on: null,
  open_issues: 1,
  closed_issues: 0,
  state: 'open',
  created_at: '2026-10-01T09:00:00Z',
});

describe('parsePlansClause', () => {
  test("R8's real description parses as its ten plans, in clause order", () => {
    const c = parsePlansClause(fixture('description-r8.txt'));
    expect(c).toEqual({
      parse: 'ok',
      plans: [
        {
          name: "Subagent runs keep sidekick's rules",
          issues: [161, 152, 164, 158, 134],
        },
        { name: 'Plans in the brief', issues: [141, 106, 168, 170] },
        { name: 'Lint reads the issue side', issues: [131, 153, 166, 118] },
        {
          name: 'Claims checked before they land',
          issues: [155, 157, 160, 154, 167],
        },
        { name: 'Rules say one thing', issues: [162, 163, 156, 144, 115] },
        { name: 'PM guidance matches GitHub', issues: [133, 114, 151] },
        {
          name: 'Rules delivery fits every repo',
          issues: [145, 149, 108, 102, 126],
        },
        { name: 'sk-design from use', issues: [142, 147, 159] },
        { name: 'Docs tidy', issues: [100, 105, 137] },
        { name: 'One release order', issues: [143, 165] },
      ],
    });
  });

  test("R7's clause predates the grammar, so it is malformed, not partly read", () => {
    const c = parsePlansClause(fixture('description-r7.txt'));
    expect(c.parse).toBe('malformed');
  });

  test('a description without the clause has no plans', () => {
    expect(parsePlansClause('Outcome: x. Scope: y.')).toEqual({
      parse: 'none',
    });
    expect(parsePlansClause('SubPlans: A (#1).')).toEqual({ parse: 'none' });
  });

  test('spacing inside the grammar is tolerated, and a name may hold a period', () => {
    expect(parsePlansClause('Plans:A(#1,#2);B ( #3 ).')).toEqual({
      parse: 'ok',
      plans: [
        { name: 'A', issues: [1, 2] },
        { name: 'B', issues: [3] },
      ],
    });
    expect(parsePlansClause('Plans: Docs v2.0 tidy (#4). Order: x.')).toEqual({
      parse: 'ok',
      plans: [{ name: 'Docs v2.0 tidy', issues: [4] }],
    });
  });

  test('whitespace runs in a name or a reason collapse to one space, so neither spans lines', () => {
    expect(
      parsePlansClause('Plans: Lint reads\nthe issue side (#1); B (#2).'),
    ).toEqual({
      parse: 'ok',
      plans: [
        { name: 'Lint reads the issue side', issues: [1] },
        { name: 'B', issues: [2] },
      ],
    });
    expect(parsePlansClause('Plans: A\n  B (1).')).toEqual({
      parse: 'malformed',
      reason: '"A B (1)" is not <name> (#N, …)',
    });
  });

  test('a clause outside the grammar is malformed with a reason, never a partial list', () => {
    const cases: Array<[string, string]> = [
      ['Plans: (#1).', '"(#1)" is not <name> (#N, …)'],
      ['Plans: A (#1); (#2).', '"(#2)" is not <name> (#N, …)'],
      ['Plans: A (#1) B (#2).', '"A (#1) B (#2)" is not <name> (#N, …)'],
      ['Plans: A (1).', '"A (1)" is not <name> (#N, …)'],
      ['Plans: A (#1)', 'the Plans: clause has no ")." end'],
      ['Plans: A (#1, #2); B (#2).', '#2 appears in two plans'],
      ['Plans: A (#1); A (#2).', 'plan "A" appears twice'],
      ['Plans: A (#1);; B (#2).', '"" is not <name> (#N, …)'],
      [
        'Outcome: x. Plans: A (#1); B (#2);. Order: A, then B. Closes with 0.5.0 (#99).',
        'plan ". Order: A, then B. Closes with 0.5.0" holds a sentence break',
      ],
      [
        'Outcome: the brief reads the Plans: clause. Plans: Parser (#1); Brief (#2).',
        'Plans: appears twice',
      ],
      ['Plans: A (#1). Plans: B (#2).', 'Plans: appears twice'],
    ];
    for (const [description, reason] of cases) {
      expect(parsePlansClause(description)).toEqual({
        parse: 'malformed',
        reason,
      });
    }
  });
});

describe('planView', () => {
  const states = (description: string, items: Item[]) =>
    planView(ms(description), items).list.map((p) => [p.name, p.state]);

  test('state precedence: done, running, the first plan with Backlog is next, verify, later', () => {
    expect(
      states(
        'Plans: Done (#1); Run (#2, #3); Ver (#4); Nxt (#5, #6); Lat (#7).',
        [
          item({ number: 1, state: 'CLOSED', status: 'Done' }),
          item({ number: 2, status: 'In Progress' }),
          item({ number: 3 }),
          item({ number: 4, status: 'Verify' }),
          item({ number: 5, status: 'Verify' }),
          item({ number: 6 }),
          item({ number: 7 }),
        ],
      ),
    ).toEqual([
      ['Done', 'done'],
      ['Run', 'running'],
      ['Ver', 'verify'],
      ['Nxt', 'next'],
      ['Lat', 'later'],
    ]);
  });

  test('an issue with no card is open and not started, so its plan can be next', () => {
    const v = planView(ms('Plans: New (#8).'), []);
    expect(v.list).toEqual([
      {
        name: 'New',
        state: 'next',
        issues: [{ number: 8, title: null, open: true, status: null }],
      },
    ]);
  });

  test('issues keep clause order and carry the card they have', () => {
    const v = planView(ms('Plans: P (#3, #1).'), [
      item({ number: 1, status: 'Verify' }),
      item({ number: 3, state: 'CLOSED', status: 'Done' }),
    ]);
    expect(v.list[0].issues).toEqual([
      { number: 3, title: 't3', open: false, status: 'Done' },
      { number: 1, title: 't1', open: true, status: 'Verify' },
    ]);
  });

  test("unplanned is the milestone's open issues that no plan lists", () => {
    const v = planView(ms('Plans: P (#1).'), [
      item({ number: 1 }),
      item({ number: 9 }),
      item({ number: 5, status: 'In Progress' }),
      item({ number: 6, state: 'CLOSED', status: 'Done' }),
      item({ number: 7, milestone: 'R8' }),
      item({ number: 8, milestone: null }),
    ]);
    expect(v.unplanned).toEqual([
      { number: 5, title: 't5' },
      { number: 9, title: 't9' },
    ]);
  });

  test('no clause and a malformed clause give no plans and no unplanned list', () => {
    const items = [item({ number: 1 })];
    expect(planView(ms('Outcome: x.'), items)).toEqual({
      parse: 'none',
      list: [],
      unplanned: [],
    });
    expect(planView(ms('Plans: A (#1); A (#2).'), items)).toEqual({
      parse: 'malformed',
      reason: 'plan "A" appears twice',
      list: [],
      unplanned: [],
    });
  });
});
