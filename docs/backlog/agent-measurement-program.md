---
applies-to: [evals/cases, bin/helpers/eval-run.ts, bin/helpers/eval-report.ts, bin/helpers/graph-parse-machine.ts]
---

# Agent/skill measurement program — the sk-* confidence gate (next-epic candidate)

Operator direction at ops-epic closure (2026-07-23), redefining the "eval-metrics schema extension" unlock as something bigger than graph plumbing: **we have ~30 agents and skills and nothing that measures their quality, consistency, adherence, or reasoning (or lack thereof), nor a designed set of scenarios to measure them against.** The operator expects the metric and scenario list to grow beyond what's named here. This program — not the visibility layer alone — is what grants the confidence that opens sk-* self-use; the reassessment is explicitly sequenced after it ("sk-reassessment comes after we have tools to measure").

**Method constraints (operator-set, grounded in what's already built and researched):**

- **Not code-level tests of agents** — "it doesn't really work." The lane is the one already explored and built (ADR-0006): run the agent/skill on a controlled fixture, check the output. Control the inputs, measure the outputs.
- **Judge bias is real and must be acknowledged, not ignored** — the research base (verification-autonomy; eval-harness REPORT) documents it. Existing mitigations to build on, not re-derive: sealed judges (process-structural), typed mixed assertions (code/structured/judge), calibration against labelled corpora with precision-leaning thresholds.
- **Non-determinism → repeated runs** — single-shot verdicts are points, not properties. pass@k / pass^k already exist in `eval report`; consistency-across-k is itself one of the metrics the program should elevate.
- **Results persist so evolution is visible** — append-only records are already the substrate; the program adds the reading layer: regressions and progress over time, per subject, as new checks/benches accrete. New scenarios must be addable without disturbing history.

**What exists vs what's missing:** the harness (`sidekick eval run|report|calibrate`), the case convention, sealing, one graduation protocol worked end-to-end, 7 suites / 43 cases, one committed run set — but coverage names only ~7 of ~30 subjects (`graph gaps`: 23 subject-unmeasured), there is no metrics vocabulary (quality · consistency · adherence · reasoning · …), no per-subject scenario corpora, and the graph/views can't trend any of it (ADR-0007 Revisit-when carries the schema half: bench subjects, per-subject metrics, calibration/graduation state as first-class entities).

**Resolution direction:** promote to the next epic via a design dialogue — the open design questions are the metrics vocabulary (what dimensions matter per subject kind) and the scenario-corpus shape (what a fair, regression-sensitive fixture set per agent/skill looks like), then schema + views + corpora as items. The dashboard Bench page is the ready-made trend surface.
