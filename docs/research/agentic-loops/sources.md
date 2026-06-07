## Sources

Grouped by research angle. Verification status noted per source: **[verified]** = primary source opened/read in session; **[abstract]** = abstract or authoritative secondary confirmed; **[unverified]** = cited but not primary-opened; **[disputed]** = a specific figure failed verification.

### Angle 1 — Self-Refine / intrinsic self-correction

- **Huang et al., "Large Language Models Cannot Self-Correct Reasoning Yet"** — ICLR 2024, arXiv:2310.01798. https://arxiv.org/abs/2310.01798 — **[verified]** Seminal disconfirmer; intrinsic self-correction degrades reasoning, gains need oracle. Exact GSM8K table recovered in durability pass.
- **Madaan et al., "Self-Refine: Iterative Refinement with Self-Feedback"** — NeurIPS 2023, arXiv:2303.17651. https://arxiv.org/abs/2303.17651 — **[abstract]** ~0 on math, large gains on subjective generation (Sentiment +32.4, Dialogue +49.2).
- **Kamoi/Pan et al., self-correction meta-survey** — TACL 2024, arXiv:2406.01297. https://arxiv.org/html/2406.01297v2 — **[verified]** Strongest clean result: prompted self-correction succeeds only for decomposable / tool-backed / fine-tuned cases.
- **Gou et al., "CRITIC"** — ICLR 2024, arXiv:2305.11738. https://arxiv.org/abs/2305.11738 — **[abstract]** HotpotQA F1 62.0 *with* tool vs 55.2 without; external tool drives the gain. (Label in original findings was inverted.)
- **Shinn et al., "Reflexion"** — NeurIPS 2023, arXiv:2303.11366. https://arxiv.org/abs/2303.11366 — **[abstract]** Code gains driven by unit-test execution (external signal).
- **Yang et al., "A Probabilistic Inference Scaling Theory for LLM Self-Correction"** — 2025, arXiv:2508.16456. https://arxiv.org/abs/2508.16456 — **[abstract]** Closed-form improvement condition; formula confirmed, parameter semantics partial.
- **Kumar et al., "SCoRe"** — ICLR 2025, arXiv:2409.12917. https://arxiv.org/abs/2409.12917 — **[abstract]** RL instills intrinsic self-correction (+15.6/+9.1); SFT collapses. Model-provider lever.
- **"Should we be going MAD?" (multi-agent debate vs self-consistency)** — arXiv:2311.17371 — **[abstract]** Supports the *direction* that debate doesn't reliably beat self-consistency. **[disputed]** The specific "83.0/88.2" figures are untraceable and dropped.

### Angle 2 — Gates and verifiers

- **Weaver, "Closing the Generation-Verification Gap with Weak Verifiers"** — Hazy Research/Stanford, arXiv:2506.18203. https://hazyresearch.stanford.edu/blog/2025-06-18-weaver — **[verified]** Gaps up to 64.5pt; first-sample boost 11.2-27.8pp; Claude **3.7** Sonnet 70.4% (original said 3.5).
- **Stechly/Valmeekam/Kambhampati, "On the Self-Verification Limitations of LLMs on Reasoning and Planning"** — arXiv:2402.08115. https://arxiv.org/abs/2402.08115 — **[verified]** Self-critique "performance collapse"; sound external verifier gives large gains.
- **METR, "Recent Frontier Models Are Reward Hacking"** — 2025-06-05. https://metr.org/blog/2025-06-05-recent-reward-hacking/ — **[verified]** 30.4% RE-Bench hacking; 100% on one task; 0.7% HCAST; o3 admits 10/10. **[disputed]** "43x visibility effect" is a derived cross-suite ratio, not measured.
- **johnswentworth, "Verification Is Not Easier Than Generation In General"** — LessWrong. https://www.lesswrong.com/posts/2PDC69DDJuAx6GANa/ — **[verified]** Strongest disconfirmer: verification-easy is an NP fact, breaks under for-all/adversarial.
- **Lightman et al., "Let's Verify Step by Step"** — OpenAI, arXiv:2305.20050. https://arxiv.org/abs/2305.20050 — **[verified]** Process supervision solves 78% of MATH; PRM800K = 800K step labels.
- **Zhang et al., "The Lessons of Developing Process Reward Models in Mathematical Reasoning"** — arXiv:2501.07301. https://arxiv.org/abs/2501.07301 — **[verified]** PRMs: MC-label noise, best-of-N inflation, drift to outcome-scoring.
- **Zheng et al., "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena"** — arXiv:2306.05685. https://arxiv.org/abs/2306.05685 — **[abstract]** GPT-4 ~80% human agreement + position/verbosity/self-preference biases.
- **Sandler et al. (RAND), "Judge Reliability Harness"** — 2026 — **[unverified, secondary]** "No judge uniformly reliable"; >50% error on bias stress-tests. Corroborated by citation only.
- **"Does Thinking More Always Help? / Mirage of Test-Time Scaling"** — arXiv:2506.04210. https://arxiv.org/html/2506.04210v1 — **[verified]** 87.3%→70.3% (1.1k→16k tokens); entropy ~12x. **[disputed]** "monotonically worse" sub-claim contradicts the paper's own non-monotonic framing; numbers scoped to one GSM-8K/1.5B setup.

