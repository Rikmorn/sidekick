# ADR-0008 — Agent measurement program: metric registry, corpus strategy, and the sk-* gate

**Status:** Accepted (2026-08-04, operator sign-off on the written form; the design was approved conversationally in the measurement-program dialogue of 2026-07-23 and this document recorded it as Proposed on 2026-07-29). Extends ADR-0006 (the harness this program runs on) and ADR-0007 (the graph its registry and trends live in) — it reopens neither. Implemented by the `bench` epic ([`../work/bench/epic.md`](../work/bench/epic.md)). Resolves [`../backlog/agent-measurement-program.md`](../backlog/agent-measurement-program.md) by promotion; spawns [`../backlog/failure-capture-pipeline.md`](../backlog/failure-capture-pipeline.md) (v1 rides item 5).

## Context

1. **The fleet is unmeasured.** ~30 agents and skills; `graph gaps` names 23 with no eval case. Nothing measures their quality, consistency, adherence, or grounding, and no designed scenario set exists to measure them against. The operator named this — not the visibility layer — as the confidence gate for sk-* self-use: "sk-reassessment comes after we have tools to measure."

2. **The harness exists; breadth and vocabulary don't.** ADR-0006 built the lane this program runs on: fixture + typed assertions (`code`/`structured`/`judge`), repeated runs (pass@k/pass^k), sealed judges, calibration by hash-pinned certificate — proven end-to-end on `sk-coherence-checker` (precision 1.0 / recall 0.967 / unanimity 0.95 over 60 runs). What's missing is a metrics vocabulary, per-subject scenario corpora, and trend surfaces.

3. **Operator method constraints (2026-07-23):** not code-level tests of agents ("doesn't really work") — run on controlled fixtures, check outputs; judge biases acknowledged per the research, never ignored; results persist append-only so regressions and progress stay visible as benches accrete; repeated runs because outputs are non-deterministic; the vocabulary must be formalised so it cannot rot — "not just an md file we hope to read later."

4. **Research grounding** ([`eval-harness`](../research/eval-harness/REPORT.md), [`verification-autonomy`](../research/verification-autonomy/REPORT.md)): same-family judging is structurally compromised (self-preference; ~60% correlated errors across same-provider models when both err); rubric scores as a gate are unsubstantiated *without* our own validation — calibration against human labels is the validation; grade the product, not the path (agents find valid unanticipated routes); 20–50 cases from real failures is a strong corpus start; agreement is never proof.

5. **Operator availability is bursty** — label-hungry designs stall. Labelling budget must be spot-audit-sized, not authoring-sized.

## Decision

**1. Scope is gate-driven, depth-first.** Measure the sk-* execution chain first — the subjects that touch files or gate merges when self-use opens: `sk-executor`, `sk-fixer`, `sk-spec-reviewer`; the review dimensions (`sk-correctness-reviewer`, `sk-security-reviewer`, `sk-maintainability-reviewer`, `sk-test-reviewer`, `sk-architecture-reviewer`, `sk-goal-verifier`); the drafters (`sk-rfc-drafter`, `sk-plan-drafter`, `sk-decision-drafter`) and quorum checkers (`sk-coherence-checker`, `sk-structural-checker`, `sk-crossref-checker`); the orchestrator skills `sk-build`, `sk-review`, `sk-design`. The remaining subjects follow as registry entries + corpora — the machinery is built once.

**2. The metrics vocabulary is a typed registry, not prose.** Each metric is a machine-readable definition: name; subject-kinds it applies to; assertion types that feed it; deterministic computation semantics (computed by `sidekick eval report`, unit-tested kernel code); and a **required bias/caveat field** — acknowledgment is schema, not footnote. The registry is kernel-validated (unknown fields/kinds are lint findings) and parsed into the graph (metrics become entities; per-metric coverage and trends become queries). Initial vocabulary — four metrics: **quality** (per-kind correctness, see D3), **consistency** (stability across k: pass^k, verdict unanimity), **adherence** (contract/scope compliance: deliverable shape, read-only respect, `scope-check` — mechanical), **grounding** (does the output cite evidence that exists, does the conclusion follow from it — judge-checked, calibrated). "Grounding" deliberately replaces "reasoning": the research warns against grading the path, so reasoning is measured through its checkable consequences.

**3. Measurement shape follows subject kind.** Verifier-class agents measure like classifiers — precision/recall/consistency against labelled corpora (the proven calibration pattern, generalised). Producer-class agents measure by artifact — structural assertions + calibrated judge rubrics. Executor-class agents measure by outcome — gates pass, scope adherence, mechanically graded. Orchestrator skills measure by wiring — dispatch/seal adherence (the `orchestrator-wiring` suite is the seed). The four metrics apply everywhere; *quality*'s computation differs by kind and the registry records which shape applies.

**4. Corpus strategy: seeded bootstrap + failure harvest.** Seeded corpora (defects planted by construction → labels free) get every chain subject measured and trending immediately; seeds are agent-authored, operator **spot-audited for realism**. A standing harvest ritual captures real failures as cases at the moment of failure — when the label is cheapest ([`failure-capture-pipeline`](../backlog/failure-capture-pipeline.md) v1 is the capture surface). Operator labelling budget: spot-audits and ambiguous adjudications only. Corpus composition shifts seeded→harvested over time; sizes per research — ~20-case calibration corpora where judges gate, ~10–20 scenario cases per subject to start.

