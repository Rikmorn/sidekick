---
id: bench-6
epic: bench
kind: item
status: open
deps: [bench-2, bench-3, bench-4]
implements: [adr-0008]
grounds: [research/verification-autonomy]
---

# bench-6 — Gate report + reassessment ritual

**Goal.** The sk-* confidence gate as a computed report the operator reads to decide — explicit, data-derived, never auto-opening.

**Spec.**
- **Gate computation** (ADR-0008 D6), kernel-side from records + registry: per chain subject — corpus exists and trending (≥3 committed run sets, distinct dates) · adherence/quality at registry thresholds (start: pass^k ≥ 0.9 / ≥ 0.8, per-subject tunable) · gating judges hold valid certificates · latest run set shows no unexplained regression. Output: per-subject green/amber/red + the reasons, human-readable and `--json`.
- **The ritual:** a short operator-facing procedure (orient-linked): read the gate report → spot-check any amber → decide open/scoped-trial/stay-parked → record the decision (the reassessment is an operator decision informed by data; ADR-0008 D6 forbids auto-opening).
- **Bias ledger surfaces in the report:** same-family judging and seeded-corpus composition are printed with the verdict, not hidden behind it — the operator decides with the caveats in view.
- **Adoption wiring:** dashboard gains the gate view; STATE's bench line gains gate status; [[sidekick-execution-prefs]]-class memory updated at decision time.

**Gates.** Gate report runs green-or-not against the live records without hand-editing; a seeded regression in a fixture corpus flips the affected subject amber/red on the next run set (negative test of the gate itself); the ritual executed once with the operator for real.