### Angle 3 — Convergence vs thrashing

- **Song et al., "Mind the Gap: Examining the Self-Improvement Capabilities of LLMs"** — ICLR 2025, arXiv:2412.02674. https://arxiv.org/abs/2412.02674 — **[verified abstract]** Gen-verification gap "scales monotonically with pre-training flops." Durability anchor. "2-3 round saturation" sub-claim unverified.
- **Gema et al., "Inverse Scaling in Test-Time Compute"** — TMLR Dec 2025, arXiv:2507.14417. https://arxiv.org/abs/2507.14417 — **[verified abstract]** Reasoning length deteriorates performance; five failure modes incl. amplified self-preservation; DeepSeek-R1 ~70%→~30%.
- **CMU 2026, "Benchmark Test-Time Scaling of General LLM Agents"** — arXiv:2602.18998 — **[verified, upgraded from blog]** Self-selection plateaus ~55% vs ~100% oracle; gap *widens* with N. (Original cited an effloow.com blog summary.)
- **effloow.com, "Agent Test-Time Compute Scaling Has a Ceiling"** — https://effloow.com/articles/agent-test-time-compute-scaling-context-ceiling-2026 — **[secondary]** Source of the "3-7 turn peak / turns-11+ degrade" figures; treat exact turn counts as indicative.

### Angle 4 — Pattern taxonomy

- **Yao et al., "ReAct: Synergizing Reasoning and Acting"** — ICLR 2023, arXiv:2210.03629. https://arxiv.org/abs/2210.03629 — **[unverified-in-session]** Task-conditional: wins on tool tasks, loses to CoT on knowledge QA. Specific deltas not re-verified.
- **Wang et al., "Self-Consistency Improves Chain of Thought Reasoning"** — ICLR 2023, arXiv:2203.11171. https://arxiv.org/abs/2203.11171 — **[abstract]** +17.9% GSM8K; the robust budget-matched baseline.
- **"Reasoning in Token Economies: Budget-Aware Evaluation"** — EMNLP 2024, arXiv:2406.06461. https://aclanthology.org/2024.emnlp-main.1112.pdf — **[verified abstract]** Self-consistency beats debate/Reflexion at equal budget; both can worsen with more budget.
- **"When Independent Sampling Outperforms Agentic Reasoning"** — arXiv:2605.08478. https://arxiv.org/html/2605.08478 — **[verified]** k-shot strictly beats single SWE-agent at every cost point on 216 Codeforces problems; `minimize ln(1-p)/c`.
- **Ridnik et al., "Code Generation with AlphaCodium"** — 2024, arXiv:2401.08500. https://arxiv.org/abs/2401.08500 — **[verified verbatim]** GPT-4 pass@5 19%→44%; ~100 calls vs ~1M. No ablation study.
- **Yao et al., "Tree of Thoughts"** — NeurIPS 2023, arXiv:2305.10601. https://arxiv.org/abs/2305.10601 — **[abstract]** Game-of-24 4%→74%, compute-heavy, weak self-critic.
- **Note on misattribution:** the "Self-Refine +0.2% vs +4.8% = 24x swing on GPT-4" is a **[disputed cross-model splice]** — +4.8% is GPT-3.5's oracle gain; GPT-4's is +0.7%.

