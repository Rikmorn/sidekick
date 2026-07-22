# Knowledge layer — rent vs build vs glue (grounding for the visibility track / ADR-0007)

**Date:** 2026-07-22. **Method:** four legs — (1) repo grounding verified against the tree; (2) code-level inspection of gsd-graphify (in-house prior art); (3) a dual-audience substrate survey (web, primary sources fetched); (4) an adversarially-verified landscape workflow (103 agents; every surviving claim 3-0 across three refutation votes; two claims reproduced empirically in-session — the strongest evidence class). Verification labels where they matter: [V] = primary source read this session; [B] = general knowledge, not re-verified.

**The operator problem this answers.** Bursty operator time (weeks between sessions) makes context re-acquisition the binding cost; retrieval is grep-only; ~56 tracked docs are disconnected prose; eval-run jsonl records are facts without a schema-of-meaning; north-star → objectives → work → research → results traceability exists only as narrative. The diagnosis this research grounds: the repo's knowledge is a graph flattened into prose — `EPIC-STATE.md` and `docs/research/README.md` are hand-maintained materialized views of it.

**Hard rubric.** Local-first + git-friendly (diffable sources); typed entities AND typed edges (untyped wikilinks insufficient); headless dual queryability (human + agent: CLI/JSON/MCP — app-locked query fails); derived views (status rollups, coverage matrix, gap detection via unmatched edges, trends over jsonl runs, graph-diff-between-commits for catch-up); heterogeneous ingestion (md frontmatter, md tables, jsonl, code inventory); FTS yes, embeddings optional; no server babysitting; writes user-editable, never silently agent-editable; visualization may be glued.

**Rubric amendment mid-research (operator).** The md/jsonl substrate was an inherited assumption, not a requirement — md is agent-optimal but human-hostile; the human layer wants rich HTML. Operator lens: the **coverage-report pattern** — generated, never-authored, never-versioned rich HTML over machine data, regenerated on demand. This dissolves the substrate question for everything derived and narrows it to authored narrative only.

---

## Grounding: what the corpus already is

| Source | Shape | Machine-readable today? |
|---|---|---|
| `docs/*.md` (EPIC, EPIC-STATE, LIMITS, DESIGN-PRINCIPLES) | 4 files | No frontmatter; EPIC's 32 item rows carry **ID / Sources / Deps** columns — already edge-shaped |
| `docs/adr/` | 6 ADRs | Status lines use a **consistent informal edge vocabulary**: resolves / unblocks / spawns / implemented-by / supersedes / subsumes / relates / consumes |
| `docs/research/` | ~27 files, 10 topics | README index carries per-report confidence + open-threads map + the north-star statement |
| `evals/cases/**/case.json` | 7 suites | Fully structured; `subject{kind,name}` = the *measures* edge |
| `evals/results/*/records.jsonl` | baseline run | Fully structured: model, cost_usd, verdict, deliverable |
| `agents/*.md` | 23 | Frontmatter present (name/description/tools) |
| `skills/`, `bin/helpers/` | 7 + 17 | Enumerable code inventory |

Three grounding facts shape everything below. (1) **The edge vocabulary already exists in prose** — formalizing it is adoption, not invention. (2) **The graph can bootstrap before any frontmatter migration** — EPIC tables, ADR status lines, eval manifests, records, and agent frontmatter are parseable as-is; value arrives before anyone touches 56 files. (3) **Identifier normalization is a hard local requirement no external tool anticipates**: legacy `E#` → v2 → current `{phase}.{item}` IDs resolve only through the EPIC crosswalk; without normalization, cross-references silently dangle.

---

## Prior art: gsd-graphify (inspected at code level)

