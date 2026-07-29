---
id: bench-4
epic: bench
kind: item
status: open
deps: [bench-3]
implements: [adr-0008]
grounds: [research/eval-harness, research/verification-autonomy]
---

# bench-4 — Chain corpora wave 2: producers, executors, orchestrators

**Goal.** The rest of the chain measured in its kind-appropriate shape: drafters by artifact quality, executor/fixer by outcome, orchestrator skills by wiring.

**Spec.**
- **Producers** (`sk-rfc-drafter`, `sk-plan-drafter`, `sk-decision-drafter`; quorum checkers `sk-coherence-checker`/`sk-structural-checker`/`sk-crossref-checker` extend their existing suites where thin): structural assertions + judge rubrics; judges calibrated before their scores count toward quality (rubric-without-validation is the refuted lever — ADR-0008 context 4).
- **Executors** (`sk-executor`, `sk-fixer`, `sk-spec-reviewer`): outcome-graded — gates pass on the fixture workspace, `scope-check` as a mechanical adherence assertion, spec-intent via the existing spec-reviewer lane.
- **Orchestrator skills** (`sk-build`, `sk-review`, `sk-design`): wiring/seal adherence extending the `orchestrator-wiring` suite; dialogic segments stay `manual: true` — honest non-coverage, never fake coverage.
- **Wave-2 learns from wave-1:** corpus shape, seed realism findings, and any registry adjustments feed forward; adjust the registry via its own versioning, not ad-hoc.

**Gates.** Every chain subject (18) has a corpus + at least one committed run set with per-metric values; the coverage matrix shows the chain fully measured; `graph gaps` chain-subject entries cleared or explicitly excepted.
