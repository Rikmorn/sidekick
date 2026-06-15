# Architecture Decision Records (ADRs)

Numbered, dated records of significant, hard-to-reverse design decisions for the harness — the **decision plus the assumptions it rests on**, so each is *revisitable* when an assumption changes. Decisions derive from `../research/` (evidence), `../DESIGN-PRINCIPLES.md` (doctrine), and `../EPIC.md` (work).

**Convention:** `NNNN-slug.md`. Status ∈ Proposed / Accepted / Superseded. Each ADR ends with the assumptions it depends on and a "revisit when" trigger.

## Index
- [0001](./0001-harness-shape.md) — Harness shape: behavioural-leaning, lifecycle as a thin skeleton — **Accepted (direction); execution gated on eval (E13)**
- [0002](./0002-platform-primitives-scoping.md) — Platform primitives: own the loop, rent the fan-out — **Accepted (2026-06-10)**
- [0003](./0003-design-interaction-model.md) — Design interaction model: research-as-dialogue vs produce-then-confirm — **Proposed (2026-06-15); EPIC E23, gates the sk-design slice of E3**
