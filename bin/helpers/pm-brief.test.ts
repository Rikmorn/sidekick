import { describe, expect, test } from 'bun:test';
import { fixture, plansHeader } from './fixtures/pm/runner.js';
import type { Candidate, InProgress } from './pm.js';
import {
  type BriefInput,
  nextMove,
  PER_TIER_MAX,
  renderBrief,
  TITLE_MAX,
} from './pm-brief.js';
import type { Item, Milestone } from './pm-data.js';
import { planView } from './pm-plans.js';

const inProgress = (
  number: number,
  age_days: number,
  title = `t${number}`,
): InProgress => ({
  number,
  title,
  item_id: `PVTI_${number}`,
  age_days,
  assignees: [],
  milestone: null,
});
const cand = (
  number: number,
  tier: 1 | 2,
  title = `t${number}`,
): Candidate => ({
  tier,
  number,
  title,
  item_id: `PVTI_${number}`,
  labels: ['area:pm'],
});
const base = (over: Partial<BriefInput> = {}): BriefInput => ({
  board: { owner: 'Rikmorn', repo: 'sidekick', project: { number: 2 } },
  milestone: {
    number: 6,
    title: 'R6 — PM layer',
    description: 'Outcome: sessions start from the board. Scope: the PM layer.',
    due_on: null,
    open_issues: 3,
    closed_issues: 2,
    state: 'open',
    created_at: '2026-09-19T14:29:56Z',
  },
  open_milestones: [{ number: 6, title: 'R6 — PM layer' }],
  in_progress: [],
  candidates: [],
  plans: null,
  drift: {
    unpushed: { count: 0, basis: 'upstream' },
    stale_in_progress: [],
    open_pr: null,
    in_progress_split: [],
  },
  ...over,
});

