# Angle contribution: Constitutional & principle-based steering (sub-question 6)

*Web-searcher subagent contribution. Scope: does stating principles/a constitution generalize better than enumerating explicit rules and cases? Grounds the repo's "constitutional constraints" rule (sk-agent-prompts.md Rule 2) and the "goal-oriented identity" claim (Rule 1). Includes the priority disconfirming angle (sub-question 2: negative vs positive instructions). The orchestrator merges this into REPORT.md.*

## Headline finding

The constitutional/principle-based steering literature **supports the spirit** of sk-agent-prompts.md (goal-oriented identity + constitutional constraints) but **refines two specifics**:

1. **General principles generalize, but offload normativity to an opaque model.** Anthropic's *Specific vs. General Principles for Constitutional AI* found a single broad principle ("do what's best for humanity") nearly matches trait-specific constitutions at suppressing problematic behaviours (power-seeking, self-preservation) and even *beats* the HH-RLHF preference model at detecting conventional harmfulness — without harmlessness-specific training data. BUT specific principles still win on precise/known harms (e.g. "desire for self-identity," where the general model reached only ~60% accuracy), and the authors explicitly flag that a short constitution "offloads important normative questions to an opaque AI model" — a transparency/auditability cost. This is the academic mirror of the operator's own "no debugger" worry. Verdict: principle-based steering is the right default; specific rules are warranted for precise, high-stakes, or known-failure categories — which is exactly the "escalate to structural enforcement" carve-out the repo already has.

2. **The disconfirming hit (priority): "guardrail what you don't want" collides with the negative-instruction problem.** Anthropic's own prompt-engineering best practices say **"Tell Claude what to do instead of what not to do"** (e.g. replace "Do not use markdown" with "Your response should be composed of smoothly flowing prose paragraphs"). The reliability evidence here is weak/anecdotal (Reddit reports, Ironic-Process-Theory analogy — no controlled benchmark surfaced), so treat the magnitude as unverified. But the framing recommendation is consistent across Anthropic guidance and OpenAI's Model Spec design. **This does NOT refute the thesis — it refines how guardrails should be written.** The thesis's deep claim ("don't imperatively specify procedure; bound the space, let reasoning fill it") survives. What it challenges is the *surface form*: constraints framed as bare prohibitions ("NEVER create duplicate files") are reportedly leaky; the same boundary framed as a positive affordance ("apply all fixes to the existing files") is followed better. So: a guardrail is a *boundary*, and a boundary is best stated as the positive affordance it leaves open, not only as the prohibition it closes.

## How OpenAI's Model Spec adjudicates the tension (strong primary source)

The Model Spec is a hybrid, and its structure is itself evidence for the repo's design:
- It is **not a flat list of rules**. It begins with high-level *intent* (what the system optimises for and why) — i.e. goal-oriented identity, not procedure. This vindicates Rule 1.
- It uses a **chain of command** (authority levels: platform/root > developer > user) so conflicting instructions resolve by priority rather than by the model guessing. This is the structural answer to "directive stacking" — the repo's anti-pattern about directives fighting for priority.
- **Prohibitions are reserved for the top authority tier.** Root-level rules ("mostly prohibitive" — avoid catastrophic risk, physical harm, illegality) sit at the very top and cannot be overridden; *most* policies are deliberately placed at the lowest level so users/developers can override them. This is the precise nuance the repo's Rule 4 ("reserve strong directives for safety boundaries / framework requirements") was reaching for: prohibitions are legitimate but should be *few and high-authority*, not sprinkled through behavioural guidance.

The Model Spec is therefore strong primary-source support for: goal-oriented identity (Rule 1), constraints-reserved-for-safety (Rule 4), and a structural priority mechanism instead of natural-language directive stacking (anti-pattern section).

## Rule-by-rule reconciliation (this angle's slice)

| sk-agent-prompts.md claim | Evidence verdict | Refinement |
|---|---|---|
| Rule 1 — Goal-oriented identity (state purpose, not procedure) | **Backed.** Model Spec opens with intent before rules; CAI principles are interpreted by reasoning, generalising to unseen phrasings. | Keep. Add: state the *positive* goal explicitly; capable models follow affirmative specs better than inferred ones. |
| Rule 2 — Constitutional constraints (state what NOT to do, leave positive space) | **Backed in spirit, refined in form.** Principle/constitution steering generalises (CAI). | The "state what NOT to do" *framing* is the weak part. Frame each constraint as the positive affordance/boundary it leaves open, not only the prohibition. Reserve bare "never" for genuine safety/parse boundaries (Model Spec: prohibitions live at the top authority tier only). |
| "Trust the model / principles generalise" (Rule 8 + thesis) | **Backed with a caveat.** General principles nearly match specific ones AND offload normativity to an opaque model. | Durable for frontier models. Add specific rules where a harm is precise, known, or high-stakes — matches the repo's own escalation carve-out. |

## Durability lens (this angle)

- **Durable (leverages the reasoning engine):** principle/constitution-based steering, goal-oriented identity, positive-affordance framing of boundaries. These get *stronger* as models reason better — CAI's whole premise is that the model interprets principles against novel situations. The Model Spec is published precisely so models internalise principles during training; the better the model, the more a short constitution suffices.
- **Transient / weaker-model-dependent:** enumerated rule lists and case-by-case prohibitions. The negative-instruction fragility is most acute on weaker evaluators (the multimodal-baseline and "weak LLM evaluator" findings both report negation handled worse by smaller/weaker models) — consistent with the format-tax open-vs-closed split. As models improve, exhaustive enumeration is the thing being absorbed; principle-statement is what survives.

## Bucketed actionable findings (this angle)

**(1) IN-REPO (sk-agent-prompts.md edits):**
- Refine Rule 2: keep "constitutional constraints," but add the framing rule — *write each guardrail as the positive boundary/affordance it leaves open; reserve bare prohibitions for safety/parse boundaries.* Cite Anthropic best practices + Model Spec authority-tiering.
- Cross-link Rule 4's "reserve strong directives for safety" to the Model Spec pattern (prohibitions at top authority tier only) as external grounding.
- Note the transparency cost of pure principle-steering (CAI: "offloads normative questions to an opaque model") next to the existing "escalate to structural enforcement" guidance — it's the same tradeoff, now externally sourced.

**(2) HARNESS/CONFIG:** none specific to this angle.

**(3) MODEL/PROVIDER-LEVEL (track only):** principle-internalisation is happening at training time (Model Spec is a training target). Over time more of the "constitution" lives in the model, so in-repo prompts can get shorter/more principle-like — revisit directive-density heuristics as base models advance.

## Verified vs. needs spot-checking

- **Verified this run (read source):** *Specific vs. General Principles for CAI* findings (fetched arXiv HTML); Model Spec chain-of-command + prohibitions-at-top-tier (fetched/searched OpenAI sources); Anthropic "tell Claude what to do instead of what not to do" appears in official Claude prompt-engineering best practices (search-confirmed, primary docs URL captured).
- **NOT verified / weak:** the *magnitude* of negative-instruction unreliability. The pink-elephant article self-admits its evidence is anecdotal (Reddit) with no benchmark. No controlled study quantifying negative-vs-positive follow rates surfaced in this angle's searches. Treat "negative instructions are less reliable" as a directionally-supported best-practice recommendation, not a quantified law. Flag for spot-check by the instruction-following-limits angle.
