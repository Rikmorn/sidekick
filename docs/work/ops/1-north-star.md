---
id: ops-1
epic: ops
kind: item
status: done
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

---

## Completion synthesis (2026-07-22)

Executed via the model-split workflow: a separate Opus process ran the locked enclave plan (cited by name: `2026-07-22-ops-1-north-star.md` + its run report) and delivered draft + wiring uncommitted; this session verified independently (footprint, verbatim-statement check, both fork sources re-pulled raw, vocabulary grep) and the operator ratified.

**Outcome.** `docs/NORTH-STAR.md` landed: statement byte-verbatim from research/README, 9 sections / 8 leaves / depth 2, every objective sourced, `Sources:` lines kept (they become EXTRACTED edges). Epic wiring: `ops` advances `ns-project-visibility` + `ns-adaptive-harness` (the second operator-added at ratification — the bench-trend surface is that objective's absorption instrument).

**Forks surfaced by drafting, settled at ratification.** (1) *Harness reach* — any-domain is the horizon, engineering the simpler proving ground; EPIC's narrower blockquote retained deliberately; operator's formulation of the goal: **"informed autonomy with automated loops."** (2) *Visibility placement* — **leading** (ADR-0007 had already pulled the navigation mechanisms forward; the Phase-4 gate's rationale was the memory frontier, which this layer avoids; the memory half stays gated).

**sk-\* self-use** — folded as an evidence line on `ns-oversight-harness`, with recorded operator intent: it graduates to a standalone objective (the recursive-improvement loop) once readiness is proven.

**Deviations** (from the run report; all reviewed and accepted): two source-scope stretches onto committed text (EPIC's line-3 blockquote; research README's Track-A row) — both load-bearing for fork honesty; a fork-dependent evidence line pre-ratification; one orientation paragraph beyond D1's letter. One executor finding was corrected during verification: ADR-0007's D1 vocabulary was *self-inconsistent* (the executor's "ops-2 lint will reject" framing was wrong — the ops-2 spec already carried the extended list); D1 reconciled in the ratification commit.

**Commits.** The ratification commit landing this synthesis alongside `NORTH-STAR.md`, the epic edge, and the D1 reconciliation.
