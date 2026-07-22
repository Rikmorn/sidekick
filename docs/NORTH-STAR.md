---
kind: north-star
status: living
---

# North star

> *Maximally autonomous, wrapped in an external oversight harness the model can't talk its way out of* — and **adaptive**: the harness shrinks as models self-police better, and the durability filter predicts the order (fast-moving capability artifacts loosen first; slow-moving self-blindnesses keep their guardrails longest). Autonomy is **derived per task** from the non-functional requirements the user expresses (scope of delegation, urgency, blast-radius/reversibility); irreversible actions escalate for approval.
>
> — `docs/research/README.md` §"North star" (reproduced verbatim)

The objectives below are that statement decomposed into addressable entities. Each carries an `ns-*` ID that work items point at, so "where are we on the path" becomes a rollup query instead of a feeling. This tree is **consolidation with IDs, not new strategy**: every objective traces to text that already existed, and each section cites where. **Ratified by the operator 2026-07-22.** Two forks the drafting surfaced — the harness's reach, and visibility's placement — were settled at ratification; each section records its resolution.

---

## ns-oversight-harness — External oversight the model can't talk its way out of

The harness is structure *around* the model, not instruction inside it: it owns the loop (research → design → build → verify), the gates, the verification, and the escalation, and it rents the wording. Its warrant is the through-line across every research track — the model cannot be trusted to police itself: not its correctness, not its confidence or resource state, not its own coordination. So every durable lever is external structure compensating for a specific self-blindness while leaving the reasoning itself free: proceduralize the META, liberate the OBJECT.

**Evidence of progress:** gate-passing is machinery rather than intention — a loop transition that fails its gate is *refused*, not merely discouraged — and the share of transitions riding a real gate rises over time. The standing test ahead: the harness runs its own repo's work — the sk-* self-use gate opens on measured confidence, and once readiness is proven this graduates to a standalone objective (the recursive-improvement loop; operator intent recorded at ratification).

**Sources:** `docs/research/README.md` §"North star", §"The through-line" (incl. the founding-principle blockquote); `docs/EPIC.md` opening north-star blockquote ("oversight harness … owns the loop, the gates, the verification, and the escalation, and *rents* the wording"); `docs/EPIC.md` §Status 2026-07-03 (the harness as built: skills + agents + CLI kernel + tier-0 hook); operator ratification, 2026-07-22 (the self-use evidence line — graduates to an objective on proven readiness).

### ns-independent-verification — Gates that are independent and sealed

A gate is worth exactly what its independence buys. The producer never judges its own work: the verifier is a separate invocation that receives the artifact and the spec, never the producer's draft or reasoning. Independence has a ceiling inside one model family — self-consistent errors cap what an all-same-family quorum can catch — so the highest-stakes verification eventually routes across families. What the gate checks includes *constraint-adherence*, because reasoning itself degrades constraint-following.

**Evidence of progress:** every producer→verifier path is sealed by construction (read-only verifier tooling; artifact-plus-spec inputs), checks run against actual state rather than the producer's self-report, and a non-Anthropic verifier is reachable for the gates that warrant one.

**Sources:** `docs/research/ACTION-PLAN.md` §Tier 1b item 7 (CoVe-style, verifier doesn't see the draft; audit constraint-adherence at high stakes; reuse the no-self-validation quorum), §Tier 2 (cross-family quorum, scoped to high-stakes/irreversible); `docs/research/README.md` §"The through-line" (the model can't police its own correctness), §"Completed research" Track A row (independence > verification; cross-family quorum *capped* by self-consistent errors); `docs/EPIC.md` §Phase 3 intro ("quorum" as a named prerequisite).

### ns-calibrated-gates — Gates bind on measurement, not on taste

A gate nobody has measured is an opinion holding a veto. Judgment-based verifiers enter *advisory* and acquire binding force only through independent calibration; kernel invariants that are deterministic need no such licence. The same measurement layer is what makes the durability question answerable at all — without it, "is this scaffold still paying for itself?" has no evidence behind it.

