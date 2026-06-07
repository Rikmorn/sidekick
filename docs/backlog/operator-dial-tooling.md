# Backlog (emerging): Operator-dial tooling

**Status:** Emerging / nascent (2026-06-07) — not yet specified. Surfaced by the operator while discussing Reasoning & Capability.

**The idea:** an AI-support layer that connects a human operator to the meta-process *before* the AI tackles a task — letting them "dial some knobs" up front rather than babysitting during. Candidate knobs: research depth, autonomy level (how hands-off), risk tolerance, budget / effort ceiling, escalation thresholds.

**Why it's emerging now** — it's the concrete home for several threads that keep recurring:
- autonomy is *derived per task* from the NFRs the operator expresses (mission north star) — knobs make those NFRs explicit and settable;
- the **dial** problem (how much process per task) can't be left to the model's over-confident self-assessment (see `../research/reasoning-capability/FRAMING.md`);
- **forcing-functions > self-report** (Track B) — knobs are operator-set parameters the AI reasons *within*, not values it self-regulates;
- escalation on irreversible / low-confidence (Track A) is itself one such knob.

**Open before it's real:** what the *right* knobs are; how they're surfaced (the human-AI control-interface question — going to the reasoning-capability research); how each maps to AI behaviour (deterministic enforcement vs. guidance — connects to the prompting thread: guardrail vs. imperative).

**Feeds from / to:** `../research/reasoning-capability/` (operator-in-the-loop sub-question); mission north star (autonomy-as-derived-NFR).
