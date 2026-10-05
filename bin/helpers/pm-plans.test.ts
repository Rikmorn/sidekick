import { describe, expect, test } from 'bun:test';
import { fixture } from './fixtures/pm/runner.js';
import type { Item, Milestone } from './pm-data.js';
import { descriptionProse, parsePlansHeader, planView } from './pm-plans.js';

const item = (p: Partial<Item> & { number: number }): Item => ({
  itemId: `PVTI_${p.number}`,
  status: 'Backlog',
  title: `t${p.number}`,
  state: 'OPEN',
  stateReason: null,
  updatedAt: '2026-09-01T00:00:00Z',
  statusUpdatedAt: null,
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

const R8_PLANS = [
  {
    name: "Subagent runs keep sidekick's rules",
    issues: [161, 152, 164, 158, 134],
  },
  { name: 'Plans in the brief', issues: [141, 106, 168, 170, 171, 172, 173] },
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
];

const header = (...lines: string[]): string =>
  ['<!-- plans -->', ...lines, '<!-- /plans -->', '', 'Outcome: x.'].join('\n');

describe('parsePlansHeader', () => {
  test("R8's migrated description parses as its ten plans, in line order", () => {
    expect(parsePlansHeader(fixture('description-r8.txt'))).toEqual({
      parse: 'ok',
      plans: R8_PLANS,
    });
  });

  test('a Plans: clause in prose is never read, however well formed', () => {
    for (const description of [
      fixture('description-r8-clause.txt'),
      fixture('description-r7.txt'),
      'Outcome: the brief reads the Plans: clause (#3). Scope: y.',
      'Plans: A (#1); B (#2).',
    ]) {
      expect(parsePlansHeader(description)).toEqual({ parse: 'none' });
    }
  });

  test('numbers are ignored and line order is run order', () => {
    expect(parsePlansHeader(header('1. B (#2)', '1. A (#1, #3)'))).toEqual({
      parse: 'ok',
      plans: [
        { name: 'B', issues: [2] },
        { name: 'A', issues: [1, 3] },
      ],
    });
  });

  test('spacing, blank lines inside, and blank lines before the header are tolerated', () => {
    const description = `\n  \n${header('  1.A(#1,#2)', '', '2.  Docs v2.0 tidy ( #4 ) ')}`;
    expect(parsePlansHeader(description)).toEqual({
      parse: 'ok',
      plans: [
        { name: 'A', issues: [1, 2] },
        { name: 'Docs v2.0 tidy', issues: [4] },
      ],
    });
  });

  test('markers with surrounding whitespace still delimit the header', () => {
    const description =
      '   <!-- plans -->\n1. A (#1)\n<!-- /plans -->  \n\nOutcome: x.';
    expect(parsePlansHeader(description)).toEqual({
      parse: 'ok',
      plans: [{ name: 'A', issues: [1] }],
    });
  });

  test('the template in sk-milestone, indented three spaces as in the skill, parses', () => {
    const template = [
      '<!-- plans -->',
      '1. <name> (#N, #N)',
      '2. <name> (#N)',
      '<!-- /plans -->',
      '',
      'Outcome: <sentence> Scope: <lines>.',
    ]
      .join('\n')
      .replace(/^(?=.)/gm, '   ')
      .replace('<name>', 'First')
      .replace('<name>', 'Second')
      .replace(/#N, #N/, '#1, #2')
      .replace(/#N/, '#3');
    expect(parsePlansHeader(template)).toEqual({
      parse: 'ok',
      plans: [
        { name: 'First', issues: [1, 2] },
        { name: 'Second', issues: [3] },
      ],
    });
  });

  test('CRLF and CR line endings parse as LF does', () => {
    const lf = header('1. A (#1)', '2. B (#2)');
    expect(parsePlansHeader(lf.replaceAll('\n', '\r\n'))).toEqual(
      parsePlansHeader(lf),
    );
    expect(parsePlansHeader(lf.replaceAll('\n', '\r'))).toEqual(
      parsePlansHeader(lf),
    );
    expect(parsePlansHeader(lf).parse).toBe('ok');
  });

  test('a header outside the grammar is malformed with a reason, never a partial list', () => {
    const cases: Array<[string, string]> = [
      [
        '<!-- plans -->\n1. A (#1)\n\nOutcome: x.',
        'the plans header has no <!-- /plans --> line',
      ],
      [header('1. A (#1)', 'B (#2)'), '"B (#2)" is not <n>. <name> (#N, …)'],
      [header('1. (#1)'), '"1. (#1)" is not <n>. <name> (#N, …)'],
      [header('1. A (1)'), '"1. A (1)" is not <n>. <name> (#N, …)'],
      [
        header('1. A (#1) B (#2)'),
        '"1. A (#1) B (#2)" is not <n>. <name> (#N, …)',
      ],
      [
        header('1. A (#1); B (#2)'),
        '"1. A (#1); B (#2)" is not <n>. <name> (#N, …)',
      ],
      [
        header('2.0 release (#5)'),
        '"2.0 release (#5)" is not <n>. <name> (#N, …)',
      ],
      [header(), 'the plans header lists no plans'],
      [header(''), 'the plans header lists no plans'],
      [header('1. A (#1, #2)', '2. B (#2)'), '#2 appears in two plans'],
      [header('1. A (#1)', '2. A (#2)'), 'plan "A" appears twice'],
      [
        'Outcome: x.\n\n<!-- plans -->\n1. A (#1)\n<!-- /plans -->',
        'the plans header is not at the top',
      ],
      ['Outcome: x.\n<!-- /plans -->', 'the plans header is not at the top'],
      [
        `${header('1. A (#1)')}\n\n<!-- plans -->\n1. B (#2)\n<!-- /plans -->`,
        'a second plans header follows the first',
      ],
    ];
    for (const [description, reason] of cases) {
      expect(parsePlansHeader(description)).toEqual({
        parse: 'malformed',
        reason,
      });
    }
  });
});

describe('descriptionProse', () => {
  test('is the text after a header at the top', () => {
    expect(descriptionProse(fixture('description-r8.txt')).trim()).toMatch(
      /^Outcome: the issues listed in Plans, filed by 2026-09-30/,
    );
  });
  test('is the whole description, line endings normalised, when no header opens it', () => {
    expect(descriptionProse('Outcome: a.\r\nScope: b.')).toBe(
      'Outcome: a.\nScope: b.',
    );
    expect(descriptionProse('<!-- plans -->\n1. A (#1)')).toBe(
      '<!-- plans -->\n1. A (#1)',
    );
  });
});

describe('planView', () => {
  const states = (description: string, items: Item[]) =>
    planView(ms(description), items).list.map((p) => [p.name, p.state]);

  test('state precedence: done, running, the first plan with Backlog is next, verify, later', () => {
    expect(
      states(
        header(
          '1. Done (#1)',
          '2. Run (#2, #3)',
          '3. Ver (#4)',
          '4. Nxt (#5, #6)',
          '5. Lat (#7)',
        ),
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
    const v = planView(ms(header('1. New (#8)')), []);
    expect(v.list).toEqual([
      {
        name: 'New',
        state: 'next',
        issues: [{ number: 8, title: null, open: true, status: null }],
      },
    ]);
  });

  test('issues keep header order and carry the card they have', () => {
    const v = planView(ms(header('1. P (#3, #1)')), [
      item({ number: 1, status: 'Verify' }),
      item({ number: 3, state: 'CLOSED', status: 'Done' }),
    ]);
    expect(v.list[0].issues).toEqual([
      { number: 3, title: 't3', open: false, status: 'Done' },
      { number: 1, title: 't1', open: true, status: 'Verify' },
    ]);
  });

  test("unplanned is the milestone's open issues that no plan lists", () => {
    const v = planView(ms(header('1. P (#1)')), [
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

  test('no header and a malformed header give no plans and no unplanned list', () => {
    const items = [item({ number: 1 })];
    expect(planView(ms('Outcome: x.'), items)).toEqual({
      parse: 'none',
      list: [],
      unplanned: [],
    });
    expect(planView(ms(header('1. A (#1)', '2. A (#2)')), items)).toEqual({
      parse: 'malformed',
      reason: 'plan "A" appears twice',
      list: [],
      unplanned: [],
    });
  });
});
