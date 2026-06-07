# Reasoning & Capability — Sources

*Sources cited in `REPORT.md`, with type and verification status. Run date 2026-06-07. All marked "verified this run" were checked against the primary source during the adversarial verification pass (3-vote).*

## Primary — peer-reviewed / arXiv (verified this run)

### Planning & decomposition
- **arXiv:2305.04091** — Wang et al., "Plan-and-Solve Prompting" (ACL 2023). Three CoT failure modes (calculation / missing-step / semantic-misunderstanding); two-phase decompose-then-execute; isolating ablation shows bare planning trigger beats Zero-shot-CoT (+1.8pts GSM8K). Claims [0], [1]. *Caveat: GPT-3.5-era; durability lens flags as absorbable.*
  - ar5iv full text: https://ar5iv.labs.arxiv.org/html/2305.04091
  - ACL Anthology: aclanthology.org/2023.acl-long.147

### Self-verification limits / external verification
- **arXiv:2402.01817** — Kambhampati et al. (ASU), "LLMs Can't Plan, But Can Help Planning in LLM-Modulo Frameworks" (ICML 2024 spotlight). LLMs can't self-verify; self-critique is net-negative; LLM-Modulo Generate-Test-Critique with EXTERNAL sound critics. Claims [2], [3], [4]. https://arxiv.org/html/2402.01817v2
- **arXiv:2402.08115** — Stechly/Valmeekam/Kambhampati, "On the Self-Verification Limitations of LLMs" (companion). Corroborates [2][3].
- **arXiv:2310.01798** — Huang et al. (Google DeepMind), "Large Language Models Cannot Self-Correct Reasoning Yet" (ICLR 2024). Independent confirmation: intrinsic self-correction drops accuracy; prior gains relied on oracle labels. Corroborates [2], [3].
- **arXiv:2406.01297** — TACL critical survey (Nov 2024). Intrinsic self-correction does not improve / degrades on arithmetic, QA, code, plan-gen, graph coloring. Corroborates [3].

### Sycophancy / RLHF amplification (the defaulting prior)
- **arXiv:2602.01002** — Shapira/Benade/Procaccia, "How RLHF Amplifies Sycophancy" (2026-02). Formal single-mechanism (covariance/mean-gap; β, N as knobs); Best-of-N empirical validation. Claims [5], [6]. https://arxiv.org/pdf/2602.01002
- **arXiv:2310.13548** — Sharma et al. (Anthropic), "Towards Understanding Sycophancy in Language Models" (2023). User-belief-matching predicts human preference; optimizing the preference model increases sycophancy. Corroborates [5].

### Overthinking / non-monotonic test-time compute (the disconfirming cluster)
- **arXiv:2412.21187** — Chen et al. (Tencent AI Lab + SJTU), "Do NOT Think That Much for 2+3=? On the Overthinking of o1-Like LLMs" (ACL 2025). Canonical overthinking paper; "2+3?" = 1953% more tokens, up to 13 solutions; self-training mitigation preserves accuracy on GSM8K/MATH500/GPQA/AIME. Claims [8], [9], [10]. https://arxiv.org/pdf/2412.21187
- **arXiv:2506.04210** — Ghosal et al., "Does Thinking More always Help? Mirage of Test-Time Scaling in Reasoning Models" (NeurIPS 2025). Inverted-U; variance-as-illusion (entropy ~12x); parallel > sequential thinking. Claims [11], [12]. https://arxiv.org/abs/2506.04210
- **arXiv:2507.14417** — Gema, Hägele, ... Benton, Perez (Anthropic-led), "Inverse Scaling in Test-Time Compute" (TMLR Dec 2025, Featured Certification). Independent confirmation of inverse scaling. Corroborates [11].
- **arXiv:2604.10739** — Zhou, Ling, Chen, Wang, Fan, Wang, "When More Thinking Hurts: Overthinking in LLM Test-Time Compute Scaling" (Apr 2026). Difficulty-dependent threshold (7.5x); R1-32B peak ~12K, marginal utility negative beyond; flip ratio crosses 1 at ~7K. Claims [13], [14], [15]. https://arxiv.org/html/2604.10739 *Caveat: single preprint for exact numbers; cite directionally.*

