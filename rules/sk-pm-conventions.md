# sk-* Project Management Conventions

How work is tracked across the home projects (sidekick, furnace, aesir).

## Where things live
- **GitHub is the status surface.** Work items are issues; epics are milestones; each repo has its own project board, which is that repo's single view of what is happening. Issue number is the work item's identity.
- **Files keep content.** Designs, research, ADRs (`docs/adr/`), learnings, reference docs live in the repo. Every working doc names its issue (`#NN`) near the top. Join by issue number, never by file path.
- **No mirroring.** A fact lives in exactly one place; the other side points at it.

## Placement test (tense)
True now → reference doc · happened → ADR / learning record · to do or doing → GitHub issue.

## Naming
Issue titles are **content names** — say what the work is, never a position code (`3.4 — …`, `bench-6 — …`, `wave 2 of…` as identity are all out). Ordering lives on the board and in milestones; legacy or external IDs live in the issue body as source pointers.

## Board discipline
- One project board per repo; that board is the repo's status surface. Columns: Backlog · Next · In Progress · Verify · Done. At most **one item in Next per board** — Next is the answer to "what do I pick up", not a queue.
- A parked item is an issue labelled `parked` whose body states its unblock condition.
- Closure is GH-native: done, or closed-as-not-planned with a one-line reason. When there is something worth keeping, write a learning record in the repo and link it from the close comment.

## Change control
Objective or scope changes enter as issues labelled `change-request` and are prioritised explicitly before any work absorbs them. This applies to the releases' own gates.

## Working docs
Specs/plans/scaffolding under `docs/superpowers/` are disposable (gitignored where the repo so chooses): delete on closure; the learning record is the tombstone.
