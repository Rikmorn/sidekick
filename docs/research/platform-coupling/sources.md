# Platform Coupling — Sources

Deep-research run 2026-06-10: 5 angles, 22 sources fetched, 101 claims extracted, top 25 verified (3-vote quorum) → 23 confirmed / 2 killed → 8 synthesized findings. Quality labels are the run's assessment. `code.claude.com/docs/en/workflows` was additionally re-read first-hand by the orchestrator (2026-06-10).

## Angle: historical-precedent — platform absorption churn

| Source | Quality | Claims used |
|---|---|---|
| https://developers.openai.com/api/docs/deprecations | primary | 5 |
| https://help.zapier.com/hc/en-us/articles/24785309335565-Sunsetting-the-Zapier-ChatGPT-plugin-what-you-need-to-know | primary | 4 |
| https://ragwalla.com/docs/guides/openai-assistants-api-deprecation-2026-migration-guide-wire-compatible-alternatives | blog (vendor-bias flagged: sells Assistants-compatible product; facts matched OpenAI primary) | 5 |
| https://gizmodo.com/openai-pissed-off-developers-by-phasing-out-plugins-for-1851124124 | secondary | 4 |
| https://towardsdatascience.com/why-ai-engineers-are-moving-beyond-langchain-to-native-agent-architectures/ | blog (1 claim refuted) | 5 |
| https://www.speakeasy.com/blog/ai-agent-framework-comparison | blog | 4 |

Also load-bearing for F1: https://developers.openai.com/api/docs/assistants/migration (primary; surfaced during verification).

## Angle: ecosystem-adoption — CC Workflows in the wild

**Zero surviving claims for actual ecosystem adoption** — the angle's surviving material is all from the official docs.

| Source | Quality | Claims used |
|---|---|---|
| https://code.claude.com/docs/en/workflows | primary (re-verified first-hand) | 5 |
| https://www.pulumi.com/blog/claude-code-orchestration-frameworks/ | blog | 5 extracted, none survived to findings |
| https://alexop.dev/posts/claude-code-workflows-deterministic-orchestration/ | blog | 5 extracted, none survived to findings |
| https://news.ycombinator.com/item?id=48311705 | forum | 5 extracted, none survived to findings |

## Angle: abstraction-churn skeptic — framework wrapper regret

| Source | Quality | Claims used |
|---|---|---|
| https://www.anthropic.com/research/building-effective-agents | primary | 5 |
| https://blog.langchain.com/how-to-think-about-agent-frameworks/ | blog | 5 |
| https://testdouble.com/insights/abstracting-vendors-in-code | blog | 5 |
| https://www.proxai.co/blog/archive/llm-abstraction-layer | blog | 5 |
| https://hatchworks.com/blog/gen-ai/llm-projects-production-abstraction/ | blog | 5 |
| https://octoclaw.ai/blog/why-we-no-longer-use-langchain-for-building-our-ai-agents | unreliable | 0 |

## Angle: practitioner-guidance — vendor coupling & graceful degradation

| Source | Quality | Claims used |
|---|---|---|
| https://code.visualstudio.com/api/working-with-extensions/publishing-extension | primary | 4 |
| https://code.visualstudio.com/api/references/extension-manifest | primary (surfaced during verification) | — |
| https://www.w3.org/wiki/Graceful_degradation_versus_progressive_enhancement | secondary | 5 |
| https://martinfowler.com/articles/oss-lockin.html | blog | 5 |

## Angle: architecture-evidence — deterministic kernel + LLM runtime hybrid

| Source | Quality | Claims used |
|---|---|---|
| https://github.com/humanlayer/12-factor-agents | blog | 5 |
| https://temporal.io/blog/of-course-you-can-build-dynamic-ai-agents-with-temporal | blog | 5 |
| https://genta.dev/resources/ai-agent-orchestration-patterns-llm-vs-code-driven | blog | 5 |

## Refuted claims (2)

1. "GPTs replacement was a strict capability downgrade vs plugins" — 1-2 (gizmodo).
2. "Production teams broadly migrating off LangChain to custom orchestration" — 1-2 (towardsdatascience).
