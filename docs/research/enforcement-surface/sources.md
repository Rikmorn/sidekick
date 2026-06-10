# Enforcement Surface — Sources

Deep-research run 2026-06-10: 5 angles, 24 sources fetched, 119 claims extracted, top 25 verified (3-vote quorum) → 22 confirmed / 3 killed → 9 synthesized findings. Quality labels are the run's assessment. `code.claude.com/docs/en/hooks-guide` was additionally re-read first-hand by the orchestrator (2026-06-10) — all four load-bearing quotes verified verbatim.

## Angle: deterministic guardrail layering in practice

| Source | Quality | Claims used |
|---|---|---|
| https://code.claude.com/docs/en/hooks-guide | primary (re-verified first-hand) | 5 |
| https://paddo.dev/blog/claude-code-hooks-guardrails/ | blog | 5 |
| https://microservices.io/post/architecture/2026/03/09/genai-development-platform-part-1-development-guardrails.html | blog | 5 |
| https://www.resilientcyber.io/p/a-look-at-an-emerging-runtime-enforcement | blog | 5 |
| https://gokhan-gokalp.com/runtime-governance-for-ai-agents-policy-as-code-with-opa/ | blog | 5 |
| https://claudefa.st/blog/tools/hooks/hooks-guide | blog | 5 |

NeMo Guardrails / Guardrails AI: **no surviving claims** (coverage gap noted in REPORT).

## Angle: generated per-project gates and their drift

| Source | Quality | Claims used |
|---|---|---|
| https://arxiv.org/html/2603.23443v1 (test staleness under semantic drift; non-peer-reviewed preprint) | primary | 5 |
| https://arxiv.org/pdf/2602.00409 (agent over-mocking; MSR 2026) | primary | 5 |
| https://lambdasec.github.io/AutoGrep-Automated-Generation-and-Filtering-of-Semgrep-Rules-from-Vulnerability-Patches/ | blog | 5 extracted, none survived |
| https://semgrep.dev/blog/2026/introducing-semgrep-custom-workflows/ | blog | 5 extracted, none survived |
| https://www.paulmduvall.com/claude-code-hooks-code-quality-guardrails/ | blog | 5 extracted, none survived |
| https://jvaneyck.wordpress.com/2026/02/22/guardrails-for-agentic-coding-how-to-move-up-the-ladder-without-lowering-your-bar/ | blog | 5 extracted, none survived |

Surviving generated-gates evidence is **tests-only** — generated semgrep/lint/hook/policy gates remain unevidenced.

## Angle: gate integrity under reward hacking

| Source | Quality | Claims used |
|---|---|---|
| https://metr.org/blog/2025-06-05-recent-reward-hacking/ | primary | 5 |
| https://metr.org/blog/2025-10-14-malt-dataset-of-natural-and-prompted-behaviors/ | primary | 5 |
| https://www.anthropic.com/engineering/claude-code-sandboxing | primary (vendor self-report; 1 claim refuted 0-3) | 5 |

## Angle: producer-verifier separation / LLM-judge reliability

| Source | Quality | Claims used |
|---|---|---|
| https://arxiv.org/abs/2402.08115 (Stechly et al. — self-critique collapse; 1 companion claim refuted 0-3) | primary | 5 |
| https://arxiv.org/abs/2412.02674 (Song et al. — generation-verification gap) | primary | 4 |
| https://arxiv.org/pdf/2603.11337 | primary | 5 extracted, none survived to findings |
| https://arxiv.org/pdf/2602.07900 | primary | 5 extracted, none survived to findings |

## Angle: human escalation ergonomics

**Effectively unanswered** — only the 84% prompt-reduction figure survived (folded into F6).

| Source | Quality | Claims used |
|---|---|---|
| https://www.anthropic.com/engineering/claude-code-auto-mode | primary | 5 extracted |
| https://docs.langchain.com/oss/python/deepagents/human-in-the-loop | primary | 5 extracted, none survived |
| https://www.langchain.com/blog/making-it-easier-to-build-human-in-the-loop-agents-with-interrupt | blog | 5 extracted, none survived |
| https://aipatternbook.com/approval-fatigue | blog | 5 extracted, none survived |
| https://link.springer.com/article/10.1007/s00146-025-02422-7 | primary | 5 extracted, none survived |

## Refuted claims (3)

1. "Semantic-preserving refactors degrade generated tests (79% pass / 69% branch)" — 1-2 (arXiv:2603.23443).
2. "Sandbox OS-level enforcement covers all subprocesses" — 0-3 (Anthropic sandboxing post).
3. "Binary re-prompt-on-reject retains most critique-loop value" — 0-3 (arXiv:2402.08115).
