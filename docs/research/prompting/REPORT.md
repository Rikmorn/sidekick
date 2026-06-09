# Prompting — Declarative/Guardrail vs Imperative (evidence vs the repo's discipline)

**Research question:** declarative/constraint ("guardrail what you don't want") vs imperative/procedural prompting for capable agentic models — where does emergent-as-a-feature hold, where does it break, how should guardrails be written? And: does `.claude/rules/sk-agent-prompts.md` hold up against the literature?

**Method & integrity note:** deep-research run `wf_60c4743b-ff1`, 2026-06-07 (5 angles → 22 sources → 108 claims → 25 verified; 17 confirmed / 8 killed). **Orchestrator-reconstructed: the synthesis agent's file-write was blocked** (6th run, persistence still flaky), but it returned 4 findings + the full verification log + refuted set + a rule-by-rule action map, so this is rebuilt from the captured structured data + 3 primary-source spot-checks. `FRAMING.md` (the pre-research hypotheses) is preserved alongside. Tags: **[spot-checked]** = I fetched the source; **[run-log]** = from the run's verification (gist/vote reliable, exact wording approximate).

---

## Headline

**Your thesis is largely vindicated; the surface form needs one surgical refinement; and there's one genuine surprise.**

1. **Vindicated:** constrain-don't-proceduralize, goal-oriented identity, structure-at-boundaries, no-self-validation, and "minimize directive density" all hold up against the evidence.
2. **The surgical refinement (your prediction landed):** "guardrail what you don't want" is right as a *principle*, but writing guardrails as **prohibitions** ("don't do X") is the weak point — negation is followed less reliably than positive specification, even on commercial models. **Flip guardrails to positive affordances; reserve prohibitions for a small safety tier.** Anthropic's own prompt-engineering guidance says the same.
3. **The surprise (challenges "trust the model"):** **reasoning can *cause* guardrail neglect** — chain-of-thought measurably degrades instruction/constraint-following across many models. So trust the model to *fill the positive space* with reasoning, but do **not** trust the reasoning to *honor the guardrails* unaudited at high stakes.

---

## Findings

### F1 — Directive density: the failure is SIMULTANEOUS satisfaction, not per-instruction competence
**Confidence: HIGH.** Prompt-level success (following *all* instructions) collapses as count grows — GPT-4o ~0.94 → 0.57 → 0.21 at n=1/5/10 across 10+ models — while **per-instruction** accuracy stays ~0.85–0.90. So the model *can* follow each rule; what collapses is satisfying many *jointly*. **[spot-checked: ManyIFEval 2509.21051 (EMNLP 2025) — degradation-with-count confirmed; exact curve from full paper]** + IFEval (2311.07911, recognized; GPT-4 misses ~1 in 6 atomic instructions).
- **Verdict on Rule 4:** direction **strongly backed**; the ">10 MUSTs" *number* has **no empirical anchor** — and claims of a clean low ceiling were **refuted** (see Refuted: "ceiling ~2-3" 0-3; ">30% past 5" 0-3). Reframe ">10" as a **smell, not a threshold**. The real lever: minimize constraints that must hold *simultaneously*.

### F2 — Negation is the weak surface form (your predicted disconfirming angle — confirmed)
**Confidence: HIGH (direction); magnitude on Claude UNMEASURED.** Models follow negated/prohibition instructions less reliably than positive ones. **[spot-checked: "When Prohibitions Become Permissions" 2601.21433 (Jan 2026)]** — open-source endorse prohibited actions **77% (simple negation), 100% (compound)**; **commercial models fare better but still show 19–128% swings**; holds at temperature 0. Anthropic's prompt best-practices explicitly **recommend positive over negative instructions** [run-log + Anthropic docs].
- **Important scope (honest calibration):** the metric is instruction-following compliance measured **on 14 ethical scenarios**, not general formatting IF; the catastrophic 77–100% is **open-source**; Claude specifically is **not measured**. The run also attributed a "reasoning reduces negation-sensitivity" claim to this paper — **that is NOT in the paper** (misattribution; treat as unverified). And the scary "inverse scaling — bigger models worse at negation" claim was **refuted 0-3**.
- **Verdict on Rule 2:** **backed in spirit, refine the form.** Constrain-not-procedure holds; write guardrails as **positive affordances/boundaries**, reserve prohibitions for a non-negotiable safety tier. *Top-priority edit.*

