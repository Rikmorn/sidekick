import type { Candidate, InProgress } from '../../pm.js';
import type { BriefInput } from '../../pm-brief.js';
import type { Milestone } from '../../pm-data.js';
import type { PlanIssue, PlanView } from '../../pm-plans.js';

/** Test-only pickups for the brief, the line, and the pane's view. */

const card = (number: number, age_days: number): InProgress => ({
  number,
  title: `t${number}`,
  item_id: `PVTI_${number}`,
  age_days,
  assignees: [],
  milestone: null,
});
const cand = (number: number, tier: 1 | 2): Candidate => ({
  tier,
  number,
  title: `t${number}`,
  item_id: `PVTI_${number}`,
  labels: ['area:pm'],
});
const planIssue = (
  number: number,
  status: string | null,
  open = status !== 'Done',
): PlanIssue => ({
  number,
  title: status === null ? null : `t${number}`,
  open,
  status,
});

const milestone = (description: string, number = 6): Milestone => ({
  number,
  title: `R${number} — PM layer`,
  description,
  due_on: null,
  open_issues: 3,
  closed_issues: 2,
  state: 'open',
  created_at: '2026-09-19T14:29:56Z',
});

const quiet: BriefInput['drift'] = {
  unpushed: { count: 0, basis: 'upstream' },
  stale_in_progress: [],
  open_pr: null,
  in_progress_split: [],
};

const base = (over: Partial<BriefInput> = {}): BriefInput => ({
  board: { owner: 'Rikmorn', repo: 'sidekick', project: { number: 2 } },
  milestone: milestone(
    'Outcome: sessions start from the board. Scope: the PM layer.',
  ),
  open_milestones: [{ number: 6, title: 'R6 — PM layer' }],
  issue_counts: { open: 3, closed: 2 },
  in_progress: [],
  candidates: [],
  plans: null,
  drift: quiet,
  ...over,
});

const planned = (
  name: string,
  state: PlanView['state'],
  ...issues: PlanIssue[]
): PlanView => ({
  name,
  state,
  issues,
});

