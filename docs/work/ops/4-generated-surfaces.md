---
id: ops-4
epic: ops
kind: item
status: open
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
