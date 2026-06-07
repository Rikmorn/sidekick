# Sources — Self-Verification & LLM-as-Judge SOTA (Track A, sub-questions 1 & 2)

Search angle: academic/technical primary papers on LLM self-critique/reflection reliability
and LLM-as-judge biases/calibration. Collected 2026-06-06 via WebSearch.

## Sub-question 1 — Self-verification / self-refine / reflection: what works, what doesn't

- **LLMs Cannot Self-Correct Reasoning Yet** (Huang et al., ICLR 2024) — arXiv:2310.01798.
  Foundational disconfirming result: with NO external signal, self-correction does not improve
  and often DEGRADES reasoning. Bottleneck is error DETECTION, not correction. This is the single
  most important durability caveat for any do→verify→learn loop relying on self-critique alone.
  (Surfaced via secondary write-up: https://beancount.io/bean-labs/research-logs/2026/04/28/llms-cannot-self-correct-reasoning-yet)

- **Chain-of-Verification Reduces Hallucination in LLMs** (Dhuliawala et al., Findings of ACL 2024)
  — arXiv:2309.11495 / https://aclanthology.org/2024.findings-acl.212/
  CoVe: draft → plan verification questions → answer them INDEPENDENTLY (un-biased by the draft)
  → revise. "Factored + revise" variant best. Key design lesson: independence of the verification
  step from the draft is what buys the gain — directly relevant to manufacturing verifiers.

- **Can LLMs Correct Themselves? A Benchmark of Self-Correction in LLMs** — arXiv:2510.16062.
  Recent systematic benchmark of self-correction across methods/conditions.

- **Illusions of reflection: open-ended task reveals systematic failures in LLMs' reflective
  reasoning** — arXiv:2510.18254. Reflection fails systematically on open-ended (non-verifiable)
  tasks — directly on point for non-code domains lacking ground truth.

- **ReVISE: Learning to Refine at Test-Time via Intrinsic Self-Verification** — arXiv:2502.14565.
  Trains intrinsic self-verification rather than relying on prompting; a MODEL/PROVIDER-level lever.

- **Curated list:** https://github.com/ryokamoi/llm-self-correction-papers (running bibliography;
  includes "LLMs cannot find reasoning errors, but can correct them given the error location", ACL 2024).

## Sub-question 2 — LLM-as-judge: reliability, biases, calibration

- **Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena** (Zheng et al., NeurIPS 2023
  Datasets & Benchmarks) — arXiv:2306.05685. The canonical reference. Strong judges reach >80%
  agreement with humans (≈ human-human agreement) BUT names position, verbosity, and
  self-enhancement biases + limited reasoning. The trust-but-bound baseline.

- **Self-Preference Bias in LLM-as-a-Judge** (NeurIPS 2024) — arXiv:2410.21819.
  Proves linear correlation between a model's self-RECOGNITION ability and self-preference bias.
  Implication: a judge from the SAME family as the generator is structurally compromised →
  argues for cross-family / cross-model quorum (no human analog).

- **Quantifying and Mitigating Self-Preference Bias of LLM Judges** — arXiv:2604.22891.
  Disentangles capability from bias (win-rate alone conflates "I'm better" with "I'm narcissistic").

- **Beyond Accuracy: The Role of Calibration in Self-Improving LLMs** — arXiv:2504.02902.
  Calibration matters for self-improvement loops — directly relevant to convergence vs divergence
  of the positive recursive loop (a poorly-calibrated judge poisons memory).

- **The Judge Who Never Admits: Hidden Shortcuts in LLM-based Evaluation** — arXiv:2602.07996.
  Judges exploit shortcuts and rarely flag their own uncertainty — failure mode for gating autonomy.

- **Judge's Verdict: Analysis of LLM Judge Capability Through Human Agreement** — arXiv:2510.09738.

## Buckets (for this angle's findings)

- IN-REPO actionable: CoVe-style independent verification questions as a skill/agent;
  cross-family quorum for verifiers (already echoed in repo's sk-* "no self-validation" rule);
  refuse self-critique-only gating for non-verifiable outputs (require external/independent signal).
- HARNESS/CONFIG actionable: use a DIFFERENT model/family for the judge step than the producer;
  surface calibration/uncertainty in judge output before it gates an action.
- MODEL/PROVIDER-level (track only): intrinsic self-verification training (ReVISE);
  reducing the error-DETECTION bottleneck; judge self-preference is partly a pretraining/RLHF artifact.

## Durability lens

- Self-critique-WITHOUT-external-signal: substitutes hoped-for reasoning that doesn't exist today;
  partially MODEL-level (may improve), but the independence principle (CoVe) is durable.
- LLM-as-judge biases (position/verbosity/self-preference): partly model-level artifacts (may shrink),
  but cross-family quorum + calibration gating are DURABLE harness designs regardless of model gen.