### F3 — Reasoning can degrade constraint-following (the surprise; challenges Rule 8 / "trust the model")
**Confidence: HIGH (direction); correlational.** CoT/explicit reasoning **degrades instruction-following** across 15 models (drops on 13/14 IFEval, all of ComplexBench; e.g. Llama3-8B 75.2→59.0). Mechanism: reasoning "flattens" constraint attention; low constraint-attention predicts failures. **Recoverable via selective reasoning.** **[spot-checked: "When Thinking Fails" 2505.11423, Li et al., NeurIPS 2025 — direction confirmed; specific numbers from full paper; correlational not causal]**
- **Verdict:** **Rule 8 (trust the model) backed *with a hard caveat*.** Trust the model to fill the positive space; do **not** trust the reasoning to self-honor guardrails — audit constraint-adherence independently at high stakes. **Rule 6 (CoT for orchestrators) is MIXED** — keep it for decisions, but the reasoning trace can drop the orchestrator's own constraints.

### F4 — Principle-based steering generalizes (durably); wording micro-optimization is being absorbed
**Confidence: HIGH (direction); scale/model-dependent.** A single general principle ("do what's best for humanity") roughly matches trait-specific constitutions and a general preference model **surpassed** a specialised one at detecting harm without harm supervision (emergent) — **but only at ~175B scale** (2023 training; direction transfers, threshold doesn't). **[run-log: "Specific vs General Principles for CAI", Anthropic 2310.13798, recognized]**. OpenAI's Model Spec is a **hybrid** — opens with intent (principles) *and* enumerates prohibitions at a top tier, resolving conflicts by a **priority chain-of-command** (the "principle-only is impractical" framing was **refuted 1-2** — it's hybrid, not a rejection of principles).
- **Durability:** few-shot on frontier models mostly does **format alignment, not reasoning transfer** (zero-shot CoT can *beat* few-shot — 2506.14641); auto-prompt-optimization (GEPA 2507.19457: NL reflection beats RL, prompts 9.2× shorter, optimized-small matches hand-prompted-large; DSPy) **closes the wording gap, most for small models.** So: **constraint/principle/structure design is durable; hand-tuned examples and wording are transient (being absorbed).**
- **Verdict on Rule 3:** "reasoning over rules" backed; **few-shot is model-dependent** — keep the *reasoning-pattern* teaching, mark *examples* as more valuable for weaker models / format alignment.

---

## `sk-agent-prompts.md` vs. the evidence (rule-by-rule)

| Rule | Verdict | Action |
|---|---|---|
| **R1 Goal-oriented identity** | **Backed** (Model Spec opens with intent; principle steering) | Keep |
| **R2 Constitutional constraints ("state what NOT to do")** | **Backed in spirit, REFINE the form** — prohibitions are the weak surface (F2) | **Top edit:** guardrails as *positive affordances*; prohibitions only in a safety tier |
| **R3 Few-shot WITH reasoning** | "Reasoning over rules" backed; **few-shot is model-dependent** (F4) | Keep reasoning-pattern; mark examples model-dependent |
| **R4 Minimize directive density (>10)** | **Direction strongly backed; number is a smell** (F1); low-ceiling claims refuted | Reframe ">10" as a smell; minimize *simultaneous* constraints; add priority tiers |
| **R5 Dimensional verifiers / no self-validation / quorum** | **Backed** (+ Track A) | Keep |
| **R6 CoT for orchestrators** | **MIXED** — reasoning can drop the orchestrator's own constraints (F3) | Keep for decisions; audit guardrail adherence independently at high stakes |
| **R7 Structure at boundaries only** | **Backed** (Track C + Model Spec) | Keep |
| **R8 Trust the model** | **Backed WITH HARD CAVEAT** (F3) | Add: "reasoning is not a constraint-guarantee" |

### Missing from the doc (add)
1. **Negation-framing rule** — positive affordances over prohibitions; prohibitions only in a safety tier (F2).
2. **"Reasoning is not a constraint-guarantee"** — the more you trust reasoning, the more you must externally audit guardrail adherence (F3; ties to the through-line + Track A).
3. **Model-dependence axis** — the whole discipline assumes capable frontier models; say so, and flag which guidance is frontier-specific.
4. **Directive-PRIORITY / tier pattern** — borrow the Model Spec chain-of-command: rank constraints (safety > correctness > style) so conflicts resolve by priority, not flat enumeration (addresses the *simultaneous-satisfaction* failure in F1).

---

## Refuted (killed by the adversarial pass — prevents over-correction)

- **"Reliable ceiling is ~3 (frontier) / ~2 (open)"** — 0-3. Do NOT conclude the limit is 2-3.
- **"IF drops >30% past 5 constraints"** — 0-3. No clean threshold.
- **"Inverse scaling on negation (bigger models worse)"** — 0-3 (Jang 2023). Do NOT claim frontier models are *worse* at negation.
- **"Soft-conflicts drive the density drop"** — 0-3.
- **"OpenAI Model Spec rejects principle-only as impractical"** — 1-2. It's *hybrid*, not a rejection of principles.
- **"Count-only logistic regression predicts IF to ~10%"** — 1-2.
- **"Reasoning's effect is cleanly bidirectional (helps format / hurts simple)"** — 1-2.
- **"Monotonic degradation to ~62% at 5 constraints"** — 1-2.

---

## Action map (three buckets)

**IN-REPO** (edits to `sk-agent-prompts.md` — see `../../references/sk-agent-prompts-revisions.md`, shipped in E1):
- Refine R2 to positive-framing (top priority); reframe R4's number as a smell; mark R3 few-shot as model-dependent; add the "reasoning-is-not-a-constraint-guarantee" rule; add a model-dependence note; add a directive-priority/tier pattern.

**HARNESS/CONFIG:**
- Independent **constraint-adherence verification** for safety-/parse-critical steps (the quorum pattern applied to guardrails, since reasoning can drop them — F3).
- Use auto-prompt-optimization (DSPy/GEPA) **only with a metric + labeled set**; otherwise it's wording roulette.

**MODEL/PROVIDER-LEVEL (track only):**
- Principle internalization is moving into training (CAI direction); negation robustness is uneven and improving; auto-optimization closes the gap most for *small* models (so frontier prompting stabilizes on structure, not wording).

---

## Durability verdict
**Durable:** goal-oriented identity, constraint/principle design, reason-then-structure, verification/quorum, priority-tiering — the *philosophy*. **Transient / being-absorbed:** hand-tuned few-shot examples and wording micro-optimization (GEPA/DSPy + stronger models close the gap). The bitter-lesson read: `sk-agent-prompts.md`'s *approach* is exactly the durable kind; any specific *wording* in prompts is not — which is itself an argument for keeping the doc principle-level (as it is).

## Open questions
1. Negative-vs-positive follow-rate on **current Claude** in a controlled IF setup (not ethical-scenario moral judgment).
2. Does CoT-constraint-neglect reproduce on **Claude extended-thinking**, and does the orchestrator/worker split mitigate it?
3. Directive-density knee for **real agentic/multi-tool** workloads (vs text-formatting constraints).
4. Is encoding directive **priority** (Model-Spec chain-of-command) worth it in sk prompts vs flat constraints?

## Provenance & honesty
- **Spot-checked by me:** 2601.21433 (negation — metric is IF on ethical scenarios; commercial models 19–128% swings; "reasoning-reduces-it" NOT in paper), 2505.11423 (reasoning degrades IF — confirmed, correlational), 2509.21051 (ManyIFEval — degradation-with-count confirmed).
- **Recognized from training:** IFEval (2311.07911), CAI specific-vs-general (2310.13798), Jang negation (the *refuted* inverse-scaling claim).
- **From run log, not re-checked:** EifBench, ScaledIF, GEPA, DSPy, zero-shot-CoT-beats-few-shot, brittleness-angle sources (several 2024–2026 IDs).
- **Reconstruction:** synthesis prose was lost to a blocked file-write; verification votes are authoritative, exact wording for [run-log] items approximate.
