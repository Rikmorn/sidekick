---
id: ops-3
epic: ops
kind: item
status: active
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
