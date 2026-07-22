---
id: ops-1
epic: ops
kind: item
status: open
deps: []
implements: [adr-0007]
---

# ops-1 — North-star reification

**Goal.** `docs/NORTH-STAR.md`: the objective tree as addressable entities — the north-star statement decomposed into named objectives (`ns-*` IDs) that work items can carry `implements`/`grounds` edges to, making "where are we on the path" a rollup query instead of a feeling.

**Spec.**
- Draft from the three places the decomposition currently lives smeared: the research README's north-star paragraph, `docs/research/ACTION-PLAN.md`, and the EPIC phase intros. This is *consolidation with IDs*, not new strategy.
- Shape: the statement itself, then a shallow tree (aim: 2 levels, single-digit leaf count — this is a steering artifact, not a WBS). Each objective: `ns-<slug>` ID, one-paragraph meaning, what evidence-of-progress looks like.
- Lifecycle: **living**, root steering doc. Operator ratifies before it lands — the objectives are theirs, the drafting is not.
- Adoption wiring (Decision 8): existing epic files gain `advances: [ns-*]` frontmatter; the ops epic itself gets its edge.

**Constraints.** No invented objectives — everything traces to an existing source (cite in the draft, drop citations on ratification if noise). If drafting surfaces a genuine strategic fork the sources don't settle, stop and put it to the operator rather than smoothing it over.
