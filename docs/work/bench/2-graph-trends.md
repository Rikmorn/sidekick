---
id: bench-2
epic: bench
kind: item
status: open
deps: [bench-1]
implements: [adr-0008, adr-0007]
grounds: [research/knowledge-layer]
---

# bench-2 — Graph schema + trend views

**Goal.** ADR-0007's revisit-when extension, landed with a consumer: metrics, run sets, and graduation state become first-class graph entities the views can trend and queries can traverse.

**Spec.**
- **Schema extension:** metric definitions (from the bench-1 registry), run sets, and calibration/graduation state parsed as entities with edges to their subjects (`measures` gains company as needed — vocabulary additions go through ADR-0007 D1's closed-list discipline, lint-enforced).
- **Coverage becomes per-metric:** `graph coverage` answers "measured on quality but not consistency"; `gaps` distinguishes unmeasured-entirely from partially measured.
- **Dashboard Bench page trends per-metric** over run sets (the columns-in-time the page already promises). This item dissolves [`backlog/dashboard-verdict-rule-duplication.md`](../../backlog/dashboard-verdict-rule-duplication.md): the dashboard consumes kernel-computed report output instead of re-deriving verdicts in `prepare.sh`.
- **Adoption wiring:** orient's briefing gains the per-metric read where it reports bench state.

**Gates.** `graph build` green on the live tree; the verdict-rule duplication is gone (one implementation, kernel-side); dashboard smoke stays clean; STATE/MAP drift-clean.
