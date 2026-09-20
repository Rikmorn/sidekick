import { describe, expect, test } from 'bun:test';
import type { Candidate, InProgress } from './pm.js';
import {
  type BriefInput,
  nextMove,
  PER_TIER_MAX,
  renderBrief,
  TITLE_MAX,
} from './pm-brief.js';

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
  },
  in_progress: [],
  candidates: [],
  drift: {
    unpushed: { count: 0, basis: 'upstream' },
    stale_in_progress: [],
    open_pr: null,
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
    expect(renderBrief(base({ milestone: null })).split('\n')[1]).toBe(
      'milestone: none',
    );
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

  test('one candidate carries no order caveat; tier 2 alone is the pull', () => {
    const r = renderBrief(base({ candidates: [cand(200, 2)] })).split('\n');
    expect(r[3]).toBe('candidates: tier 2 #200 t200');
    expect(r[5]).toBe('next: pull one tier-2 candidate');
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
        },
      }),
    );
    expect(r.split('\n')).toHaveLength(6);
    expect(r.split('\n')[1]).toBe(
      'milestone: R6 — PM layer (3 open, 2 closed) · Outcome: sessions start from the board Scope: the PM layer.',
    );
  });

  test('nextMove is the fixed rule in order: in progress, tier 1, tier 2, nothing', () => {
    expect(
      nextMove(
        base({ in_progress: [inProgress(5, 0)], candidates: [cand(1, 1)] }),
      ),
    ).toBe('continue #5');
    expect(nextMove(base({ candidates: [cand(9, 2), cand(1, 1)] }))).toBe(
      'pull one tier-1 candidate',
    );
    expect(nextMove(base({ candidates: [cand(9, 2)] }))).toBe(
      'pull one tier-2 candidate',
    );
    expect(nextMove(base())).toBe(
      'nothing to pick up: verify, then close the milestone',
    );
    expect(nextMove(base({ milestone: null }))).toBe(
      'nothing open: open the next milestone',
    );
  });
});