/** The live R9 pickup of 2026-10-26, cut to what the brief reads. */
const r9: BriefInput = {
  board: { owner: 'Rikmorn', repo: 'sidekick', project: { number: 2 } },
  milestone: {
    number: 9,
    title: 'R9 — Control centre',
    description:
      "<!-- plans -->\n1. Mods ADR and the context monitor (#203, #146)\n2. GSD's skills and agents out, its monitor kept (#204)\n3. Profile manifest and launch (#205)\n4. Repo profiles and switching (#213)\n5. Dispatched workers (#206, #218)\n6. Mod foundation and the gauge (#207, #208, #225)\n7. The desk (#210)\n8. Board band and scope mod (#211, #209, #228)\n9. The board's state line (#233)\n10. /profile that fits, and commands in every session (#232, #234, #235, #238)\n11. The main session keeps its views, and workers point back to it (#245)\n12. The desk tells an idle main from one that needs you (#247)\n13. The control centre's usage guide (#240, #253, #254, #251)\n14. A backgrounded main that runs none of sidekick's mods (#250)\n15. The docs that say what sidekick is (#215)\n16. GSD's status line and monitor replaced after the release install (#214)\n<!-- /plans -->\n\nOutcome: GSD no longer loads, and nothing it provided is lost. Sessions launch with declared profiles and start leaner than today's measured baseline. From any session, the operator dispatches, steers, and stops workers, and sees which sessions need them.\n\nScope: sidekick's context monitor, and GSD disabled in two stages with its files kept. Profile management, and workers a session dispatches. The mods that show sessions, profiles, and context, with the ADR that admits them, and the docs that say what sidekick is. The baseline is the 74,229-token first request measured on 2026-10-11 in this repo, by the method in `docs/research/control-centre/2026-10-12-claude-code-surface.md` §Context budget. Out: domain profiles, the plugin split, and memory and the loop, which the loop design takes up.\n\nRoute: R9 lands on `master` from the branch `milestone/r9-control-centre` at the close, as one release. GSD's status line and monitor are replaced after the release install (#214), and the milestone closes once that issue does.\n\n\n\n\n\n\n\n\n\n\n",
    due_on: null,
    open_issues: 5,
    closed_issues: 23,
    state: 'open',
    created_at: '2026-10-13T13:04:27Z',
  },
  issue_counts: { open: 5, closed: 23 },
  open_milestones: [{ number: 9, title: 'R9 — Control centre' }],
  in_progress: [
    {
      number: 240,
      title:
        'A usage guide with pictures: what each control-centre view shows, and how to move between sessions, agent view, and workers',
      item_id: 'PVTI_lAHOABcx2M4BiJeEzhBSExM',
      age_days: 0,
      assignees: [],
      milestone: 'R9 — Control centre',
    },
    {
      number: 251,
      title:
        "Docked sidekick panes open 24 columns wide at 160 columns, so the board's brief wraps to 28 rows",
      item_id: 'PVTI_lAHOABcx2M4BiJeEzhDCFl8',
      age_days: 0,
      assignees: [],
      milestone: 'R9 — Control centre',
    },
  ],
  candidates: [
    {
      tier: 1,
      number: 214,
      title:
        "After the release install: replace GSD's status line and context monitor, and measure the released start cost",
      item_id: 'PVTI_lAHOABcx2M4BiJeEzhAcrjE',
      labels: ['area:plugin'],
    },
    {
      tier: 1,
      number: 215,
      title:
        'The README, the north star, and the plugin manifest describe the control centre R9 adds',
      item_id: 'PVTI_lAHOABcx2M4BiJeEzhAcro0',
      labels: ['area:guidance'],
    },
    {
      tier: 1,
      number: 250,
      title:
        "A backgrounded main can run none of sidekick's mods, so it shows no views and /desk completes to /desktop",
      item_id: 'PVTI_lAHOABcx2M4BiJeEzhDCFik',
      labels: ['area:plugin'],
    },
  ],
  plans: {
    parse: 'ok',
    list: [
      {
        name: 'Mods ADR and the context monitor',
        state: 'done',
        issues: [
          {
            number: 203,
            title:
              'An ADR for when sidekick ships mods and what they may do, with ADR-0010 amended to match',
            open: false,
            status: 'Done',
          },
          {
            number: 146,
            title:
              "A context monitor hook: warn the model before the context window fills, as GSD's does",
            open: false,
            status: 'Done',
          },
        ],
      },
      {
        name: "GSD's skills and agents out, its monitor kept",
        state: 'done',
        issues: [
          {
            number: 204,
            title:
              'Disable GSD in two stages, keeping its files, with nothing it provides lost',
            open: false,
            status: 'Done',
          },
        ],
      },
      {
        name: 'Profile manifest and launch',
        state: 'done',
        issues: [
          {
            number: 205,
            title:
              'Profile management: declare, list, and launch session profiles over native settings',
            open: false,
            status: 'Done',
          },
        ],
      },
      {
        name: 'Repo profiles and switching',
        state: 'done',
        issues: [
          {
            number: 213,
            title:
              "Repo profiles and switching: a repo's own profiles, profile switching, and the dependency check",
            open: false,
            status: 'Done',
          },
        ],
      },
      {
        name: 'Dispatched workers',
        state: 'done',
        issues: [
          {
            number: 206,
            title:
              'Dispatched workers: a session launches sk-worker in the background, in its own worktree, behind a push block',
            open: false,
            status: 'Done',
          },
          {
            number: 218,
            title:
              "In worktree mode, the worker's run report lands in a folder that removing the worktree deletes",
            open: false,
            status: 'Done',
          },
        ],
      },
      {
        name: 'Mod foundation and the gauge',
        state: 'done',
        issues: [
          {
            number: 207,
            title:
              "The mod foundation: sidekick's hooks module, the adapter pattern, and mod tests in the gates",
            open: false,
            status: 'Done',
          },
          {
            number: 208,
            title:
              'The gauge: each session shows its profile and context, and flags itself when unprofiled',
            open: false,
            status: 'Done',
          },
          {
            number: 225,
            title:
              "The context monitor's fallback measures against Claude Code's compaction window as if it were the context window",
            open: false,
            status: 'Done',
          },
        ],
      },
      {
        name: 'The desk',
        state: 'done',
        issues: [
          {
            number: 210,
            title:
              'The desk: every session shows which others need the operator, with a workers pane',
            open: false,
            status: 'Done',
          },
        ],
      },
      {
        name: 'Board band and scope mod',
        state: 'done',
        issues: [
          {
            number: 211,
            title:
              'The board band: the pickup shown as a band, and a session start that carries only the brief',
            open: false,
            status: 'Done',
          },
          {
            number: 209,
            title:
              'The scope mod: per-session filters native settings cannot set, and a /profile command',
            open: false,
            status: 'Done',
          },
          {
            number: 228,
            title:
              'Worker worktrees get the type caches the gates need through .worktreeinclude',
            open: false,
            status: 'Done',
          },
        ],
      },
      {
        name: "The board's state line",
        state: 'done',
        issues: [
          {
            number: 233,
            title:
              'The board draws one state line under the prompt, with its brief in a /board pane',
            open: false,
            status: 'Done',
          },
        ],
      },
      {
        name: '/profile that fits, and commands in every session',
        state: 'done',
        issues: [
          {
            number: 232,
            title:
              'Inline panes clip their rows with no way to scroll, so /profile and /desk hide what does not fit',
            open: false,
            status: 'Done',
          },
          {
            number: 234,
            title:
              '/profile prints the auto-memory file as an unreadable path tail',
            open: false,
            status: 'Done',
          },
          {
            number: 235,
            title:
              '/desk, /board, and /profile answer in place of any other command of the same name',
            open: false,
            status: 'Done',
          },
          {
            number: 238,
            title:
              '/desk, /board, and /profile do not exist in a background session, and nothing tells the operator why',
            open: false,
            status: 'Done',
          },
        ],
      },
      {
        name: 'The main session keeps its views, and workers point back to it',
        state: 'done',
        issues: [
          {
            number: 245,
            title:
              "The main session keeps sidekick's views after ←, and every worker says how to get back to its main",
            open: false,
            status: 'Done',
          },
        ],
      },
      {
        name: 'The desk tells an idle main from one that needs you',
        state: 'done',
        issues: [
          {
            number: 247,
            title:
              'The desk counts a backgrounded main whose turn ended as waiting on the operator',
            open: false,
            status: 'Done',
          },
        ],
      },
      {
        name: "The control centre's usage guide",
        state: 'running',
        issues: [
          {
            number: 240,
            title:
              'A usage guide with pictures: what each control-centre view shows, and how to move between sessions, agent view, and workers',
            open: true,
            status: 'In Progress',
          },
          {
            number: 253,
            title:
              "The desk pane prints a waiting session's state twice, as blocked · blocked, when the listing gives no reason",
            open: false,
            status: 'Done',
          },
          {
            number: 254,
            title:
              "The desk pane reads at a glance: each session's work, context, and subagents, nested, with other sessions marked in place",
            open: false,
            status: 'Done',
          },
          {
            number: 251,
            title:
              "Docked sidekick panes open 24 columns wide at 160 columns, so the board's brief wraps to 28 rows",
            open: true,
            status: 'In Progress',
          },
        ],
      },
      {
        name: "A backgrounded main that runs none of sidekick's mods",
        state: 'next',
        issues: [
          {
            number: 250,
            title:
              "A backgrounded main can run none of sidekick's mods, so it shows no views and /desk completes to /desktop",
            open: true,
            status: 'Backlog',
          },
        ],
      },
      {
        name: 'The docs that say what sidekick is',
        state: 'later',
        issues: [
          {
            number: 215,
            title:
              'The README, the north star, and the plugin manifest describe the control centre R9 adds',
            open: true,
            status: 'Backlog',
          },
        ],
      },
      {
        name: "GSD's status line and monitor replaced after the release install",
        state: 'later',
        issues: [
          {
            number: 214,
            title:
              "After the release install: replace GSD's status line and context monitor, and measure the released start cost",
            open: true,
            status: 'Backlog',
          },
        ],
      },
    ],
    unplanned: [],
  },
  drift: {
    unpushed: { count: 0, basis: 'upstream' },
    stale_in_progress: [],
    open_pr: null,
    in_progress_split: [],
  },
};

