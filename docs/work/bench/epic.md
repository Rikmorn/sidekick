---
id: bench
kind: epic
status: open
implements: [adr-0008]
grounds: [research/eval-harness, research/verification-autonomy]
advances: [ns-calibrated-gates, ns-independent-verification, ns-derived-autonomy]
resolves: [backlog:agent-measurement-program]
---

# bench — the agent measurement program (ADR-0008)

**Why this epic exists.** ~30 agents and skills, 23 of them unmeasured; no metrics vocabulary, no scenario corpora, no trends. The operator named measurement — not visibility — as the confidence gate for sk-* self-use: "sk-reassessment comes after we have tools to measure." This epic builds the tools: a typed metric registry the kernel validates, chain-subject corpora that trend over committed run sets, bias acknowledgment as schema, and an explicit computed gate the operator reads to decide.

**Scope guard.** Gate-driven, depth-first (ADR-0008 D1): the sk-* execution chain only — 15 agents + 3 orchestrator skills. The rest of the fleet extends later via registry entries + corpora through the authoring skill; no new machinery. Judges stay same-family in v1 (the bias ledger names it); cross-family is the `3.7` seam, not this epic.

**Items** (specs in this folder; `deps` in frontmatter; each item includes its adoption wiring per ADR-0007 Decision 8):

| ID | Item | One-line |
|---|---|---|
| bench-1 | Metric registry + report semantics | typed metric definitions (kind · assertions · computation · required bias field) validated by the kernel, computed by `eval report` |
| bench-2 | Graph schema + trend views | metrics/run-sets as graph entities (ADR-0007 revisit-when lands); per-metric coverage; dashboard Bench trends |
| bench-3 | Chain corpora wave 1 — verifier-class | seeded labelled corpora for the 6 review dimensions + goal-verifier; classifier metrics live |
| bench-4 | Chain corpora wave 2 — producers, executors, orchestrators | drafters (judge rubrics, calibrated), executor/fixer (outcome + scope), sk-build/review/design (wiring) |
| bench-5 | Authoring skill + harvest capture v1 | the extension discipline as a guided skill; failure-capture local log + case import |
| bench-6 | Gate report + reassessment ritual | `sidekick` computes gate status from records + registry; operator reads, decides — never auto-opens |

**Ordering.** bench-1 is the spine's head; bench-2 and bench-5 hang off it; bench-3 → bench-4 is the corpus sequence (wave 2 learns from wave 1's shape); bench-6 needs the registry, the trends, and both waves. Sized one-session-per-item; the repo is coherent at every item boundary.

**Done means:** every chain subject measured on the four metrics with ≥3 committed run sets; gating judges certificated; the gate report computes green-or-not from data; the authoring skill has added at least one metric or corpus end-to-end (proof the extension path works); then the sk-* self-use reassessment — the operator decision this epic exists to inform — has what it needs.
