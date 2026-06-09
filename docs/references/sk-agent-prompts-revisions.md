# sk-agent-prompts.md revisions — shipped spec (E1)

**Status:** Shipped — applied in E1 (2026-06-09, commits `3c5a340` + `d972545`). Promoted here from `docs/backlog/` as the provenance record for the change. The sk-* prompt itself is kept citation-free (it's machine context), so the sources below live here, not in the rule. Source: `docs/research/prompting/REPORT.md` (rule-by-rule table). These were **surgical edits, not a rewrite** — the doc's philosophy is vindicated.

## Edits
1. **R2 — flip guardrails to POSITIVE framing (TOP PRIORITY).** Keep "constrain, don't proceduralize," but change the *form*: write guardrails as positive affordances/boundaries ("do X" / "stay within Y") rather than prohibitions ("don't do X"). Reserve explicit prohibitions for a small, non-negotiable **safety tier**. Why: negation is followed less reliably even on commercial models (2601.21433); Anthropic's own best-practices agree.
2. **R4 — reframe ">10 MUSTs" as a SMELL, not a threshold.** No empirical anchor; low-ceiling claims were refuted. Real lever: minimize constraints that must hold *simultaneously* (per-instruction competence stays high ~0.85–0.90; joint satisfaction collapses — ManyIFEval).
3. **R3 — mark few-shot as MODEL-DEPENDENT.** Keep "teach the reasoning pattern"; note examples matter more for weaker models / format-alignment, less for frontier reasoning (zero-shot CoT can beat few-shot).
4. **ADD — "Reasoning is not a constraint-guarantee."** CoT can cause the model to neglect its own constraints (2505.11423). The more you trust reasoning, the more you must audit guardrail adherence externally at high stakes. Annotates R6 (CoT-for-orchestrators) and R8 (trust-the-model).
5. **ADD — model-dependence note.** State explicitly that the discipline assumes capable frontier models; flag any frontier-specific guidance.
6. **ADD — directive-PRIORITY / tier pattern.** Borrow the OpenAI Model Spec chain-of-command: rank constraints (safety > correctness > style) so conflicts resolve by priority, not flat enumeration. Addresses the simultaneous-satisfaction failure (R4 / F1).
7. **STRENGTHEN R5 — promote no-self-validation from a stylistic rule to an *evidenced invariant*** (source: `docs/research/agentic-loops/REPORT.md`). The agentic-loops research makes R5 load-bearing: self-verification is **net-NEGATIVE** (Stechly/Valmeekam/Kambhampati — self-critique causes "significant performance collapse"; a *sound external verifier* recovers the gains), and the **generation-verification gap WIDENS with model scale** (Song, "Mind the Gap"), so the lever grows as models improve. State it as: *the gate must be a **different invocation** than the producer*, and **seal the gate from the producer's context** (reward-hacking scales with capability + visibility — METR). Keep R5's quorum guidance.

## Vindicated (no change)
R1 (goal-oriented identity), R7 (structure at boundaries); and the *spirit* of R2/R3/R4/R8. **(R5 moved up to edit #7 — now strengthened, not merely vindicated.)**

## Do NOT over-correct
The "reliable ceiling is ~2-3 constraints" and "inverse scaling — bigger models worse at negation" claims were **refuted** — don't slash constraint counts to 2-3, and don't claim frontier models are worse at negation.
