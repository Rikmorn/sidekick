# Architecture Decision Records (ADRs)

Numbered, dated records of significant, hard-to-reverse design decisions for the harness — the **decision plus the assumptions it rests on**, so each is *revisitable* when an assumption changes. Decisions derive from `../research/` (evidence), `../DESIGN-PRINCIPLES.md` (doctrine), and `../EPIC.md` (work).

**Convention:** `NNNN-slug.md`. Status ∈ Proposed / Accepted / Superseded. Each ADR ends with the assumptions it depends on and a "revisit when" trigger.

**Work-item references:** ADRs 0001–0003 cite work items by their historical `E#` IDs (e.g. `E13`, `E23`) — resolve via the crosswalk in [`../EPIC.md`](../EPIC.md#crosswalk--legacy-e--phaseitem). ADR-0004 was authored post-renumber and uses `{phase}.{item}` IDs natively. (ADR bodies are kept as-authored — decision records aren't rewritten.) **ADR-0004 is accepted (2026-06-18); implementation is work item `1.2`.**

## Index
- [0001](./0001-harness-shape.md) — Harness shape: behavioural-leaning, lifecycle as a thin skeleton — **Accepted (direction); execution gated on eval (E13)**
- [0002](./0002-platform-primitives-scoping.md) — Platform primitives: own the loop, rent the fan-out — **Accepted (2026-06-10)**
- [0003](./0003-design-interaction-model.md) — Design interaction model: dialogue-by-default, `--auto` opts into one-shot — **Accepted (2026-06-15); implemented by EPIC E23; `--auto`-as-mode superseded by 0004**
- [0004](./0004-loop-identity-reentry-autonomy-seam.md) — Loop identity, re-entry, and the autonomy seam: identity derived-not-demanded, existing-plan = re-entry, redesign re-enters dialogic design on sealed gates; autonomy-dial seamed — **Accepted (2026-06-18); implemented by EPIC `1.2`**
- [0005](./0005-operator-authored-verifiers.md) — Operator-authored verifiers: quorum membership as configuration (contract + registry + authoring skill); advisory-until-calibrated binding; bundled UI-audit subsumed into an example pack — **Accepted (2026-07-02); implementation is EPIC `3.9` (seam) + `5.1` (generation)**