### Angle 5 — Plan-as-program / generated workflows

- **Zhang et al., "AFlow: Automating Agentic Workflow Generation"** — ICLR 2025, arXiv:2410.10762. https://arxiv.org/abs/2410.10762 — **[verified]** MCTS *per dataset* (20/80 split); per-distribution artifact, not portable.
- **"DyFlow: Dynamic Workflow Framework for Agentic Reasoning"** — NeurIPS 2025, arXiv:2509.26062. https://arxiv.org/abs/2509.26062 — **[verified verbatim]** Dynamic beats static AFlow most on OOD (SocialMaze 17.18 vs 11.45); dynamism costs 1.4-3x tokens.
- **"Learning to Compose for Cross-domain Agentic Workflow Generation" (CapFlow)** — arXiv:2602.11114. https://arxiv.org/html/2602.11114v1 — **[verified verbatim]** 1-pass dynamic (74.19%) matches 20-iteration compiled (72.93%); heuristics "backfire in another domain."
- **"Multi-agent Architecture Search via Agentic Supernet" (MaAS)** — arXiv:2502.04180. https://arxiv.org/abs/2502.04180 — **[partial]** Fixed workflows mis-allocate; query-conditioned sizing wins. Exact phrasing body-level; 83.59% unverified.
- **Anthropic, "Building Effective Agents"** — 2024. https://www.anthropic.com/research/building-effective-agents — **[verified quotes]** Workflow-vs-agent decision rule; "add complexity only when it demonstrably improves outcomes."
- **Qodo/CodiumAI, "System 2 Thinking: AlphaCodium + o1"** — https://qodo.ai/blog/system-2-thinking-alphacodium-outperforms-direct-prompting-of-openai-o1/ — **[vendor, no numbers]** Weakest-sourced claim; treat object-level flow durability as unproven.

### Angle 6 — Context management

- **Chroma, "Context Rot: How Increasing Input Tokens Impacts LLM Performance"** — 2025. https://www.trychroma.com/research/context-rot — **[verified]** 18-model monotonic decline at constant difficulty. **[disputed]** "50K-token / 50-65% effective" figures are NOT Chroma's.
- **Liu et al., "Lost in the Middle"** — TACL 2024, arXiv:2307.03172. https://arxiv.org/abs/2307.03172 — **[abstract]** Positional degradation in long contexts.
- **Sinha et al., "The Illusion of Diminishing Returns: Measuring Long Horizon Execution"** — 2025, arXiv:2509.09677. https://arxiv.org/html/2509.09677v3 — **[verified verbatim]** Long-horizon failure is execution + self-conditioning; scale doesn't fix it; thinking mitigates.
- **Cognizant AI Lab, "MAKER: Million-Step, Zero-Error LLM Reasoning"** — 2025. https://www.cognizant.com/us/en/ai-lab/blog/maker — **[verified verbatim]** 1,048,575 zero-error steps via decompose+vote+red-flag. Vendor blog, synthetic puzzle.
- **Cemri et al., "Why Do Multi-Agent LLM Systems Fail?" (MAST)** — NeurIPS 2025, arXiv:2503.13657. https://arxiv.org/abs/2503.13657 — **[verified, partial]** 1,600+ traces, 14 modes, κ=0.88. Per-category % are Figure-2 values over 151 traces; "41-87%" band leans on un-opened secondary.
- **Walden Yan / Cognition, "Don't Build Multi-Agents"** — 2025. https://cognition.ai/blog/dont-build-multi-agents — **[verified]** Context-sharing fragility; single-thread for coherence-bound work.
- **Anthropic, "How we built our multi-agent research system" + "Effective context engineering for AI agents"** — 2025. https://www.anthropic.com/engineering/multi-agent-research-system — **[verified verbatim]** +90.2% on breadth-first; token usage explains 80% of variance; ~15x cost; not for coding.
- **"AMA-Bench: Evaluating Long-Horizon Memory for Agentic Applications"** — 2026, arXiv:2602.22769. https://arxiv.org/html/2602.22769v1 — **[corroborated via mirrors]** Engineered memory underperforms naive long-context (MemoryBank −41.3%, HippoRAG2 −43.2%).
- **Manus, "Context Engineering for AI Agents: Lessons from Building Manus"** — 2025. https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus — **[secondary]** Recitation/todo.md; file-system-as-context; "keep errors in context" (contradicts Sinha, reconciled by scope).
- **badlogic, "Context Compaction Research"** — https://gist.github.com/badlogic/cd2ef65b0697c4dbe2d13fbecb0a0a5f — **[secondary]** Per-tool compaction thresholds; cumulative degradation.
- **METR, "Measuring AI Ability to Complete Long Tasks"** — 2025. https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/ — **[abstract]** 50%-reliability horizon doubles ~7mo; production needs higher.

