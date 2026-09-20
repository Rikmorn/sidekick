/**
 * The text rendering of `sidekick pm pickup`, for a session-start hook and
 * for a reader who wants six lines rather than a JSON object. Pure: it
 * renders what `pickup` already joined and decides nothing new, except the
 * `next` line, which is a fixed rule so the skill does the judging.
 */

import type { Candidate, Drift, InProgress } from './pm.js';
import type { Milestone } from './pm-data.js';

export interface BriefInput {
  board: { owner: string; repo: string; project: { number: number } };
  milestone: Milestone | null;
  in_progress: InProgress[];
  candidates: Candidate[];
  drift: Drift;
}

/** Prescriptive: a title longer than this is cut with an ellipsis. */
export const TITLE_MAX = 60;
/** Prescriptive: candidates shown per tier before `+n more`. */
export const PER_TIER_MAX = 5;

function cut(title: string): string {
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title;
}

function firstSentence(text: string): string {
  const t = text.trim();
  const m = /^(.*?[.!?])(?:\s|$)/.exec(t);
  return m ? m[1] : t;
}

function ref(i: { number: number; title: string }): string {
  return `#${i.number} ${cut(i.title)}`;
}

function tierLine(tier: 1 | 2, candidates: Candidate[]): string | null {
  const mine = candidates.filter((c) => c.tier === tier);
  if (mine.length === 0) return null;
  const shown = mine.slice(0, PER_TIER_MAX).map(ref).join('; ');
  const more =
    mine.length > PER_TIER_MAX ? ` +${mine.length - PER_TIER_MAX} more` : '';
  return `tier ${tier} ${shown}${more}`;
}

export function nextMove(p: BriefInput): string {
  if (p.in_progress.length > 0) {
    const lowest = Math.min(...p.in_progress.map((i) => i.number));
    return `continue #${lowest}`;
  }
  if (p.candidates.some((c) => c.tier === 1))
    return 'pull one tier-1 candidate';
  if (p.candidates.some((c) => c.tier === 2))
    return 'pull one tier-2 candidate';
  return 'nothing open: open the next milestone';
}

export function renderBrief(p: BriefInput): string {
  const lines: string[] = [];
  lines.push(
    `sidekick · ${p.board.owner}/${p.board.repo} · board #${p.board.project.number}`,
  );

  if (p.milestone) {
    const m = p.milestone;
    const outcome = firstSentence(m.description);
    lines.push(
      `milestone: ${m.title} (${m.open_issues} open, ${m.closed_issues} closed)${outcome ? ` · ${outcome}` : ''}`,
    );
  } else {
    lines.push('milestone: none');
  }

  lines.push(
    p.in_progress.length > 0
      ? `in progress: ${p.in_progress.map((i) => `${ref(i)} (${i.age_days} d)`).join(', ')}`
      : 'in progress: none',
  );

  const tiers = [tierLine(1, p.candidates), tierLine(2, p.candidates)].filter(
    (t): t is string => t !== null,
  );
  const order = p.candidates.length > 1 ? ' (order: number, not priority)' : '';
  lines.push(
    tiers.length > 0
      ? `candidates: ${tiers.join(' · ')}${order}`
      : 'candidates: none',
  );

  const drift: string[] = [];
  const unpushed = p.drift.unpushed.count;
  if (unpushed !== null && unpushed > 0) drift.push(`${unpushed} unpushed`);
  if (p.drift.stale_in_progress.length > 0) {
    drift.push(
      `stale: ${p.drift.stale_in_progress.map((i) => `#${i.number} (${i.age_days} d)`).join(', ')}`,
    );
  }
  if (p.drift.open_pr) drift.push(`open PR #${p.drift.open_pr.number}`);
  lines.push(drift.length > 0 ? `drift: ${drift.join(' · ')}` : 'drift: none');

  lines.push(`next: ${nextMove(p)}`);
  return lines.join('\n');
}
