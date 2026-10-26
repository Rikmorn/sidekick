import { describe, expect, test } from 'bun:test';
import {
  type PaneMark,
  type PaneNode,
  type PaneRow,
  type PaneWeight,
  parsePane,
} from '../../plugin/hooks/board/contract.js';
import { pickups } from './fixtures/pm/pickups.js';
import { type BriefInput, PER_TIER_MAX } from './pm-brief.js';
import { paneRows } from './pm-pane.js';
import { pickupView } from './pm-view.js';

const pick = (name: keyof typeof pickups): BriefInput => pickups[name];

const rowsOf = (input: BriefInput): PaneRow[] =>
  paneRows(pickupView(input)).rows;

const node = (
  mark: PaneMark,
  ref: string | null,
  text: string,
  right: string | null,
  weight: PaneWeight,
  children: PaneNode[] = [],
): PaneNode => ({ mark, ref, text, right, weight, children });

const later = (n: number) => node('later', `#${n}`, `t${n}`, null, 'plain');
const running = (n: number, age: number) =>
  node('running', `#${n}`, `t${n}`, `${age} d`, 'plain');
const group = (text: string, children: PaneNode[]) =>
  node('group', null, text, null, 'quiet', children);
const more = (n: number) => node('more', null, `+${n} more`, null, 'quiet');

const nextRow = (input: BriefInput): PaneRow => ({
  kind: 'prose',
  mark: 'next',
  text: pickupView(input).next,
});

const candidates = (input: BriefInput, tier1: number, tier2: number) => {
  const template = input.candidates;
  const make = (tier: 1 | 2, count: number) =>
    Array.from({ length: count }, (_, i) => {
      const [first] = template;
      if (first === undefined) throw new Error('fixture has a candidate');
      return {
        ...first,
        tier,
        number: tier * 100 + i,
        title: `t${tier * 100 + i}`,
      };
    });
  return { ...input, candidates: [...make(1, tier1), ...make(2, tier2)] };
};