### Angle 7 — When NOT to loop

- **"Single-Agent LLMs Outperform Multi-Agent Systems Under Equal Thinking Token Budgets"** — Tran & Kiela, arXiv:2604.02460. https://arxiv.org/html/2604.02460 — **[verified real]** SAS beats sequential MAS ~3-4pts; DPI argument; MAS competitive only when context corrupted. Decimals are aggregate averages.
- **Snell et al., "Scaling LLM Test-Time Compute Optimally..."** — arXiv:2408.03314. https://arxiv.org/abs/2408.03314 — **[verified abstract]** >4x over best-of-N; beats 14x-larger model only with a foothold; "critically varies" by difficulty.
- **"Reasoning on a Budget: A Survey of Adaptive/Controllable Test-Time Compute"** — arXiv:2507.02076. https://arxiv.org/html/2507.02076v1 — **[abstract]** Overthinking on easy queries; up to 92.4% token reduction.
- **"Stop Overthinking: A Survey on Efficient Reasoning for LLMs"** — TMLR 2025, arXiv:2503.16419. https://arxiv.org/abs/2503.16419 — **[abstract]** Reasoning up to 5x longer than needed.
- **Anthropic, "Inverse Scaling in Test-Time Compute" (Alignment blog)** — July 2025. https://alignment.anthropic.com/2025/inverse-scaling/ — **[verified]** Shutdown-willingness 60%→47%; four task families.
- **Note:** Weaver's gain restated to the verified "11.2-27.8 pts" range; the original "+17.9%/+14.5%" decomposition is **[disputed]**.

### Angle 8 — Human-in-the-loop

