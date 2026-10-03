import { describe, expect, test } from 'bun:test';
import type { Item, Milestone } from './pm-data.js';
import { planView } from './pm-plans.js';
import { renderReport } from './pm-report.js';

const r9 = (description: string): Milestone => ({
  number: 9,
  title: 'R9 — Next',
  description,
  due_on: null,
  open_issues: 6,
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
  url: '',
  milestone: 'R9 — Next',
  labels: [],
  assignees: [],
  repo: 'Rikmorn/sidekick',
});
const report = (description: string, items: Item[]): string =>
  renderReport({
    board: { owner: 'Rikmorn', repo: 'sidekick' },
    milestone: r9(description),
    plans: planView(r9(description), items),
  });

describe('renderReport', () => {
  test('one row per plan in clause order, every issue qualified, the state column empty for later', () => {
    expect(
      report('Plans: Done (#1); Run (#2, #3); Ver (#4); Nxt (#5); Lat (#6).', [
        card(1, 'Done', 'CLOSED'),
        card(2, 'In Progress'),
        card(3, 'Done', 'CLOSED'),
        card(4, 'Verify'),
        card(5, 'Backlog'),
        card(6, 'Backlog'),
        card(7, 'Backlog'),
      ]),
    ).toBe(
      [
        '**R9 — Next** · 6 open, 1 closed',
        'Running: **Run**',
        '',
        '| | Plan | Closed | Issues |',
        '|---|---|---|---|',
        '| done | Done | 1 of 1 | Rikmorn/sidekick#1 |',
        '| running | Run | 1 of 2 | Rikmorn/sidekick#2 Rikmorn/sidekick#3 |',
        '| verify | Ver | 0 of 1 | Rikmorn/sidekick#4 |',
        '| next | Nxt | 0 of 1 | Rikmorn/sidekick#5 |',
        '|  | Lat | 0 of 1 | Rikmorn/sidekick#6 |',
        '',
        'Unplanned: Rikmorn/sidekick#7.',
      ].join('\n'),
    );
  });

  test('no running plan and no unplanned issue say none; a pipe in a name is escaped', () => {
    const lines = report('Plans: A | B (#1).', [card(1, 'Backlog')]).split(
      '\n',
    );
    expect(lines[1]).toBe('Running: none');
    expect(lines[5]).toBe('| next | A \\| B | 0 of 1 | Rikmorn/sidekick#1 |');
    expect(lines[7]).toBe('Unplanned: none.');
  });
});
