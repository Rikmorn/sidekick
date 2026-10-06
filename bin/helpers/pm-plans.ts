/**
 * A milestone's plans: parsed from the plans header at the top of its
 * description, which is their only source, and given a state from the
 * board's cards. Pure: it reads what `pickup` already fetched and writes
 * nothing.
 */

import type { Item, Milestone } from './pm-data.js';

export interface HeaderPlan {
  name: string;
  issues: number[];
}

export type HeaderParse =
  | { parse: 'none' }
  | { parse: 'malformed'; reason: string }
  | { parse: 'ok'; plans: HeaderPlan[] };

export const HEADER_OPEN = '<!-- plans -->';
export const HEADER_CLOSE = '<!-- /plans -->';

const LINE = /^\s*\d+\.(?!\d)\s*(.*)$/;
const GROUP = /^\s*([^();\s][^();]*?)\s*\(\s*(#\d+(?:\s*,\s*#\d+)*)\s*\)\s*$/;

// A web-UI edit stores CRLF; the parser sees LF only.
const normalise = (text: string): string => text.replace(/\r\n?/g, '\n');

// Names and reasons print inside one line of the brief and the report.
const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

const isMarker = (line: string): boolean =>
  line.trim() === HEADER_OPEN || line.trim() === HEADER_CLOSE;

type Located =
  | { at: 'none' }
  | { at: 'elsewhere' }
  | { at: 'unclosed' }
  | { at: 'top'; lines: string[]; prose: string[] };

function locate(description: string): Located {
  const lines = normalise(description).split('\n');
  const first = lines.findIndex((l) => l.trim() !== '');
  if (first < 0 || lines[first].trim() !== HEADER_OPEN) {
    return lines.some(isMarker) ? { at: 'elsewhere' } : { at: 'none' };
  }
  const close = lines.findIndex(
    (l, k) => k > first && l.trim() === HEADER_CLOSE,
  );
  if (close < 0) return { at: 'unclosed' };
  return {
    at: 'top',
    lines: lines.slice(first + 1, close),
    prose: lines.slice(close + 1),
  };
}

const malformed = (reason: string): HeaderParse => ({
  parse: 'malformed',
  reason: oneLine(reason),
});

function duplicate(plans: HeaderPlan[]): string | null {
  const names = plans.map((p) => p.name);
  const name = names.find((n, i) => names.indexOf(n) !== i);
  if (name !== undefined) return `plan "${name}" appears twice`;
  const issues = plans.flatMap((p) => p.issues);
  const issue = issues.find((n, i) => issues.indexOf(n) !== i);
  return issue === undefined ? null : `#${issue} appears in two plans`;
}

/**
 * Reads the header `sk-milestone` writes: `<!-- plans -->`, one
 * `<n>. <name> (#N, #N)` per line, then `<!-- /plans -->`, opening the
 * description. Anything outside that grammar is `malformed`, never a
 * partial list, so a caller cannot act on half a header.
 */
export function parsePlansHeader(description: string): HeaderParse {
  const found = locate(description);
  if (found.at === 'none') return { parse: 'none' };
  if (found.at === 'elsewhere') {
    return malformed('the plans header is not at the top');
  }
  if (found.at === 'unclosed') {
    return malformed(`the plans header has no ${HEADER_CLOSE} line`);
  }
  if (found.prose.some(isMarker)) {
    return malformed('a second plans header follows the first');
  }
  const plans: HeaderPlan[] = [];
  for (const line of found.lines.filter((l) => l.trim() !== '')) {
    const numbered = LINE.exec(line);
    const group = numbered === null ? null : GROUP.exec(numbered[1]);
    if (group === null) {
      return malformed(`"${line.trim()}" is not <n>. <name> (#N, …)`);
    }
    plans.push({
      name: oneLine(group[1]),
      issues: group[2].split(',').map((r) => Number(r.trim().slice(1))),
    });
  }
  if (plans.length === 0) return malformed('the plans header lists no plans');
  const reason = duplicate(plans);
  return reason === null ? { parse: 'ok', plans } : malformed(reason);
}

/** The description after a header that opens it; otherwise all of it. */
export function descriptionProse(description: string): string {
  const found = locate(description);
  return found.at === 'top' ? found.prose.join('\n') : normalise(description);
}

export type PlanState = 'done' | 'running' | 'next' | 'verify' | 'later';

export interface PlanIssue {
  number: number;
  /** `null` when the issue has no card on the board yet. */
  title: string | null;
  open: boolean;
  status: string | null;
}

export interface PlanView {
  name: string;
  state: PlanState;
  issues: PlanIssue[];
}

export interface Plans {
  parse: 'ok' | 'none' | 'malformed';
  reason?: string;
  list: PlanView[];
  unplanned: Array<{ number: number; title: string }>;
}

const openOf = (issues: PlanIssue[]): PlanIssue[] =>
  issues.filter((i) => i.open);
const inProgress = (i: PlanIssue): boolean => i.status === 'In Progress';
// No card yet reads as not started; see planView.
const notStarted = (i: PlanIssue): boolean =>
  i.status === 'Backlog' || i.status === null;

function startable(issues: PlanIssue[]): boolean {
  const open = openOf(issues);
  return open.length > 0 && !open.some(inProgress) && open.some(notStarted);
}

function stateOf(issues: PlanIssue[], isNext: boolean): PlanState {
  const open = openOf(issues);
  if (open.length === 0) return 'done';
  if (open.some(inProgress)) return 'running';
  if (isNext) return 'next';
  if (open.every((i) => i.status === 'Verify')) return 'verify';
  return 'later';
}

/**
 * The milestone's plans in header order, each with a state from the board.
 * A header issue with no card counts as open and not started: a card has
 * to be added to the board, and the issue may not have been.
 */
export function planView(ms: Milestone, items: Item[]): Plans {
  const c = parsePlansHeader(ms.description);
  if (c.parse === 'none') return { parse: 'none', list: [], unplanned: [] };
  if (c.parse === 'malformed') {
    return { parse: 'malformed', reason: c.reason, list: [], unplanned: [] };
  }
  const byNumber = new Map(items.map((i) => [i.number, i]));
  const issueOf = (n: number): PlanIssue => {
    const i = byNumber.get(n);
    return i
      ? {
          number: n,
          title: i.title,
          open: i.state === 'OPEN',
          status: i.status,
        }
      : { number: n, title: null, open: true, status: null };
  };
  const issues = c.plans.map((p) => p.issues.map(issueOf));
  const nextAt = issues.findIndex(startable);
  const list = c.plans.map((p, k) => ({
    name: p.name,
    state: stateOf(issues[k], k === nextAt),
    issues: issues[k],
  }));
  const planned = new Set(c.plans.flatMap((p) => p.issues));
  const unplanned = items
    .filter(
      (i) =>
        i.state === 'OPEN' &&
        i.milestone === ms.title &&
        !planned.has(i.number),
    )
    .sort((a, b) => a.number - b.number)
    .map((i) => ({ number: i.number, title: i.title }));
  return { parse: 'ok', list, unplanned };
}