describe('renderBrief', () => {
  test('a tracked repo with a milestone and nothing open renders six lines', () => {
    expect(renderBrief(base())).toBe(
      [
        'sidekick · Rikmorn/sidekick · board #2',
        'milestone: R6 — PM layer (3 open, 2 closed) · Outcome: sessions start from the board.',
        'in progress: none',
        'candidates: none',
        'drift: none',
        'next: nothing to pick up: verify, then close the milestone',
      ].join('\n'),
    );
  });

  test('no open milestone is an ordinary state', () => {
    const r = renderBrief(base({ milestone: null, open_milestones: [] }));
    expect(r.split('\n')[1]).toBe('milestone: none');
    expect(r.split('\n')[5]).toBe(
      'next: nothing open: open the next milestone',
    );
  });

  test('other open milestones show as also open beside the active one', () => {
    const r = renderBrief(
      base({
        open_milestones: [
          { number: 6, title: 'R6 — PM layer' },
          { number: 7, title: 'R7 — Design pass' },
          { number: 9, title: `R9 — ${'x'.repeat(70)}` },
        ],
      }),
    );
    expect(r.split('\n')[1]).toBe(
      `milestone: R6 — PM layer (3 open, 2 closed) · Outcome: sessions start from the board. · also open: R7 — Design pass, R9 — ${'x'.repeat(54)}…`,
    );
  });

  test('with none active among open milestones, the brief lists them and next asks to choose', () => {
    const r = renderBrief(
      base({
        milestone: null,
        open_milestones: [
          { number: 7, title: 'R7 — A' },
          { number: 9, title: 'R9 — B' },
        ],
        in_progress: [inProgress(3, 1)],
        candidates: [cand(200, 2)],
        drift: {
          unpushed: { count: 0, basis: 'upstream' },
          stale_in_progress: [],
          open_pr: null,
          in_progress_split: ['R7 — A', 'R9 — B'],
        },
      }),
    ).split('\n');
    expect(r[1]).toBe('milestone: none active · open: R7 — A, R9 — B');
    expect(r[4]).toBe('drift: In Progress split: R7 — A, R9 — B');
    expect(r[5]).toBe('next: choose a milestone: R7 — A, R9 — B');
  });

  test('in progress lists every card with its age and next continues the lowest number', () => {
    const r = renderBrief(
      base({ in_progress: [inProgress(112, 3), inProgress(110, 1)] }),
    ).split('\n');
    expect(r[2]).toBe('in progress: #112 t112 (3 d), #110 t110 (1 d)');
    expect(r[5]).toBe('next: continue #110');
  });

  test('candidates keep pickup order, cap per tier, and flag that order is not priority', () => {
    const tier1 = [111, 112, 113, 114, 115, 116, 117].map((n) => cand(n, 1));
    const r = renderBrief(base({ candidates: [...tier1, cand(200, 2)] })).split(
      '\n',
    );
    expect(r[3]).toBe(
      `candidates: tier 1 #111 t111; #112 t112; #113 t113; #114 t114; #115 t115 +${7 - PER_TIER_MAX} more · tier 2 #200 t200 (order: number, not priority)`,
    );
    expect(r[5]).toBe('next: pull one tier-1 candidate');
  });

  test('one candidate carries no order caveat; tier 2 alone is never the pull', () => {
    const r = renderBrief(base({ candidates: [cand(200, 2)] })).split('\n');
    expect(r[3]).toBe('candidates: tier 2 #200 t200');
    expect(r[5]).toBe(
      'next: nothing to pick up: verify, then close the milestone',
    );
  });

  test('drift names unpushed, stale cards, and an open PR; null unpushed is silent', () => {
    const stale = inProgress(109, 9);
    const r = renderBrief(
      base({
        in_progress: [stale],
        drift: {
          unpushed: { count: 4, basis: 'origin-branch' },
          stale_in_progress: [stale],
          open_pr: { number: 42, title: 'pr' },
          in_progress_split: [],
        },
      }),
    ).split('\n');
    expect(r[4]).toBe('drift: 4 unpushed · stale: #109 (9 d) · open PR #42');
    expect(
      renderBrief(
        base({
          drift: {
            unpushed: { count: null, basis: 'none' },
            stale_in_progress: [],
            open_pr: null,
            in_progress_split: [],
          },
        }),
      ).split('\n')[4],
    ).toBe('drift: none');
  });

  test('long titles are cut at TITLE_MAX with an ellipsis', () => {
    const long = 'x'.repeat(TITLE_MAX + 10);
    const r = renderBrief(
      base({ in_progress: [inProgress(1, 0, long)] }),
    ).split('\n')[2];
    expect(r).toBe(`in progress: #1 ${'x'.repeat(TITLE_MAX - 1)}… (0 d)`);
  });

  test('a milestone description without a sentence end is shown whole', () => {
    const r = renderBrief(
      base({
        milestone: {
          number: 6,
          title: 'R6 — PM layer',
          description: 'no terminal punctuation',
          due_on: null,
          open_issues: 3,
          closed_issues: 2,
          state: 'open',
          created_at: '2026-09-19T14:29:56Z',
        },
      }),
    ).split('\n')[1];
    expect(r).toBe(
      'milestone: R6 — PM layer (3 open, 2 closed) · no terminal punctuation',
    );
  });

  test('a multi-line description still renders one milestone line', () => {
    const r = renderBrief(
      base({
        milestone: {
          number: 6,
          title: 'R6 — PM layer',
          description:
            'Outcome: sessions start from the board\nScope: the PM layer.\nSize: two.',
          due_on: null,
          open_issues: 3,
          closed_issues: 2,
          state: 'open',
          created_at: '2026-09-19T14:29:56Z',
        },
      }),
    );
    expect(r.split('\n')).toHaveLength(6);
    expect(r.split('\n')[1]).toBe(
      'milestone: R6 — PM layer (3 open, 2 closed) · Outcome: sessions start from the board Scope: the PM layer.',
    );
  });

  test('a plans header never shows as the outcome: the milestone line reads the prose after it', () => {
    const r = renderBrief(
      base({
        milestone: {
          number: 8,
          title: 'R8 — Fixes filed by 30 September',
          description: fixture('description-r8.txt'),
          due_on: null,
          open_issues: 33,
          closed_issues: 8,
          state: 'open',
          created_at: '2026-09-30T20:31:45Z',
        },
        open_milestones: [
          { number: 8, title: 'R8 — Fixes filed by 30 September' },
        ],
      }),
    );
    expect(r.split('\n')[1]).toBe(
      "milestone: R8 — Fixes filed by 30 September (33 open, 8 closed) · Outcome: the issues listed in Plans, filed by 2026-09-30 against sidekick's skills, rules, and CLI, are resolved or closed with a verdict.",
    );
  });

  test('nextMove without plans: in progress, tier 1, then close or open; never tier 2', () => {
    expect(
      nextMove(
        base({ in_progress: [inProgress(5, 0)], candidates: [cand(1, 1)] }),
      ),
    ).toBe('continue #5');
    expect(nextMove(base({ candidates: [cand(9, 2), cand(1, 1)] }))).toBe(
      'pull one tier-1 candidate',
    );
    expect(nextMove(base({ candidates: [cand(9, 2)] }))).toBe(
      'nothing to pick up: verify, then close the milestone',
    );
    expect(nextMove(base())).toBe(
      'nothing to pick up: verify, then close the milestone',
    );
    expect(nextMove(base({ milestone: null, candidates: [cand(9, 2)] }))).toBe(
      'nothing open: open the next milestone',
    );
  });
});

