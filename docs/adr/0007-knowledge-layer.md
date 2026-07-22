# ADR-0007 — Project knowledge layer: glue-with-thin-build over typed text, generated rich views

**Status:** Proposed (2026-07-22, from the knowledge-layer research pass; operator acceptance pending). Grounds the visibility/ops track that gates sk-* self-use confidence. Partially subsumes the *mechanism* halves of EPIC `4.1` (navigability), `3.8` (observability rendering), and `4.5` (cached codebase-map — pulled forward as the agent-facing map, Decision 7) — those items narrow to their residues when this is accepted. Research: [`../research/knowledge-layer/REPORT.md`](../research/knowledge-layer/REPORT.md).

## Context

The operator's binding constraint is bursty availability: weeks between sessions, expensive context re-acquisition, retrieval by grep only. The repo's knowledge — north star → objectives → EPIC items → ADRs → research → agents/skills → eval suites → runs — is a graph flattened into prose; `EPIC-STATE.md` and `docs/research/README.md` are hand-maintained materialized views; eval-run jsonl records carry no schema-of-meaning. The operator additionally judged raw markdown a poor human surface ("great for you, not great for me") and set the coverage-report lens: generated, never-authored rich HTML over machine data as the primary human view. sk-* self-use for repo work is parked until this visibility exists.

A four-leg research pass (repo grounding · gsd-graphify code inspection · dual-audience substrate survey · adversarially-verified landscape workflow, 103 agents) found: no tool rents whole; the glue substrate is empirically validated; the corpus already contains its own edge vocabulary and enough existing structure to bootstrap without migration.

## Decision

1. **Sources of truth stay typed text in git.** md (+ frontmatter where precision pays) and append-only jsonl. Machine artifacts (agent prompts, eval fixtures, manifests, hash-pinned RFC/PLAN content, certificates) are deterministic text in git unconditionally. Authored edges use the basic-memory-style typed wiki-link convention plus frontmatter fields, with a **closed vocabulary formalized from the corpus's own**: `grounds / implements / measures / supersedes / subsumes / resolves / unblocks / spawns / relates / deps` — enforced by lint, not convention.
2. **Glue the commodity layers.** SQLite (+ FTS5) as the derived, rebuildable store; ingestion via the DuckDB markdown extension *or* a thin remark-based parser (implementation choice at build; extractors are swappable — the single-maintainer DuckDB extension must not become load-bearing without an exit path); sqlite-utils-class JSONL ingestion for run records. Embeddings deferred until FTS recall measurably fails (Phase-4 research guardrail).
3. **Build only the thin residue, as a TDD'd kernel CLI**: typed-edge extraction + vocabulary lint; **crosswalk ID normalization** (legacy `E#` → v2 → current — without it references silently dangle); confidence tiers on every edge (`EXTRACTED` from explicit structure / `INFERRED` by agent, queued for review, never silently blended / `AMBIGUOUS` surfaced as open questions); derived views — status rollups, coverage matrix (subject × suite, with explicit unmeasured-because entries), gap queries (unmatched edges), **graph-diff-between-commits** as the catch-up mechanism; token-budgeted query output for agent context. Builds run inline, never in subagents (graphify's SIGTERM lesson). The graph is derived and rebuildable; only sources are edited — humans freely, agents visibly (git-diffed), never silently.
4. **The human surface is generated, never authored** (coverage-report pattern): a Quarto-class site + dashboards computing from the same SQLite/jsonl (trend charts over eval runs, coverage, status). `EPIC-STATE.md` and research-README *tables* become derived views; narrative TL;DRs stay human-written. Diagrams generated from text (mermaid) preferred over committed images.
5. **Rich-first apps and DB-native systems are at most projections, never substrate.** Obsidian-the-app may be pointed at the corpus locally as a free extra viewport; nothing depends on it.
6. **Docs taxonomy and file lifecycles are decided, not conventional.** Every folder under `docs/` has a declared meaning and a lifecycle class, recorded in an authored [`docs/README.md`](../README.md) and checked by the graph lint. **Living** — root steering docs (`NORTH-STAR`, `EPIC`, `EPIC-STATE`, `LIMITS`, `DESIGN-PRINCIPLES`): edited in place, status tables generated. **Record** — `adr/`, `research/`, `reviews/`, `references/`: immutable once landed, *superseded via edges, never deleted*, so the graph always knows which decisions still bind. **Ephemeral** — `backlog/` holds **open items only**: on resolution an item is promoted to `references/` when the shipped change needs a provenance record (the existing informal convention, now formalized), otherwise deleted outright, with a `resolves` edge recorded on the resolving item — git history keeps the text, the graph tracks the open set. Backlog frontmatter carries **`applies-to` edges** (EPIC items, file globs, components) so "does an open backlog item apply to this work?" is a standing query — run at orientation and as a pre-work check — not a memory test. Process residue (plan-doc handoffs, currently gitignored inside `docs/superpowers/`) relocates out of `docs/`: docs/ means knowledge, without asterisks.
7. **The agent navigation surface is the second render of the same graph — generated maps + budgeted query, with grep demoted to last resort.** (a) A generated **`MAP.md`** — folder meanings, entry points, one-liners for every live doc, agent, skill, and helper — is **committed and drift-checked**: a deliberate exception to the never-versioned rule for derived views, because the map must exist on any clone before any tool runs (fresh sessions, the eval runner, other agents); a stale map fails lint like a broken pin. (b) The **codebase map** — a deterministic skeleton from the code inventory plus one-liner purpose annotations that enter as INFERRED and get reviewed (agent-extracts / CLI-validates) — pulls EPIC `4.5` forward into this layer. (c) `AGENTS.md` sets the retrieval ordering: read MAP → query the graph → grep only when both miss. Dashboards are the human render of the graph; maps are the agent render — one compiler, two outputs.
8. **The adoption surface ships with the mechanism — a layer item is not done until its usage wiring is.** The research's sharpest usage finding is that agents use what they are *pointed at* (the index moved outcomes; format did not) — a queryable layer nobody's guidance references changes nothing about how sessions actually run. Therefore, in the same work item as each mechanism: (a) **repo guidance** (`AGENTS.md`, currently the only root guidance file) gains query-first directives — session catch-up runs the graph diff, coverage/status/gap questions are answered from the derived views rather than fresh grep archaeology, authored docs use the typed-edge convention; (b) **repo-specific skills** (repo-local, not sk-* product skills) wrap the rituals — session orientation/catch-up, bench-run + regression investigation — so the workflows are invocable, not remembered; (c) agent-facing query output stays token-budgeted (Decision 3) so pointing agents at the layer is cheap enough to be the default.

