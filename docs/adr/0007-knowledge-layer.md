# ADR-0007 — Project knowledge layer: glue-with-thin-build over typed text, generated rich views

**Status:** Proposed (2026-07-22, from the knowledge-layer research pass; operator acceptance pending). Grounds the visibility/ops track that gates sk-* self-use confidence. Partially subsumes the *mechanism* halves of EPIC `4.1` (navigability) and `3.8` (observability rendering) — those items narrow to their residues when this is accepted. Research: [`../research/knowledge-layer/REPORT.md`](../research/knowledge-layer/REPORT.md).

## Context

The operator's binding constraint is bursty availability: weeks between sessions, expensive context re-acquisition, retrieval by grep only. The repo's knowledge — north star → objectives → EPIC items → ADRs → research → agents/skills → eval suites → runs — is a graph flattened into prose; `EPIC-STATE.md` and `docs/research/README.md` are hand-maintained materialized views; eval-run jsonl records carry no schema-of-meaning. The operator additionally judged raw markdown a poor human surface ("great for you, not great for me") and set the coverage-report lens: generated, never-authored rich HTML over machine data as the primary human view. sk-* self-use for repo work is parked until this visibility exists.

A four-leg research pass (repo grounding · gsd-graphify code inspection · dual-audience substrate survey · adversarially-verified landscape workflow, 103 agents) found: no tool rents whole; the glue substrate is empirically validated; the corpus already contains its own edge vocabulary and enough existing structure to bootstrap without migration.

## Decision

1. **Sources of truth stay typed text in git.** md (+ frontmatter where precision pays) and append-only jsonl. Machine artifacts (agent prompts, eval fixtures, manifests, hash-pinned RFC/PLAN content, certificates) are deterministic text in git unconditionally. Authored edges use the basic-memory-style typed wiki-link convention plus frontmatter fields, with a **closed vocabulary formalized from the corpus's own**: `grounds / implements / measures / supersedes / subsumes / resolves / unblocks / spawns / relates / deps` — enforced by lint, not convention.
2. **Glue the commodity layers.** SQLite (+ FTS5) as the derived, rebuildable store; ingestion via the DuckDB markdown extension *or* a thin remark-based parser (implementation choice at build; extractors are swappable — the single-maintainer DuckDB extension must not become load-bearing without an exit path); sqlite-utils-class JSONL ingestion for run records. Embeddings deferred until FTS recall measurably fails (Phase-4 research guardrail).
3. **Build only the thin residue, as a TDD'd kernel CLI**: typed-edge extraction + vocabulary lint; **crosswalk ID normalization** (legacy `E#` → v2 → current — without it references silently dangle); confidence tiers on every edge (`EXTRACTED` from explicit structure / `INFERRED` by agent, queued for review, never silently blended / `AMBIGUOUS` surfaced as open questions); derived views — status rollups, coverage matrix (subject × suite, with explicit unmeasured-because entries), gap queries (unmatched edges), **graph-diff-between-commits** as the catch-up mechanism; token-budgeted query output for agent context. Builds run inline, never in subagents (graphify's SIGTERM lesson). The graph is derived and rebuildable; only sources are edited — humans freely, agents visibly (git-diffed), never silently.
4. **The human surface is generated, never authored** (coverage-report pattern): a Quarto-class site + dashboards computing from the same SQLite/jsonl (trend charts over eval runs, coverage, status). `EPIC-STATE.md` and research-README *tables* become derived views; narrative TL;DRs stay human-written. Diagrams generated from text (mermaid) preferred over committed images.
5. **Rich-first apps and DB-native systems are at most projections, never substrate.** Obsidian-the-app may be pointed at the corpus locally as a free extra viewport; nothing depends on it.

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
