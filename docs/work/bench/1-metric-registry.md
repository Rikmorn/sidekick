---
id: bench-1
epic: bench
kind: item
status: open
deps: []
implements: [adr-0008]
grounds: [research/eval-harness]
---

# bench-1 — Metric registry + report semantics

**Goal.** The metrics vocabulary as data the kernel validates and computes — not prose. After this item, "what do we measure and how is it computed" is a schema question with one answer.

**Spec.**
- **Registry:** typed metric definitions (location settled at build — `evals/metrics/` or a registry file beside the case convention): name · subject-kinds it applies to · assertion types that feed it · deterministic computation semantics · **required bias/caveat field** · per-subject-tunable thresholds (gate inputs, ADR-0008 D6). Unknown kinds/fields are lint findings (closed-vocabulary discipline, per ADR-0007 D1's precedent).
- **The four v1 metrics** (ADR-0008 D2): quality (per-kind, D3 shapes) · consistency (pass^k, verdict unanimity) · adherence (deliverable shape, read-only/scope compliance — mechanical) · grounding (evidence-exists + conclusion-follows, judge-checked, calibrated).
- **`eval report` computes them:** per-subject per-metric values derived from `records.jsonl` + registry, unit-tested kernel code (TDD). The existing pass@k/pass^k reporting folds into the metric frame rather than living beside it.
- **Adoption wiring:** report output is the substrate bench-2 parses; `--json` contract documented for the graph parser.

**Gates.** `bun test` green; a registry entry with an unknown subject-kind or missing bias field fails lint; `eval report` over the existing `3-3-w4` records produces per-metric values for the already-measured subjects without touching the records.
