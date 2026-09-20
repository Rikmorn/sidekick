---
name: sk-orient
description: Where things stand on this repo's board and what to pick up. Use at the start of a session in a tracked repo, when asked what to work on or where things stand, and after finishing a piece of work before choosing the next.
---

# sk-orient

`sidekick pm pickup --brief` prints six lines from the repo's board: the board, the active milestone with its outcome, what is In Progress with its age in days, the candidates in two tiers, drift, and a suggested move. In an untracked repo it prints nothing, and there is nothing to orient: the PM layer is silent where you do not own the tracking. A session-start hook prints the same six lines when a session opens; run the command yourself for a fresh picture mid-session.

## Reading it

- **Milestone.** The active milestone is the one whose outcome the current work serves. `milestone: none` is an ordinary state between milestones, and the move is to open the next one with `sk-milestone`.
- **In progress.** Work already picked up. Continue it unless you are pausing it on purpose, and say so on the issue when you pause. New work is pulled when In Progress drops, not on top of it.
- **Candidates.** Tier 1 is the active milestone's Backlog; tier 2 is unmilestoned work that is not deferred. The order is issue number, which says nothing about priority. Pick by what serves the outcome, and prefer the item that unblocks others.
- **Drift.** Unpushed commits are pushed or their reason stated. A card stale past seven days is continued or paused explicitly. An open PR on the current branch is finished before anything new starts.
- **Next.** A fixed rule, not a judgment: continue the lowest-numbered card, else pull from tier 1, else tier 2. With nothing to pick up, verify and close the open milestone, or open the next when none is open. Override it when you have a reason, and state the reason.

## Picking up

Move the card before starting: `gh project item-edit --owner @me --url <issue url> --field Status --value "In Progress"` on gh 2.98 or later. Below that, `sidekick pm pickup` carries each candidate's `item_id` and `sidekick pm board` carries the Status field and option ids for a write by id. The issue body is the brief. Then state the pickup to the operator in one line: the issue, why that one, and what would change the choice.
