# Backlog: sk-agent-prompts.md revisions (from the prompting research)

**Status:** Ready to apply (2026-06-07). Source: `docs/research/prompting/REPORT.md` (rule-by-rule table). These are **surgical edits, not a rewrite** — the doc's philosophy is vindicated.

## Edits
1. **R2 — flip guardrails to POSITIVE framing (TOP PRIORITY).** Keep "constrain, don't proceduralize," but change the *form*: write guardrails as positive affordances/boundaries ("do X" / "stay within Y") rather than prohibitions ("don't do X"). Reserve explicit prohibitions for a small, non-negotiable **safety tier**. Why: negation is followed less reliably even on commercial models (2601.21433); Anthropic's own best-practices agree.
2. **R4 — reframe ">10 MUSTs" as a SMELL, not a threshold.** No empirical anchor; low-ceiling claims were refuted. Real lever: minimize constraints that must hold *simultaneously* (per-instruction competence stays high ~0.85–0.90; joint satisfaction collapses — ManyIFEval).
3. **R3 — mark few-shot as MODEL-DEPENDENT.** Keep "teach the reasoning pattern"; note examples matter more for weaker models / format-alignment, less for frontier reasoning (zero-shot CoT can beat few-shot).
4. **ADD — "Reasoning is not a constraint-guarantee."** CoT can cause the model to neglect its own constraints (2505.11423). The more you trust reasoning, the more you must audit guardrail adherence externally at high stakes. Annotates R6 (CoT-for-orchestrators) and R8 (trust-the-model).
5. **ADD — model-dependence note.** State explicitly that the discipline assumes capable frontier models; flag any frontier-specific guidance.
6. **ADD — directive-PRIORITY / tier pattern.** Borrow the OpenAI Model Spec chain-of-command: rank constraints (safety > correctness > style) so conflicts resolve by priority, not flat enumeration. Addresses the simultaneous-satisfaction failure (R4 / F1).

## Vindicated (no change)
R1 (goal-oriented identity), R5 (no-self-validation/quorum), R7 (structure at boundaries); and the *spirit* of R2/R3/R4/R8.

## Do NOT over-correct
The "reliable ceiling is ~2-3 constraints" and "inverse scaling — bigger models worse at negation" claims were **refuted** — don't slash constraint counts to 2-3, and don't claim frontier models are worse at negation.
