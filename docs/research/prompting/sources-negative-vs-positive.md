# Sources — Negative vs Positive Instructions (contrarian/disconfirming angle, sub-question 2)

Compiled 2026-06-07. Angle: does "guardrail what you don't want" (prohibition framing) hold up,
or are negative instructions followed less reliably than positive affordances/boundaries?

## Primary / strong evidence

- **When Prohibitions Become Permissions: Auditing Negation Sensitivity in Language Models** (arXiv 2601.21433, 2026).
  https://arxiv.org/html/2601.21433 — VERIFIED via fetch.
  16 models, 14 ethical scenarios, 4 framings. Open-source models endorse prohibited actions 77% of the time
  under simple negation vs 24% under affirmative framing (+317% relative); 100% under compound negation.
  US commercial: 25%→34% simple, 57% compound (+128%). Chinese commercial only category moving correct direction
  (37%→21% simple) but 44% compound. Financial domain ~2x more fragile than medical (sensitivity 0.65 vs 0.36).
  Temp 0.0 INCREASED sensitivity +16% vs temp 0.7 → failures are structural, not sampling noise.
  NOTE: paper does NOT recommend abandoning prohibitions; recommends certification tiers + human oversight for
  high-negation-sensitivity systems. This is a nuance against the strong "prohibitions are weak, use positives" reading.

- **Can Large Language Models Truly Understand Prompts? A Case Study with Negated Prompts** (Jang et al., PMLR v203, 2023; arXiv 2209.12711).
  https://proceedings.mlr.press/v203/jang23a.html — VERIFIED via fetch.
  INVERSE SCALING on negated prompts across 9 tasks. OPT/GPT-3 (125M–175B), InstructGPT. Larger = WORSE on negation.
  Few-shot did NOT fix it; fine-tuning on negated prompts did NOT fix it. Large human-vs-model gap.
  DURABILITY CAVEAT: 2022-era models; frontier models have improved — needs spot-check against current Claude/GPT.

- **Language models are not naysayers: An analysis of LLMs on negation benchmarks** (arXiv 2306.08189, 2023).
  https://arxiv.org/pdf/2306.08189 — search-summary only, not fetched.
  Even modern LLMs: insensitivity to presence of negation, fail to capture lexical semantics of negation,
  fail to reason under negation.

- **Yes is Harder than No: A Behavioral Study of Framing Effects in LLMs** (CIKM 2025, ACM).
  https://dl.acm.org/doi/10.1145/3746252.3761350 — search-summary only.
  Response asymmetry: models affirm only when highly confident, lean negative under uncertainty. Framing-effect evidence.

## Mechanism / practitioner (weaker evidence, useful for framing)

- **The Pink Elephant Problem: Why "Don't Do That" Fails with LLMs** (16x Engineer blog).
  https://eval.16x.engineer/blog/the-pink-elephant-negative-instructions-llms-effectiveness-analysis — VERIFIED via fetch.
  Cites Anthropic docs: "Tell Claude what to do instead of what not to do." Example: "only use real data" >
  "don't use mock data." IMPORTANT honesty: relies on anecdotal Reddit reports, NO controlled experiments.
  Explicit caveat: prohibitions ARE effective for harmful-behavior boundaries, especially in SYSTEM prompts;
  use sparingly/strategically, not as primary method. (Directly relevant to system-vs-user-prompt placement.)

- **Suppressing Pink Elephants with Direct Principle Feedback** (arXiv 2402.07896, 2024).
  https://arxiv.org/abs/2402.07896 — search-summary only.
  Structural fix (RLAIF variant) for the prohibition-following problem — i.e., when prompt-level negation fails,
  escalate to training/structural enforcement. Maps to Rule "escalate to structural enforcement."

## Negation: A Pink Elephant in the LLMs' Room? (arXiv 2503.22395, 2025)
  https://arxiv.org/html/2503.22395v2 — search-summary only.
