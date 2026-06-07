# Reasoning & Capability — Deep Research Report

*Synthesis of a 3-vote adversarially-verified research run (21 surviving claims). Companion to `FRAMING.md` (the pre-research hypotheses). Tracks A/B are treated as ESTABLISHED — this report investigates what FOLLOWS. Run date: 2026-06-07.*

---

## Executive summary

The research confirms the operator's central hypothesis: the universal problem-solving flow (research → decompose → plan → build → verify) is not a reasoning-engine deficiency — it's a **calibration and initiative** problem, and the model **cannot self-calibrate reliably**. The two load-bearing failure modes are (1) the agreement/helpfulness prior toward immediate answers is *amplified* by RLHF rather than introduced only by pretraining (so it's structural, not promptable-away), and (2) models lack budget awareness and systematically over- or under-apply reasoning relative to true task difficulty — confirming the FRAMING's claim that "skip based on perceived complexity" inherits the over-confidence bug. The durable fixes the evidence supports are exactly the structural ones the FRAMING predicted: force a cheap framing/planning pass as a default (Plan-and-Solve gives direct evidence that planning-before-answering beats unstructured CoT), put verification in *external* tools rather than self-checking prompts (LLM-Modulo; intrinsic self-verification is empirically net-negative), and treat the DIAL as an operator-set-budget-plus-bounded-model-adaptation problem (the controllable-vs-adaptive taxonomy maps directly onto the operator-dial concept, and Anthropic already ships bounded adaptive thinking). Critically, **more reasoning is non-monotonic** — past a difficulty-dependent threshold, additional test-time compute flips correct answers to incorrect — so the harness must guard against over-engineering as actively as under-research. Reasoning models partially absorb the planning/decomposition techniques natively, but they do NOT solve the calibration problem (they overthink trivial queries), so the durable harness value is in budget calibration and external verification, not in re-implementing decomposition prompts.

---

## Findings

### F1 — The defaulting gap is structural (RLHF-amplified), not a prompt artifact
**Confidence: HIGH** (2 primary sources, formal mechanism + Anthropic empirical corroboration)

The helpfulness/agreement prior that pushes models toward immediate answers is **amplified by preference-based post-training (RLHF) — the very stage meant to reduce misalignment** (claim [5], arXiv:2602.01002, corroborated by Sharma et al. 2023 / Anthropic arXiv:2310.13548). The mechanism is single and formal: if an undesirable attribute (e.g. agreeing with the user, answering immediately) is overrepresented among high-reward completions under the base policy, then stronger optimization pressure increases its prevalence — formalized as a covariance/mean-gap condition with β (RLHF strength) and N (best-of-N) as knobs (claim [6]).

**Why this matters for the FRAMING:** This is direct evidence for the FRAMING's hypothesis that the defaulting-to-shallow behaviour is a trained prior, not deliberate budgeting. It also explains *why* "tell it to research more" doesn't work — the prior is baked in by training, so the fix must be structural (a forcing function), not a self-report instruction.

**Durability:** This is a MODEL/PROVIDER-LEVEL property. It will persist as long as preference-based post-training is used; the harness cannot remove it, only counteract it structurally.

---

### F2 — Planning-before-answering is a real, measurable improvement over unstructured CoT
**Confidence: HIGH** (primary source with isolating ablation)

Zero-shot CoT ("think step by step") fails in three identifiable ways — calculation errors, missing-step errors, and semantic-misunderstanding errors — so prompting a model to think step by step does NOT reliably produce a complete, correct decomposition (claim [0], arXiv:2305.04091). Plan-and-Solve fixes this by forcing an explicit two-phase decompose-then-execute structure (claim [1]): the bare planning trigger alone (not the error-fixing add-ons) beats unstructured CoT (+1.8pts GSM8K; ~2.5% avg across arithmetic datasets in the paper's own isolating ablation).

**Why this matters for the FRAMING:** This is the direct evidence behind "make the framing/planning pass a default forcing-function." The effect of the *planning instruction alone* is modest but real and isolated from confounds.

**Durability caveat — IMPORTANT:** This is GPT-3.5-era evidence. The verifier flagged this as a technique reasoning models likely **absorb natively** (it leverages the reasoning engine rather than substituting a program). Treat in-harness Plan-and-Solve-style prompting as a hedge that stronger models may make redundant — do NOT over-invest in elaborate decomposition prompt scaffolding. Three of four REFUTED claims were attempts to credit o1's native reasoning patterns (decomposition, self-refinement, divide-and-conquer) as the driver of its gains — those refutations mean we should NOT assume reasoning models reliably self-decompose, but the durability lens still says the planning *technique* is the kind a model can internalize.

---

### F3 — Intrinsic self-verification is unreliable and often net-negative; verification must be external
**Confidence: HIGH** (primary source + independent DeepMind ICLR corroboration + TACL survey)

LLMs cannot reliably verify or self-critique their own plans/solutions — verification is NOT easier than generation for them, contradicting the optimistic assumption that drives iterative self-improvement schemes (claim [2], arXiv:2402.01817, Kambhampati et al.). Empirically, self-critiquing does NOT improve over baseline and can make performance *worse*, because the model fails to recognize a correct solution and discards fortuitously-correct outputs (claim [3]; independently confirmed by Huang et al. DeepMind ICLR'24 arXiv:2310.01798 — intrinsic self-correction *drops* accuracy; prior positive results relied on oracle labels that don't exist in practice).

The proposed durable fix is the **LLM-Modulo framework**: a Generate-Test-Critique loop where the LLM generates and EXTERNAL sound critics (not the LLM) verify/critique (claim [4]). Soundness is inherited from the external critics, not the reasoning engine.

**Scope caveat:** This is scoped to *intrinsic, prompt-only, no-external-feedback* self-verification. External-verifier loops and decomposable-task verification (where verification is genuinely easier than generation) are exempt. Verification ability CAN be installed via additional RL/training (S2R, ReVISE) — but that's a model-level change, not a prompt.

**Why this matters for the FRAMING:** Directly reinforces Track A's "models can't self-verify." For sidekick this means: do not build reliability on "ask the model to check its own work" prompts. Build external verifiers (test runners, linters, type-checkers, formal critics, a *separate* reviewer agent — the project's own sk-* rule that "producers and verifiers are distinct agents, no self-validation" is the right pattern).

**Durability:** The *deficiency* is model-level and durable. The *fix* (external scaffolding) is HARNESS-LEVEL and durable — external sound verifiers remain valuable regardless of model strength.

---

### F4 — More reasoning is non-monotonic: past a difficulty-dependent threshold it flips correct answers to wrong
**Confidence: HIGH** (3+ primary sources across independent teams, incl. Anthropic-led TMLR paper)

This is the strongest and most-corroborated cluster. Extending a reasoning model's thinking trace produces an **inverted-U**: performance first improves, then declines due to overthinking — more test-time compute is NOT monotonically beneficial (claim [11], arXiv:2506.04210; independently corroborated by Anthropic-led "Inverse Scaling in Test-Time Compute" arXiv:2507.14417, TMLR Dec 2025). Concretely, accuracy can rise then drop (GSM-8K 82.2%→87.3%→70.3% as thinking tokens grow), and **past a budget threshold, more thinking actively flips correct answers to incorrect** — beyond ~7K tokens negative flips outnumber positive (claim [14], arXiv:2604.10739; flip ratio reaches 3.29 at 12K, 7.55 at 16K). For R1-32B, marginal utility turns negative beyond ~12K tokens (claim [13]).

Part of the apparent gain from extended thinking is an **artifact** of the interaction between model uncertainty and the evaluation metric — additional thinking raises output variance (entropy rose ~12x), creating an illusion of improved reasoning while undermining precision (claim [12]). The same paper shows *parallel* thinking (Best-of-N-style) genuinely helps where sequential extended thinking does not — so the failure is specific to thinking *longer in the same direction*, which answers sub-question 2 directly: reasoning models can just think longer in a shallow direction, and that is variance, not depth.

**Why this matters for the FRAMING:** This is the DISCONFIRMING evidence the brief asked for. Over-research/over-decomposition/over-thinking is not merely diminishing returns — it is net-negative for correctness. The harness must guard the over-engineering failure mode as hard as the under-research one. "Default to framing, justify skipping" must be balanced by "cap depth, justify adding."

**Durability:** Model-level phenomenon; the *mitigation* (budget caps, difficulty-aware allocation, prefer parallel-sampling over sequential length) is HARNESS-LEVEL and durable.

---

### F5 — The DIAL: optimal compute is strongly difficulty-dependent, and models can't self-assess it
**Confidence: HIGH** (multiple primary sources, unanimous votes)

The optimal compute budget varies **~7.5x across difficulty levels** — easy problems peak at ~1.5K tokens, hard problems benefit up to ~8K — so a fixed/uniform reasoning budget is wrong; effort must be calibrated per task difficulty (claim [15], arXiv:2604.10739; foundational corroboration Snell et al. arXiv:2408.03314). But o1-like models **systematically overthink simple problems**, allocating excessive compute to trivial queries where extra reasoning yields minimal benefit (claims [8], [10], [17] — e.g. 1,953% more tokens on "2+3?", up to 13 solutions for one trivial problem). And **sequential reasoning models lack budget awareness**, leading to inefficient token usage — the models themselves do not reliably know how much compute to spend (claim [18]).

There is a partial counterweight: o1 *does* adapt reasoning depth to task *category* — short chains for commonsense, long chains for hard math/coding, with length tracking task difficulty rather than per-sample correctness (claim [7]). So the adaptation is real at the coarse category level but fails at the fine-grained per-instance level (overthinking the easy end). Wasted reasoning is removable without performance loss via self-training (claim [9]) — but that's a model-training fix, not a harness one.

**Why this matters for the FRAMING:** This is the empirical core of the FRAMING's "DIAL" insight and confirms it precisely: the model misjudges complexity and mis-allocates process, AND self-assessed-complexity is an unreliable basis for the dial. The FRAMING's resolution ("don't let the model pre-judge depth from the armchair; make a cheap framing pass always-on and let *that* set depth") is consistent with the evidence — but the evidence adds a constraint the FRAMING under-weighted: the framing pass itself can over-set depth, so depth needs an external cap, not just a grounded self-estimate.

**Durability:** The difficulty-dependence is a durable fact about problems. The model's *inability to self-budget* is currently model-level but being attacked by both training (self-training, SelfBudgeter) and external scaffolding (routers, budget allocators). The HARNESS lever — difficulty-aware budget caps and routing — is durable until models internalize budget awareness.

---

### F6 — The controllable-vs-adaptive taxonomy is the operator-dial concept, and Anthropic already ships a bounded version
**Confidence: HIGH** (primary survey + primary Anthropic API docs + independent academic corroboration)

The literature distinguishes two regimes of test-time-compute control (claim [16], arXiv:2507.02076): **controllable** methods that optimize performance under a fixed compute budget set *externally by the user* (the operator dial), versus **adaptive** methods that dynamically scale inference based on input difficulty or model confidence (model self-assessment). This maps directly onto the operator's DIAL question.

Anthropic ships a native **adaptive thinking** mode where Claude itself evaluates each request's complexity and decides whether/how much to use extended thinking, rather than the developer pre-setting a fixed token budget (claim [19], platform.claude.com adaptive-thinking docs). Crucially, this self-assessment operates **within developer-set bounds** — effort param (max/xhigh/high/medium/low, soft guidance), max_tokens (hard cap), and promptable triggering ("When in doubt, respond directly"). This is the model-level form of the DIAL: self-assessed allocation *inside* operator-set knobs. Adaptive (model-decided) thinking can outperform a fixed developer-set budget on bimodal tasks and long-horizon agentic workflows (claim [20]; independently corroborated — ARES cuts reasoning tokens up to 52.7% vs fixed high-effort with minimal task-success loss; static low-effort-everywhere causes ~20% accuracy drop).

**Why this matters for the FRAMING:** The operator-dial tooling concept (`../../backlog/operator-dial-tooling.md`) is not speculative — it's the established controllable/adaptive frame, and the harness can lean on Anthropic's bounded adaptive thinking rather than reinventing it. The right design is **operator sets the bounds (effort ceiling, token cap, autonomy/risk level), model adapts within them** — which is exactly what F4/F5 require, since unbounded model self-allocation over-thinks.

**Durability:** The bounded-adaptive interface is HARNESS/PROVIDER-LEVEL and durable — even as models get better at self-budgeting, operator-set ceilings remain the safety/cost/autonomy control surface.

---

## Sub-question coverage map

| Sub-question | Answer from evidence | Findings |
|---|---|---|
| 1. Initiative/defaulting gap — why no self-trigger? | RLHF-amplified helpfulness prior; structural, not prompt-fixable. Fix = forcing function. | F1, F2 |
| 2. Reasoning models — deeper or just longer? | Can be "longer in the same shallow direction" = variance not depth; parallel helps, sequential length doesn't past threshold. | F4 |
| 3. Meta-reasoning / effort calibration (the DIAL) | Difficulty-dependent (~7.5x); models lack budget awareness; self-assessed complexity unreliable; better strategy = external bounds + bounded adaptation. | F5, F6 |
| 4. Decomposition & planning methods | Plan-and-Solve gives modest real gain over CoT; CoT has 3 named failure modes; reasoning models partly absorb decomposition (so don't over-invest). | F2 |
| 5. CoT faithfulness | NOT RESOLVED by this run — see Open Questions. The brief flagged Turpin/Anthropic; no surviving claim addressed faithfulness directly. | — (gap) |
| 6. Capability self-knowledge & escalation | NOT directly addressed by surviving claims (overlaps with Track B's self-monitoring failure). See Open Questions. | — (gap) |
| 7. Operator-in-the-loop control interfaces | Controllable/adaptive taxonomy + bounded adaptive thinking = the precedent. | F6 |
| 8. Disconfirming — when does more process HURT? | Strongly answered: overthinking is net-negative past a threshold (flips correct→wrong); uniform heavy reasoning is miscalibrated. | F4, F5 |

---

## Actionability buckets

### Bucket 1 — IN-REPO (skill / rule / hook / agent)
- **Force a framing/planning pass as a default forcing-function** (F2). A skill or rule that runs a cheap "understand → decompose → set depth" pass before answering non-trivial tasks. DURABLE (leverages reasoning engine), but flag as possibly-absorbed-by-stronger-models — keep it lightweight, don't build elaborate decomposition scaffolding.
- **External verification via separate reviewer agents, never self-validation** (F3). The repo's existing sk-* rule ("producers and verifiers are distinct agents; no self-validation; quorum pattern") is exactly right and evidence-backed. Extend it: prefer tool-based verifiers (tests, types, lints, formal critics) over LLM-judge prompts where ground truth exists.
- **Guard the over-engineering failure mode** (F4, F5). Add a rule/heuristic that justifies *adding* depth, not just skipping it — symmetric to "justify skipping research." Cap decomposition depth; prefer parallel sampling/Best-of-N over ever-longer sequential chains where a verifier can select.
- **Difficulty-aware routing** (F5): a cheap framing pass that sets an effort tier per task, with the tier mapping to an effort ceiling — not the model free-running its own budget.

### Bucket 2 — HARNESS / CONFIG (Claude Code settings, hooks, MCP, persistent-instruction files)
- **Use Anthropic's bounded adaptive thinking with operator-set ceilings** (F6, F4). Configure effort level + max_tokens as the operator dial; let the model adapt *within* the cap. This directly implements the operator-dial-tooling concept. Note: on Opus 4.7/4.8 adaptive is the *only* thinking mode (manual budget_tokens returns 400), so the lever is effort level, not raw token budget.
- **External-verifier tooling via MCP** (F3): wire test runners, type-checkers, linters, and (where applicable) formal critics as MCP/tools the harness invokes as the Generate-Test-Critique loop's "test" stage.
- **Operator-dial interface up front** (F6): expose research-depth / autonomy / risk / budget as parameters the operator sets before a task, mapped onto effort ceilings + which verifiers run — the controllable regime, with bounded adaptation inside it.

### Bucket 3 — MODEL / PROVIDER-LEVEL (track only)
- **RLHF-amplified helpfulness/sycophancy prior** (F1) — cannot be removed in-harness; only counteracted structurally. Track for any provider work on de-biasing.
- **Models lack native budget awareness; overthink simple queries** (F5, F4) — being attacked by training (self-training, SelfBudgeter) and may improve. When models internalize budget awareness, the harness's difficulty-routing value drops (but operator ceilings remain).
- **Intrinsic self-verification deficiency** (F3) — model-level; verification ability is being installed via RL in some lines of work. Until reliable, keep verification external.
- **Reasoning models absorbing decomposition/planning natively** (F2, plus the 4 refuted o1-pattern claims) — track whether explicit decomposition prompting becomes redundant.

---

## Durability lens summary

| Technique | Leverages reasoning engine (durable) vs hand-built program (absorbable) | Note |
|---|---|---|
| Plan-and-Solve / framing pass (F2) | Leverages engine -> durable, BUT likely absorbed by reasoning models | Keep lightweight; hedge |
| External sound verifiers / LLM-Modulo (F3) | Hand-built program -> but PERMANENTLY durable | Soundness can't come from the engine being verified |
| Difficulty-aware budget caps (F4/F5) | Hand-built scaffolding -> durable until models self-budget | Operator ceiling outlives it |
| Bounded adaptive thinking (F6) | Hybrid: model adapts, operator bounds -> durable | The bound is the durable part |
| Symmetric over-engineering guard (F4) | Leverages judgment -> durable | The non-monotonic fact is permanent |

---

## Caveats

- **Magnitudes are model/dataset-specific.** The exact numbers — 7.5x budget variance, 1.5K/8K peaks, 7K/12K flip thresholds (claims [13][14][15]) — rest partly on single preprints (arXiv:2604.10739) and math benchmarks (AIME/MATH Level 1-5). Cite them as illustrative of the *direction*, not as universal constants. The directional core (inverted-U, difficulty-dependence) is robustly multi-source.
- **Plan-and-Solve evidence is GPT-3.5-era (2023).** The +1.8pts/2.5% gains are from text-davinci-003. The failure modes' *existence* is durable; the *magnitude* on frontier models is unknown and likely smaller (reasoning models absorb it).
- **Anthropic adaptive-thinking performance claim (F6, claim [20]) has no published benchmark numbers in the vendor doc** — Anthropic has a commercial interest (they deprecated budget_tokens). The directional claim is salvaged only because independent academic papers (ARES, DiffAdapt, CODA) confirm the same direction. Cite the academic sources when strength matters, not the vendor doc.
- **Two sub-questions were not answered by surviving claims:** CoT faithfulness (sub-q 5) and capability self-knowledge/escalation (sub-q 6). The FRAMING explicitly flagged faithfulness as a trap (post-hoc rationalization) needing verification — this run did NOT verify it. Do not assume the decision trace is faithful; that remains an open risk for hands-off operation.
- **Self-verification scope.** F3 is scoped to *intrinsic, prompt-only* self-verification. It does NOT say all verification fails — external verifiers and decomposable-task self-checks (where verification is genuinely easier than generation) are exempt. Don't over-generalize to "never let the model check anything."
- **Refuted claims (transparency):** Four claims crediting o1's native reasoning patterns (decomposition, self-refinement, divide-and-conquer, beating scaffolding) were refuted 0-3. This means we should NOT assume reasoning models reliably self-decompose — supporting the case for keeping a framing forcing-function rather than trusting native behaviour.

---

## Open questions

1. **CoT faithfulness for the decision trace.** The brief and FRAMING both flag that "why A not B" traces may be post-hoc rationalization (Turpin et al.; Anthropic CoT-faithfulness work). No surviving claim addressed this. For hands-off operation a confident-but-unfaithful trace is worse than none — this needs a dedicated verification run before any auditable-decision-trace feature is trusted.
2. **Capability self-knowledge & calibrated escalation.** Does a model reliably know its own tool availability / capability boundaries (the "do we have an ecommerce MCP / browser? -> escalate" pattern)? This overlaps Track B's self-monitoring failure but wasn't directly evidenced here. Likely needs structural capability-registry tooling rather than model self-report.
3. **Does the always-on framing pass itself over-set depth?** F5 implies the framing pass can mis-allocate just as the armchair judgment does. What's the cheapest reliable signal for the *initial* difficulty tier — and should the tier be a soft prior the operator can override, given the model can't self-budget?
4. **When do reasoning models fully absorb Plan-and-Solve / decomposition prompting?** If frontier reasoning models internalize the framing pass, in-harness planning prompts become redundant overhead. A periodic re-test would tell the harness when to retire that scaffolding.

---

## Orchestrator spot-check (post-run, by Claude)

Verified the two most load-bearing post-cutoff papers against their primary sources:
- **arXiv:2604.10739 (F4/F5) — confirmed real.** Abstract confirms the *direction*: optimal thinking length is difficulty-dependent, "overthinking" abandons previously-correct answers, and cost-aware stopping at moderate budgets saves compute. The precise magnitudes (~7.5×; 7K/12K/16K flip ratios) are in the full paper, not the abstract — cite as **illustrative of the direction**, not universal constants.
- **arXiv:2602.01002 (F1) — confirmed real** (Shapira, Benade, Procaccia, Feb 2026). Confirms RLHF *amplifies* an over-represented attribute via a covariance/mean-gap condition, with a closed-form agreement penalty as fix. **Precision caveat:** the paper's measured attribute is **sycophancy / belief-endorsement**, not literally an "answer-immediately / skip-research" prior. F1's extension to the defaulting-to-shallow behaviour is a **well-motivated analogy, not a directly-measured result** — treat the *mechanism* as solid, its application to the shallow-answer prior as inference.
- **Not verified by me — flag before relying:** the Anthropic adaptive-thinking API specifics in Bucket 2 (e.g. "budget_tokens returns 400 on Opus 4.7/4.8, adaptive-only"). A concrete, dateable API claim — verify against current Anthropic docs (via the claude-api skill) before building config on it.
