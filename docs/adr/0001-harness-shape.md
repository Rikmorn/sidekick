# ADR-0001 — Harness shape: behavioural-leaning, lifecycle as a thin skeleton

**Status:** Accepted as direction (2026-06-07). *Execution is sequenced and gated on the eval layer (EPIC E13) — see Decision.*

## Context
sidekick is currently **gsd-shaped** (a plan/decide/design/build/review lifecycle + ~23 specialist agents) but **superpowers-souled** (lean, reasoning-led discipline; `sk-agent-prompts.md`). The operator leaned lifecycle originally because *the loop was obvious* (understand → plan → build → verify → loop). gsd was dropped for rigidity / md-sprawl. The open question: reduce surface and go more behavioural (superpowers-style), or keep the middle-of-the-road lifecycle?

Reframing dissolves the binary: the **loop is the meta-process**, and our through-line says *proceduralize the meta* — so an **explicit loop is principle-aligned, not the gsd trap.** The gsd trap is proceduralizing the **object level** (rigid step-lists *inside* phases). So the real axes are (1) what's *inside* each phase — behavioural vs procedural; (2) how *heavy/mandatory* the loop is.

Relevant findings (see `../research/`):
- The lifecycle's artifacts (PLAN/RFC) *are* context-handoff payloads and its phase boundaries *are* isolation points → it delivers context management almost for free (DESIGN-PRINCIPLES #5). Going full-behavioural would forfeit a **legible oversight loop** and **built-in context management** — both load-bearing. (gsd's memory/handoff strength came from its lifecycle artifacts.)
- A *fixed* loop over-applies process to small tasks — over-engineering is **net-negative**, not just wasteful (reasoning F4/F5).
- Durability filter: the loop *skeleton* (gates + handoff artifacts) is durable; the *procedural insides* are the transient, absorbed-by-better-models part (DESIGN-PRINCIPLES #3).
- The ratchet (#4): the better the behavioural layer (prompt/tool improvements), the thinner the skeleton can be.

## Decision
Move **toward behavioural — as a ratchet, not a flip:**
1. **Keep the loop as a thin, explicit, dial-able oversight skeleton** (phases as gates + handoff artifacts). It is the meta; it keeps verify-and-loop-back legible; it carries context management.
2. **Make phase internals behavioural** (lean, reasoning-led, not procedural) — this is EPIC E1/E3.
3. **Reduce surface via the E3 audit**, judging each agent by the *context-headroom-vs-fidelity* test (#5), not by raw count. Verifiers and genuinely context-heavy isolations stay; over-decomposed specialists merge.
4. **Make the loop right-sizeable** — full loop for large/risky work, collapse toward behavioural-only for small (the operator-dial, E11).
5. **Thin the lifecycle further over time** as the behavioural layer proves out (the ratchet).

This is not "middle of the road" — it is `lifecycle-as-meta-skeleton + behavioural-insides + dial`.

**Gate:** scaffolding may only be shed once the **eval layer (E13)** can verify the leaner harness still delivers. The path to "more behavioural" runs *through* eval — otherwise we trade legible-but-heavy for lean-but-unverified, and "it feels lean enough" is exactly the self-assessment the research says not to trust. **Sequence: E1/E3 (lift behavioural layer) + E13 (eval) → measure → then thin with evidence.**

## Consequences
**Positive:** keeps the durable skeleton + legibility + context management; sheds rigidity and right-sizes; aligns with the durability filter; surface shrinks where it doesn't earn its keep.
**Negative / costs:** requires the eval layer *first* (can't safely thin before it); the E3 audit is real work; ongoing discipline needed against rigidity-creep in phase internals (the gsd failure mode). Until E13 exists, this ADR changes *direction and sequencing*, not the current shape.

## Assumptions (revise the decision if these are wrong)
- **Task size:** sidekick's real usage is *often* multi-step/large enough that an explicit loop + handoffs pay for themselves. **If most real tasks are small → lean behavioural harder and faster** (the lifecycle would mostly be over-engineering tax).
- **Legibility matters** (hands-off / auditable operation is a goal).
- **Context stays binding** enough that built-in handoff artifacts earn their keep (partly durable per #5).
- **The behavioural layer's reliability is liftable** by the prompt/tool improvements (E1/E3) — and *measurable* by E13.

## Revisit when
- The eval layer (E13) exists and can measure leaner-harness quality (then execute the thinning).
- The task-size assumption proves wrong (usage data skews small → lean harder).
- Context windows / model self-orchestration improve materially (thin the skeleton further per the ratchet).

## Links
`../DESIGN-PRINCIPLES.md` (#1–#5, #8) · `../research/prior-art.md` (superpowers vs gsd) · `../research/SYNTHESIS.md` · `../EPIC.md` (E1, E3, E11, E13).
