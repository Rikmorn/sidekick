# Sources — Constitutional & principle-based steering angle (sub-question 6)

*Contributed by the constitutional-steering web-searcher subagent. Merge into the report's consolidated sources list. Strength labels: PRIMARY = original research/official spec; PRACTITIONER = blog/opinion.*

1. **Specific versus General Principles for Constitutional AI** — Anthropic (arXiv 2310.13798). PRIMARY (strong).
   https://arxiv.org/html/2310.13798 · PDF: https://arxiv.org/pdf/2310.13798 · Page: https://www.anthropic.com/research/specific-versus-general-principles-for-constitutional-ai
   Finding: general principle ("do what's best for humanity") nearly matches trait-specific constitutions and beats HH-RLHF PM at detecting harmfulness; specific principles win on precise traits; short constitutions "offload normative questions to an opaque model." Core evidence that principles generalise + the transparency cost.

2. **OpenAI Model Spec (2025/12/18, latest; plus 2025/04/11)** — OpenAI. PRIMARY (strong).
   https://model-spec.openai.com/2025-12-18.html · https://model-spec.openai.com/2025-04-11.html · Source repo: https://github.com/openai/model_spec/blob/main/model_spec.md · Rationale: https://openai.com/index/our-approach-to-the-model-spec/
   Finding: opens with intent (not a flat rule list); chain-of-command authority levels resolve conflicts; prohibitions reserved for top "root" authority tier, most policies placed low so they're overridable. Hybrid principle+rule design = external grounding for goal-oriented identity + constraints-reserved-for-safety.

3. **Anthropic — Claude prompt engineering best practices ("Tell Claude what to do instead of what not to do")** — Anthropic. PRIMARY (official docs).
   https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices · overview: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
   Finding: official guidance to frame instructions affirmatively, not as prohibitions (replace "Do not use markdown" with a positive spec). The disconfirming refinement to "guardrail what you don't want."

4. **The Pink Elephant Problem: Why "Don't Do That" Fails with LLMs** — eval.16x.engineer. PRACTITIONER (weak / anecdotal, self-admitted).
   https://eval.16x.engineer/blog/the-pink-elephant-negative-instructions-llms-effectiveness-analysis
   Finding: argues negative instructions are leaky (Claude Code making file-fixed.py despite "NEVER create duplicate files"); invokes Ironic Process Theory; cites Anthropic guidance. NO benchmark — explicitly anecdotal. Use only for the framing recommendation, not for magnitude.

5. **Robust Instruction Tuning (LRV-Instruction)** — arXiv 2306.14565. PRIMARY (supporting).
   https://arxiv.org/pdf/2306.14565
   Finding: baseline multimodal models (MiniGPT4, LLaVA, InstructBLIP) perform better on positive than negative instances because training data lacks negative instructions — model-dependence evidence for the negative-instruction weakness (weaker models hurt more).

6. **Evaluating LLMs at Evaluating Instruction Following** — arXiv 2310.07641. PRIMARY (supporting).
   https://arxiv.org/pdf/2310.07641
   Finding: weak LLM evaluators frequently fail to account for negation prefixes — negation handling degrades on weaker models. Supports the durability/model-dependence lens for negative instructions.

## Secondary / context (not load-bearing)
- ConstitutionalExperts: Mixture of Principle-based Prompts — arXiv 2403.04894 (principle-based prompts can be discovered/incrementally improved).
- Collective / Public Constitutional AI — anthropic.com + arXiv 2406.16696 (constitutions can be sourced from public input; governance, not steering-efficacy).
