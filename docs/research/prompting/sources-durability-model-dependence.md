# Sources — Durability / Model-Dependence & Auto-Prompt-Optimization

*Web-search pass for sub-questions 4 (few-shot vs zero-shot for reasoning models) and 8 (durability: model-dependence; is hand prompt-engineering being absorbed by stronger models / auto-optimizers). Captured 2026-06-07. Feeds the orchestrator's REPORT.md synthesis; does not overwrite FRAMING.md.*

## Verified in this session (read the source / its extracted findings)

### 1. Revisiting Chain-of-Thought Prompting: Zero-shot Can Be Stronger than Few-shot (arXiv 2506.14641, v3)
- URL: https://arxiv.org/html/2506.14641v3
- **Strong evidence (primary, empirical).** Direct test of the doc's few-shot-with-reasoning claim against modern models.
- Findings (quotes/paraphrase from the paper body):
  - "Zero-shot prompting achieves the highest accuracy in most settings" for recent strong models (Qwen2.5 7B/72B, LLaMA3.2-3B) on GSM8K and MATH; after correcting an evaluation-extraction bias, zero-shot-fixed "surpass[es] all others."
  - **Few-shot's primary role is FORMAT ALIGNMENT, not reasoning transfer:** "the primary function of CoT exemplars is to align the output format." Ablations masking question/answer content (Replace_Q, Replace_QA, Replace_All) degraded performance only minimally.
  - **Two failure mechanisms** for few-shot on capable models: (a) *semantic misguidance* — high textual similarity makes the model copy intermediate steps verbatim; (b) *strategy transfer failure* — model can't extract a reusable strategy from examples. Adding NOISE to exemplars "does not lead to significant performance degradation" → the model "largely ignores exemplars during inference, relying more on the prompt template" (attention viz).
  - **MODEL-DEPENDENCE (the key durability finding):** weaker/older models (e.g. LLaMA3.2-1B) show "a significant improvement in accuracy when exemplars are provided." Conclusion: "the effectiveness of CoT exemplars depends on the model's inherent capabilities."
- Bears on: Rule 3 (few-shot-with-reasoning) and the whole durability lens. Confirms few-shot is **transient for frontier models / durable for weak models**, and that examples on a capable model do format work, not reasoning work.

### 2. DSPy "Is It Time To Treat Prompts As Code?" Multi-Use-Case Study (arXiv 2507.03620)
- URL: https://arxiv.org/html/2507.03620
- **Medium-strong evidence (primary, applied case study; not a controlled benchmark).** Balanced — counters the hype.
- Findings:
  - Auto-optimization (MIPROv2 / CustomMIPROv2) gives large gains on some tasks (jailbreak detection 59%→93.18%; prompt-evaluator 46.2%→64%→76.9% with constraints; hallucination-detection GPT-4o-mini 64%→82%) but **minimal gains on others** (code-gen baseline 87.5% vs optimized 90% on one template, 83% on another).
  - **Requires labeled train/val data (50–90 examples typical) and a metric.** "Much fewer than finetuning" but not zero.
  - **Best results combine demonstration + instruction optimization** ("optimizing demonstrations and instructions together tends to yield the best results"). No evidence that cheaper GPT-4o-mini matched stronger models through optimization alone *in this study*.
  - Caveats: content filters blocked some optimization; "extracting the optimized instructions out of DSPy might not always work as expected" (lock-in); gains "varied significantly by task" → task-specific factors dominate.
  - Verdict: "it's time, indeed, to treat prompts as code… DSPy is more than a prompt optimization tool — it's a programming model." Best when you stay inside the framework; suits "complex and multi-reasoning tasks."

