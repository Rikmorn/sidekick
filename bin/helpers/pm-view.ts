/**
 * What a pickup shows, selected and worded once. The brief and the board
 * line read it today and the board pane reads it next, so the three agree on
 * which facts count and how a drift kind is named. Pure: it decides nothing
 * the pickup did not join, except the `next` line, a fixed rule.
 */

import type { Candidate, Drift, InProgress } from './pm.js';
import type { BriefInput } from './pm-brief.js';
import type { IssueCounts } from './pm-data.js';
import {
  descriptionProse,
  type PlanIssue,
  type PlanState,
  type Plans,
  type PlanView,
} from './pm-plans.js';

/** Prescriptive: a title longer than this is cut with an ellipsis. */
export const TITLE_MAX = 60;

export function cut(title: string): string {
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title;
}

function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const m = /^(.*?[.!?])(?:\s|$)/.exec(t);
  return m ? m[1] : t;
}

export const titles = (list: Array<{ title: string }>): string =>
  list.map((m) => cut(m.title)).join(', ');

interface ParsedPlans {
  list: PlanView[];
  unplanned: Plans['unplanned'];
}

function parsedPlans(p: BriefInput): ParsedPlans | null {
  if (p.plans === null || p.plans.parse !== 'ok') return null;
  return { list: p.plans.list, unplanned: p.plans.unplanned };
}

const openRefs = (plan: PlanView): string =>
  plan.issues
    .filter((i) => i.open)
    .map((i) => `#${i.number}`)
    .join(', ');

const plannedNumbers = (list: PlanView[]): Set<number> =>
  new Set(list.flatMap((pl) => pl.issues.map((i) => i.number)));

function continueMove(cards: InProgress[], plans: ParsedPlans | null): string {
  const lowest = Math.min(...cards.map((i) => i.number));
  const plan =
    plans === null
      ? undefined
      : plans.list.find((pl) => pl.issues.some((i) => i.number === lowest));
  return plan === undefined
    ? `continue #${lowest}`
    : `continue plan ${plan.name} (${openRefs(plan)})`;
}

function pullMove(p: BriefInput, plans: ParsedPlans | null): string | null {
  if (plans === null) {
    return p.candidates.some((c) => c.tier === 1)
      ? 'pull one tier-1 candidate'
      : null;
  }
  const next = plans.list.find((pl) => pl.state === 'next');
  if (next !== undefined) return `pull plan ${next.name} (${openRefs(next)})`;
  const planned = plannedNumbers(plans.list);
  const unplanned = p.candidates.some(
    (c) => c.tier === 1 && !planned.has(c.number),
  );
  return unplanned ? 'pull one unplanned candidate' : null;
}

/**
 * The fixed rule: with several milestones open and none active, choose one.
 * Otherwise continue what is In Progress, else pull the next plan, an
 * unplanned issue, or a tier-1 candidate, else close or open a milestone.
 * Tier 2 is never the pick; taking it is a judgment.
 */
export function nextMove(p: BriefInput): string {
  if (p.milestone === null && p.open_milestones.length > 1) {
    return `choose a milestone: ${titles(p.open_milestones)}`;
  }
  const plans = parsedPlans(p);
  if (p.in_progress.length > 0) return continueMove(p.in_progress, plans);
  const pull = pullMove(p, plans);
  if (pull !== null) return pull;
  if (p.milestone)
    return 'nothing to pick up: verify, then close the milestone';
  return 'nothing open: open the next milestone';
}

export interface DriftEntry {
  /** As the brief's drift line words it. */
  full: string;
  /** As the board line's state detail words it. */
  short: string;
}

/** One entry per drift kind present, in the brief's order. */
export function driftEntries(drift: Drift, plans: Plans | null): DriftEntry[] {
  const entries: DriftEntry[] = [];
  const unpushed = drift.unpushed.count;
  if (unpushed !== null && unpushed > 0) {
    entries.push({
      full: `${unpushed} unpushed`,
      short: `${unpushed} unpushed`,
    });
  }
  const [firstStale] = drift.stale_in_progress;
  if (firstStale !== undefined) {
    entries.push({
      full: `stale: ${drift.stale_in_progress.map((i) => `#${i.number} (${i.age_days} d)`).join(', ')}`,
      short: `stale #${firstStale.number}`,
    });
  }
  if (drift.open_pr) {
    const text = `open PR #${drift.open_pr.number}`;
    entries.push({ full: text, short: text });
  }
  if (drift.in_progress_split.length > 0) {
    entries.push({
      full: `In Progress split: ${drift.in_progress_split.map(cut).join(', ')}`,
      short: 'split',
    });
  }
  if (plans !== null && plans.parse === 'malformed') {
    entries.push({
      full: `plans header: ${plans.reason}`,
      short: 'plans header',
    });
  }
  return entries;
}

