---
name: sk-track
description: File a problem as an issue on this repo's board, or close one with its evidence and, when it earns one, a learning record. Use when a problem outside the current task appears, when a piece of work is complete, or when asked to file or close an issue.
---

# sk-track

Two moments, both on GitHub, both only where `sidekick pm board` reports `tracked: true`. In an untracked repo say so and file nothing: the PM layer is silent where you do not own the tracking. The conventions are in `sk-pm-conventions.md`; this skill is the procedure that follows them.

## Filing

A problem noticed mid-session is filed now, not carried to the end of the session. Filing in one step keeps the task's scope honest and the board complete. Work the current change left stale or inconsistent is not filed: it is part of that change, per `sk-pm-conventions.md` §Change control.

1. Check for a duplicate across all states: `gh issue list --state all --limit 200 --search "<two or three words>"`. A closed issue that already covers it is reopened or referenced, not duplicated.
2. Choose exactly one `area:*` label from `gh label list`, the axis the repo declares.
3. Write the body as a self-contained brief a cold reader can act on. It states the problem as observed, naming files and interfaces; what would resolve it; what is out of scope; and how it is verified.
4. Decide where it enters, and refuse to file without one of the two. The first is the active milestone, which `sidekick pm pickup` names. During `sk-milestone` Opening, its seeds and breakdown enter it directly. Afterwards only a small addition closely tied to work already in it enters, per `sk-pm-conventions.md` §Change control. The second is the `backlog` label with a line beginning `Revisit when:` that names the condition or unknown that would re-raise it. A bigger discovery takes it too, and is told to the operator rather than pursued. A future milestone is never the answer: that is a promise about a release nobody has planned. An objective change, a reshaped outcome sentence, takes `change-request` instead and waits for triage.
5. `gh issue create` with the label, the body, and `--milestone` when it has one; then `gh project item-add <board number> --owner @me --url <issue url>`. The board's "Item added to project" workflow sets Status to Backlog. For an addition to the active milestone, also comment on the issue why. Add it to the milestone's `Plans:` clause when it has one, with the whole-description `PATCH` in `sk-milestone` Opening step 4. Tell the operator the number in one line, and for an addition, that it joined the milestone.

A pull request references its issue with `Closes #N` in its body. `gh pr create --project` adds a duplicate card for the PR, so it is not used.

## Closing

1. Re-check the state before writing: `gh issue view <n> --json state,title`. A closed issue is left alone.
2. Decide the record first, because the close comment links it. The bar is a counterfactual: if this record did not exist, would the next engineer repeat the mistake or redo the investigation? When yes, write `docs/learnings/YYYY-MM-DD-<slug>.md` in the shape the repo's learnings README states, with the issue number near the top; sidekick's README is `docs/learnings/README.md`. Most closes clear no bar and get no record.
3. Comment with the evidence: the commits or the fast-forward range, the measurement, the PR, and the record's path when there is one. A close without evidence is a claim.
4. Close with the reason: `gh issue close <n> --reason completed`, or `--reason "not planned"` with a one-line verdict. The verdict is one of: not reproduced, invalid, won't fix, superseded by #N. A duplicate closes with `gh issue close <n> --duplicate-of <original>`, which sets the reason itself.
5. Set Status to Done explicitly: `gh project item-edit <board number> --owner @me --url <issue url> --field Status --value Done` on gh 2.98 or later. The number comes from `sidekick pm board`. Below that version, write by id with the `item_id` that `sidekick pm gate` and `pickup` carry. The board's own move on close is eventually consistent, and a card left in Verify misleads the next pickup.
