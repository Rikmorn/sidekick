/**
 * The project status update the PM posts at plan level: the milestone's
 * plans in run order with their state, as Markdown for GitHub. Pure: it
 * renders what `pickup` already joined.
 */

import type { IssueCounts, Milestone } from './pm-data.js';
import type { PlanState, Plans, PlanView } from './pm-plans.js';

export interface ReportInput {
  board: { owner: string; repo: string };
  milestone: Milestone;
  issue_counts: IssueCounts;
  plans: Plans;
}

const STATE_CELL: Record<PlanState, string> = {
  done: 'done',
  running: 'running',
  next: 'next',
  later: '',
};

// A pipe in a plan name would end its table cell.
const cell = (text: string): string => text.replaceAll('|', '\\|');

function row(plan: PlanView, ref: (n: number) => string): string {
  const closed = plan.issues.filter((i) => !i.open).length;
  const issues = plan.issues.map((i) => ref(i.number)).join(' ');
  return `| ${STATE_CELL[plan.state]} | ${cell(plan.name)} | ${closed} of ${plan.issues.length} | ${issues} |`;
}

/** Issues are qualified, since a user's project has no repo to resolve `#N`. */
export function renderReport(r: ReportInput): string {
  const ref = (n: number): string => `${r.board.owner}/${r.board.repo}#${n}`;
  const running = r.plans.list
    .filter((p) => p.state === 'running')
    .map((p) => `**${p.name}**`);
  const unplanned = r.plans.unplanned.map((i) => ref(i.number));
  return [
    `**${r.milestone.title}** · ${r.issue_counts.open} open, ${r.issue_counts.closed} closed`,
    `Running: ${running.length > 0 ? running.join(', ') : 'none'}`,
    '',
    '| | Plan | Closed | Issues |',
    '|---|---|---|---|',
    ...r.plans.list.map((p) => row(p, ref)),
    '',
    `Unplanned: ${unplanned.length > 0 ? unplanned.join(', ') : 'none'}.`,
  ].join('\n');
}
