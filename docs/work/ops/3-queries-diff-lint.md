---
id: ops-3
epic: ops
kind: item
status: done
deps: [ops-2]
implements: [adr-0007]
---

# ops-3 — Queries, graph-diff, lint

**Goal.** The consumption half of the compiler: `sidekick graph query|coverage|gaps|applies|diff|lint` — every operator question from the ADR becomes a command with budgeted, JSON-capable output.

**Spec.**
- **`query <term|id>`** — entity + typed neighbors, `--budget <tokens>` degrading by tier order (EXTRACTED last to go), `--json` for tooling; FTS5 term search when the argument isn't an ID.
- **`coverage`** — subject × suite matrix from `measures` edges over the inventory; complement list = unmeasured subjects. Unmeasured-*because* annotations read from an authored exceptions file (the transparency ledger — hard-to-measure entries live there, stated not implied).
- **`gaps`** — unmatched-edge queries: objectives with no `advances`/`implements` path, items citing superseded sources, open backlog with dangling `applies-to`, subjects with no suite. Each gap typed, with a `why` line (graphify's pattern).
- **`applies <item-id|path...>`** — open backlog items whose `applies-to` matches the argument; this is the pre-work check.
- **`diff <ref> [ref]`** — entities/edges/status changes between two commits (default: `<ref>..HEAD`) by rebuilding both sides from git content — the catch-up mechanism. Output grouped: status moved / new / resolved / metrics changed.
- **`lint`** — vocabulary violations, unresolvable refs, taxonomy conformance (files in decided folders, frontmatter present where required *for work/ files only* — legacy docs exempt until migrated), generated-file staleness (wired fully in ops-4), STATE.md size cap (dormant until ops-4).
- **Adoption wiring (Decision 8):** AGENTS.md: answer status/coverage/applicability questions from these commands, not fresh grep archaeology.

**Gates.** TDD per command; integration: `coverage` on the live tree reflects the 7 suites; `applies fixer` surfaces `fixer-scope-widening`; `diff` across a known historical range (e.g. the 3.3 landing) reports the expected item flips.

---

## Completion synthesis (finalized 2026-07-22)

**Outcome.** All six commands ship: `query`, `coverage`, `gaps`, `applies`, `diff`, `lint`, each `--json`-capable, TDD'd, and exercised against the live tree. All three integration gates met:

- `coverage` reports **7 suites**, 7 measured subjects, and names all **23 unmeasured** ones.
- `graph applies fixer` surfaces **`backlog:fixer-scope-widening`**.
- `graph diff a6b6dd6~1 38853be` (the `3.3` landing) reports **`plat-3.3: open → done`** plus ADR-0006 and the eval corpus arriving — the expected flips.

**Decisions made during execution.**

1. **Lint findings carry severity.** Broken references, unknown relations, undeclared folders, missing work-file frontmatter, generated-file drift, size-cap overflow, and dangling `applies-to` are **errors** (exit 1) — each means something downstream is now wrong. `ambiguous-ref` is **advisory** (exit 0): it is a known, triaged condition of documents written before the vocabulary existed, and a gate that can never pass is a gate everyone learns to ignore. Both counts are always printed. On the live tree: **0 errors, 7 advisories**.
2. **`lint` and `diff` parse the tree directly rather than reading the store.** A lint that could pass against a stale database would be worse than no lint; the same reasoning makes `diff` build both sides from committed content.
3. **Budget degradation drops speculation before fact.** `--budget` removes whole confidence tiers in order (AMBIGUOUS → INFERRED → EXTRACTED), then truncates within the survivor, and always reports the omitted count. A silently truncated answer reads as a complete one.
4. **Coverage counts cases, not suite-level edges**, so a suite with 20 cases against one subject reads as 20 rather than 1.
5. **`applies` matches four ways** — entity ID, a path the target glob covers, an entity's own path, or a bare name — so the pre-work check works the way an operator types it (`applies fixer`) rather than demanding `agent:sk-fixer`.

**Deviations from the plan (full detail in the run report).**

- **`diff` materializes with `git archive` rather than per-file `git show`** (plan D6 named the latter). The property D6 exists to protect — *never touch the working tree* — is fully preserved and directly tested: a diff run with uncommitted work present leaves `git status` byte-identical, and the dirty file is invisible to the comparison. `git archive` reads committed objects in one subprocess instead of one per file.
- **Two backlog notes gained `applies-to` frontmatter** (in Wave 3): the `applies` gate cannot pass without the data it queries, and ADR-0007 D6 specifies exactly this convention. Added only where the note's own text already names its target files.
- **New authored file `evals/coverage-exceptions.md`** — the transparency ledger ops-3 specifies, shipped with its convention and no entries.
- **`runs` deltas in `diff` are structurally always zero** on this repo: `evals/results/` is gitignored, so run records are not in committed content. The field is wired and correct; it will read non-zero wherever records are committed. Recorded rather than papered over.

**Note for verification.** `graph gaps` currently reports 30: six north-star objectives that nothing declares it advances, one item implementing a superseded ADR (`plat-0.4` → ADR-0003), and 23 unmeasured subjects. These are findings about the corpus, not about the code.

**Verification (2026-07-22, reviewing session).** All three integration gates independently re-run and matching (`coverage` 7 suites/7 measured/23 unmeasured · `applies fixer` → `backlog:fixer-scope-widening` with its applies-to reason · `diff` at the 3.3 landing → `plat-3.3: open → done` plus adr-0006 arriving). Deviations accepted: `git archive` preserves D6's actual property (working tree untouched, directly tested); the two backlog `applies-to` additions and the empty coverage-exceptions ledger are the ADR's own conventions, added minimally. The 30 gaps are acknowledged as true corpus findings — six unadvanced objectives reflect that platform items don't carry `advances` edges pre-migration, and the 23 unmeasured subjects are the honest coverage baseline the ledger exists to annotate.
