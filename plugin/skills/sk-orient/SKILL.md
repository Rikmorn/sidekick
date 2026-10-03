---
name: sk-orient
description: Where things stand on this repo's board and what to pick up. Use at the start of a session in a tracked repo, when asked what to work on, and before choosing the next piece of work.
---

# sk-orient

`sidekick pm pickup --brief` prints six lines from the repo's board. They name the board, milestone and outcome, In Progress with its age, candidates, drift, and a suggested move. In an untracked repo it prints nothing, and there is nothing to orient: the PM layer is silent where you do not own the tracking. A session-start hook prints the same six lines when a session opens; run the command yourself for a fresh picture mid-session.

## Reading it

- **Milestone.** The active milestone is the one whose outcome the current work serves. `milestone: none` is an ordinary state between milestones, and the move is to open the next one with `sk-milestone`.
- **In progress.** Work already picked up, grouped by plan when the milestone has plans. Continue it unless you are pausing it on purpose, and say so on the issue when you pause. New work is pulled when In Progress drops, not on top of it.
- **Candidates.** With a `Plans:` clause, the line follows its plans in run order. The next plan shows its open issues, and the later ones their open counts. Plans in Verify, plans done, issues in no plan, and tier 2 follow. Without a clause, tier 1 is the active milestone's Backlog, and tier 2 is unmilestoned work that is not deferred. Tiers list in issue-number order, which says nothing about priority. Pick by what serves the outcome, and prefer the item that unblocks others.
- **Drift.** Unpushed commits are pushed or their reason stated. A card stale past seven days is continued or paused explicitly. An open PR on the current branch is finished before anything new starts.
- **Next.** A fixed rule, not a judgment: continue the plan of the lowest-numbered In Progress card, or the card alone when it is in no plan. Else pull the next plan, else one issue in no plan, or one tier-1 candidate when the milestone has no plans. With nothing to pick up, verify and close the open milestone, or open the next when none is open. The rule never picks tier 2; taking it is a judgment. Override the rule when you have a reason, and state the reason.

## Picking up

Move the card before starting: `gh project item-edit <board number> --owner @me --url <issue url> --field Status --value "In Progress"` on gh 2.98 or later. The board number is the brief's first line, or `project.number` from `sidekick pm board`. Below that version, write by id: `sidekick pm pickup` carries each candidate's `item_id`, and `sidekick pm board` carries the Status field and option ids. A plan is picked up whole: move each of its open issues' cards, then post a status update as §Status updates says. The issue body is the brief. Then state the pickup to the operator in one line: the issue, why that one, and what would change the choice.

## Status updates

The PM reports a milestone's plans to the operator as project status updates on the repo's board, per plan and never per issue. Post one at a milestone's Opening, when a plan is picked up, when a plan's last issue closes, and at the close. `sidekick pm pickup --report` prints the body. It exits 1 with its reason when there is nothing sound to post; post nothing then, and tell the operator why.

```
body="$(sidekick pm pickup --report)" && gh api graphql -f query='mutation($p:ID!,$b:String!,$s:ProjectV2StatusUpdateStatus!,$d:Date){createProjectV2StatusUpdate(input:{projectId:$p,body:$b,status:$s,startDate:$d}){statusUpdate{id}}}' -f p=<project id> -f b="$body" -f s=ON_TRACK -f d=<YYYY-MM-DD>
```

The project id is `project.id` from `sidekick pm board`, and the date is the day of `milestone.created_at` from `sidekick pm pickup`. The status is `ON_TRACK`, or `COMPLETE` at the close. A discovery the milestone cannot close without makes it `AT_RISK`, with one line naming it at the top of the body, before the report. Only the operator sets `OFF_TRACK`.
