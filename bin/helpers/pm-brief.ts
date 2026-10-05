/**
 * The text rendering of `sidekick pm pickup`, for a session-start hook and
 * for a reader who wants six lines rather than a JSON object. Pure: it
 * renders what `pickup` already joined and decides nothing new, except the
 * `next` line, which is a fixed rule so the skill does the judging.
 */

import type { Candidate, Drift, InProgress } from './pm.js';
import type { Milestone } from './pm-data.js';
import { descriptionProse, type Plans, type PlanView } from './pm-plans.js';

export interface BriefInput {
  board: { owner: string; repo: string; project: { number: number } };
  milestone: Milestone | null;
  open_milestones: Array<{ number: number; title: string }>;
  in_progress: InProgress[];
  candidates: Candidate[];
  plans: Plans | null;
  drift: Drift;
}

interface ParsedPlans {
  list: PlanView[];
  unplanned: Plans['unplanned'];
}

/** Prescriptive: a title longer than this is cut with an ellipsis. */
export const TITLE_MAX = 60;
/** Prescriptive: candidates shown per tier before `+n more`. */
export const PER_TIER_MAX = 5;

function cut(title: string): string {
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title;
}

function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const m = /^(.*?[.!?])(?:\s|$)/.exec(t);
  return m ? m[1] : t;
}

const titles = (list: Array<{ title: string }>): string =>
  list.map((m) => cut(m.title)).join(', ');

function ref(i: { number: number; title: string }): string {
  return `#${i.number} ${cut(i.title)}`;
}

function tierBody(tier: 1 | 2, candidates: Candidate[]): string | null {
  const mine = candidates.filter((c) => c.tier === tier);
  if (mine.length === 0) return null;
  const shown = mine.slice(0, PER_TIER_MAX).map(ref).join('; ');
  const more =
    mine.length > PER_TIER_MAX ? ` +${mine.length - PER_TIER_MAX} more` : '';
  return `${shown}${more}`;
}

function tierLine(tier: 1 | 2, candidates: Candidate[]): string | null {
  const body = tierBody(tier, candidates);
  return body === null ? null : `tier ${tier} ${body}`;
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

const card = (i: InProgress): string => `#${i.number} (${i.age_days} d)`;
const titledCard = (i: InProgress): string => `${ref(i)} (${i.age_days} d)`;

function inProgressLine(p: BriefInput, plans: ParsedPlans | null): string {
  if (p.in_progress.length === 0) return 'in progress: none';
  if (plans === null) {
    return `in progress: ${p.in_progress.map(titledCard).join(', ')}`;
  }
  const byNumber = new Map(p.in_progress.map((i) => [i.number, i]));
  const grouped = plans.list.flatMap((pl) => {
    const cards = pl.issues.flatMap((i) => byNumber.get(i.number) ?? []);
    return cards.length === 0
      ? []
      : [`plan ${cut(pl.name)}: ${cards.map(card).join(', ')}`];
  });
  const planned = plannedNumbers(plans.list);
  const loose = p.in_progress
    .filter((i) => !planned.has(i.number))
    .map(titledCard);
  return `in progress: ${[...grouped, ...loose].join(' · ')}`;
}

function doneSegment(count: number): string | null {
  if (count === 0) return null;
  return count === 1 ? '1 plan done' : `${count} plans done`;
}

function planCandidatesLine(p: BriefInput, plans: ParsedPlans): string {
  const inState = (state: PlanView['state']) =>
    plans.list.filter((pl) => pl.state === state);
  const next = plans.list.find((pl) => pl.state === 'next');
  const later = inState('later');
  const verify = inState('verify');
  const openCount = (pl: PlanView) => pl.issues.filter((i) => i.open).length;
  // An In Progress issue already shows in the in-progress line.
  const running = new Set(p.in_progress.map((i) => i.number));
  const unplanned = plans.unplanned
    .filter((i) => !running.has(i.number))
    .map((i) => `#${i.number}`)
    .join(', ');
  const segments = [
    next === undefined
      ? null
      : `next plan ${cut(next.name)} (${openRefs(next)})`,
    later.length === 0
      ? null
      : `then ${later.map((pl) => `${cut(pl.name)} (${openCount(pl)})`).join(', ')}`,
    verify.length === 0
      ? null
      : `in verify: ${verify.map((pl) => cut(pl.name)).join(', ')}`,
    doneSegment(inState('done').length),
    `unplanned: ${unplanned === '' ? 'none' : unplanned}`,
    `tier 2: ${tierBody(2, p.candidates) ?? 'none'}`,
  ];
  return `candidates: ${segments.filter((s) => s !== null).join(' · ')}`;
}

function candidatesLine(p: BriefInput, plans: ParsedPlans | null): string {
  if (plans !== null) return planCandidatesLine(p, plans);
  const tiers = [tierLine(1, p.candidates), tierLine(2, p.candidates)].filter(
    (t): t is string => t !== null,
  );
  const order = p.candidates.length > 1 ? ' (order: number, not priority)' : '';
  return tiers.length > 0
    ? `candidates: ${tiers.join(' · ')}${order}`
    : 'candidates: none';
}

function milestoneLine(p: BriefInput): string {
  const m = p.milestone;
  if (m === null) {
    return p.open_milestones.length === 0
      ? 'milestone: none'
      : `milestone: none active · open: ${titles(p.open_milestones)}`;
  }
  const outcome = firstSentence(descriptionProse(m.description));
  const others = p.open_milestones.filter((o) => o.number !== m.number);
  return [
    `milestone: ${m.title} (${m.open_issues} open, ${m.closed_issues} closed)`,
    ...(outcome ? [outcome] : []),
    ...(others.length > 0 ? [`also open: ${titles(others)}`] : []),
  ].join(' · ');
}

export function renderBrief(p: BriefInput): string {
  const lines: string[] = [];
  lines.push(
    `sidekick · ${p.board.owner}/${p.board.repo} · board #${p.board.project.number}`,
  );

  lines.push(milestoneLine(p));

  const plans = parsedPlans(p);
  lines.push(inProgressLine(p, plans));
  lines.push(candidatesLine(p, plans));

  const drift: string[] = [];
  const unpushed = p.drift.unpushed.count;
  if (unpushed !== null && unpushed > 0) drift.push(`${unpushed} unpushed`);
  if (p.drift.stale_in_progress.length > 0) {
    drift.push(
      `stale: ${p.drift.stale_in_progress.map((i) => `#${i.number} (${i.age_days} d)`).join(', ')}`,
    );
  }
  if (p.drift.open_pr) drift.push(`open PR #${p.drift.open_pr.number}`);
  if (p.drift.in_progress_split.length > 0) {
    drift.push(
      `In Progress split: ${p.drift.in_progress_split.map(cut).join(', ')}`,
    );
  }
  if (p.plans !== null && p.plans.parse === 'malformed') {
    drift.push(`plans header: ${p.plans.reason}`);
  }
  lines.push(drift.length > 0 ? `drift: ${drift.join(' · ')}` : 'drift: none');

  lines.push(`next: ${nextMove(p)}`);
  return lines.join('\n');
}
