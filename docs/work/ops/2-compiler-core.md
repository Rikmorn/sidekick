---
id: ops-2
epic: ops
kind: item
status: done
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

---

## Completion synthesis (finalized 2026-07-22)

**Outcome.** `sidekick graph build` compiles the live tree into `.kb/graph.db`: **214 entities, 228 edges, 14 run records, 7 lint findings, zero unresolvable references**. Every parser named in the spec landed with unit tests against fixture snippets taken from the tree, plus a live-tree integration test that asserts the cross-source links the graph exists to provide. Helpers: `graph-model` (vocabulary, identity, crosswalk), `graph-store` (SQLite + FTS5), `graph-parse-monoliths` (EPIC + ADRs), `graph-parse-work` (work/, north-star, research, backlog), `graph-parse-machine` (eval cases, run records, certificates, inventory), `graph-build`, `graph-cli`.

**Decisions made during execution.**

1. **Crosswalk normalization is date-guarded.** The literal `3.4` is a v2 ID in a document written before the 2026-07-03 re-baseline and a *different, valid current* ID after it, so applying the v2→v3 delta unconditionally would corrupt live references. Refs are normalized only when their source document's own date predates the re-baseline. The rule reproduces the editorial pointers ADR-0004 and ADR-0005 carry by hand — those pointers are now derived rather than trusted, and the live-tree test asserts it.
2. **`implements` has one canonical direction: work item → decision.** Work frontmatter writes `implements: [adr-0007]`; ADR-0006's status line writes the same relation the other way round ("Implements the eval keystone EPIC `3.3`"). Both canonicalize to item→ADR so the two sources cannot disagree about which way the edge runs.
3. **Ambiguity is surfaced, never resolved by guess.** An EPIC Deps cell yields edges only when a segment is *purely* ID tokens or an explicit `relates` list. Prose like "4.2 reuses" names an ID in the *reverse* direction, and "spawns E19–E22" names members it never spells out; both become findings. Same for `E3`, which the crosswalk itself records as a split mapping.
4. **The store is Bun's built-in SQLite** (`bun:sqlite`) rather than `better-sqlite3` — zero dependencies, FTS5 included, and it matches the repo's existing Bun toolchain. See the deviation note below for the bundling consequence, which turned out to be what makes the repo-internal seam structural.
5. **Heading nesting is the objective tree.** A `###` objective under a `##` objective emits `advances` — deterministic from document structure, and the thing that makes the north-star a rollup rather than a list.

**Deviations from the plan (full detail in the run report).**

- **`bun:sqlite` over `better-sqlite3`** (plan D2 named the latter as the fallback "if none exists in deps"): Bun *is* the repo's existing tooling choice, and a native module cannot be bundled into the single-file `dist/cli.js` a consumer receives.
- **The `graph` subcommand loads through a runtime dynamic import, not a static one** (plan D1 said "wired like existing subcommands"). Forced and load-bearing: `bun build --target node` hoists a `bun:sqlite` import to the top of the bundle, which would break the shipped Node CLI *on every code path*. Using a specifier the bundler cannot resolve statically keeps the graph code out of `dist/cli.js` entirely — so D1's own requirement ("a consumer install must not receive graph helpers") is satisfied *structurally* rather than by a manifest promise. Verified: zero occurrences of `bun:sqlite` or graph code in the built bundle; a consumer invoking `sidekick graph` gets a clear repo-internal message.

**Fork-policy finding (parse target as-is).** EPIC.md item cells contain markdown-**escaped pipes** (`` `low\|medium\|high` ``, `` `eval run\|report\|calibrate` ``). Splitting rows on every pipe shifted the later columns, so item prose was read as a Deps cell. Fixed in the splitter (escaped pipes are markdown, not structure) rather than by editing EPIC.md — this is parser correctness, not a heuristic. It recovered 15 edges.

**Standing lint findings (7, all `ambiguous-ref`, none blocking).** Five EPIC Deps cells carry prose around an ID (`calibration ← 3.4` — itself a surviving v2 residue in a current document; `binding ← 3.3`; `4.2 reuses`; `pick rides 3.3's harness`; `mounts on 0.5`); ADR-0002 spawns an ID *range*; ADR-0003 cites `E3`, which the crosswalk records as split. Each is a real ambiguity in the source, which is what the fork policy asks for. Triage is the operator's at verification.

**Verification (2026-07-22, reviewing session).** Independently reproduced: 481/0 tests, typecheck clean, **zero graph code in the built bundle** (grep on a fresh `bun run build`), live build = 218 entities / 231 edges. Both deviations accepted — the `bun:sqlite` + dynamic-import one is an *upgrade*: it makes the repo-internal seam structural rather than manifest-promised. Advisory triage: the `EPIC.md:67` finding was a genuine v2 residue the 2026-07-03 renumber missed (`calibration ← 3.4` meant the eval keystone, now `3.3` — the same line uses `3.4` correctly elsewhere, vindicating the no-guess policy); fixed in the verification commit. Note the fix corrects the *referent*, not the advisory: the segment remains prose-around-an-ID (direction indeterminable), so all seven advisories legitimately stand — they are properties of how the monolith writes Deps cells, and they dissolve with the monolith at migration.
