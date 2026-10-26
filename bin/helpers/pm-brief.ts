/**
 * The text rendering of `sidekick pm pickup`, for a session-start hook and
 * for a reader who wants six lines rather than a JSON object. Pure: it
 * renders what `pickup` already joined and decides nothing new, except the
 * `next` line, which is a fixed rule so the skill does the judging.
 */

import type { Candidate, Drift, InProgress } from './pm.js';
import type { IssueCounts, Milestone } from './pm-data.js';
import type { Plans } from './pm-plans.js';
import {
  cut,
  nextMove,
  type PickupView,
  pickupView,
  TITLE_MAX,
  titles,
  type ViewPlan,
} from './pm-view.js';

export { nextMove, TITLE_MAX };

export interface BriefInput {
  board: { owner: string; repo: string; project: { number: number } };
  milestone: Milestone | null;
  /** `null` exactly when `milestone` is. */
  issue_counts: IssueCounts | null;
  open_milestones: Array<{ number: number; title: string }>;
  in_progress: InProgress[];
  candidates: Candidate[];
  plans: Plans | null;
  drift: Drift;
}

/** Prescriptive: candidates shown per tier before `+n more`. */
export const PER_TIER_MAX = 5;

function ref(i: { number: number; title: string }): string {
  return `#${i.number} ${cut(i.title)}`;
}

function tierBody(candidates: Candidate[]): string | null {
  if (candidates.length === 0) return null;
  const shown = candidates.slice(0, PER_TIER_MAX).map(ref).join('; ');
  const more =
    candidates.length > PER_TIER_MAX
      ? ` +${candidates.length - PER_TIER_MAX} more`
      : '';
  return `${shown}${more}`;
}

function tierLine(tier: 1 | 2, candidates: Candidate[]): string | null {
  const body = tierBody(candidates);
  return body === null ? null : `tier ${tier} ${body}`;
}

const openRefs = (plan: ViewPlan): string =>
  plan.issues
    .filter((i) => i.open)
    .map((i) => `#${i.number}`)
    .join(', ');

const card = (i: InProgress): string => `#${i.number} (${i.age_days} d)`;
const titledCard = (i: InProgress): string => `${ref(i)} (${i.age_days} d)`;

function inProgressLine(v: PickupView): string {
  const { byPlan, loose } = v.inProgress;
  const parts = [
    ...byPlan.map(
      (g) => `plan ${cut(g.name)}: ${g.cards.map(card).join(', ')}`,
    ),
    ...loose.map(titledCard),
  ];
  if (parts.length === 0) return 'in progress: none';
  // Without a parsed header the cards are one list; with one, groups.
  return `in progress: ${parts.join(v.plans.parse === 'ok' ? ' · ' : ', ')}`;
}

function doneSegment(count: number): string | null {
  if (count === 0) return null;
  return count === 1 ? '1 plan done' : `${count} plans done`;
}

function planCandidatesLine(v: PickupView, list: ViewPlan[]): string {
  const inState = (state: ViewPlan['state']) =>
    list.filter((pl) => pl.state === state);
  const next = list.find((pl) => pl.state === 'next');
  const later = inState('later');
  const openCount = (pl: ViewPlan) => pl.issues.filter((i) => i.open).length;
  const unplanned = v.unplanned.map((i) => `#${i.number}`).join(', ');
  const segments = [
    next === undefined
      ? null
      : `next plan ${cut(next.name)} (${openRefs(next)})`,
    later.length === 0
      ? null
      : `then ${later.map((pl) => `${cut(pl.name)} (${openCount(pl)})`).join(', ')}`,
    doneSegment(inState('done').length),
    `unplanned: ${unplanned === '' ? 'none' : unplanned}`,
    `tier 2: ${tierBody(v.tier2) ?? 'none'}`,
  ];
  return `candidates: ${segments.filter((s) => s !== null).join(' · ')}`;
}

function candidatesLine(v: PickupView): string {
  if (v.plans.parse === 'ok') return planCandidatesLine(v, v.plans.list);
  const tiers = [tierLine(1, v.tier1), tierLine(2, v.tier2)].filter(
    (t): t is string => t !== null,
  );
  const order =
    v.tier1.length + v.tier2.length > 1 ? ' (order: number, not priority)' : '';
  return tiers.length > 0
    ? `candidates: ${tiers.join(' · ')}${order}`
    : 'candidates: none';
}

function milestoneLine(v: PickupView): string {
  const m = v.milestone;
  if (m === null) {
    return v.openMilestones.length === 0
      ? 'milestone: none'
      : `milestone: none active · open: ${titles(v.openMilestones)}`;
  }
  const c = m.counts;
  const counts = c === null ? '' : ` (${c.open} open, ${c.closed} closed)`;
  return [
    `milestone: ${m.title}${counts}`,
    ...(m.outcome === null ? [] : [m.outcome]),
    ...(v.otherOpen.length > 0
      ? [`also open: ${v.otherOpen.map(cut).join(', ')}`]
      : []),
  ].join(' · ');
}

export function renderBrief(p: BriefInput): string {
  const v = pickupView(p);
  const drift = v.drift.map((d) => d.full);
  return [
    `sidekick · ${v.board.owner}/${v.board.repo} · board #${v.board.project}`,
    milestoneLine(v),
    inProgressLine(v),
    candidatesLine(v),
    drift.length > 0 ? `drift: ${drift.join(' · ')}` : 'drift: none',
    `next: ${v.next}`,
  ].join('\n');
}