**Evidence of progress:** verifiers graduate advisory → binding through recorded measurement rather than assertion, and for any binding gate you can name the calibration standing behind it.

**Sources:** `docs/EPIC.md` §Phase 3 intro (the "rubric + quorum + dials" prerequisites; eval as the pulled-forward keystone); `docs/EPIC.md` §Status 2026-07-03 (a verifier graduated via a hash-pinned calibration certificate with resolve-time binding validation).

## ns-derived-autonomy — Autonomy derived per task, bounded by the operator

Autonomy is not a global setting. It is derived per task from the non-functional requirements the user expresses — scope of delegation, urgency, blast-radius and reversibility — with irreversible actions escalating for approval. The operator sets the bounds (effort, autonomy, risk, budget) *before* the work and the model adapts within them. The standing difficulty is that the routing signal cannot come from the model's own confidence: self-reported success is badly miscalibrated (~73% predicted vs ~35% true), yet the whole when-to-loop / how-big-a-leaf decision currently rides on it.

**Evidence of progress:** a task's autonomy level is traceable to stated NFRs rather than to a default; irreversible operations escalate by construction; the operator's knobs are set up front rather than negotiated mid-run; and the sizing/routing signal comes from outside the model's self-report.

**Sources:** `docs/research/README.md` §"North star" (derived-per-task from NFRs; irreversible actions escalate), §"Live problem-space map" (Emerging requirement: operator-dial tooling; "Externalize the sizing/routing signal" — the miscalibration figures and *the single highest-value follow-up* framing); `docs/research/ACTION-PLAN.md` §Tier 2 (operator-dial: operator sets bounds, model adapts within); `docs/EPIC.md` §Phase 3 intro ("dials").

## ns-adaptive-harness — The harness shrinks as the models improve

The harness is not meant to be permanent scaffolding. The durability filter sorts every element: external structure compensating for a slow-moving self-blindness keeps its guardrails longest; hand-built programs that substitute for reasoning are absorption candidates and loosen first. Build the oversight harness; rent the wording. And because a scaffold can flip from net-positive to net-negative *silently* across a single model generation, this is a standing instrumented check, not a one-time sort — the ambition is a harness that gets *more* reliable as the models improve, rather than one that becomes a tax on them.

**Evidence of progress:** elements carry a durability classification that is re-run per model generation; there is a *mechanism* that detects a structural element crossing zero (not just an intention to notice); and scaffolding actually gets retired when it does.

**Sources:** `docs/research/README.md` §"North star" (adaptive; the filter predicts the loosening order), §"Durability filter" (durable vs at-risk; the IN-REPO / HARNESS-CONFIG / MODEL-PROVIDER buckets), §"Live problem-space map" ("Instrument sidekick's own gates for absorption/inversion" — detect the crossing rather than assume durability); `docs/research/ACTION-PLAN.md` §"Cross-cutting durability note" (build the harness, rent the wording; the transient list); `docs/EPIC.md` opening north-star blockquote (more reliable as models improve, not a tax).

## ns-project-visibility — The project's own state is retrievable, not reconstructed

The body of work should be usable without trudging through markdown: a navigability layer over a token-level corpus, so what is known, what is open, what changed, and where we are on the path are *retrieved* rather than reconstructed from scratch each session. This is the observability finding applied to the project itself — observability is a property of the corpus's *form* (token-level text plus a navigation layer), not of a different store.

**Evidence of progress:** state, coverage, and "what changed since I was last here" are answerable without grep archaeology, and a cold session reaches current state through the layer rather than through re-reading the corpus.

