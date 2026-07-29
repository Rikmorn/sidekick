---
id: bench-5
epic: bench
kind: item
status: open
deps: [bench-1]
implements: [adr-0008]
grounds: [research/eval-harness]
---

# bench-5 — Authoring skill + harvest capture v1

**Goal.** Extension that can't skip the discipline: a guided skill for designing metrics/scenarios/corpora, and the failure-harvest capture surface — so the program grows through dialogue and real-world data, not archaeology.

**Spec.**
- **Authoring skill** (`.claude/skills/` — name settled at build, `/sk-write-bench`-class): walks a new metric, scenario, or corpus through the ADR-0008 discipline — subject kind → measurement shape (D3) → assertion types → labels/calibration needed? → inherited biases (the registry's required field) → registry entry + case skeletons. Authored under `sk-agent-prompts.md` discipline (goal-oriented identity; the deterministic parts live in the kernel, the skill reasons).
- **Harvest capture v1** ([`backlog/failure-capture-pipeline.md`](../../backlog/failure-capture-pipeline.md)): sk-* orchestrators log a real-world failure locally (structured: subject, fixture-able input, expected-vs-actual) at the moment of failure; an import step turns a log entry into a case skeleton for operator adjudication. Capture cost at failure time stays near zero or it won't happen. No servers; the hosted variant stays parked.
- **Adoption wiring:** the harvest ritual is referenced from the orchestrators' prompts (blast-radius reconciled per the rewrite rule); orient mentions unimported harvest entries if any exist.

**Gates.** The skill run end-to-end adds one real metric or corpus (the epic's done-means proof); a synthetic failure logged → imported → adjudicated as a case; `bun test` green.
