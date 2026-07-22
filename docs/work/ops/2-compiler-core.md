---
id: ops-2
epic: ops
kind: item
status: active
deps: []
implements: [adr-0007]
grounds: [research/knowledge-layer]
---

# ops-2 — Compiler core: parse → normalize → store

**Goal.** `sidekick graph build` (helpers `bin/helpers/graph-*.ts`, TDD'd): deterministic parse of the live tree into `.kb/graph.db` (SQLite: `entities`, `edges`, `runs` + FTS5 over doc prose). Bootstrap against what exists — no file migration is part of this item.

**Spec.**
- **Parsers (all deterministic; every edge they emit is tier EXTRACTED):**
  - `docs/work/**`: frontmatter (id, epic, kind, status, deps, implements, grounds, advances, applies-to) + typed wiki-links in bodies (`- implements [[x]]` convention).
  - `docs/EPIC.md`: item tables (ID / Was / Item / Sources / Deps columns) + the crosswalk table.
  - `docs/adr/*.md`: number, title, Status line (state + date), and its informal edge prose (resolves / unblocks / spawns / implemented-by / supersedes / subsumes / relates / consumes) — parse conservatively; an unparseable relation is skipped and lint-reported, never guessed.
  - `evals/cases/**/case.json`: suite, case, `subject{kind,name}` → `measures` edges.
  - `evals/results/*/records.jsonl`: runs rows (run_id, case, suite, subject, model, cost, verdict, timestamps).
  - `.sidekick/calibrations/*.json`: certificate entities pinned to their verifier.
  - `agents/*.md`, `skills/*/`, `bin/helpers/*.ts`: inventory entities with descriptions from frontmatter/headers.
  - `docs/research/*/REPORT.md`, `docs/backlog/*.md`: entities; backlog `applies-to` when present.
- **ID normalization:** every reference resolves through the crosswalk (`E#` → v2 → current `{phase}.{item}`) before edge creation; unresolvable refs become lint findings, not silent drops. Deterministic entity IDs derivable from path/ID alone (graphify lesson — same entity, same ID, any pass).
- **Vocabulary:** closed edge set from ADR-0007 D1 + `measures`/`advances`/`assesses`/`triggered-by`/`applies-to`/`resolves`. Unknown relation = lint finding.
- **Store:** rebuildable cache — full rebuild each run is acceptable at this corpus size (add incrementality only when build time actually hurts); stamp `built_at_commit`; anti-shrink guard (refuse a drastically smaller rebuild without `--force`); fence any hash/ref read from data files before it reaches a git argv. Builds run inline, never dispatched to subagents.
- **Exclusions:** the enclave (`docs/superpowers/`), `evals/fixtures/` seeded content, `node_modules`, `.kb/` itself. Exclusion list is explicit config in the helper, lint-visible.
- **Housekeeping:** `.kb/` added to `.gitignore`; helpers excluded from the install manifest (repo-internal; the deliberate `4.1` productization seam). Verify the exclusion mechanically — a consumer install must not receive graph helpers.
- **Adoption wiring (Decision 8):** AGENTS.md gains the build command + a one-line "the DB exists, query it" pointer (full retrieval ordering lands with ops-5).

**Gates.** Unit tests per parser against fixture snippets taken from the live tree; one integration test: build on the real repo, assert known entities/edges exist (e.g. `3.3 implements adr-0006`, `coherence-agent measures sk-coherence-checker`), zero unresolvable-ref findings on the current tree or each finding triaged in the synthesis.

**Fork policy.** The parse target is the live tree as-is. If a source file's structure defeats conservative parsing, the answer is a lint finding plus a note in the synthesis — never a silent parser heuristic, and file edits to aid parsing are their own follow-up decision.