A thin GSD wrapper around the external Python engine `graphifyy` (tree-sitter AST track for code + LLM chunk-extraction track for docs; `graph.json` + HTML viz + report; BFS/MCP query). **Rent: no** — nodes are typed by *medium* (`code|document|paper|image|rationale|concept`), not domain role; no structured ingestion of frontmatter/tables/jsonl as data (our primary sources); the graph is machine-owned regenerate-only (human-curated edges cannot survive rebuild); diff is against one mutable snapshot — no history, no commit-to-commit diff; no FTS.

**Steal list** (all small-CLI-sized):
1. **Confidence tiers** `EXTRACTED | INFERRED | AMBIGUOUS` — valuable because *consumed*: budget-trimming drops tiers in order; AMBIGUOUS → open questions; INFERRED clusters → a verification queue; report rolls up tier % as graph health. Mapping here: a frontmatter/table edge is EXTRACTED; an agent-inferred edge is INFERRED and queues for review — the write-gate ethos applied to knowledge extraction.
2. **Discrete confidence rubrics over continuous ranges** (their production evidence: continuous guidance collapses bimodally).
3. **Deterministic entity IDs** derivable from the entity alone (the dedup mechanism across passes).
4. **Two-track extraction with a non-duplication contract** — deterministic parse owns everything parseable; LLM only for semantic edges the parser can't see.
5. **`built_at_commit` stamping; surface both mtime- and commit-staleness** (they legitimately disagree); fence hashes read from data files before git argv.
6. **Gap detection as typed questions with `why` fields.**
7. **Anti-shrink write guard**; token-**budgeted query** as a first-class parameter.
8. Negative result: file-writing build pipelines dispatched to subagents get SIGTERM'd mid-write — **builds run inline**.

---

## Substrate: the dual-audience question

**"Translate" wins: text sources in git, compiled rich layer as the primary human surface.** The decisive constraint is the operator's own catch-up mechanism — "what changed since I left" is *natively* satisfied only by text-in-git; every rich-first/DB-native option requires a DIY export mirror you must then trust. The dual-renderer pattern is named industry practice in exactly one direction (text source → generated human site + generated agent index — Mintlify, Cloudflare content-negotiation); nobody credible runs the arrow the other way [V].

Rendering layer: **Quarto is the standout for a research-heavy corpus** [V] — dashboards and Observable JS charts computed client-side from data files are first-class (our jsonl → trend charts, no server, no custom components: the coverage-report pattern productized); cost: `.qmd` is a slight md dialect. Runner-up **Astro Starlight** (most active general SSG; vanilla md/MDX; charts need custom components). **MkDocs Material must be avoided for new adoption** — maintenance mode since 2025-11, EOL 2026-11; successor Zensical still alpha [V]. Cheap complement: Obsidian-the-app locally over the same files (Bases dashboards over frontmatter) — zero substrate change; Publish can't render Bases yet [V].

