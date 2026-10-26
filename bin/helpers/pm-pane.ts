import type {
  GlancePane,
  PaneNode,
  PanePlanState,
  PaneRow,
} from '../../plugin/hooks/board/contract.js';
import { PER_TIER_MAX } from './pm-brief.js';
import type { PickupView, ViewIssue, ViewPlan } from './pm-view.js';

const IN_PROGRESS = 'In Progress';

type Titled = { number: number; title: string };

function ageText(days: number | null): string | null {
  return days === null ? null : `${days} d`;
}

function leaf(
  mark: PaneNode['mark'],
  ref: string | null,
  text: string,
  age: number | null,
): PaneNode {
  return {
    mark,
    ref,
    text,
    right: ageText(age),
    weight: 'plain',
    children: [],
  };
}

function markOf(issue: ViewIssue): 'done' | 'running' | 'later' {
  if (issue.open && issue.status === IN_PROGRESS) return 'running';
  return issue.open ? 'later' : 'done';
}

function issueNode(issue: ViewIssue): PaneNode {
  return leaf(
    markOf(issue),
    `#${issue.number}`,
    issue.title ?? 'no card',
    issue.ageDays,
  );
}

function titledNode(
  issue: Titled,
  mark: 'later' | 'running',
  age: number | null,
): PaneNode {
  return leaf(mark, `#${issue.number}`, issue.title, age);
}

function quiet(
  mark: PaneNode['mark'],
  text: string,
  children: PaneNode[] = [],
): PaneNode {
  return { mark, ref: null, text, right: null, weight: 'quiet', children };
}

function openIssues(plan: ViewPlan): PaneNode[] {
  const open = plan.issues.filter((i) => i.open);
  const started = open.filter((i) => i.status === IN_PROGRESS);
  const rest = open.filter((i) => i.status !== IN_PROGRESS);
  return [...started, ...rest].map(issueNode);
}

function closedNode(plan: ViewPlan): PaneNode[] {
  const closed = plan.issues.filter((i) => !i.open).length;
  return closed === 0 ? [] : [quiet('done', `${closed} closed`)];
}

function planNode(plan: ViewPlan): PaneNode {
  const base = { mark: plan.state, ref: null, text: plan.name };
  if (plan.state === 'running') {
    return {
      ...base,
      right: null,
      weight: 'strong',
      children: [...openIssues(plan), ...closedNode(plan)],
    };
  }
  if (plan.state === 'next') {
    return {
      ...base,
      right: 'next',
      weight: 'plain',
      children: openIssues(plan),
    };
  }
  const open = plan.issues.filter((i) => i.open).length;
  return {
    ...base,
    right: `${open} open`,
    weight: 'quiet',
    children: [],
  };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function planNodes(view: PickupView): PaneNode[] {
  if (view.plans.parse !== 'ok') return [];
  const done = view.plans.list.filter((p) => p.state === 'done').length;
  const fold =
    done === 0 ? [] : [quiet('done', `${plural(done, 'plan')} done`)];
  const active = view.plans.list.filter((p) => p.state !== 'done');
  return [...fold, ...active.map(planNode)];
}

function capped(name: string, issues: Titled[]): PaneNode[] {
  if (issues.length === 0) return [];
  const shown = issues
    .slice(0, PER_TIER_MAX)
    .map((i) => titledNode(i, 'later', null));
  const hidden = issues.length - shown.length;
  const tail = hidden > 0 ? [quiet('more', `+${hidden} more`)] : [];
  return [quiet('group', name, [...shown, ...tail])];
}

function milestoneNodes(titles: string[]): PaneNode[] {
  return titles.map((title) => leaf('later', null, title, null));
}

function alsoOpen(view: PickupView): PaneNode[] {
  if (view.milestone === null || view.otherOpen.length === 0) return [];
  return [quiet('group', 'also open', milestoneNodes(view.otherOpen))];
}

function treeNodes(view: PickupView): PaneNode[] {
  const headerParsed = view.plans.parse === 'ok';
  return [
    ...(view.milestone === null ? milestoneNodes(view.otherOpen) : []),
    ...planNodes(view),
    ...view.inProgress.loose.map((i) => titledNode(i, 'running', i.age_days)),
    ...capped('unplanned', view.unplanned),
    ...capped('candidates', headerParsed ? [] : view.tier1),
    ...capped('tier 2 · no milestone', view.tier2),
    ...alsoOpen(view),
  ];
}

function planStates(view: PickupView): PanePlanState[] {
  return view.plans.parse === 'ok' ? view.plans.list.map((p) => p.state) : [];
}

function cellsRow(view: PickupView): PaneRow[] {
  if (view.milestone === null) return [];
  const plans = planStates(view);
  if (plans.length > 0) {
    const done = plans.filter((s) => s === 'done').length;
    return [{ kind: 'cells', plans, label: `${done}/${plans.length} plans` }];
  }
  const { open, closed } = view.milestone.counts ?? { open: 0, closed: 0 };
  return [{ kind: 'cells', plans, label: `${closed} closed · ${open} open` }];
}

/** The rows the board pane draws, worded and ordered but with no width; the mod fits them. */
export function paneRows(view: PickupView): GlancePane {
  const outcome = view.milestone?.outcome ?? null;
  const nodes = treeNodes(view);
  const rows: PaneRow[] = [
    { kind: 'prose', mark: 'next', text: view.next },
    ...view.drift.map(
      (d): PaneRow => ({
        kind: 'prose',
        mark: 'drift',
        text: d.full,
      }),
    ),
    ...(outcome === null
      ? []
      : [{ kind: 'prose', mark: 'outcome', text: outcome } satisfies PaneRow]),
    ...cellsRow(view),
    ...(nodes.length === 0 ? [] : [{ kind: 'tree', nodes } satisfies PaneRow]),
  ];
  return { rows };
}
