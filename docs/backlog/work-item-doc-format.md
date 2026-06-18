# Work-item documentation format

**Status:** Backlog (surfaced 2026-06-18 during the EPIC renumber).

## The gap

Work-item identity, status, ordering, and cross-references have been tracked **ad-hoc across multiple documents with no single format**: `EPIC.md` (the roadmap), the ADRs (decision records that forward-reference work items), `backlog/*.md` (parked items), `EPIC-STATE.md` (live snapshot), and the project memory. There is no canonical schema for "what is a work item, what fields does it carry, where does its status live, how is it referenced."

The symptoms this produced:
- **Numbering that didn't encode order.** The original `E#` IDs were priority-assigned then renumbered (with a stale "renumbering map"), so the number told you nothing about sequence. Replaced 2026-06-18 by the `{phase}.{item}` scheme + a crosswalk — but that's a patch, not a format.
- **Reference rot.** Research reports and FRAMINGs point at work-item numbers; those artifacts rotate/get replaced, so the references dangle. (Operator: research files shouldn't reference work items at all.)
- **Status scattered.** Whether an item is done/in-progress/backlogged is recorded in prose close-outs, EPIC table cells, memory, and commit tags — no single source of truth.
- **Drift between the roadmap and the live state** (EPIC.md vs EPIC-STATE.md vs memory) because each is maintained by hand.

## What's wanted (not yet specified)

A real format/system for work items. Open questions for the brainstorm:
- **Identity & lifecycle:** stable ID scheme (the `{phase}.{item}` + append-never-renumber rule is a start), status states, and where status canonically lives.
- **Single source of truth vs. views:** is there one machine-readable work-item store (e.g. frontmatter'd files, one-per-item) that the roadmap / state-snapshot / crosswalk are *generated* from — so they can't drift?
- **Reference discipline:** who is allowed to reference a work item (roadmap + ADRs yes; rotating research artifacts no), and how references stay valid across renames.
- **Boundary with the sidekick product:** the toolchain already writes structured plan/decision artifacts under `.sidekick/`. Does the EPIC's own work-tracking reuse that machinery, or is meta-work tracked differently from product-work? (Note the dogfooding boundary — ADR-0002's E20 recursion.)

## Why it matters

The operator lost the thread of a multi-week EPIC partly because there was no durable, legible work-item format — the re-baseline (`EPIC-STATE.md`) and renumber were the reactive fix. A real format prevents the next "I have no idea where things stand." Low urgency, but a genuine infrastructure gap; revisit when the Phase 1 audit work settles.