### Adaptive vs controllable compute (the DIAL taxonomy)
- **arXiv:2507.02076** — Alomrani, Zhang et al. (Huawei Noah's Ark / McGill / Mila), "Reasoning on a Budget: A Survey of Adaptive and Controllable Test-Time Compute in LLMs" (2025-07). Controllable (user-set budget) vs adaptive (difficulty/confidence-driven) taxonomy; overthinking simple queries; sequential models lack budget awareness. Claims [16], [17], [18]. https://arxiv.org/html/2507.02076
- **arXiv:2408.03314** — Snell, Lee, Xu, Kumar (UC Berkeley / Google DeepMind), "Scaling LLM Test-Time Compute Optimally..." Foundational: compute-optimal strategy varies by difficulty (~4x efficiency vs uniform). Corroborates [15].
- **arXiv:2410.13639** — "A Comparative Study on Reasoning Patterns of OpenAI's o1 Model." o1 adapts depth to task category; token length tracks difficulty not per-sample correctness. Claim [7]. *Note: 3 other claims from this paper crediting native o1 reasoning patterns were REFUTED 0-3.* https://arxiv.org/html/2410.13639v1

### DIAL corroboration (independent, secondary-to-the-claim but primary papers)
- **arXiv:2603.07915** — ARES. Adaptive cuts reasoning tokens up to 52.7% vs fixed high-effort; static low-effort-everywhere ≈20% accuracy drop. Corroborates [20].
- **arXiv:2510.19669** — DiffAdapt. Matches/improves accuracy with up to 22.4% fewer tokens across 5 models / 8 benchmarks. Corroborates [20].
- **arXiv:2603.08659** — CODA. >60% token cut on easy tasks, accuracy preserved. Corroborates [20].
- **arXiv:2604.05164** — "Not All Turns Are Equally Hard." Adaptive budgets beat fixed in multi-turn/long-horizon. Corroborates [20].
- arXiv:2504.13367 (ThoughtTerminator), 2505.22017, 2505.11274 (SelfBudgeter), 2505.18822 (AdaCtrl), 2505.16122 (Plan-and-Budget) — overthinking/budget-awareness corroboration for [17], [18].

## Primary — vendor docs (verified this run)
- **Anthropic adaptive thinking** — platform.claude.com/docs/en/build-with-claude/adaptive-thinking. Claude self-assesses complexity within developer-set bounds (effort level + max_tokens). Adaptive is the only mode on Opus 4.7/4.8. Claims [19], [20]. *Caveat: performance claim [20] has no published benchmark numbers in the doc — vendor interest; rely on academic corroboration above.*
  - Independent corroboration: AWS Bedrock docs (docs.aws.amazon.com/.../claude-messages-adaptive-thinking.html).

## Refuted (0-3 votes — transparency)
- "PS outperforms Zero-shot-CoT across ALL datasets by a large margin" (arXiv:2305.04091) — gain is modest, not large; large gains came from PS+ error-fixing not planning.
- "o1 outperforms all test-time-compute methods, native structure beats scaffolding" (arXiv:2410.13639).
- "o1's reasoning = six identifiable native patterns (decomposition/planning/self-refinement)" (arXiv:2410.13639).
- "Self-Refinement + Divide-and-Conquer is the dominant driver of o1's gains" (arXiv:2410.13639).
  - *Implication: do NOT assume reasoning models reliably self-decompose — supports keeping a framing forcing-function.*

## Not covered this run (open — see REPORT.md Open Questions)
- CoT faithfulness (Turpin et al.; Anthropic CoT-faithfulness work) — flagged by FRAMING/brief, NOT verified this run.
- Capability self-knowledge & calibrated escalation/abstention — not directly evidenced; overlaps Track B.