export const pickups: Record<string, BriefInput> = {
  r9,
  everyDrift: base({
    in_progress: [card(240, 9), card(241, 2)],
    plans: {
      parse: 'malformed',
      reason: 'plan 2 repeats #240',
      list: [],
      unplanned: [],
    },
    drift: {
      unpushed: { count: 3, basis: 'upstream' },
      stale_in_progress: [card(240, 9), card(241, 2)],
      open_pr: { number: 12, title: 'A pull request' },
      in_progress_split: ['R9', 'R10'],
    },
  }),
  overflowNoHeader: base({
    candidates: [
      ...[11, 12, 13, 14, 15, 16, 17].map((n) => cand(n, 1)),
      ...[21, 22, 23, 24, 25, 26].map((n) => cand(n, 2)),
    ],
    in_progress: [card(30, 1)],
    plans: { parse: 'none', list: [], unplanned: [] },
  }),
  malformedHeader: base({
    candidates: [cand(11, 1), cand(21, 2)],
    plans: {
      parse: 'malformed',
      reason: 'the plans header lists no plans',
      list: [],
      unplanned: [],
    },
  }),
  noMilestoneSeveralOpen: base({
    milestone: null,
    issue_counts: null,
    open_milestones: [
      { number: 6, title: 'R6 — PM layer' },
      { number: 7, title: 'R7 — Something else' },
    ],
  }),
  noMilestoneNoneOpen: base({
    milestone: null,
    issue_counts: null,
    open_milestones: [],
  }),
  everyPlanDone: base({
    plans: {
      parse: 'ok',
      list: [
        planned('First', 'done', planIssue(1, 'Done')),
        planned('Second', 'done', planIssue(2, 'Done'), planIssue(3, 'Done')),
      ],
      unplanned: [],
    },
  }),
  planIssueWithNoCard: base({
    candidates: [cand(41, 1)],
    plans: {
      parse: 'ok',
      list: [
        planned(
          'Running',
          'running',
          planIssue(40, 'In Progress'),
          planIssue(42, null),
        ),
        planned('Later', 'later', planIssue(43, 'Backlog')),
      ],
      unplanned: [
        { number: 44, title: 't44' },
        { number: 45, title: 't45' },
      ],
    },
    in_progress: [card(40, 3), card(45, 1), card(46, 1)],
  }),
  emptyMilestone: base({
    issue_counts: { open: 0, closed: 0 },
    plans: { parse: 'none', list: [], unplanned: [] },
  }),
};
