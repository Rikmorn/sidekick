---
applies-to: [dashboards/prepare.sh, bin/helpers/graph-parse-machine.ts, bin/helpers/graph-build.ts]
---

# Dashboard runs.json verdict rule duplicates the kernel's

**Status:** Resolved (2026-08-04, bench-2) — `graph export` now carries per-record rows and per-metric values inside `bench` (kernel-computed by `parseRunRecords`/`computeMetrics`); `dashboards/prepare.sh` extracts instead of re-deriving, so the second verdict implementation is gone.

`dashboards/prepare.sh` transforms `evals/results/*/records.jsonl` into the dashboard's `runs.json` with its own pass/fail verdict rule, kept deliberately identical to the kernel's `parseRunRecords`. Two implementations of one rule is a sync hazard: if the kernel's verdict logic changes (new assertion types, new deliverable shapes), the dashboard silently reports stale semantics.

**Resolution direction:** lift the transform into the kernel — e.g. `graph export --runs` (or fold per-record detail into `graph export`) so prepare.sh consumes it instead of re-deriving. Small; do it the next time either file is touched (this note's `applies-to` will surface it).

Flagged by the ops-6 run report (2026-07-22); accepted as a v1 ship-with-note at verification.