**5. The bias ledger is structural.** Stated here once and enforced by the registry's required caveat field: all v1 judges are same-family (Claude judging Claude — self-preference; correlated-error ceiling), so judge verdicts are trusted only where calibrated against operator labels and never treated as ground truth; agreement alone never gates; every judge carries an explicit insufficient-evidence exit; cross-family judging is the `3.7` seam and the certificate schema anticipates a family axis. Seeded-corpus flattery (measuring "catches what we plant") is a named risk, mitigated by spot-audits and the harvest shift.

**6. The gate is an explicit computed report, and it informs — it never auto-opens.** The sk-* self-use reassessment opens when, for every chain subject: a corpus exists and is trending (≥3 committed run sets on distinct dates); adherence and quality hold at threshold (starting point: pass^k ≥ 0.9 adherence, ≥ 0.8 quality — tunable per subject in the registry); every gating judge holds a valid calibration certificate; and the latest run set shows no unexplained regression. `sidekick` computes gate status from records + registry; the operator reads it and decides. Thresholds live in the registry as data.

**7. Extension is a skill, not archaeology.** An authoring skill walks the design of any new metric, scenario, or corpus: which subject kind, which measurement shape, whether labels and calibration are needed, which biases the addition inherits. Adding the rest of the fleet — or a new metric the operator names later — is a guided dialogue plus registry entries, never re-derivation from this document.

## Options considered

- **Fleet-complete breadth-first** (one thin case per subject first) — rejected: a smoke is not a measure; it kills the gap list without grounding the sk-* decision, so the gate opens later. Depth on the chain is what the reassessment actually rides on.
- **Prose vocabulary** (an md spec of the metrics) — rejected by the operator explicitly: docs rot; the registry is data the kernel validates, the graph parses, and a skill extends.
- **Real-failure-only corpora** — rejected: highest validity but gated on bursty operator labelling; the program would stall. Retained as the harvest half of D4.
- **Trajectory-grading "reasoning"** — rejected per research (path-grading is brittle; agents find valid unanticipated routes); grounding is the checkable proxy. Sparse trajectory assertions stay available per case where tool-use sanity genuinely matters.
- **Auto-opening gate** (thresholds met → sk-* enabled) — rejected: the gate is evidence for an operator decision, not a substitute for one. Autonomy stays derived and operator-bounded.

## Consequences

**Positive.** The sk-* confidence gate becomes explicit, measurable, and trendable; regressions in any measured subject surface on the next run set instead of in production use; bias acknowledgment can't be skipped (schema-required); the ADR-0007 revisit-when extension lands with a consumer (trends/coverage per metric); extension to the full fleet is data + dialogue, not new machinery.

**Costs and risks.** Corpus authoring is real ongoing cost (accepted per-dimension, per ADR-0006). Seeded corpora can flatter — the spot-audit + harvest shift is mitigation, not elimination. Same-family judging caps what calibration can promise until `3.7`. The registry adds schema surface the kernel must validate and migrate. Run-set accumulation costs subscription time (~chain × cases × k per sweep); bounded by rate limits, not dollars.

## Assumptions (revise the decision if these are wrong)

- The chain subjects are the right confidence proxy for sk-* self-use — trusting them transfers to trusting the flows they compose.
- Agent-authored seeded defects can be made realistic enough that trends over them are informative (spot-audits check exactly this).
- Subscription limits tolerate corpus-scale sweeps at the sizes in D4.
- Four metrics are a sufficient starting vocabulary; the registry makes additions cheap enough that missing ones are discovered, not fatal.

## Revisit when

- `3.7` (cross-family quorum) lands — the certificate's family axis activates; same-family caveats in the registry weaken accordingly.
- Harvested cases outnumber seeded in a subject's corpus — reweight what the gate trusts for that subject.
- A metric proves uninformative or gameable — registry versioning retires it without losing history (records are append-only).
- Wave 2 completes and fleet extension begins — revisit whether breadth needs its own thresholds.
- Phase 4's memory write-gate consumes the harness — its validation lessons may belong in the registry as metrics.

## Links

- Implements: [`../work/bench/epic.md`](../work/bench/epic.md) · Resolves by promotion: [`../backlog/agent-measurement-program.md`](../backlog/agent-measurement-program.md) · Spawns: [`../backlog/failure-capture-pipeline.md`](../backlog/failure-capture-pipeline.md)
- Builds on: [ADR-0006](./0006-eval-harness-contracts.md) (harness contracts) · [ADR-0007](./0007-knowledge-layer.md) (graph; its Revisit-when extension lands here) · [ADR-0005](./0005-operator-authored-verifiers.md) (advisory→binding graduation this program's calibration serves)
- Research: [`eval-harness`](../research/eval-harness/REPORT.md) · [`verification-autonomy`](../research/verification-autonomy/REPORT.md)
- Roadmap seams: EPIC `3.7` (cross-family), `3.8` (observability), `3.4` (sizing — consumes the same records)