**Placement — settled at ratification (2026-07-22): leading.** The sources disagreed: `ACTION-PLAN.md` §Tier 2 calls this "the **#1 daily-pain fix** … **Recommended first *real* build**", while `EPIC.md` §Phase 4 filed navigation in a phase hard-gated behind `3.2`+`3.3`. Ratified as leading — ADR-0007 pulled the navigation mechanisms forward precisely because they avoid the unsolved memory frontier that motivated the Phase-4 gate; the *memory* half of Phase 4 stays gated as before.

**Sources:** `docs/research/README.md` §"What this is" (the parenthetical: a navigability layer over a token-level corpus so the work doesn't require "trudging through markdown"), §"Live problem-space map" (Navigability/observability layer over markdown); `docs/research/ACTION-PLAN.md` §Tier 2 (Navigability layer over markdown memory), §"What changed since the first (A/B/C-only) tiers" (observability = a navigability layer over a token-level form); `docs/EPIC.md` §Phase 4 intro.

## ns-durable-memory — Memory that persists across sessions, gated and operator-owned

Episodic memory — cross-session "what happened" — is the acknowledged gap; what exists today is semantic and procedural. Writes need selective formation (keep what has future utility), reconcile-not-append, an independent check before anything persists, and the standing invariant that memory is user-editable but never *silently* agent-editable. The bar is evidence rather than enthusiasm: engineered memory can underperform plain long context, and the substrate question stays deliberately open until the requirements above are settled.

**Evidence of progress:** a session recovers what happened previously without the operator re-narrating it; every memory write passes an independent gate; agent-made changes to memory are visible to the operator; and the substrate, when chosen, is chosen on measurement rather than pre-picked.

**Sources:** `docs/research/ACTION-PLAN.md` §"What changed since the first (A/B/C-only) tiers" (Memory: episodic is the gap; selective-formation, reconcile-not-append, user-editable-but-not-silently-agent-editable), §Tier 1b item 5 (validate-before-persist gate), §Tier 3 (episodic/session memory; substrate — do NOT pre-pick); `docs/EPIC.md` §Phase 4 intro (engineered memory underperforms naive long-context ~40%; user-editable, never silently agent-editable).

## ns-state-of-the-art — Track the frontier; ground every lever in evidence

Half the mission is tracking the state of the art in AI-as-assistant. That means a live research program rather than a finished one: a map that names what is known, what is still open, and what must be researched *before* it can be built — so levers are adopted because a run found them durable, not because they sound right, and open threads stay visible instead of quietly lost.

**Evidence of progress:** the open-thread map is current; named threads close into reports; build items cite the research that justifies them; and the research-before-build gates hold — nothing ships against a question the map still calls unresolved.

**Sources:** `docs/research/README.md` §"What this is" (clause (a): track the state of the art in AI-as-assistant), §"Live problem-space map" (the open-thread inventory and its "candidate track" statuses); `docs/research/ACTION-PLAN.md` §"Open research BEFORE certain builds".

## ns-any-domain — Capability for work in any domain

The horizon is every domain; engineering is simply where the loop is cheapest to close. Drafting surfaced a genuine fork between the two committed statements of purpose — research/README's "capability for work in ***any* domain**" versus EPIC's "oversight harness **for AI-assisted engineering**" — and ratification settled it: the broader reading is the objective, and the narrower one is its first proving ground, retained in the EPIC deliberately. In the operator's words, **the goal is informed autonomy with automated loops** — and nothing in that formulation is engineering-specific: the harness's structure (loops, gates, verification, escalation) is domain-independent even while every current instance is code-shaped.

**Evidence of progress:** staged. Near — the harness holds on repos it wasn't built in, with gates generated for the target rather than inherited from this one. Far — a non-engineering task carried end-to-end without engineering-shaped assumptions.

**Sources:** `docs/research/README.md` §"What this is"; `docs/EPIC.md` opening north-star blockquote (the engineering-era statement, retained deliberately); operator ratification, 2026-07-22 ("north star is everything, engineering is just simpler; informed autonomy with automated loops is the goal").
