---
id: ops-4
epic: ops
kind: item
status: done
deps: [ops-3]
implements: [adr-0007]
---

# ops-4 — Generated surfaces: STATE.md + MAP.md

**Goal.** The two committed generated files: `docs/STATE.md` (current-state rollup) and `MAP.md` (repo root — the agent's entry map), each produced by `sidekick graph state|map`, drift-checked by lint.

**Spec.**
- **STATE.md** — current only: open epics with progress counts, active items, open backlog count, latest bench summary vs baseline, freshness stamps (`built_at_commit`, doc staleness flags). Pointers and counts, no prose detail; completed items absent. **Size cap enforced by lint** (start ~120 lines; an overflow is an unclosed-entities signal and the lint message says so). Timeline = `git log -p docs/STATE.md`, never in-file history.
- **MAP.md** — the folder taxonomy one-liners (from docs/README.md's decisions), every live entity class with counts and entry links (epics, ADRs by status, research topics, suites, helpers/agents/skills), the retrieval ordering statement. Budget-conscious: this is the file every cold agent reads first.
- **Drift-check:** regenerating must be idempotent; lint fails when committed content ≠ regenerated content (same discipline as the pins). Deterministic output — no timestamps beyond `built_at_commit`, stable ordering.
- **EPIC-STATE reconciliation:** its hand-maintained status duties are declared delegated to STATE.md (one pointer line added); its narrative stays until platform migration dissolves it. No table surgery in this item.
- **Adoption wiring (Decision 8):** AGENTS.md points at MAP.md as the first read; the memory-index line about "authoritative state is EPIC-STATE" gets updated to name STATE.md alongside it.

**Gates.** Generator unit tests on fixture DBs; idempotency test; lint-drift test (mutate a source, assert lint fails until regenerated); live run committed with both files.

---

## Completion synthesis (finalized 2026-07-22)

**Outcome.** Both surfaces ship, generated and committed: **`docs/STATE.md` (37 lines, cap 120)** and **`MAP.md` (138 lines)**, each produced by `sidekick graph state|map`, idempotent, and drift-checked by lint. Live lint after generation: **0 errors, 7 advisories.**

**Decisions made during execution.**

1. **The commit stamp is excluded from the drift comparison.** A generated file records the commit it was built from; that value changes on the *next* commit, so comparing it byte-for-byte would report drift permanently, and a check that always fires is a check nobody reads. Both sides are normalized (the stamp line blanked) before comparing, so drift means a real content difference. Directly tested both ways: a moved stamp is not drift, a changed source is.
2. **The generated surfaces are not parsed back into the graph.** STATE.md counts entities; if STATE.md were itself an entity, writing it would invalidate the file just written and regeneration would never converge. Derived views describe the corpus rather than belonging to it (`GENERATED_PATHS` in `graph-model.ts`).
3. **STATE.md reports *source* lint health, not total lint health.** STATE reports lint counts and lint drift-checks STATE; reporting only the source findings breaks the loop, so regenerating cannot depend on whether the current file is stale.
4. **MAP reads the folder taxonomy out of `docs/README.md`** rather than restating it, so the map cannot quietly disagree with the decided taxonomy.

**Two parser gaps the generated surfaces exposed** — the value of rendering a view is that wrong numbers become visible:

- **Phase-level completion was under-read.** EPIC.md spells "done" three ways: a tick in the ID cell (Phases 1-3), a date in a `Done` column, and a phase heading marked `✅ DONE` (Phase 0). Reading only the tick reported **12/32 items done when the true figure is 18/32** — a whole phase missing. All three spellings are explicit structure; the parser now reads each, with a regression test.
- **Cited documents carried their path as their title.** A doc entity created as a citation target was titled with its own path, so `docs/EPIC.md` rendered as "docs/EPIC.md — docs/EPIC.md". Titles are now upgraded from the file's real heading, across every duplicate instance (the same doc is cited by several objectives).

**Adoption wiring (Decision 8).** AGENTS.md opens with "read MAP.md first" plus the question→command table; `docs/EPIC-STATE.md` gains exactly one pointer line delegating its status duties to STATE.md, with no table surgery.

**Deviation.** None beyond the two recorded above and those noted in ops-2/ops-3.

**Verification (2026-07-22, reviewing session).** STATE.md read in full and reproduced live (18/32 platform items confirmed — the three-spellings-of-done catch was real; the surface also flagged ADR-0006 as still awaiting sign-off, a pending decision nobody was tracking). The stamp-normalization and surfaces-excluded-from-parse decisions are correct reconciliations of contracts that genuinely conflicted — accepted. Drift-check and idempotency re-verified after the status flips this verification itself caused.