- **Xiong et al., "Can LLMs Express Their Uncertainty?"** — ICLR 2024, arXiv:2306.13063. https://arxiv.org/abs/2306.13063 — **[verified]** Verbalized confidence concentrated 80-100%, failure-prediction AUROC 62.7%. **[disputed]** "87%" stat is absent from the paper.
- **"Agentic Uncertainty Reveals Agentic Overconfidence"** — arXiv:2602.06948. https://arxiv.org/pdf/2602.06948 — **[verified real]** Agents predict 73% success vs 35% true (SWE-bench Pro). WebArena numbers via snippet only.
- **Ren, Dixit et al., "Robots That Ask For Help: Uncertainty Alignment for LLM Planners" (KnowNo)** — CoRL 2023, arXiv:2307.01928. https://arxiv.org/abs/2307.01928 — **[verified abstract]** Conformal-prediction gate with user-specified success guarantee, no finetuning.
- **Liang et al., "Introspective Planning"** — NeurIPS 2024, arXiv:2402.06529. https://arxiv.org/pdf/2402.06529 — **[verified]** KnowNo over-asks/over-steps/asks the wrong question; gate quality ≠ gate timing.
- **Jabbour et al. (JAMA 2023), AI diagnostic bias study** — PMC10731487 — **[verified via coverage]** Clinician accuracy 73%→61.7% under biased AI; explanations don't rescue (64.0%). Don't conflate with the separate 84.9%→73.3% medRxiv study.
- **Sophos, "Inside the lethal trifecta: Blast radius reduction in AI agent deployments"** — https://www.sophos.com/en-us/blog/inside-the-lethal-trifecta-blast-radius-reduction-in-ai-agent-deployments — **[secondary]** Gate only irreversible/high-blast-radius; approval fatigue.
- **LangChain/LangGraph human-in-the-loop docs** — https://docs.langchain.com/oss/python/langchain/human-in-the-loop — **[secondary]** "Interrupt on irreversible, high-blast-radius actions only."
- **"Ask or Assume? Uncertainty-Aware Clarification-Seeking in Coding Agents"** — arXiv:2603.26233. https://arxiv.org/html/2603.26233v1 — **[verified real]** Separating detection from execution: 69.40% vs 61.20% on underspecified SWE-bench Verified.
- **Xu et al., "Hallucination is Inevitable"** — arXiv:2401.11817. https://arxiv.org/abs/2401.11817 — **[abstract]** Learning-theory argument for innate hallucination.
- **"LLMs Do NOT Really Know What They Don't Know"** — arXiv:2510.09033 — **[unverified]** Hallucinations share hidden-state geometry of correct answers.
- **ReDAct / SelectLLM / "Cost-Saving LLM Cascades with Early Abstention"** — arXiv:2604.07036, OpenReview JJPAy8mvrQ, arXiv:2502.09054 — **[unverified]** Deferral magnitudes (~7.5%→error<1%; ~15% matches always-big-model). Treat as unconfirmed.

### Angle 9 — Durability / bitter-lesson

- **"You Don't Need Prompt Engineering Anymore: The Prompting Inversion"** — arXiv:2510.22251. https://arxiv.org/html/2510.22251v1 — **[verified verbatim]** Sculpting beats CoT on GPT-4o (97/93) but reverses on GPT-5 (94/96.36). Single-author preprint, one benchmark.
- **Sprague et al., "To CoT or not to CoT?"** — ICLR 2025, arXiv:2409.12183. https://arxiv.org/html/2409.12183 — **[verified verbatim]** CoT +12-14pp math/symbolic, +0.7pp elsewhere; ~95% of MMLU gain from equals-sign questions.
- **Agrawal et al., "GEPA: Reflective Prompt Evolution Can Outperform Reinforcement Learning"** — ICLR 2026 oral, arXiv:2507.19457. https://arxiv.org/html/2507.19457v1 — **[verified]** +14.29% (GPT-4.1 Mini), +12.44% (Qwen3 8B); beats MIPROv2/GRPO with up to 35x fewer rollouts. **[disputed]** "78x on HoVer" unverifiable.
- **AlphaProof / Aristotle + Lean 4 (DeepMind)** — 2025. https://venturebeat.com/ai/lean4-how-the-theorem-prover-works-and-why-its-the-new-competitive-edge-in — **[secondary]** IMO 2025 gold-equivalent, all proofs Lean-verified.
- **"Building AI Coding Agents for the Terminal" / OpenDev** — arXiv:2603.05344. https://arxiv.org/html/2603.05344v1 — **[verified]** Names verification, tool infra, dual-memory as durable; documents stripping structure as models improve.
- **Sutton, "The Bitter Lesson"** — 2019. http://www.incompleteideas.net/IncIdeas/BitterLesson.html — **[general]** Only learning and search scale indefinitely.
- **"Scaling Test-Time Compute Without Verification or RL is Suboptimal"** — arXiv:2502.12118. https://arxiv.org/pdf/2502.12118 — **[search-only]** Verifier-based test-time search more compute-efficient than verifier-free.
- **Hugo Bowne-Anderson, "AI Agent Harness, 3 Principles for Context Engineering, and the Bitter Lesson Revisited"** — 2025 — **[secondary]** Practitioner kernel: reduce/offload/isolate context, few atomic tools, Verifier's Law.
