---
id: bench-5
epic: bench
kind: item
status: done
deps: [bench-1]
implements: [adr-0008]
grounds: [research/eval-harness]
resolves: [backlog:failure-capture-pipeline]
---

# bench-5 — Authoring skill + harvest capture v1

**Goal.** Extension that can't skip the discipline: a guided skill for designing metrics/scenarios/corpora, and the failure-harvest capture surface — so the program grows through dialogue and real-world data, not archaeology.

**Spec.**
- **Authoring skill** (`.claude/skills/` — name settled at build, `/sk-write-bench`-class): walks a new metric, scenario, or corpus through the ADR-0008 discipline — subject kind → measurement shape (D3) → assertion types → labels/calibration needed? → inherited biases (the registry's required field) → registry entry + case skeletons. Authored under `sk-agent-prompts.md` discipline (goal-oriented identity; the deterministic parts live in the kernel, the skill reasons).
- **Harvest capture v1** ([`backlog/failure-capture-pipeline.md`](../../backlog/failure-capture-pipeline.md)): sk-* orchestrators log a real-world failure locally (structured: subject, fixture-able input, expected-vs-actual) at the moment of failure; an import step turns a log entry into a case skeleton for operator adjudication. Capture cost at failure time stays near zero or it won't happen. No servers; the hosted variant stays parked.
- **Adoption wiring:** the harvest ritual is referenced from the orchestrators' prompts (blast-radius reconciled per the rewrite rule); orient mentions unimported harvest entries if any exist.

**Gates.** The skill run end-to-end adds one real metric or corpus (the epic's done-means proof); a synthetic failure logged → imported → adjudicated as a case; `bun test` green.

---

## Completion synthesis (2026-08-04)

**Outcome.** Three surfaces shipped and both proof gates ran live:
- **`/sk-write-bench`** (`skills/sk-write-bench/SKILL.md`, installed): walks one addition — metric, corpus, or case — through the ADR-0008 discipline; the contract section states what the kernel validates (closed computation list, required bias, case convention, judges-gate-nothing-uncalibrated) and the workflow ends in `--validate-only` + `graph lint` + a first run set, never prose.
- **Harvest capture v1** (`bin/helpers/harvest.ts`, TDD'd; `sidekick harvest log|list|import`): near-zero-cost structured logging to a gitignored `.sidekick/harvest.jsonl` inbox; import produces a `manual: true` skeleton that cannot count as coverage until adjudicated. Ritual referenced from the three orchestrators' failure paths; orient surfaces unimported entries.
- **Proof gate A (harvest):** synthetic failure (correctness reviewer passing an exclusive-end-date boundary bug) logged → listed → imported into `review-correctness` → adjudicated (fixture from the logged input, label set, `manual` dropped) → passed live in `bench-5-w1`.
- **Proof gate B (skill run):** following the skill's own workflow, the `crossref-checker` corpus was authored — 9 cases (dangling goal/decision, stale `pins-rfc`, dep cycle, dangling task dep; 3 clean incl. unused-RFC-entries and two decision-doc cases), true pins baked per fixture via the `hash-rfc` CLI. Run set `bench-5-w1`: 10/10, sk-crossref-checker enters the bench at quality 1.0 (n=9) / consistency 1.0 / adherence 1.0.

**The proof run caught a real harness gap.** The first `clean-plan` execution failed because the headless eval session's permission sandbox denied executing the installed sidekick CLI — the subject correctly failed *closed* (`unverifiable_check`), which would have recorded a false quality miss. bench-3 never hit this (reviewers only run git inside the workspace); every CLI-integrated subject (crossref now, bench-4's executors next) needs the lane allowance. Fix: the runner's argv builders pass `--allowedTools Bash` (workspaces are throwaway fixture copies; write discipline stays with each agent's tool grant). The false-miss record was replaced before the run set's first commit — append-only discipline starts at commit, not in local scratch.

**Decisions.** Harvest inbox is gitignored scratch (the durable artifact is the adjudicated case); import refuses double-imports and collisions; skeleton subjects for skills use `/name` as the invocation starting point; the backlog note is resolved for v1 with the hosted variant explicitly a new-note-if-ever. Corpus discipline learned on wave 1 is now written into the skill (derive from real artifacts, vary from worked examples, single-defect invariant, both-sides imperfections).
