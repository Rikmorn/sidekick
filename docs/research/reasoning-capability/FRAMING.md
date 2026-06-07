# Reasoning & Capability — Framing (pre-research)

*Our reasoning before the deep-research run, captured so the hypotheses stay separable from the evidence. Discussion 2026-06-07. The `REPORT.md` (same dir, once the run lands) tests/extends these.*

## The question
Why are AI discussions about a problem/solution shallow by default, but sharp once guided to research — to the point the solution often becomes obvious — yet the AI doesn't *default* to that? Reasoning flaw, over-confidence, or budgeting?

## Our scored answer (grounded in Tracks A/B)
- **Over-confidence: yes, and measured.** Track B (verified): LLMs are systematically over-optimistic about their own success and can't accurately self-monitor. The model skips research because it over-estimates that it already knows enough.
- **Budgeting: mostly a myth (in the deliberate sense).** Track B: models are bad at estimating their own remaining budget, so it isn't conscious token-conservation. What *looks* like budgeting is a trained **helpfulness/directness prior** (instruction-tuning rewards immediate, responsive-looking answers). [general knowledge, not verified this session]
- **Reasoning flaw: no.** The engine runs the flow well *when prompted* (this session is the proof). It's a **meta-cognitive / initiative gap** — the model doesn't self-*trigger* the meta-process. Consistent with the through-line (the model can't police itself).

**Consequence:** the fix is not "tell it to research more" (self-report doesn't drive behaviour — Track B). It's **structural** — make the framing/research pass a default forcing-function.

## The universal problem-solving flow (operator's model — endorsed)
understand/research the problem → decompose → research the chunks → plan → build → verify → done, or loop back to plan. Domain-general: code; "buy shoes" (→ check tools → escalate); "buy a house" (→ surface needs → maybe spawn a tracker sub-project). Scaled by complexity + available tooling.

## The real hard part: the DIAL (our key refinement)
The flow isn't hard; *how much* of it to apply is. And "skip based on **perceived complexity**" inherits the over-confidence bug — the model misjudges complexity and under-applies process. **Resolution:** don't let the model pre-judge depth from the armchair. Make the **cheap framing pass always-on**, and let *that pass* (now grounded, not over-confident) set the depth. Default to framing; justify *skipping*, not *adding* — mirrors the safety default (treat as needing-process until established otherwise).

## Decision trace: necessary for hands-off, with a trap
"Prove why A not B, all the way down" is the auditability primitive that makes hands-off trust possible — the analog of the memory **observability** finding. **Trap:** chain-of-thought *faithfulness* — the stated reason is often post-hoc rationalization, not the real cause [recollection: Turpin et al.; Anthropic CoT-faithfulness work — to verify in research]. A confident-but-unfaithful trace is *worse* than none for a hands-off operator. Requirement = a **faithful, verifiable** trace (loops back to Track A independence), not merely a present one.

## Connections
Ties together over-optimism (B), capability-gap awareness + escalation (shoes), self-extension (house → build-a-tracker), and verification (A: can't verify what you never framed). The spine connecting prior tracks, not a new island.

## Emerging requirement (noted by operator)
A faint AI-support-tooling requirement: let a human operator **dial knobs** (research depth, autonomy level, risk tolerance, budget) *before* the AI tackles a task — the meta-process configured up front rather than babysat during. → `../../backlog/operator-dial-tooling.md`.

## What goes to research (genuinely open parts; do NOT re-derive B's over-optimism)
initiative/defaulting gap · reasoning-models / test-time-compute effect · meta-reasoning / effort-calibration (the dial) · decomposition & planning methods · CoT faithfulness · capability self-knowledge & escalation · operator-in-the-loop control interfaces.