### 3. Cameron R. Wolfe — Automatic Prompt Optimization (survey/explainer)
- URL: https://cameronrwolfe.substack.com/p/automatic-prompt-optimization
- **Medium evidence (high-quality practitioner-academic synthesis of APE/OPRO/APO/GRIPS primary results).**
- Findings:
  - APE beat human prompts on 24/24 Instruction-Induction + 17/21 BIG-Bench tasks; OPRO +8% (GSM8K) / +50% (BBH); APO up to +31%. **But** "human performance is dependent on the human writing the prompt" (baseline-quality caveat) and many optimized prompts are "ungrammatical gibberish" (interpretability cost).
  - **All methods need a validation set + metric.** "Fewer examples than finetuning," not none.
  - Cuts both ways on model strength: "Larger (and more capable) LLMs tend to be better" *as optimizers*, while task models are "naturally becoming less sensitive to subtle changes in their prompts over time, which makes prompt engineering less necessary in general."
  - **Durability verdict:** APO is "assistive… does not eliminate the need for human prompt engineers." Human expertise shifts from *prompt writing* to *system architecture* (RAG, data sources, example selection). Prompt engineering is being **absorbed into broader LLM system design**, not deleted.

### 4. GEPA: Reflective Prompt Evolution Can Outperform Reinforcement Learning (arXiv 2507.19457; ICLR 2026 Oral)
- URL: https://arxiv.org/abs/2507.19457  (overview: https://www.alphaxiv.org/overview/2507.19457v2)
- **Strong evidence (primary; ICLR 2026 Oral).** Most relevant to "the reasoning engine becomes its own optimizer" durability argument.
- Findings:
  - Reflective, **natural-language** feedback ("interpretable nature of language… a much richer learning medium than policy gradients derived from sparse scalar rewards") beats RL on LLM adaptation, using "only hundreds of rollouts" vs RL's tens of thousands.
  - GEPA-optimized prompts are "up to 9.2x shorter" than MIPROv2's while matching/improving performance. Optimizes the *system* (reasoning, tool calls, tool outputs), aligned with agentic settings.
  - DSPy GEPA docs (https://dspy.ai/api/optimizers/GEPA/overview/): "once optimized with GEPA, smaller models are faster, cheaper, and better than unoptimized frontier models"; an optimized small model "can often match a hand-prompted large model." Industry: Shopify GPT-5→small-Qwen+GEPA ≈75x cheaper / 2x more reliable; Dropbox doubled accuracy on a smaller model.
- Bears on durability: the optimizer that wins is the one that uses the **reasoning engine reflecting in natural language** — i.e. the durable layer is judgment/reflection, the transient layer is hand-tuned string wording. Confirms the gap-closing is **largest for small models**.

## Needs spot-check / weaker provenance
- WSJ-via-Wikipedia claim "prompt-engineer job became obsolete in 2025 because models better intuit intent" (Prompt engineering — Wikipedia, https://en.wikipedia.org/wiki/Prompt_engineering). Secondary/journalistic; directionally supports absorption but not a controlled finding.
- Practitioner "prompt engineering is dead → DSPy" pieces (Databricks DAIS 2024 session; Medium "Decline of Traditional Prompt Engineering"). Opinion/marketing; use only as directional signal, not evidence.
- The "weaker models benefit / frontier degrade" few-shot split is well-supported by source #1 but is on Qwen2.5/LLaMA, not Claude specifically — Claude-specific behaviour is inferred (frontier), not measured here. Flag for spot-check.

## Implication summary (durability lens)
- **DURABLE (leverage the reasoning engine):** goal+constraints over procedures; reflection/critique loops (GEPA-style); structure at boundaries; escalate-to-structural-enforcement for high-stakes determinism. These get *stronger* as models improve.
- **TRANSIENT (substitute a program / being absorbed):** hand-tuned few-shot exemplars for reasoning (now mostly format alignment on capable models → can be replaced by a one-line format spec or an output schema); manual wording micro-optimization (absorbed by APE/OPRO/GEPA where a metric + labeled set exist); brittle phrasing tricks.
- **Net:** the doc's emergent/constraint philosophy is the *durable* side of the split — but it should explicitly mark few-shot-with-reasoning as model-dependent (durable for weak models, mostly format-alignment for frontier) and acknowledge that the wording-level layer it tells authors to hand-craft is exactly what auto-optimizers now do better when a metric exists.
