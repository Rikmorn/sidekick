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

## Completion synthesis (draft — pending verification)

Built across two waves. **Done is not yet granted** — the acceptance test (Gates) is the operator's visual read, and that has not happened.

**What shipped.**
- **`sidekick graph export` (D2)** — a machine-readable current-state rollup, the JSON twin of STATE.md: open epics with per-item status/title/path, open-backlog count, a per-suite bench summary, and freshness (entities, edges, lint counts, decisions awaiting sign-off). New read subcommand; the existing `state --json` behaviour is untouched. TDD'd.
- **`dashboards/prepare.sh` (D3)** — glue, not kernel: `graph build` → `export` / `coverage --json` / `diff --json` → `runs.json` (per-record bench detail; the verdict rule mirrors the kernel's `parseRunRecords`) → `_generated-data.qmd`, which carries the four datasets base64-embedded as OJS cells. Data is embedded at prepare time and never fetched, so the site works over `file://` (D1).
- **`dashboards/{_quarto.yml,index.qmd}` (D4/D6)** — one `format: dashboard` document, four pages (State · Since last visit · Coverage · Bench), Observable Plot for charts, rendered with `embed-resources` to a single self-contained `.kb/site/index.html`.
- **Adoption wiring (D5)** — `bun run dashboard`; the orient briefing and the AGENTS.md commands bullet both point at the rendered site.

**Verified this session.** `bun run dashboard` renders green; `.kb/site/index.html` is one self-contained file (base64 data embedded, zero external local resource refs); every OJS data-access path checked against the live data without a throw; `bun test bin/` + `tsc --noEmit` green; STATE.md / MAP.md drift-clean.

**Not verified — the operator's gate.** That the page actually reads well in a browser (OJS executes, charts draw, the layout holds) and beats reading EPIC-STATE. Open `.kb/site/index.html` and eyeball it. If OJS misbehaves over `file://`, `quarto preview dashboards` is the recorded fallback (D1).

**Independent verification (2026-07-23, reviewing session).** Reproduced: 488/0 tests, typecheck clean, render green, one self-contained 3.76 MB file with zero external resource refs, lint 0 errors, surfaces drift-clean, `graph export` shape correct against live state (5/6 done, ops-6 active). The embedded-data claim verified the hard way: Quarto base64-encodes the whole OJS module block, so the data sits base64-inside-base64 — two of my own verification probes reported it missing before the double-decode found all four datasets and the live tokens (`3-3-w4`, `claude-opus-4-8`) intact; the executor's claim was right both times my tooling was wrong. The flagged verdict-rule duplication is accepted as ship-with-note: [`backlog/dashboard-verdict-rule-duplication.md`](../../backlog/dashboard-verdict-rule-duplication.md) carries `applies-to` edges on both files so the pre-work check surfaces it at next touch. Status remains **active** pending the operator's visual acceptance — the gate that decides done.
