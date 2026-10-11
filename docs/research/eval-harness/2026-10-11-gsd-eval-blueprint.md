# gsd's eval blueprint

For #136. Written 2026-10-11, extracted from a section of the prior-art note written 2026-06-07.

**Staleness flag.** This describes gsd's agents as read in 2026-06. [ADR-0006](../../adr/0006-eval-harness-contracts.md) Context 4 re-checked the agents on 2026-07-06 and found two things. gsd's blueprint has no runner, because neither the planner nor the auditor executes cases. The auditor reads the producer's SUMMARY.md files as evidence, so it is unsealed. Nothing has re-checked the agents since, and gsd has changed: it has since moved to `open-gsd/gsd-core` (see `../docs-structure/2026-10-10-docs-lifecycle-prior-art.md`). Treat each claim as a lead to confirm against the current agents, not as a fact about today's gsd.

This report extracts gsd's eval blueprint from lines 36 to 48 of [`prior-art.md` at `dce44d7`](https://github.com/Rikmorn/sidekick/blob/dce44d75b669cdd824e30c928df1bbcac983a700/docs/research/prior-art.md), and supersedes that file for it. The section runs to line 58, and the report leaves out three groups, among other detail. Lines 49 to 58 hold the last three mappings to our Track A, the list of gaps in gsd's eval, and the closing recommendation. Inside lines 36 to 48, the report also skips the system_type-to-dimension mapping, the COVERED/PARTIAL/MISSING scoring, and the orchestration chain. It skips the AI-SPEC contract and the planner's tooling defaults. It also skips the online and offline guardrail split and the auditor's weighted score. The mapping bullets on frame-before-verify, producer and verifier separation, and adversarial stance are also skipped. #100's triage found the rest of `prior-art.md` already covered or stale. Finding 1 overlaps `REPORT.md` in this folder. That report already says to calibrate the judge against human labels.

## Findings

1. **A human tier calibrates the LLM judge.** `gsd-eval-planner` writes each rubric with a measurement of Code, LLM-judge, or Human. It marks the LLM-judge as needing calibration. It reserves the human tier for edge cases, for that judge calibration, and for sampling high-stakes outputs.
2. **A reference dataset grows from the start of implementation.** The planner specifies a reference dataset covering critical paths, edge cases, failure cases, and adversarial cases. It sets a minimum of 10 examples, 20 for production, and says to start during implementation, not after.
3. **An auditor distinct from the planner checks that the eval infrastructure is wired in, but it is not sealed.** `gsd-eval-auditor` asks whether the implemented system delivered its planned eval strategy. It scores five infrastructure components. The tooling is actually called, the dataset exists, CI/CD runs the evals, guardrails sit in the request path, and tracing wraps the real calls. Its stance is to assume the strategy is not implemented until the codebase proves otherwise. ADR-0006 Context 4 adds that it reads the producer's SUMMARY.md files as evidence, so it does not judge independently.
4. **A test generator never weakens an assertion.** `gsd-nyquist-auditor` generates a behavioural test that can fail for each requirement validation gap and runs it. It debugs up to three iterations. When the implementation is at fault, it escalates and leaves the implementation read-only, and it does not loosen the assertion.

## What this means for #136

Findings 1 and 2 bear on how a skill-eval suite is built and calibrated. Findings 3 and 4 bear on who may judge it. gsd's auditor is a different agent from the planner. It reads the producer's output, so ADR-0006 counts it unsealed. It does not model the independence #136 needs. A generated test never gets easier to pass. The 2026-06 note also records that gsd's LLM judge is same-family, Claude judging Claude, so cross-family verification stays open.

## Sources

- `docs/research/prior-art.md` lines 36 to 48 at `dce44d7`, linked at the top of this report. It records that its author read `gsd-eval-planner`, `gsd-eval-auditor`, `gsd-nyquist-auditor`, and `gsd-ai-integration-phase` in 2026-06.
- [ADR-0006](../../adr/0006-eval-harness-contracts.md) Context 4, which re-checked the planner and auditor on 2026-07-06 and found no runner and an unsealed auditor.
