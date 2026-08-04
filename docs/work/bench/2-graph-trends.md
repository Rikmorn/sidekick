---
id: bench-2
epic: bench
kind: item
status: done
deps: [bench-1]
implements: [adr-0008, adr-0007]
grounds: [research/knowledge-layer]
resolves: [backlog:dashboard-verdict-rule-duplication]
---

# bench-2 — Graph schema + trend views

**Goal.** ADR-0007's revisit-when extension, landed with a consumer: metrics, run sets, and graduation state become first-class graph entities the views can trend and queries can traverse.

**Spec.**
- **Schema extension:** metric definitions (from the bench-1 registry), run sets, and calibration/graduation state parsed as entities with edges to their subjects (`measures` gains company as needed — vocabulary additions go through ADR-0007 D1's closed-list discipline, lint-enforced).
- **Coverage becomes per-metric:** `graph coverage` answers "measured on quality but not consistency"; `gaps` distinguishes unmeasured-entirely from partially measured.
- **Dashboard Bench page trends per-metric** over run sets (the columns-in-time the page already promises). This item dissolves [`backlog/dashboard-verdict-rule-duplication.md`](../../backlog/dashboard-verdict-rule-duplication.md): the dashboard consumes kernel-computed report output instead of re-deriving verdicts in `prepare.sh`.
- **Adoption wiring:** orient's briefing gains the per-metric read where it reports bench state.

**Gates.** `graph build` green on the live tree; the verdict-rule duplication is gone (one implementation, kernel-side); dashboard smoke stays clean; STATE/MAP drift-clean.

---

## Completion synthesis (2026-08-04)

**Outcome.** The graph now carries the bench: `metric` entities (4, from the registry parse), `runset` entities (2, with `measures` edges to their subjects), and a `metric_values` store table computed once at build time by the kernel's `computeMetrics` — coverage, gaps, STATE, the export, and the dashboard all read those rows. `graph coverage` answers per-metric ("measured on quality but not grounding" is now one line); `gaps` gained the error-free `metric-unmeasured` type distinguishing partially-measured from unmeasured-entirely (currently: grounding across all nine measured subjects). STATE's Bench section renders the metric frame; the dashboard's Bench page trends per-metric with one column per run set, chronological. Live gates: 533 tests green, `graph build` green, dashboard smoke clean (0 errors, 4 pages), STATE/MAP drift-clean.

**The verdict-rule duplication is dissolved** (this item's `resolves:` edge closes the backlog note): `graph export` now carries `bench.runs` (per-record rows, `parseRunRecords` verdicts, plus the subject's own normalized verdict as `deliverable_status`) and `bench.metric_values`; `dashboards/prepare.sh` extracts instead of re-deriving. The normalization itself moved to `eval-metrics.ts` (`normalizeDeliverableVerdict`) so eval-report and the graph parser share one implementation without an import cycle.

**Decisions made during execution.**
1. **Values in a table, edges for traversal.** Per-metric facts live in `metric_values` (keyed run_id x subject x metric), not as edge multiplication — 4 metrics x 60 records as edges would have polluted the graph for no traversal gain. Runsets got the `measures` edges; coverage keeps counting cases only (its counter filters `case:` sources).
2. **Latest-run is chronological, not alphabetical.** `runIdsByDate` orders run sets by their last record's start; the old id-sort had `bench-3-w1` after `3-3-w4` by luck (`b` > `3`) and would misorder future ids. Both STATE and the export share the one function.
3. **Stale-schema stores recreate themselves.** SCHEMA_VERSION was stamped but never read — bumping it (1→2) surfaced that `CREATE IF NOT EXISTS` cannot migrate. `graph build` now recreates the db file on version mismatch; the store is a derived cache, so deletion is the migration.
4. **Registry entities ride the existing parse** — `parseMetricsRegistrySource` emits them only when validation passes, so an invalid registry contributes findings, never half-entities.

**Adoption wiring.** Orient's briefing now reads bench state per-metric (STATE's Metric frame line + `graph coverage` drill-down); the dashboard smoke's expectations unchanged (the Bench page keeps its stable phrases).