Rich-first local apps — no current fit, each verified: Logseq mid-architecture-split (md track legacied, DB track beta, "data loss is possible" in release notes); Anytype opaque CRDT store (ironically the class's best official MCP); AppFlowy documented data-loss + no official local API found; Trilium fork-dependent governance; SiYuan closest (JSON-AST files + local API + MCP ecosystem) but human-hostile diffs; TiddlyWiki git-native `.tid` files but wikitext + dated ceiling.

Cross-cutting evidence:
- **Token cost holds**: HTML ≈ 2–3× md tokens; Cloudflare productized HTML→md at ~80% reduction [V].
- **"md is most accurate for LLMs" is NOT a law**: He et al. (arXiv:2411.10541) — up to 40% task swing by format, no universal winner, robustness improves with model scale. No Claude-specific study exists.
- **Don't over-compress**: token-optimized notations (TOON/TRON) save 18–27% tokens at up to 9–14pp accuracy cost with cascading parse failures (arXiv:2605.29676). Plain md prose + plain JSON/JSONL records is the reliability-optimal pair — what we have.
- **Navigation beats format**: in the one agent benchmark surveyed (Mintlify, vendor-published — flag), format barely moved accuracy but an index the agent navigates from cut failed lookups ~20×. **The index/graph is the high-leverage artifact; format games are not.**
- Diagrams: prefer generated-from-text (mermaid — source stays diffable); compress authored screenshots; LFS premature below ~1 GB.

---

## Landscape: rent candidates (adversarially verified)

**stash (Fergana-Labs) — ruled out at the architecture level** [V, 3-0]. Server-backed commercial agent-memory product: PostgreSQL+pgvector canonical store, cloud or Docker Compose, CLI "operates against a running backend, not independently". Data model is document-shaped; its wiki graph is real but **untyped** (`WikiGraph` edges `{source,target}`, no type field) — exactly the excluded untyped-wikilinks case. Its agent surfaces are best-in-survey (CLI, MCP, virtual-filesystem shell, semantic+keyword search — all shipped), but conditional on the server the rubric forbids. (A claim that stash auto-installs agent write-hooks was REFUTED 0-3 and is not carried here.)

**basic-memory — the closest rent candidate, and the adoptable piece is its syntax** [V, 3-0 ×3]. The only surveyed tool natively combining local-first + typed entities and typed edges + headless dual queryability: one md file per entity; **relations as typed wiki-links** (`- implements [[Authentication System]]`, `- depends_on [[X]]`); md explicitly the source of truth with a derived, rebuildable SQLite index; no server in local mode; MCP + CLI with JSON output. Two disqualifiers for renting whole: the relation vocabulary is open-ended free text (our closed vocabulary would need an external lint anyway), and **two-way agent writes to source files is its core value proposition** — conflicting with writes-stay-user-editable absent policy layering; and it has none of our derived views (coverage, gaps, graph-diff). Verdict: don't rent the tool; **adopt its relation-syntax convention** for authored edges.

**Obsidian ecosystem — the requirements split across tools that don't compose** [V, 3-0 ×4]. Breadcrumbs: user-definable typed edges stored in markdown-native diffable sources — but app-locked (in-app JS API only). vault-cortex: genuinely headless MCP over `.md` files on disk (app not running) — but untyped (backlinks/outgoing/orphans only) and v0.x-immature. Juggl/Semantic Obsidian: rubric-aligned vision, dormant since 2023. No composition delivers typed edges AND headless access in one surface.

**MarkdownDB — ruled out** [V, 3-0]: `link_type` is CHECK-constrained to `normal|embed` (syntactic, not semantic); dormant since v0.9.5 (2024-03). (Two adjacent claims about its query surfaces were REFUTED 0-3 and are not repeated here.)

**The glue substrate is empirically validated** [V, 3-0 ×4; two claims reproduced in-session]. The **DuckDB markdown community extension** (v1.5.0, 2026-07-19) parses md into hierarchy-aware SQL rows with scalar extractors covering exactly our heterogeneous structures: `md_extract_metadata` (frontmatter), `md_extract_tables_json`, `md_extract_code_blocks`, `md_extract_links`. **sqlite-utils** (v4.1.1) ingests JSONL headless and returns SQL results — including over SQL VIEWs — as JSON (reproduced live). Derived views become plain SQL over git-tracked sources. Caveat for the ADR: the DuckDB extension is single-maintainer (~27 stars) — a bus-factor risk, mitigable because it is one of several possible SQL layers over the same sources; **typed-edge extraction and vocabulary validation are the thin-build residue neither tool provides.**

---

## Recommendation: glue-with-thin-build

No surveyed tool satisfies the rubric whole — pure rent is off the table; pure build would re-implement validated glue. Per component:

| Component | Rent / build / glue | Choice |
|---|---|---|
| Source substrate | **keep** | md (+ typed frontmatter) + jsonl in git; machine artifacts (prompts, fixtures, pinned content, certs) stay deterministic text regardless |
| Authored-edge syntax | **adopt convention** | basic-memory-style typed wiki-links + frontmatter fields; **closed vocabulary = the corpus's own** (grounds/implements/measures/supersedes/deps/resolves/unblocks/relates), enforced by lint |
| Parse/ingest | **glue** | DuckDB md extension *or* a thin remark-based parser (decide at build — the extractors are swappable); sqlite-utils/SQLite for jsonl runs |
| Store + FTS | **glue** | SQLite + FTS5; embeddings deferred until recall measurably fails (Phase-4 research guardrail) |
| The thin build (kernel CLI, TDD'd) | **build** | edge extraction + vocabulary lint; **crosswalk ID normalization**; confidence tiers (EXTRACTED/INFERRED/AMBIGUOUS + review queue); derived views: status rollup, coverage matrix, gap queries (unmatched edges), **graph-diff-between-commits** (the catch-up mechanism); token-budgeted query for agent context |
| Human surface | **glue** | Quarto-class generated site + dashboards fed by the same SQLite/jsonl — generated-never-authored (coverage-report pattern); EPIC-STATE and research-README *tables* become derived views, narrative TL;DRs stay human |
| Agent surface | **build (thin)** | same CLI + a navigation index artifact (the evidence says the index, not the format, is the lever) |

Durability filter: we own the schema, the vocabulary, the crosswalk, the views, and the diff semantics — the oversight structure. We rent parsing, storage, FTS, and rendering — the commodity layers, each swappable.

Build sequencing implied by the grounding: **bootstrap the compiler from existing structure first** (EPIC tables, ADR status lines, eval manifests, records, agent frontmatter) — value before migration; frontmatter/typed-links added incrementally where precision pays.

## Honesty flags

- **Unassessed** (no surviving claims from the workflow — absence of assessment, not clearance): mem0/Letta/cognee-class agent-memory, Foam, Dendron, Log4brains, DVC/MLflow-style run tracking specifics, GraphRAG-class. Logseq was assessed on the substrate leg only.
- Mintlify benchmark is vendor-published, unreplicated; format-accuracy studies are GPT-family, none Claude-specific; the Ahrefs llms.txt figure was secondhand.
- DuckDB md extension bus factor (single maintainer); AppFlowy "no local API" is absence-of-evidence; several preview-ergonomics claims [B].
- Refuted-and-dropped claims are noted inline (stash write-hooks 0-3; MarkdownDB surfaces/roadmap 0-3).
- Scale of the verification pass: 103 agents, ~4.0M tokens, 586 tool calls; per-claim adversarial votes recorded in the run journal.

## Sources

Primary sources fetched this session: github.com/Fergana-Labs/stash (+ ARCHITECTURE.md, stash-releases, joinstash.ai) · github.com/basicmachines-co/basic-memory + docs.basicmemory.com · github.com/michaelpporter/breadcrumbs + BCAPI docs · github.com/aliasunder/vault-cortex · markdowndb.com + flowershow/markdowndb · duckdb.org/community_extensions/extensions/markdown + teaguesterling/duckdb_markdown · sqlite-utils.datasette.io · quarto.org (dashboards, OJS) · astro.build (Starlight releases) · squidfunk.github.io/mkdocs-material (maintenance mode, Zensical) · obsidian.md/roadmap · github.com/logseq/logseq releases + db-version docs · anyproto/anytype-mcp + any-sync · AppFlowy issues #8112/#7273 · TriliumNext/Trilium · TiddlyWiki5 · makenotion/notion-mcp-server + Notion hosted-MCP blog · outline discussion #6790 · bookstackapp.com v25.07 · docs.affine.pro · developers.cloudflare.com (Markdown for Agents) · arXiv:2411.10541 · arXiv:2605.29676 · mintlify.com/blog/llms-txt-agent-benchmark · searchenginejournal.com (llms.txt) · docs.github.com (repo limits). Local: gsd-graphify installation (`~/.claude/skills/gsd-graphify/`, `~/.local/share/uv/tools/graphifyy/`), this repo's tree at `38853be`+.
