---
id: ops-6
epic: ops
kind: item
status: active
deps: [ops-3]
implements: [adr-0007]
grounds: [research/knowledge-layer]
---

# ops-6 — Human surface: Quarto dashboards

**Goal.** `dashboards/*.qmd` (committed view definitions) rendering to `.kb/site/` (gitignored): the operator's re-entry surface — generated, never authored, opened locally.

**Spec.**
- **Views v1:** state (open epics/items, the STATE.md content made visual), coverage matrix (subject × suite, unmeasured-because column), bench trends (per-suite pass@k/pass^k and cost over runs from records.jsonl, model-faceted — the baseline `3-3-w4` on `claude-opus-4-8[1m]` is the first series), since-last-visit panel (graph-diff rendered).
- **Data path:** OJS/client-side reads from `.kb/` exports the compiler writes (`graph state --json` etc.) — no server, `file://`-friendly per the coverage-report pattern; mermaid for any diagrams.
- **Quarto is an operator-machine install** (`brew install quarto`) — first step, confirm with the operator before assuming; if Quarto is declined, fall back to a plain generated-HTML page from the same JSON (the view definitions are the swappable part, per the ADR's renderer-agnosticism).
- **Adoption wiring (Decision 8):** orient's briefing links the rendered site; a `sidekick graph render` (or make target) wraps build+render so one command refreshes everything.

**Gates.** Renders green locally from the live DB; trend view shows the baseline run correctly; operator eyeballs it and says it beats reading EPIC-STATE — that's the acceptance test that matters.
