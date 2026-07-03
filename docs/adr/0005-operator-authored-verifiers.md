# ADR-0005 — Operator-authored verifiers: quorum membership as configuration

> *Editorial pointer (2026-07-03, body kept as-authored):* EPIC re-baseline 3 renumbered Phase 3 after this ADR was accepted. In this body, `3.9` (the seam) is now **`3.1`**, `3.4` (eval keystone) is now **`3.3`**, `3.6` (cross-family) is now **`3.7`**, and `3.7` (zoo) is now **`3.9`**. Full delta: [`../EPIC.md` crosswalk](../EPIC.md#crosswalk--legacy-e--phaseitem).

**Status:** Accepted (2026-07-02, operator sign-off). Extends Rule 5's dimensional-verifier doctrine (`.claude/rules/sk-agent-prompts.md`) and ADR-0004's sealed-gate principle to an *operator-facing* surface. Carves the seam out of EPIC `5.1` into the new **`3.9`**; **subsumes the bundled UI-audit layer** (the never-built `/sk-ui-audit` + 6 pillar specialists — the original master spec's "7th command") — UI dimensions become an authored *example pack*, never bundled commands. Relates `3.2` / `3.4` / `3.6` / `3.7`.

## Context

1. **The ui-audit gap sat unresolved.** The original master spec listed 7 commands; 6 exist. The repo has since refocused generic (any consuming project, any stack), and UI quality checks are inherently project-specific — a bundled colour/typography/spacing auditor encodes one project's taste as everyone's gate. The gap was homed in backlog, unscheduled, with `/sk-review` noting "UI dimensions are not built yet."

2. **Quorum membership is prose, not data** [verified 2026-07-02]. `/sk-review` hardcodes its dimension auto-selection; `/sk-design`'s RFC/PLAN quorums and `/sk-decide`'s decision quorum name their members inline; the kernel (`config.ts`) has no verifier surface. An operator cannot add a dimension without editing shipped skill files.

3. **EPIC `5.1` bundles two separable capabilities.** The *plumbing* (a verifier contract, membership-as-config, an authoring discipline) and the *generative* capability (LLM-generated gates that bind). Only the second has a research blocker (calibration, hence the `3.4` dep). Keeping them fused means the seam ships untested, at the same moment as the riskiest capability that stands on it.

4. **The research is directional, and the direction is specific:**
   - **Configurable per-project gates are supported.** [`enforcement-surface`](../research/enforcement-surface/REPORT.md): "Generated enforcement skill: **viable**," with three structural requirements — independent calibration before a gate binds (F9), intent-anchored regeneration on drift (F7), anti-mock + integration dimensions (F8) — and the value thesis that the platform supplies enforcement *mounting points*, not the per-project surface: "that layer is sidekick's."
   - **Uncalibrated judgment gates are not.** [`verification-autonomy`](../research/verification-autonomy/REPORT.md) *refuted* rubric-based verification as a substantiated verifier-manufacturing lever ("do not lean on rubric scores as a gate without our own validation"); findings 6–7: agreement ≠ correctness, and cross-model agreement degrades precisely on abstract/judgment outputs. [`agentic-loops`](../research/agentic-loops/REPORT.md) marks rubric/checklist gates for fuzzy goals **at-risk** (gamed via presence-based items) and names the fuzzy-goal gate gap: taste has no cheap sound gate short of a human.
   - **A blueprint exists.** [`prior-art`](../research/prior-art.md): gsd's `eval-planner` manufactures eval dimensions per system-type with Code / LLM-judge / Human measurement tiering — the shape of "help the operator author dimensions," minus sealing and cross-family.

**The tension this ADR resolves:** it is not configurability the research contests — it is letting operator-authored *judgment* verifiers **bind** (block a quorum) without calibration. Separate the seam from the authority.

## Decision

**1. Quorum membership becomes data, not prose.** A verifier **registry** the orchestrators load: bundled dimensions are the defaults; operator entries extend them. Candidate home is `.sidekick/config.json` — deliberately, because the `0.5` config-guard hook already tier-0-denies agent writes there, so the registry inherits tamper-resistance for free. Final mechanics (schema, selection metadata such as fire-on conditions) are `3.9` implementation calls.

**2. A verifier contract makes "dimension" a first-class shape.** Dimensional identity (named for what it checks, per Rule 5); deliverable = ONE JSON object in a final fence; read-only tooling; an **`advisory | binding`** tier; a **model/family field** — seamed now so `3.6` (cross-family quorum) mounts here instead of forking the machinery. This codifies the contract the bundled reviewers already follow de facto.

**3. Advisory by default; binding is graduated, never asserted.** Deterministic checks may bind immediately (they are sound). Judgment (LLM-judge) verifiers enter *advisory* and graduate to *binding* only through independent calibration on the `3.4` eval harness (F9: a gate graduates before it binds). **Kernel invariant checkers are non-displaceable** — the structural/crossref dimensions guard artifact integrity the kernel depends on (pins-rfc, dependency-graph acyclicity); operator quorums are strictly *additive*.

**4. An authoring skill, not just a schema.** A verifier-authoring skill (working name `sk-write-verifier`; final name at `3.9`) walks the operator through producing a conforming verifier — embodying the sk-agent-prompts discipline (goal-oriented identity, constraints-not-workflows, density-as-smell) so operator-authored prompts don't reintroduce the state-machine anti-patterns the discipline exists to prevent. Authoring a real verifier end-to-end through the skill **is** the seam's acceptance test.

**5. The bundled UI-audit layer is not built — the gap closes by decision.** UI dimensions ship as the authoring skill's worked **example pack** (project-taste verifiers an operator instantiates and tunes), and per the fuzzy-gate research, taste dimensions stay **advisory** — surfacing findings, never hard-failing a quorum on their own authority.

**Explicitly NOT decided here (stays `5.1`):** LLM-*generated* gates — analyse-project→generate-verifiers, intent-anchored regeneration on drift, and the full calibration loop that lets a generated gate bind. `5.1` narrows to exactly that and gains `3.9` as a dependency.

## Options considered

**The question:** how do project-specific quality dimensions (UI being the motivating case) get checked by the harness?

- **A — Build the bundled UI-audit layer** (the spec's 7th command: orchestrator + 6 pillar specialists). *Pro:* closes the gap as originally specified; gsd-ui-review as prior art. *Con:* six taste-gates would be unsound by our own research (fuzzy-gate gap; rubric refutation); encodes one project's taste in a now-generic harness; +7 agents runs straight into the `3.7` coherence-tax finding.
- **B — Operator-authored verifiers: contract + registry + authoring skill (chosen).** *Pro:* research-supported (enforcement-surface D1: this layer is exactly ours to build); dissolves the UI gap into an instance of a general capability; gives `3.2`/`3.6`/`5.1` the mounting points they each independently need; passes the durability filter (own the gates, rent the wording). *Con:* real blast radius (every quorum-hardcoding orchestrator); a new operator-facing concept (the tier model) to document.
- **C — Defer everything to `5.1` as scheduled.** *Pro:* no roadmap change. *Con:* the seam has no research blocker and `5.1` needs it anyway — deferring means the plumbing first ships fused to the riskiest capability, and the UI gap stays open indefinitely.

**Binding model:** *advisory-by-default with calibration-graduation (chosen)* vs *everything-advisory* (toothless — deterministic checks are sound and should bind) vs *operator-chooses-freely* (leans the harness's authority on the refuted rubric-gate lever).

## Consequences

**Positive:**
- The ui-audit gap — the toolchain's last named functional gap — closes by decision rather than by building six unsound gates.
- `5.1` will land on a seam that already exists and has been exercised, instead of inventing its own plumbing.
- `3.2` consumes the registry (same quorum machinery, one implementation — which Phase 4's memory write-gate then reuses); `3.6` gets its family field; `3.7`'s merge/retire becomes a registry data edit.
- Consumers get the genuinely differentiating capability: their *own* quality dimensions enforced by the harness's sealed quorum machinery.

**Negative / costs:**
- The reconciliation blast radius must move together (per the "rewrites reconcile their blast radius" guard): `/sk-review`'s dimension selection + its "UI dimensions are not built yet" note, `/sk-design`'s and `/sk-decide`'s quorum prose, and the standing coherence checks ("named verifier resolves against the live orchestrator" must learn what *resolves* means against a registry).
- A new consumer-facing config surface that can be misconfigured — the registry needs kernel-side validation (a `config` CLI concern), not prose hope.
- Prompt-defined verifiers as gates are an **unstudied class** — enforcement-surface's generated-gates evidence is tests-only; drift/decay behaviour of prompt gates is unknown (its open question #1). Advisory-first bounds this risk but does not remove it.

## Assumptions (revise the decision if these are wrong)

- **Human-authored verifiers may run advisory without calibration.** F9's calibration requirement is enforced only at the *binding* boundary; an advisory finding routed to a human is escalation, not enforcement. If advisory findings turn out to drive action as if binding (automation bias / rubber-stamping), the tier model needs rework.
- **The existing quorum machinery generalises.** Parallel dispatch + JSON extraction + verdict aggregation work over registry-loaded members without per-dimension special-casing; `/sk-review`'s auto-selection logic is expressible as registry metadata. If dimensions turn out to need bespoke orchestrator logic, the registry is the wrong abstraction.
- **Single-user proportionality.** Config-guard + hash-pin drift-checking is proportionate sealing for a single-operator harness; adversarial/multi-tenant sealing (CI-side gates outside the agent's write surface entirely) is not required. Enforcement-surface F3 says revisit this if the harness ever runs unattended at scale.
- **Taste has no sound autonomous gate** (the fuzzy-goal gap). If later research finds one, the advisory ceiling on taste dimensions can be lifted — the tier field already exists.

## Revisit when

- **`3.4` lands** — define the concrete graduation procedure (calibration cases, thresholds, who signs off advisory→binding).
- **`3.6` picks the non-Anthropic family** — the contract's family field gets its first real consumer.
- **`3.7` runs** — zoo reduction should execute as registry edits; if it can't, the registry missed its own use-case.
- **Evidence on prompt-defined gate drift arrives** (enforcement-surface open Q1) — may change the regeneration/re-calibration cadence.
- **Quorum bloat appears** — a consumer authoring many verifiers makes latency/cost per review real; selection heuristics or caps become a design question (`3.8` cost data informs).

## Links

[ADR-0001](./0001-harness-shape.md) (eval-gated thinning; the dial) · [ADR-0002](./0002-platform-primitives-scoping.md) (own the loop/gates; enforcement mounting points) · [ADR-0004](./0004-loop-identity-reentry-autonomy-seam.md) (sealed externalized gates) · Rule 5, [`sk-agent-prompts.md`](../../.claude/rules/sk-agent-prompts.md) (dimensional verifiers; producer≠verifier) · research: [`enforcement-surface`](../research/enforcement-surface/REPORT.md) (F7–F9; D1 value thesis), [`verification-autonomy`](../research/verification-autonomy/REPORT.md) (rubric refutation; findings 6–7), [`agentic-loops`](../research/agentic-loops/REPORT.md) (fuzzy-goal gate gap; rubric gates at-risk), [`prior-art`](../research/prior-art.md) (gsd eval-planner) · [EPIC `3.9` / `5.1`](../EPIC.md)
