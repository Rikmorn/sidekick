/**
 * A milestone's plans: parsed from the `Plans:` clause of its description,
 * which is their only source, and given a state from the board's cards.
 * Pure: it reads what `pickup` already fetched and writes nothing.
 */

import type { Item, Milestone } from './pm-data.js';

export interface ClausePlan {
  name: string;
  issues: number[];
}

export type ClauseParse =
  | { parse: 'none' }
  | { parse: 'malformed'; reason: string }
  | { parse: 'ok'; plans: ClausePlan[] };

const HAS_CLAUSE = /(?:^|\s)Plans:/;
// The clause runs to the first ")." that ends a sentence.
const CLAUSE = /(?:^|\s)Plans:\s*(.*?\))\.(?:\s|$)/s;
const GROUP = /^\s*([^();\s][^();]*?)\s*\(\s*(#\d+(?:\s*,\s*#\d+)*)\s*\)\s*$/;

function duplicate(plans: ClausePlan[]): string | null {
  const names = plans.map((p) => p.name);
  const name = names.find((n, i) => names.indexOf(n) !== i);
  if (name !== undefined) return `plan "${name}" appears twice`;
  const issues = plans.flatMap((p) => p.issues);
  const issue = issues.find((n, i) => issues.indexOf(n) !== i);
  return issue === undefined ? null : `#${issue} appears in two plans`;
}

/**
 * Reads the clause `sk-milestone` writes: `Plans: <name> (#N, #N); <name>
 * (#N).` Anything outside that grammar is `malformed`, never a partial
 * list, so a caller cannot act on half a clause.
 */
export function parsePlansClause(description: string): ClauseParse {
  if (!HAS_CLAUSE.test(description)) return { parse: 'none' };
  const clause = CLAUSE.exec(description);
  if (!clause) {
    return { parse: 'malformed', reason: 'the Plans: clause has no ")." end' };
  }
  const parts = clause[1].split(';');
  const groups = parts.map((part) => GROUP.exec(part));
  const bad = groups.indexOf(null);
  if (bad >= 0) {
    return {
      parse: 'malformed',
      reason: `"${parts[bad].trim()}" is not <name> (#N, …)`,
    };
  }
  const plans = groups
    .filter((g): g is RegExpExecArray => g !== null)
    .map((g) => ({
      name: g[1],
      issues: g[2].split(',').map((r) => Number(r.trim().slice(1))),
    }));
  const reason = duplicate(plans);
  return reason === null
    ? { parse: 'ok', plans }
    : { parse: 'malformed', reason };
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
 * The milestone's plans in clause order, each with a state from the board.
 * A clause issue with no card counts as open and not started: a new card
 * can be missing from the board's item list for hours (#131).
 */
export function planView(ms: Milestone, items: Item[]): Plans {
  const c = parsePlansClause(ms.description);
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