export interface ViewIssue {
  number: number;
  /** `null` when the issue has no card on the board yet. */
  title: string | null;
  open: boolean;
  status: string | null;
  /** Days In Progress; `null` unless the issue is In Progress with a card. */
  ageDays: number | null;
}

export interface ViewPlan {
  name: string;
  state: PlanState;
  issues: ViewIssue[];
}

export type ViewPlans =
  | { parse: 'ok'; list: ViewPlan[] }
  | { parse: 'none' }
  | { parse: 'malformed'; reason: string };

export interface PlanCards {
  name: string;
  cards: InProgress[];
}

export interface PickupView {
  board: { owner: string; repo: string; project: number };
  /** `null` with no active milestone. */
  milestone: {
    title: string;
    /** The description's first sentence; `null` when it has no prose. */
    outcome: string | null;
    counts: IssueCounts | null;
  } | null;
  openMilestones: Array<{ number: number; title: string }>;
  /** Titles of the open milestones other than the active one. */
  otherOpen: string[];
  plans: ViewPlans;
  inProgress: {
    /** Plans with a card In Progress, in header order. */
    byPlan: PlanCards[];
    /** Cards in no plan, or every card when the header does not parse. */
    loose: InProgress[];
  };
  /** The header's unplanned issues less those In Progress. */
  unplanned: Array<{ number: number; title: string }>;
  tier1: Candidate[];
  tier2: Candidate[];
  drift: DriftEntry[];
  next: string;
}

function viewIssue(
  issue: PlanIssue,
  cards: Map<number, InProgress>,
): ViewIssue {
  const card = cards.get(issue.number);
  return {
    ...issue,
    ageDays:
      issue.status === 'In Progress' && card !== undefined
        ? card.age_days
        : null,
  };
}

function viewPlans(p: BriefInput, cards: Map<number, InProgress>): ViewPlans {
  const plans = p.plans;
  if (plans === null) return { parse: 'none' };
  if (plans.parse === 'malformed') {
    return { parse: 'malformed', reason: plans.reason ?? '' };
  }
  if (plans.parse === 'none') return { parse: 'none' };
  return {
    parse: 'ok',
    list: plans.list.map((pl) => ({
      name: pl.name,
      state: pl.state,
      issues: pl.issues.map((i) => viewIssue(i, cards)),
    })),
  };
}

function groupInProgress(
  p: BriefInput,
  plans: ParsedPlans | null,
  cards: Map<number, InProgress>,
): PickupView['inProgress'] {
  if (plans === null) return { byPlan: [], loose: p.in_progress };
  const byPlan = plans.list.flatMap((pl) => {
    const mine = pl.issues.flatMap((i) => cards.get(i.number) ?? []);
    return mine.length === 0 ? [] : [{ name: pl.name, cards: mine }];
  });
  const planned = plannedNumbers(plans.list);
  return {
    byPlan,
    loose: p.in_progress.filter((i) => !planned.has(i.number)),
  };
}

export function pickupView(p: BriefInput): PickupView {
  const cards = new Map(p.in_progress.map((i) => [i.number, i]));
  const plans = parsedPlans(p);
  const m = p.milestone;
  const outcome =
    m === null ? null : firstSentence(descriptionProse(m.description));
  return {
    board: {
      owner: p.board.owner,
      repo: p.board.repo,
      project: p.board.project.number,
    },
    milestone:
      m === null
        ? null
        : {
            title: m.title,
            outcome: outcome === '' ? null : outcome,
            counts: p.issue_counts,
          },
    openMilestones: p.open_milestones,
    otherOpen: p.open_milestones
      .filter((o) => o.number !== m?.number)
      .map((o) => o.title),
    plans: viewPlans(p, cards),
    inProgress: groupInProgress(p, plans, cards),
    unplanned:
      plans === null ? [] : plans.unplanned.filter((i) => !cards.has(i.number)),
    tier1: p.candidates.filter((c) => c.tier === 1),
    tier2: p.candidates.filter((c) => c.tier === 2),
    drift: driftEntries(p.drift, p.plans),
    next: nextMove(p),
  };
}