## Options considered

- **Rent stash** — ruled out at architecture: server-backed (Postgres+pgvector, cloud/Compose), document-shaped, untyped wiki graph; its best-in-survey agent surfaces (CLI/MCP/VFS) are conditional on the server the requirements forbid.
- **Rent basic-memory** — closest fit (typed wiki-link relations in local md, derived SQLite, headless MCP/CLI); rejected whole because its relation vocabulary is unvalidated free text (we need the lint layer anyway), two-way agent writes to sources are its core design, and it has none of the derived views. Its syntax convention is adopted; the tool is not.
- **Obsidian stack** — requirements split across non-composing tools (Breadcrumbs: typed but app-locked; vault-cortex: headless but untyped; Juggl: dormant).
- **Full build (no glue)** — re-implements empirically-validated commodity parsing/storage/query for no ownership gain; violates build-the-harness/rent-the-wording.
- **DB-native substrate (Notion/Outline-class)** — best agent APIs but fails local-first and/or native diffability; "what changed since I left" would ride a DIY export mirror — a second system to trust.
- **Rich-first local apps (Logseq/Anytype/AppFlowy/SiYuan/Trilium/TiddlyWiki)** — each fails at least one hard requirement (mid-split, opaque stores, data-loss history, human-hostile diffs, dormancy).

## Consequences

- The compiler **bootstraps from existing structure** (EPIC tables, ADR status lines, eval manifests, records.jsonl, agent frontmatter) — value before any frontmatter migration; migration proceeds incrementally where precision pays.
- The operator's stated questions become queries: what-are-we-tracking (coverage matrix), where-on-the-north-star (objective rollup — requires reifying the north-star decomposition, the one net-new modelling task), work↔research traversal, research gaps (unmatched edges), catch-up (graph diff since last visit).
- This layer is the **explicit confidence gate for sk-* self-hosting**; it also supplies the trend surface the eval bench needs (cross-model/runner comparisons over committed run summaries).
- Two hand-maintained views stop drifting: their tables are generated from the same store their prose points at.
- New moving parts owned: one kernel CLI + a site generator config. No servers, no daemons.
- **Definition-of-done shifts**: each layer capability lands with its guidance edits and skill wiring in the same change (the blast-radius discipline applied to adoption) — preventing the failure mode where the layer exists but sessions keep operating pre-layer.
- **`docs/README.md` becomes the authored taxonomy record**; folder-meaning and lifecycle drift become lint-visible instead of tribal. Backlog hygiene becomes mechanical: open set = the folder, applicability = a query, resolution = a promotion-or-deletion with an edge.

## Assumptions (revise the decision if these are wrong)

1. Single operator on their own machine; the agent consumes the corpus locally via Grep/Read (if consumption moves remote, an llms.txt/content-negotiation layer becomes load-bearing).
2. Corpus stays small enough that FTS + navigation beat embeddings (revisit ≳500 docs or on measured recall failure).
3. Quarto (or Starlight) remains healthy; MkDocs Material is avoided (EOL 2026-11).
4. The knowledge-graph compiler exists before the human site is judged — the site is *another derived view of the same source*.
5. "Rich enough" for the human means computed dashboards/diagrams/hierarchy, not collaborative editing or whiteboarding.

## Revisit when

- A collaborator joins (Outline-class projection moves up sharply; multi-user editing changes the substrate calculus).
- basic-memory ships schema-validated relation vocabularies (rent-more becomes plausible).
- FTS recall measurably fails or the corpus scale flips assumption 2 (embeddings re-enter).
- Zensical (MkDocs successor) matures, if the renderer choice is ever revisited.
- The DuckDB markdown extension's maintenance changes (swap the extractor; the schema and views survive by design).

## Links

- Research: [`../research/knowledge-layer/REPORT.md`](../research/knowledge-layer/REPORT.md)
- Coverage-report lens + parked sk-* self-use: operator decisions 2026-07-22 (session record; to be ratified alongside this ADR)
- Related: ADR-0006 (eval contracts — run records this layer trends over); EPIC `4.1`/`3.8` (partially subsumed); Phase-4 memory guardrails (embeddings caution)
