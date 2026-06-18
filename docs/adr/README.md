# Architecture Decision Records (ADRs)

Numbered, dated records of significant, hard-to-reverse design decisions for the harness — the **decision plus the assumptions it rests on**, so each is *revisitable* when an assumption changes. Decisions derive from `../research/` (evidence), `../DESIGN-PRINCIPLES.md` (doctrine), and `../EPIC.md` (work).

**Convention:** `NNNN-slug.md`. Status ∈ Proposed / Accepted / Superseded. Each ADR ends with the assumptions it depends on and a "revisit when" trigger.

**Work-item references:** ADRs cite work items by their historical `E#` IDs (e.g. `E13`, `E23`). The roadmap renumbered to `{phase}.{item}` on 2026-06-18 — resolve any `E#` via the crosswalk in [`../EPIC.md`](../EPIC.md#crosswalk--legacy-e--phaseitem). (ADR bodies are kept as-authored — decision records aren't rewritten.) **ADR-0004 (explorer-rethink) is pending** — work item `1.2`.

## Index
- [0001](./0001-harness-shape.md) — Harness shape: behavioural-leaning, lifecycle as a thin skeleton — **Accepted (direction); execution gated on eval (E13)**
- [0002](./0002-platform-primitives-scoping.md) — Platform primitives: own the loop, rent the fan-out — **Accepted (2026-06-10)**
- [0003](./0003-design-interaction-model.md) — Design interaction model: dialogue-by-default, `--auto` opts into one-shot — **Accepted (2026-06-15); implemented by EPIC E23**
