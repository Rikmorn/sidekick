---
id: bench-3
epic: bench
kind: item
status: open
deps: [bench-1]
implements: [adr-0008]
grounds: [research/eval-harness, research/verification-autonomy]
---

# bench-3 — Chain corpora wave 1: verifier-class

**Goal.** The five defect-scanning review dimensions (`sk-correctness-reviewer`, `sk-security-reviewer`, `sk-maintainability-reviewer`, `sk-test-reviewer`, `sk-architecture-reviewer`) plus `sk-goal-verifier` — six verifier-class subjects — measured as classifiers against seeded labelled corpora: the proven `calibration-coherence` pattern, generalised.

**Spec.**
- **Per subject: a seeded labelled corpus** (~10–20 cases: planted defects + known-clean fixtures; labels free by construction). Seeds agent-authored; a sample per corpus goes to the operator for the realism spot-audit (ADR-0008 D4) — the audit is the item's operator touchpoint, not fixture authoring.
- **Classifier metrics live:** precision/recall/consistency per subject computed by `eval report` from the registry definitions; `quality` for this kind = label agreement.
- **Calibration where a subject should graduate:** the certificate protocol (ADR-0006 D3) run for any dimension the operator wants binding-capable; others stay advisory with trends.
- **Fixture realism note:** seeds derive from real repo artifacts wherever possible (past review findings, the smokes' fixture stock) rather than synthetic toys — the flattery risk is named in the ADR; derivation-from-real is its cheapest mitigation.

**Gates.** Every wave-1 subject has a committed corpus + at least one committed run set with per-metric values; spot-audit sample delivered to the operator; no `manual: true` case counted as coverage.
