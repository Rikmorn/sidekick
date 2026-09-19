import { describe, expect, test } from 'bun:test';
import { fixtureRunner, sidekickMap } from './fixtures/pm/runner.js';
import { chooseBoard } from './pm.js';
import {
  fetchDiscovery,
  fetchItems,
  fetchOpenIssues,
  type Issue,
  type Item,
} from './pm-data.js';
import {
  areaLabelCount,
  backlogInMilestone,
  backlogWithoutCondition,
  completedNotDone,
  lintAll,
  multipleLinkedBoards,
  noStatus,
  openInDone,
  positionCodeTitle,
  REVISIT_MARKER,
  staleInProgress,
  unboarded,
} from './pm-lint.js';

const issue = (p: Partial<Issue> & { number: number }): Issue => ({
  title: `t${p.number}`,
  labels: ['area:pm'],
  body: '',
  milestone: null,
  updatedAt: '2026-09-01T00:00:00Z',
  ...p,
});
const item = (p: Partial<Item> & { number: number }): Item => ({
  itemId: `PVTI_${p.number}`,
  status: 'Backlog',
  title: `t${p.number}`,
  state: 'OPEN',
  stateReason: null,
  updatedAt: '2026-09-01T00:00:00Z',
  url: '',
  milestone: null,
  labels: [],
  assignees: [],
  repo: 'Rikmorn/sidekick',
  ...p,
});
const now = new Date('2026-09-19T00:00:00Z');
const numbers = (f: Array<{ number: number | null }>): Array<number | null> =>
  f.map((x) => x.number);

describe('predicates on synthetic input', () => {
  test('areaLabelCount counts, it does not test presence', () => {
    const f = areaLabelCount([
      issue({ number: 1 }),
      issue({ number: 2, labels: [] }),
      issue({ number: 3, labels: ['area:pm', 'area:plugin'] }),
    ]);
    expect(numbers(f)).toEqual([2, 3]);
  });
  test('noStatus is open cards without a Status', () => {
    expect(
      numbers(
        noStatus([
          item({ number: 1, status: null }),
          item({ number: 2, status: null, state: 'CLOSED' }),
        ]),
      ),
    ).toEqual([1]);
  });
  test('openInDone and completedNotDone', () => {
    expect(
      numbers(
        openInDone([item({ number: 1, status: 'Done' }), item({ number: 2 })]),
      ),
    ).toEqual([1]);
    expect(
      numbers(
        completedNotDone([
          item({
            number: 1,
            state: 'CLOSED',
            stateReason: 'COMPLETED',
            status: 'Backlog',
          }),
          item({
            number: 2,
            state: 'CLOSED',
            stateReason: 'COMPLETED',
            status: 'Done',
          }),
          item({
            number: 3,
            state: 'CLOSED',
            stateReason: 'NOT_PLANNED',
            status: 'Backlog',
          }),
        ]),
      ),
    ).toEqual([1]);
  });
  test('backlogWithoutCondition reads a Revisit when: line, any case, any indent', () => {
    expect(
      REVISIT_MARKER.test('Body\n\n  revisit WHEN: #113 is designed\n'),
    ).toBe(true);
    expect(REVISIT_MARKER.test('We might revisit when it matters')).toBe(false);
    expect(
      numbers(
        backlogWithoutCondition([
          issue({
            number: 1,
            labels: ['backlog', 'area:pm'],
            body: 'no marker',
          }),
          issue({
            number: 2,
            labels: ['backlog', 'area:pm'],
            body: 'x\nRevisit when: y\n',
          }),
          issue({ number: 3, body: 'not deferred' }),
        ]),
      ),
    ).toEqual([1]);
  });
  test('backlogInMilestone flags deferred-and-scheduled', () => {
    expect(
      numbers(
        backlogInMilestone([
          issue({ number: 1, labels: ['backlog', 'area:pm'], milestone: 'R6' }),
          issue({ number: 2, labels: ['backlog', 'area:pm'] }),
        ]),
      ),
    ).toEqual([1]);
  });
  test('positionCodeTitle catches the ruled shapes and nothing else', () => {
    const f = positionCodeTitle([
      issue({ number: 1, title: '3.4 — verifier seam' }),
      issue({ number: 2, title: 'bench-6 — gate report' }),
      issue({ number: 3, title: 'Wave 2 of the retirement' }),
      issue({ number: 4, title: 'Phase 3 renumbered' }),
      issue({ number: 5, title: 'The plugin has no PM seat' }),
      issue({ number: 6, title: '2026-09-19 research round' }),
    ]);
    expect(numbers(f)).toEqual([1, 2, 3, 4]);
  });
  test('unboarded is open issues without a card', () => {
    expect(
      numbers(
        unboarded(
          [issue({ number: 1 }), issue({ number: 2 })],
          [item({ number: 2 })],
        ),
      ),
    ).toEqual([1]);
  });
  test('staleInProgress is strictly over the threshold', () => {
    expect(
      numbers(
        staleInProgress(
          [
            item({
              number: 1,
              status: 'In Progress',
              updatedAt: '2026-09-11T00:00:00Z',
            }),
            item({
              number: 2,
              status: 'In Progress',
              updatedAt: '2026-09-12T00:00:00Z',
            }),
          ],
          now,
        ),
      ),
    ).toEqual([1]);
  });
  test('multipleLinkedBoards is one finding naming all of them', () => {
    const boards = chooseBoard(
      [
        {
          number: 2,
          title: 'sidekick',
          closed: false,
          url: '',
          id: 'a',
          ownerLogin: 'Rikmorn',
        },
        {
          number: 7,
          title: 'sidekick',
          closed: false,
          url: '',
          id: 'b',
          ownerLogin: 'Rikmorn',
        },
      ],
      'Rikmorn',
      'sidekick',
    );
    const f = multipleLinkedBoards(boards);
    expect(f.length).toBe(1);
    expect(f[0].detail).toContain('#2');
    expect(f[0].detail).toContain('#7');
    expect(multipleLinkedBoards(boards.slice(0, 1))).toEqual([]);
  });
});

describe('lintAll on the captured board', () => {
  test('counts derive from the fixtures, not from literals', () => {
    const run = fixtureRunner(sidekickMap());
    const issues = fetchOpenIssues(run, '/', 'Rikmorn', 'sidekick');
    const { items } = fetchItems(run, '/', 'Rikmorn', 2, 'Rikmorn/sidekick');
    const d = fetchDiscovery(run, '/', 'Rikmorn', 'sidekick');
    const candidates = chooseBoard(d.boards, d.viewer, 'sidekick');
    const r = lintAll({ issues, items, candidates, now });
    const carded = new Set(items.map((i) => i.number));
    expect(r.counts.unboarded).toBe(
      issues.filter((i) => !carded.has(i.number)).length,
    );
    const deferred = issues.filter((i) => i.labels.includes('backlog'));
    expect(r.counts.backlog_without_condition).toBe(
      deferred.filter((i) => !/^\s*revisit when:/im.test(i.body)).length,
    );
    expect(r.counts.multiple_linked_boards).toBe(candidates.length > 1 ? 1 : 0);
    for (const id of Object.keys(r.counts) as Array<keyof typeof r.counts>) {
      expect(r.counts[id]).toBe(r.findings[id].length);
    }
  });
});
