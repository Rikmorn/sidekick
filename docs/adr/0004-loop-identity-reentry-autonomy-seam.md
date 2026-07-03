# ADR-0004 — Loop identity, re-entry, and the autonomy seam

> *Editorial pointer (2026-07-03, body kept as-authored):* EPIC re-baseline 3 renumbered Phase 3 after this ADR was accepted. In this body, `3.5` (operator-dial) is now **`3.6`**, `3.3` (forcing-function) is now **`3.5`**, `3.1` (sizing signal) is now **`3.4`**, and `3.7` (zoo reduction) is now **`3.9`**. Full delta: [`../EPIC.md` crosswalk](../EPIC.md#crosswalk--legacy-e--phaseitem).

**Status:** Accepted (2026-06-18, operator sign-off). **Supersedes ADR-0003's `--auto`-as-a-design-mode** (Decision §5). Executed by EPIC `1.2`; the autonomy driver is *seamed here, built later* (`3.5` operator-dial + `3.3` forcing-function / durable interrupt); relates `5.2` (design-emits-workflow) and `3.7` (eval-gated zoo reduction). Driven by the [2026-06-18 whole-architecture review](../reviews/2026-06-18-architecture-review.md) and a from-evidence loop sanity-check (re-grounded against `../research/`, not its distillation).

## Context

Two seams snapped in the `0.4`/`0.5` reworks, and a step-back review showed they share one root and point at a third, larger decision.

1. **The redesign loop is broken end-to-end** [verified, this session]. `/sk-build`'s redesign prompts route to `/sk-design <slug>`, which the explorer rejects with `slug_collision` — the plan exists *by definition* (we are mid-build on it). `/sk-goal-verify` routes to `/sk-design --resume`, a flag removed in `0.4` and not even in sk-design's "errors clearly" list, so it mis-parses as a topic literally named `--resume`. **The design↔build cycle cannot cycle.**

2. **Plan identity is *demanded* up front and a name collision is a *hard stop*.** The slug is a required positional; `sk-explorer`'s first act is to classify clean-slug-vs-fuzzy-text. This is a best-in-class outlier: comparable systems *derive or assign* the identifier from the task and treat re-entry as the normal case — GSD's phase-number-in-roadmap, Spec Kit's auto-derived `specs/001-<name>/`, LangGraph's `thread_id`, Devin/OpenHands' issue/session id. None turns a name collision into an error. *(The cohort-naming facts are general knowledge; our research corpus is silent on how peers mint identifiers.)*

3. **Autonomy is bolted onto one phase.** `--auto` (ADR-0003) is a per-command mode on `/sk-design` only. The evidence says autonomy is an *operator-dial spanning the loop* — "operator sets the bounds (effort ceiling, token cap, autonomy/risk level); the model adapts within them" (`reasoning-capability` F6) — which **ADR-0001 #4 already named** ("make the loop right-sizeable… the operator-dial") and which the cohort confirms (LangGraph/Devin treat autonomy as a dial with interrupt/resume). ADR-0003 put a stopgap dial *inside* design because the real one (`3.5`) was not built.

**The shared root:** the loop's *identity* and *transitions* were modeled around a user-supplied slug and a one-way pipeline, not around a cyclic, resumable unit of work. Repairing re-entry **is** changing what "an existing plan" means — which is the explorer's contract — which is why the explorer rethink and the loop repair are one decision, not two.

**The governing constraint** (the research through-line, `SYNTHESIS.md`): *the model cannot be trusted to police itself.* Self-confidence is broken as a routing signal — failure-prediction AUROC **62.7% (near-random)**; agentic self-estimates run **73% predicted success against a 35% true rate**. So loop transitions must ride *externalized, sealed* signals, never the orchestrator's introspection. This is what makes a self-routing loop sound rather than a noise amplifier.

## Decision

**1. Identity is a derived output, not a required input.** `/sk-design` opens open-ended (a topic, or a conversation). The slug is *derived* from the dialogue and *confirmed* by the operator, then becomes the stable handle (`.sidekick/plans/<slug>/`, `/sk-build <slug>`, `pins-rfc`, `design(<slug>):` commits). A clean slug supplied up front is still honored as a fast path — but it is no longer the entry contract.

**2. An existing plan is re-entry, not a collision.** `slug_collision`-as-hard-stop is retired. Re-invoking design on an existing plan opens a **redesign dialogue** seeded by what is on disk (RFC/PLAN/RESEARCH + git/build state) and by the triggering signal. The only residual case — an *accidental* name clash (a genuinely new intent matching an existing slug) — is resolved *in the dialogue* ("this plan exists; redesign it or pick another name?"), not by halting.

**3. Redesign re-enters dialogic `/sk-design`, seeded by an externalized trigger, capped.** The redesign loop routes back to the *same* dialogic design — not a flag, not a separate command (fewest boundaries; honors ADR-0003). It is entered on a **sealed, externalized verdict**: `classify-deviation`'s `redesign` route (deterministic CLI) or `sk-goal-verifier`'s HOLLOW/ORPHANED gap — **never** on the orchestrator "deeming" the design wrong. Redesign **appends** to the plan (an `## Redesigns` `R-NN` block in RFC.md; PLAN re-pinned) rather than starting over, and the loop carries a **hard iteration cap + best-so-far checkpoint** — looping-to-a-gate is non-monotonic and can degrade an already-correct result (the inverted-U: GSM-8K 82.2%→87.3%→**70.3%**).

**4. `sk-explorer` dissolves into the dialogue + the kernel; F3 is dropped.** With scoping in the dialogue and collision-as-re-entry, the explorer's three jobs evaporate: fuzzy-vs-slug classification and single-vs-group scoping move into `/sk-design`'s conversation; slug-collision becomes the re-entry route (orchestrator + the existing `.sidekick/plans/` existence check, kernel-side if it must be deterministic); and the `low|medium|high` self-rating (**F3**) is *dropped* — it is exactly the "self-assessed complexity is an unreliable basis for the dial" anti-signal (models overthink trivial input — ~1,953% more tokens on `2+3?`). What survives is at most an **overridable soft prior under an operator-set cap** (F6), never an authoritative gate. Whether the residual repo-grounding role becomes a thin subagent or folds into `sk-pattern-mapper` / the future codebase-map (`4.5`) is an **eval-gated** call deferred to `3.7` (ADR-0001: thin with evidence, not taste). `1.2` repurposes/dissolves in place; it does not merge agents by taste.

**5. Autonomy moves to a cross-cutting dial — seamed now, built later. This supersedes ADR-0003's `--auto`-as-mode.** Design owns *what* to build; *how autonomously* the loop runs is an operator concern spanning every phase. This ADR fixes the **principle** so the future driver stands on clean ground:
- Every phase transition rides an **externalized, sealed gate** (`classify-deviation`, `sk-goal-verifier`) — never self-assessment.
- The autonomy bar **rises across the loop**: auto-design is cheap and reversible (artifacts + a discardable commit); auto-build mutates source → **default-escalate on `irreversible ∧ low-confidence`**, with the strongest gate at the build/commit boundary.
- The driver is **owned**, not delegated to `/goal` — ADR-0002 rejected `/goal`'s fixed same-family Haiku judge on the independence bar.
- Human escalation stays **sparse and actionable** (rubber-stamping degrades verification — it is not a free safety net).

The driver itself is **not built in `1.2`**; it lands with `3.5` + `3.3`. Until then, hands-off design continues to work — the capability *relocates* into the future driver rather than vanishing.

**Explicitly NOT decided here (parked):** the frozen-`PLAN.md`-vs-meta-skeleton question — the loop research calls a frozen object-level DAG the "half-right-wrong-half bet" (static plans overfit their distribution and invert out-of-distribution; emit a thin meta-skeleton with replanning triggers, keep the object dynamic) → relates `5.2`. Decision §3's redesign-as-append loop is a *step toward* it (a revisable plan), not a resolution. Also parked: a mid-phase continuation-doc (`3.3`) and episodic/navigability memory (Phase 4).

## Options considered

**The question:** how should the design↔build loop identify a unit of work and re-enter design when build/verify discovers the design is wrong?

**Re-entry surface:**
- **A — bare `/sk-design <slug>` becomes redesign-aware (chosen).** Existing plan → redesign dialogue; no new flag/command. *Pro:* fewest boundaries; honors ADR-0003 (which removed flags for dialogue); `/sk-build` already points here and `/sk-goal-verify` trivially redirects. *Con:* the bare invocation is overloaded (new vs redesign by existence) — mitigated because the dialogue opens by stating what it found, and identity-as-derived (§1) means "new" rarely arrives as a bare existing-slug.
- **B — explicit `--redesign` flag.** *Pro:* explicit intent, no overload. *Con:* re-adds a flag ADR-0003 deliberately removed; cuts against dialogue-by-default.
- **C — separate `/sk-redesign` command.** *Pro:* clearest separation. *Con:* a 7th orchestrator — most surface, directly against the review's coherence-tax finding and the `3.7` reduction direction.

**Identity:** *derived + confirmed (chosen)* vs *demanded up front (status quo).* The status quo is the best-in-class outlier and the source of the collision-halt; deriving it removes both problems and matches the cohort.

**Autonomy:** *cross-cutting dial, seamed now (chosen)* vs *keep `--auto`-as-design-mode* vs *build the full driver in `1.2`.* The dial is where the evidence, ADR-0001, and the cohort point; building the driver now would balloon `1.2` into a half-built autonomy subsystem crossing the irreversible build boundary before `3.3`/`3.5` exist.

## Consequences

**Positive:**
- The design↔build↔verify loop actually cycles — the central diagnosed defect closes.
- The slug stops being an arbitrary up-front demand and a collision stops being a dead-end; identity matches best-in-class.
- `1.2` *shrinks*: the explorer largely dissolves rather than gaining a bolted-on redesign mode, and F3 falls out for free.
- The autonomy model is set correctly (dial; sealed-gate routing) *before* the driver is built, so `3.3`/`3.5` stand on clean ground.
- Routing-on-sealed-gates is what makes the loop's autonomy *safe to not supervise* — the durable property the SYNTHESIS names.

**Negative / costs:**
- This ADR's scope is larger than the original `1.2` line ("explorer rethink") — the EPIC row is updated to match.
- Overloading the bare `/sk-design` invocation needs careful dialogue UX so an accidental name clash cannot silently start a redesign.
- Superseding `--auto`-as-mode means `/sk-design --auto`'s contract changes when the dial lands (`3.5`) — a future migration, flagged now.
- The reconciliation blast radius is real and must move together (the "rewrites reconcile their blast radius" guard): `sk-explorer`, `/sk-design`, `/sk-build` (its redesign prompts), `/sk-goal-verify` (the `--resume` route), and their dispatch contracts.

## Assumptions (revise the decision if these are wrong)

- **Redesign is rare but load-bearing.** `amend` (an `A-NN` block written in `/sk-build`) absorbs the common small deviations; only *structural* ones (≥2 `D-NN`, a goal change, or a HOLLOW/ORPHANED goal-verify gap) reach design. If redesign proves frequent, the append-and-cap loop needs revisiting.
- **The externalized gates are good-enough routing signals.** `classify-deviation` and `sk-goal-verifier` are sealed/deterministic-ish today; if they prove noisy, that is a `3.1` problem (externalize the sizing/routing signal), not a re-litigation of this ADR.
- **Derive-and-confirm is acceptable UX** versus a typed slug. The clean-slug fast path remains for power users.

## Revisit when

- The operator-dial (`3.5`) or the forcing-function / durable interrupt (`3.3`) lands — finalize the autonomy driver against this seam.
- The frozen-PLAN / meta-skeleton question (`5.2`) is taken up — the redesign-append loop is its first step.
- `3.7` can eval-gate the explorer's residual repo-grounding role (thin subagent vs merge into `sk-pattern-mapper`/`4.5`).
- Re-entry/redesign frequency data (`3.8` observability) contradicts the "rare but load-bearing" assumption.

## Links

[ADR-0001](./0001-harness-shape.md) (right-sizeable loop / operator-dial; eval-gated thinning) · [ADR-0002](./0002-platform-primitives-scoping.md) (own the loop; `/goal` fails the independence bar) · [ADR-0003](./0003-design-interaction-model.md) (dialogue-by-default — this supersedes its `--auto`-as-mode) · research: [`agentic-loops`](../research/agentic-loops/REPORT.md) (self-confidence, non-monotonicity, meta-skeleton), [`reasoning-capability`](../research/reasoning-capability/REPORT.md) (F3/F6 — self-sizing + operator-dial), [`verification-autonomy`](../research/verification-autonomy/REPORT.md) + [`SYNTHESIS`](../research/SYNTHESIS.md) (sealing; the through-line), [`memory`](../research/memory/REPORT.md) / [`context-memory`](../research/context-memory/REPORT.md) (repo-as-context; handoff) · [whole-architecture review](../reviews/2026-06-18-architecture-review.md) (§loop, §best-in-class) · [EPIC `1.2`](../EPIC.md)