describe('paneRows', () => {
  test('a malformed header gives the reason, a label-only cells row, and the tier-1 group', () => {
    const input = pick('malformedHeader');
    expect(rowsOf(input)).toEqual([
      nextRow(input),
      {
        kind: 'prose',
        mark: 'drift',
        text: 'plans header: the plans header lists no plans',
      },
      {
        kind: 'prose',
        mark: 'outcome',
        text: 'Outcome: sessions start from the board.',
      },
      { kind: 'cells', plans: [], label: '2 closed · 3 open' },
      {
        kind: 'tree',
        nodes: [
          group('candidates', [later(11)]),
          group('tier 2 · no milestone', [later(21)]),
        ],
      },
    ]);
  });

  test('an empty milestone draws no tree row', () => {
    const input = pick('emptyMilestone');
    expect(rowsOf(input)).toEqual([
      nextRow(input),
      {
        kind: 'prose',
        mark: 'outcome',
        text: 'Outcome: sessions start from the board.',
      },
      { kind: 'cells', plans: [], label: '0 closed · 0 open' },
    ]);
  });

  test('a group of exactly the cap shows every issue and no more node', () => {
    const input = candidates(
      pick('overflowNoHeader'),
      PER_TIER_MAX,
      PER_TIER_MAX,
    );
    const [, , tree] = rowsOf(input).slice(-3);
    if (tree?.kind !== 'tree') throw new Error('the pane has a tree');
    for (const g of tree.nodes.filter((n) => n.mark === 'group')) {
      expect(g.children).toHaveLength(PER_TIER_MAX);
      expect(g.children.some((c) => c.mark === 'more')).toBe(false);
    }
  });

  test('one issue past the cap shows the cap and +1 more', () => {
    const input = candidates(
      pick('overflowNoHeader'),
      PER_TIER_MAX + 1,
      PER_TIER_MAX + 1,
    );
    const [, , tree] = rowsOf(input).slice(-3);
    if (tree?.kind !== 'tree') throw new Error('the pane has a tree');
    for (const g of tree.nodes.filter((n) => n.mark === 'group')) {
      expect(g.children).toHaveLength(PER_TIER_MAX + 1);
      expect(g.children.at(-1)).toEqual(more(1));
      expect(
        g.children.slice(0, PER_TIER_MAX).every((c) => c.mark === 'later'),
      ).toBe(true);
    }
  });

  test('with no header, an In Progress issue leads the tree, then the capped groups', () => {
    const input = pick('overflowNoHeader');
    const tail = rowsOf(input).slice(-2);
    expect(tail).toEqual([
      { kind: 'cells', plans: [], label: '2 closed · 3 open' },
      {
        kind: 'tree',
        nodes: [
          running(30, 1),
          group('candidates', [11, 12, 13, 14, 15].map(later).concat(more(2))),
          group(
            'tier 2 · no milestone',
            [21, 22, 23, 24, 25].map(later).concat(more(1)),
          ),
        ],
      },
    ]);
  });

  test('drift lists each full form, after the next move and before the outcome', () => {
    const input = pick('everyDrift');
    const view = pickupView(input);
    const rows = rowsOf(input);
    expect(rows.map((r) => (r.kind === 'prose' ? r.mark : r.kind))).toEqual([
      'next',
      ...view.drift.map(() => 'drift'),
      'outcome',
      'cells',
      'tree',
    ]);
    expect(rows.slice(1, 1 + view.drift.length)).toEqual(
      view.drift.map((d) => ({ kind: 'prose', mark: 'drift', text: d.full })),
    );
    expect(view.drift).toHaveLength(5);
  });

  test('every plan done folds into one node, plural by count', () => {
    const rows = rowsOf(pick('everyPlanDone'));
    expect(rows.slice(-2)).toEqual([
      { kind: 'cells', plans: ['done', 'done'], label: '2/2 plans' },
      {
        kind: 'tree',
        nodes: [node('done', null, '2 plans done', null, 'quiet')],
      },
    ]);
  });

  test('one done plan reads 1 plan done', () => {
    const input = pick('everyPlanDone');
    const { plans } = input;
    if (plans === null) throw new Error('fixture has plans');
    const rows = rowsOf({
      ...input,
      plans: { ...plans, list: plans.list.slice(0, 1) },
    });
    expect(rows.at(-1)).toEqual({
      kind: 'tree',
      nodes: [node('done', null, '1 plan done', null, 'quiet')],
    });
  });

  test('a plan issue with no card reads no card, and a later plan counts its open issues', () => {
    const input = pick('planIssueWithNoCard');
    expect(rowsOf(input).slice(-2)).toEqual([
      { kind: 'cells', plans: ['running', 'later'], label: '0/2 plans' },
      {
        kind: 'tree',
        nodes: [
          node('running', null, 'Running', null, 'strong', [
            running(40, 3),
            node('later', '#42', 'no card', null, 'plain'),
          ]),
          node('later', null, 'Later', '1 open', 'quiet'),
          running(45, 1),
          running(46, 1),
          group('unplanned', [later(44)]),
        ],
      },
    ]);
  });

  test('no active milestone lists the open milestones as later nodes, with no cells or outcome', () => {
    const input = pick('noMilestoneSeveralOpen');
    expect(rowsOf(input)).toEqual([
      nextRow(input),
      {
        kind: 'tree',
        nodes: [
          node('later', null, 'R6 — PM layer', null, 'plain'),
          node('later', null, 'R7 — Something else', null, 'plain'),
        ],
      },
    ]);
  });

  test('no milestone and none open is the next move alone', () => {
    const input = pick('noMilestoneNoneOpen');
    expect(rowsOf(input)).toEqual([nextRow(input)]);
  });

  test('an active milestone with others open gets an also open group', () => {
    const input = {
      ...pick('emptyMilestone'),
      open_milestones: [
        { number: 6, title: 'R6 — PM layer' },
        { number: 7, title: 'R7 — Later' },
      ],
    };
    expect(rowsOf(input).at(-1)).toEqual({
      kind: 'tree',
      nodes: [
        group('also open', [node('later', null, 'R7 — Later', null, 'plain')]),
      ],
    });
  });

  test('R9 folds twelve done plans, opens the running and next plans, and counts the rest', () => {
    const input = pick('r9');
    const rows = rowsOf(input);
    const cells = rows.find((r) => r.kind === 'cells');
    expect(cells?.kind === 'cells' ? cells.label : '').toBe('12/16 plans');
    const tree = rows.at(-1);
    if (tree?.kind !== 'tree') throw new Error('R9 has a tree');
    const [fold, active, next, ...rest] = tree.nodes;
    expect(fold).toEqual(node('done', null, '12 plans done', null, 'quiet'));
    expect(active?.mark).toBe('running');
    expect(active?.weight).toBe('strong');
    expect(active?.children.map((c) => [c.ref, c.mark, c.right])).toEqual([
      ['#240', 'running', '0 d'],
      ['#251', 'running', '0 d'],
      [null, 'done', null],
    ]);
    expect(next).toMatchObject({
      mark: 'next',
      right: 'next',
      weight: 'plain',
    });
    expect(rest.slice(0, 2).map((n) => [n.mark, n.weight, n.right])).toEqual([
      ['later', 'quiet', '1 open'],
      ['later', 'quiet', '1 open'],
    ]);
  });

  test('the done node under a running plan counts its closed issues', () => {
    const rows = rowsOf(pick('r9'));
    const tree = rows.at(-1);
    if (tree?.kind !== 'tree') throw new Error('R9 has a tree');
    expect(tree.nodes[1]?.children.at(-1)).toEqual(
      node('done', null, '2 closed', null, 'quiet'),
    );
  });
});

describe('the contract', () => {
  test.each(
    Object.keys(pickups),
  )('parsePane returns paneRows unchanged for %s', (name) => {
    const input = pickups[name];
    if (input === undefined) throw new Error('fixture exists');
    const pane = paneRows(pickupView(input));
    expect(parsePane(JSON.parse(JSON.stringify(pane)))).toEqual(pane);
  });
});
