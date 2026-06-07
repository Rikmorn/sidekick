# Prompting — Framing (pre-research)

*Pre-research hypotheses, captured so they stay separable from the evidence. Discussion 2026-06-07. The `REPORT.md` (same dir, once the run lands) tests/extends these, and reconciles rule-by-rule against the repo's existing discipline.*

## What makes this thread different
The repo already has a mature, battle-tested prompting discipline: **`.claude/rules/sk-agent-prompts.md`** — developed by stumbling into it (the operator notes research would have made it obvious). So this thread *stress-tests an existing artifact* against the literature, rather than starting from scratch. The highest-value output: which rules are **evidence-backed**, which are **stumbled-into heuristics the evidence refines/challenges**, and what's **missing**.

## The operator's thesis (= the doc's thesis)
"Guardrail what we don't want; don't imperatively specify what we want. Emergent behaviour is a feature; only babysit when risky/critical. Imperative specification = writing software with no debugger." Encoded in sk-agent-prompts.md as: goal-oriented identity (not procedures); constitutional constraints (state what NOT to do, leave positive space to reasoning); few-shot-with-reasoning over if/then rules; minimize directive density (>10 strong directives in an orchestrator / >5 in a worker = red flag); trust the model; structure only at boundaries; escalate to structural enforcement when in-prompt rules keep failing.

## How it connects to what we've found
- The prompting-side of the through-line: **proceduralize the META (guardrails/constraints/boundaries), liberate the OBJECT level (reasoning)** — the same coin as "operator sets bounds, model adapts within" (reasoning-capability F6).
- Track C vindicated Rule 7 (reason-then-structure; structure at boundaries) from primary sources.
- Track A vindicated "constraints not procedures" + no-self-validation.

## Where I'd CHALLENGE the thesis (disconfirming angles to hunt)
- **Negative instructions may be unreliable.** "Guardrail what we don't want" leans on prohibitions ("don't do X") — but negative instructions may be followed *less* reliably than positive ones ("don't think of a pink elephant"). If so, guardrails should be positive boundaries/affordances, not prohibitions. Genuine tension inside the thesis — verify.
- **"No debugger" is a real cost, not a quip.** Emergent behaviour is less predictable/auditable — the same observability/CoT-faithfulness problem. The thesis trades debuggability for flexibility; quantify *when* that trade is worth it.
- **">10 MUSTs" is a stumbled-into heuristic.** Validate against real instruction-following-limit research (how many instructions a model reliably follows; degradation with count; conflict/priority).
- **Few-shot in the reasoning-model era.** Examples may matter less now and can bias toward surface features (the doc's own "worked-example accumulation" anti-pattern). When do examples help vs hurt?
- **Model-dependence.** The emergent/constraint-based philosophy likely holds for frontier models (Claude) but not weaker ones — mirrors the format-tax open-vs-closed split. Separate "true for frontier" from "true in general."

## What goes to research
declarative/constraint vs imperative/procedural · negative vs positive instructions · instruction-following limits & directive density · few-shot vs zero-shot for reasoning models · prompt brittleness/sensitivity (the "no debugger" cost) · constitutional/principle-based steering · agent/system-prompt design · durability (is prompt-engineering being absorbed?) · **rule-by-rule evaluation of sk-agent-prompts.md against the evidence.**