describe('plans in the brief', () => {
  const r9 = (description: string): Milestone => ({
    number: 9,
    title: 'R9',
    description,
    due_on: null,
    open_issues: 4,
    closed_issues: 1,
    state: 'open',
    created_at: '2026-10-01T09:00:00Z',
  });
  const card = (
    number: number,
    status: string,
    state: 'OPEN' | 'CLOSED' = 'OPEN',
  ): Item => ({
    itemId: `PVTI_${number}`,
    number,
    status,
    title: `t${number}`,
    state,
    stateReason: null,
    updatedAt: '2026-10-01T00:00:00Z',
    statusUpdatedAt: null,
    url: '',
    milestone: 'R9',
    labels: [],
    assignees: [],
    repo: 'Rikmorn/sidekick',
  });
  const withPlans = (
    description: string,
    items: Item[],
    over: Partial<BriefInput> = {},
  ): BriefInput =>
    base({
      milestone: r9(description),
      plans: planView(r9(description), items),
      ...over,
    });

  test("R8's state renders plans in the in-progress and candidates lines, and next continues the plan", () => {
    const description = fixture('description-r8.txt');
    const closed = [161, 152, 164, 158, 134];
    const running = [141, 106, 168, 170];
    const items = [
      ...closed.map((n) => card(n, 'Done', 'CLOSED')),
      ...running.map((n) => card(n, 'In Progress')),
      ...[
        131, 153, 166, 118, 155, 157, 160, 154, 167, 162, 163, 156, 144, 115,
        133, 114, 151, 145, 149, 108, 102, 126, 142, 147, 159, 100, 105, 137,
        143, 165,
      ].map((n) => card(n, 'Backlog')),
    ];
    const r = renderBrief(
      withPlans(description, items, {
        in_progress: [
          inProgress(106, 1),
          inProgress(141, 1),
          inProgress(168, 1),
          inProgress(170, 0),
        ],
      }),
    ).split('\n');
    expect(r).toHaveLength(6);
    expect(r[2]).toBe(
      'in progress: plan Plans in the brief: #141 (1 d), #106 (1 d), #168 (1 d), #170 (0 d)',
    );
    expect(r[3]).toBe(
      'candidates: next plan Lint reads the issue side (#131, #153, #166, #118) · then Claims checked before they land (5), Rules say one thing (5), PM guidance matches GitHub (3), Rules delivery fits every repo (5), sk-design from use (3), Docs tidy (3), One release order (2) · 1 plan done · unplanned: none · tier 2: none',
    );
    expect(r[5]).toBe(
      'next: continue plan Plans in the brief (#141, #106, #168, #170, #171, #172, #173)',
    );
  });

  test('a card in no plan keeps its title; verify plans, done plans, unplanned issues, and tier 2 show', () => {
    const description = plansHeader('A (#1, #2)', 'B (#3)', 'C (#4)', 'D (#5)');
    const items = [
      card(1, 'In Progress'),
      card(2, 'Backlog'),
      card(3, 'Verify'),
      card(4, 'Done', 'CLOSED'),
      card(5, 'Done', 'CLOSED'),
      card(7, 'Backlog'),
    ];
    const r = renderBrief(
      withPlans(description, items, {
        in_progress: [inProgress(1, 2), inProgress(9, 4)],
        candidates: [cand(2, 1), cand(7, 1), cand(200, 2)],
      }),
    ).split('\n');
    expect(r[2]).toBe('in progress: plan A: #1 (2 d) · #9 t9 (4 d)');
    expect(r[3]).toBe(
      'candidates: in verify: B · 2 plans done · unplanned: #7 · tier 2: #200 t200',
    );
  });

  test('an unplanned issue In Progress shows in the in-progress line, not in unplanned', () => {
    const r = renderBrief(
      withPlans(
        plansHeader('A (#1)'),
        [card(1, 'Backlog'), card(7, 'In Progress'), card(8, 'Backlog')],
        { in_progress: [inProgress(7, 2)] },
      ),
    ).split('\n');
    expect(r[2]).toBe('in progress: #7 t7 (2 d)');
    expect(r[3]).toBe(
      'candidates: next plan A (#1) · unplanned: #8 · tier 2: none',
    );
  });

  test('the lowest In Progress card is continued alone when it is in no plan, beside a planned one', () => {
    const r = renderBrief(
      withPlans(
        plansHeader('A (#5, #6)'),
        [card(3, 'In Progress'), card(5, 'In Progress'), card(6, 'Backlog')],
        { in_progress: [inProgress(5, 1), inProgress(3, 1)] },
      ),
    ).split('\n');
    expect(r[5]).toBe('next: continue #3');
  });

  test('a malformed header renders lines 3 and 4 as if there were no plans', () => {
    const items = [card(1, 'Backlog')];
    const r = renderBrief(
      withPlans(plansHeader('A (#1)', 'A (#2)'), items, {
        candidates: [cand(1, 1), cand(200, 2)],
      }),
    ).split('\n');
    expect(r[3]).toBe(
      'candidates: tier 1 #1 t1 · tier 2 #200 t200 (order: number, not priority)',
    );
    expect(r[5]).toBe('next: pull one tier-1 candidate');
  });

  test('nextMove with plans: continue a plan, pull the next plan, then an unplanned issue, then close', () => {
    const description = plansHeader('A (#1, #2)', 'B (#3)');
    expect(
      nextMove(
        withPlans(description, [card(1, 'In Progress'), card(2, 'Backlog')], {
          in_progress: [inProgress(1, 0), inProgress(9, 0)],
        }),
      ),
    ).toBe('continue plan A (#1, #2)');
    expect(
      nextMove(
        withPlans(description, [card(1, 'Backlog')], {
          in_progress: [inProgress(9, 0)],
        }),
      ),
    ).toBe('continue #9');
    expect(
      nextMove(
        withPlans(description, [
          card(1, 'Done', 'CLOSED'),
          card(2, 'Done', 'CLOSED'),
          card(3, 'Backlog'),
        ]),
      ),
    ).toBe('pull plan B (#3)');
    expect(
      nextMove(
        withPlans(
          description,
          [
            card(1, 'Verify'),
            card(2, 'Done', 'CLOSED'),
            card(3, 'Verify'),
            card(7, 'Backlog'),
          ],
          { candidates: [cand(7, 1), cand(200, 2)] },
        ),
      ),
    ).toBe('pull one unplanned candidate');
    expect(
      nextMove(
        withPlans(
          description,
          [card(1, 'Verify'), card(2, 'Done', 'CLOSED'), card(3, 'Verify')],
          { candidates: [cand(200, 2)] },
        ),
      ),
    ).toBe('nothing to pick up: verify, then close the milestone');
  });
});
