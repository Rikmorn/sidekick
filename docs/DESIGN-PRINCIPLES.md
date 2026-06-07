# Design Principles — sidekick

*Distilled from the research program ([`research/`](./research/README.md)). This is **doctrine** — the durable decision-rules for how the harness is built, above any specific agent/skill. Each is a decision rule, not a spec. Companion to `research/SYNTHESIS.md` (the analysis), `EPIC.md` (the work), and `research/ACTION-PLAN.md` (the tiers).*

1. **Proceduralize the meta, liberate the object.** Trust the reasoning engine to do the *work*; build external scaffolding only for *oversight* (verification, resource-governance, coordination) — because the model cannot reliably police itself: not its correctness, confidence, context, or coordination. *(SYNTHESIS — the through-line.)*

2. **Structure ≠ rigidity.** The oversight functions must *exist*, but built **lean** — lightweight scaffolding that leverages reasoning, never procedural prompts / state-machines / pipelines. Keep the superpowers soul; watch the gsd shape. *(prior-art.)*

3. **Build the oversight harness; rent the wording.** Durable: constraint / structure / verification design. Transient (absorbed by stronger models + auto-optimizers): prompt wording, hand-tuned few-shot, specific numeric thresholds. Don't over-invest in the transient. *(prompting; durability filter.)*

4. **The harness is a ratchet.** Oversight shrinks as models self-police better; the durability filter predicts the order (capability artifacts loosen first, self-blindnesses last). Design scaffolding — *including the specialist zoo* — so it can be **merged/retired** as context + capability improve. Don't hard-wire today's-limits shape. *(reasoning F6; prior-art.)*

5. **Context management is the architecture driver — a tradeoff, not a blind optimization.** Finite, *degrading* context is *why* the harness has a specialist zoo, handoffs, and a memory layer — one problem, three faces.
   - **Isolation (the zoo) and handoff (compaction) pay the same tax.** Finite context forces a fidelity cost *somewhere* — at the subagent boundary (isolate → lossy return) or at the compaction boundary (hand off → lossy summary). The design choice is *where* to pay it.
   - **Each isolation boundary is a tradeoff:** it buys fresh context budget + focused attention, and costs handoff fidelity (the DPI lossy-channel result; ~37% of multi-agent failures are inter-agent misalignment). Justified when the boundary **buys more context-headroom than it costs fidelity** (e.g. a verbose, self-contained reviewer returning a verdict) — *not* when the orchestrator needs to reason *with* the detail.
   - **Isolation only *delays* the orchestrator's own fill** — strategic handoff is still mandatory on top of it.
   - **→ Candidate operator knob (E10):** bias the isolation↔handoff balance per task (fidelity-first vs context-budget-first). *(Track B; Track C / DPI.)*

6. **Verification needs independence; escalation on the irreversible is structural.** Producer ≠ verifier; cross-family where stakes warrant; human escalation is a load-bearing safety primitive, not a failure of autonomy. *(Track A.)*

7. **Guardrails as positive boundaries; reasoning is not a constraint-guarantee.** Frame guardrails as affordances; reserve prohibitions for a safety tier; audit guardrail adherence externally at high stakes (reasoning can drop constraints). *(prompting.)*

8. **Research/frame first — but guard both ends of the dial.** An always-on cheap framing pass sets depth within operator bounds; over-application of process is net-negative, not just wasteful. *(reasoning F4/F5.)*

9. **Autonomy is derived per task** from the non-functional requirements the operator expresses (scope / urgency / blast-radius), within operator-set bounds the model adapts inside — not a global on/off. *(SYNTHESIS; reasoning F6.)*
