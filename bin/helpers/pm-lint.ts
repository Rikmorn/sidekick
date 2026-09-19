// bin/helpers/pm-lint.ts
/**
 * The board's invariants as predicates. Each returns the items that
 * contradict it; `lintAll` runs them all. A non-zero count means the board
 * contradicts a rule, not that the rule needs revisiting.
 */
import {
  ageDays,
  type Issue,
  type Item,
  type LinkedBoard,
  STALE_DAYS,
} from './pm-data.js';

export type LintId =
  | 'area_label_count'
  | 'no_status'
  | 'open_in_done'
  | 'completed_not_done'
  | 'backlog_without_condition'
  | 'backlog_in_milestone'
  | 'position_code_title'
  | 'unboarded'
  | 'stale_in_progress'
  | 'multiple_linked_boards';

/** The single source of predicate ids; `lintAll` builds both maps from it. */
export const LINT_IDS: readonly LintId[] = [
  'area_label_count',
  'no_status',
  'open_in_done',
  'completed_not_done',
  'backlog_without_condition',
  'backlog_in_milestone',
  'position_code_title',
  'unboarded',
  'stale_in_progress',
  'multiple_linked_boards',
];

export interface Finding {
  number: number | null;
  title: string;
  detail: string;
}

/** The marker a deferred issue states its condition with (ruled 2026-09-19). */
export const REVISIT_MARKER = /^\s*revisit when:/im;
/** Position codes are ruled out of titles; extend by ruling, not by guess. */
export const POSITION_CODE = [
  /^\s*\d+(\.\d+)+\s*[—–-]/,
  /^\s*(bench|wave|step|phase)[- ]?\d+\b/i,
];

const f = (number: number | null, title: string, detail: string): Finding => ({
  number,
  title,
  detail,
});
const open = (items: Item[]): Item[] => items.filter((i) => i.state === 'OPEN');

export function areaLabelCount(issues: Issue[]): Finding[] {
  return issues
    .map((i) => ({
      i,
      n: i.labels.filter((l) => l.startsWith('area:')).length,
    }))
    .filter(({ n }) => n !== 1)
    .map(({ i, n }) => f(i.number, i.title, `${n} area:* labels`));
}

export function noStatus(items: Item[]): Finding[] {
  return open(items)
    .filter((i) => i.status === null)
    .map((i) => f(i.number, i.title, 'card has no Status'));
}

export function openInDone(items: Item[]): Finding[] {
  return open(items)
    .filter((i) => i.status === 'Done')
    .map((i) => f(i.number, i.title, 'open issue carded Done'));
}

export function completedNotDone(items: Item[]): Finding[] {
  return items
    .filter(
      (i) =>
        i.state === 'CLOSED' &&
        i.stateReason === 'COMPLETED' &&
        i.status !== 'Done',
    )
    .map((i) =>
      f(
        i.number,
        i.title,
        `closed as completed, card is ${i.status ?? 'unset'}`,
      ),
    );
}

export function backlogWithoutCondition(issues: Issue[]): Finding[] {
  return issues
    .filter((i) => i.labels.includes('backlog') && !REVISIT_MARKER.test(i.body))
    .map((i) =>
      f(i.number, i.title, 'backlog label without a "Revisit when:" line'),
    );
}

export function backlogInMilestone(issues: Issue[]): Finding[] {
  return issues
    .filter((i) => i.labels.includes('backlog') && i.milestone !== null)
    .map((i) =>
      f(i.number, i.title, `deferred but in milestone ${i.milestone}`),
    );
}

export function positionCodeTitle(issues: Issue[]): Finding[] {
  return issues
    .filter((i) => POSITION_CODE.some((re) => re.test(i.title)))
    .map((i) => f(i.number, i.title, 'title starts with a position code'));
}

export function unboarded(issues: Issue[], items: Item[]): Finding[] {
  const carded = new Set(items.map((i) => i.number));
  return issues
    .filter((i) => !carded.has(i.number))
    .map((i) => f(i.number, i.title, 'no card on the board'));
}

export function staleInProgress(items: Item[], now: Date): Finding[] {
  return open(items)
    .filter(
      (i) =>
        i.status === 'In Progress' && ageDays(i.updatedAt, now) > STALE_DAYS,
    )
    .map((i) =>
      f(
        i.number,
        i.title,
        `In Progress, untouched ${ageDays(i.updatedAt, now)} days`,
      ),
    );
}

/** `candidates` is `chooseBoard`'s output: already open, owned, and titled. */
export function multipleLinkedBoards(candidates: LinkedBoard[]): Finding[] {
  if (candidates.length <= 1) return [];
  const names = candidates.map((b) => `#${b.number}`).join(', ');
  return [
    f(
      null,
      'linked boards',
      `${candidates.length} open boards match: ${names}`,
    ),
  ];
}

const PREDICATES: {
  [K in LintId]: (input: {
    issues: Issue[];
    items: Item[];
    candidates: LinkedBoard[];
    now: Date;
  }) => Finding[];
} = {
  area_label_count: ({ issues }) => areaLabelCount(issues),
  no_status: ({ items }) => noStatus(items),
  open_in_done: ({ items }) => openInDone(items),
  completed_not_done: ({ items }) => completedNotDone(items),
  backlog_without_condition: ({ issues }) => backlogWithoutCondition(issues),
  backlog_in_milestone: ({ issues }) => backlogInMilestone(issues),
  position_code_title: ({ issues }) => positionCodeTitle(issues),
  unboarded: ({ issues, items }) => unboarded(issues, items),
  stale_in_progress: ({ items, now }) => staleInProgress(items, now),
  multiple_linked_boards: ({ candidates }) => multipleLinkedBoards(candidates),
};

export function lintAll(input: {
  issues: Issue[];
  items: Item[];
  candidates: LinkedBoard[];
  now: Date;
}): { findings: Record<LintId, Finding[]>; counts: Record<LintId, number> } {
  const entries = LINT_IDS.map((id) => [id, PREDICATES[id](input)] as const);
  const findings = Object.fromEntries(entries) as Record<LintId, Finding[]>;
  const counts = Object.fromEntries(
    entries.map(([id, list]) => [id, list.length]),
  ) as Record<LintId, number>;
  return { findings, counts };
}
