---
id: ops
kind: epic
status: open
implements: [adr-0007]
grounds: [research/knowledge-layer]
---

# ops — the knowledge/visibility layer (ADR-0007 v1)

**Why this epic exists.** The operator's binding constraint is bursty availability; the repo's knowledge is a graph flattened into prose; retrieval is grep-only. ADR-0007 (accepted 2026-07-22) decides the fix: typed text sources, a thin TDD'd compiler to SQLite+FTS5, derived views for both audiences (dashboards for the human, maps + budgeted query for the agent), adoption wiring shipping with every mechanism. **This layer is the explicit confidence gate for sk-* self-use on repo work** — and this epic is the first inhabitant of the `work/` structure it builds.

**Scope guard (first iteration).** Deterministic extraction only — every v1 edge is EXTRACTED from parseable structure; the INFERRED lane (annotations, review queue) gets its machinery but no producers yet. Agent/skill testing + metrics concepts are deliberately out (ADR-0007 Revisit-when): extend the schema after this lands, don't pre-model.

**Items** (specs in this folder; `deps` in frontmatter; each item includes its own adoption wiring per ADR-0007 Decision 8):

| ID | Item | One-line |
|---|---|---|
| ops-1 | North-star reification | `docs/NORTH-STAR.md` — the objective tree, drafted from existing sources, operator-ratified |
| ops-2 | Compiler core | parsers (monoliths + evals + agents + work/) · crosswalk normalization · SQLite+FTS5 build |
| ops-3 | Queries, diff, lint | rollup · coverage · gaps · applies-to · graph-diff-between-commits · vocabulary/size/freshness lint |
| ops-4 | Generated surfaces | `STATE.md` + `MAP.md` generators, committed + drift-checked, size-capped |
| ops-5 | Orient skill + retrieval ordering | `.claude/skills/orient/` + the AGENTS.md map→query→grep directive |
| ops-6 | Human surface | Quarto dashboards: state · coverage · bench trends from records.jsonl |

**Ordering.** ops-1 is independent (operator dialogue; do first or in parallel). ops-2 → ops-3 → ops-4 → ops-5 is the dependency spine. ops-6 needs only ops-3. Sized one-session-per-item; the repo is coherent at every item boundary.

**Done means:** all six items record-class with syntheses; the compiler runs green on the live tree; a cold session (either audience) reaches current state without grep; then two consequences unlock — the eval-metrics schema extension (ADR-0007 Revisit-when) and the sk-* self-use confidence reassessment ([[sidekick-execution-prefs]] item 3's gate).
