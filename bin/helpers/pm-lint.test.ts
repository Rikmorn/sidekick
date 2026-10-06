import { describe, expect, test } from 'bun:test';
import { fixtureRunner, sidekickMap } from './fixtures/pm/runner.js';
import { chooseBoard } from './pm.js';
import {
  cardedItems,
  fetchDiscovery,
  fetchOpenIssues,
  fetchRepoIssues,
  type Issue,
  type Item,
  type RepoIssue,
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
  statusUpdatedAt: null,
  url: '',
  milestone: null,
  labels: [],
  assignees: [],
  repo: 'Rikmorn/sidekick',
  ...p,
});
const repoIssue = (p: Partial<RepoIssue> & { number: number }): RepoIssue => ({
  title: `t${p.number}`,
  state: 'OPEN',
  stateReason: null,
  updatedAt: '2026-09-01T00:00:00Z',
  url: '',
  milestone: null,
  labels: [],
  assignees: [],
  card: null,
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
          item({ number: 3 }),
        ]),
      ),
    ).toEqual([1]);
  });
  test('openInDone and completedNotDone', () => {
    expect(
      numbers(
        openInDone([
          item({ number: 1, status: 'Done' }),
          item({ number: 2 }),
          item({ number: 3, status: 'Done', state: 'CLOSED' }),
        ]),
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
          item({ number: 4, stateReason: 'COMPLETED' }),
        ]),
      ),
    ).toEqual([1]);
  });
  test.each([
    'Revisit when: x',
    '**Revisit when:** x',
    '**Revisit when**: x',
    '__Revisit when:__ x',
    '*Revisit when:* x',
    '_Revisit when:_ x',
    '- Revisit when: x',
    '* Revisit when: x',
    '+ Revisit when: x',
    '- **Revisit when:** x',
    '   **Revisit when:** x',
    '  - revisit WHEN: x',
  ])('REVISIT_MARKER accepts %s', (line) => {
    expect(REVISIT_MARKER.test(`Body\n\n${line}\n`)).toBe(true);
  });
  test.each([
    'The fix should revisit when: x',
    'Revisit: x',
    '**Re-raise when:** x',
  ])('REVISIT_MARKER rejects %s', (line) => {
    expect(REVISIT_MARKER.test(`Body\n\n${line}\n`)).toBe(false);
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
          issue({ number: 3, milestone: 'R6' }),
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
  test('unboarded is open issues and issues closed as completed, without a card', () => {
    const f = unboarded([
      repoIssue({ number: 1 }),
      repoIssue({ number: 2, state: 'CLOSED', stateReason: 'COMPLETED' }),
      repoIssue({ number: 3, state: 'CLOSED', stateReason: 'NOT_PLANNED' }),
      repoIssue({ number: 4, state: 'CLOSED', stateReason: null }),
    ]);
    expect(numbers(f)).toEqual([1, 2]);
    expect(f[0].detail).toBe('no card on the board');
    expect(f[1].detail).toContain('closed as completed');
  });
  test('unboarded of nothing is nothing', () => {
    expect(unboarded([])).toEqual([]);
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
            item({
              number: 3,
              status: 'Backlog',
              updatedAt: '2026-09-01T00:00:00Z',
            }),
          ],
          now,
        ),
      ),
    ).toEqual([1]);
  });
  test('staleInProgress counts from the card move when it is later', () => {
    const findings = staleInProgress(
      [
        item({
          number: 1,
          status: 'In Progress',
          updatedAt: '2026-09-01T00:00:00Z',
          statusUpdatedAt: '2026-09-18T00:00:00Z',
        }),
        item({
          number: 2,
          status: 'In Progress',
          updatedAt: '2026-09-01T00:00:00Z',
          statusUpdatedAt: '2026-09-10T00:00:00Z',
        }),
      ],
      now,
    );
    expect(findings.map((f) => [f.number, f.detail])).toEqual([
      [2, 'In Progress, untouched 9 days'],
    ]);
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
    const repoIssues = fetchRepoIssues(
      run,
      '/',
      'Rikmorn',
      'sidekick',
      'PVT_kwHOABcx2M4BiJeE',
    );
    const items = cardedItems(repoIssues, 'Rikmorn/sidekick');
    const uncarded = repoIssues.filter((i) => i.card === null);
    const d = fetchDiscovery(run, '/', 'Rikmorn', 'sidekick');
    const candidates = chooseBoard(d.boards, d.viewer, 'sidekick');
    const r = lintAll({ issues, items, uncarded, candidates, now });
    expect(r.counts.unboarded).toBe(
      uncarded.filter(
        (i) => i.state === 'OPEN' || i.stateReason === 'COMPLETED',
      ).length,
    );
    const deferred = issues.filter((i) => i.labels.includes('backlog'));
    expect(r.counts.backlog_without_condition).toBe(
      deferred.filter((i) => !/^\s*revisit when:/im.test(i.body)).length,
    );
    expect(r.counts.multiple_linked_boards).toBe(candidates.length > 1 ? 1 : 0);
  });
  test('an archived card on a closed, completed issue is a card, and a card with no Status is no_status, not unboarded', () => {
    const closedDone = item({
      number: 5,
      state: 'CLOSED',
      stateReason: 'COMPLETED',
      status: 'Done',
    });
    const noStatusCard = item({ number: 6, status: null });
    const r = lintAll({
      issues: [],
      items: [closedDone, noStatusCard],
      uncarded: [],
      candidates: [],
      now,
    });
    expect(r.counts.unboarded).toBe(0);
    expect(numbers(r.findings.no_status)).toEqual([6]);
    expect(r.counts.completed_not_done).toBe(0);
  });
  test('an empty repository yields no findings', () => {
    const r = lintAll({
      issues: [],
      items: [],
      uncarded: [],
      candidates: [],
      now,
    });
    expect(Object.values(r.counts).every((n) => n === 0)).toBe(true);
  });
});
