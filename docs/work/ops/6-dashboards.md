---
id: ops-6
epic: ops
kind: item
status: done
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

**Browser-truth episode (2026-07-23, late).** The operator's first look found near-empty pages — vindicating the visual gate, and exposing three defects layered on top of each other, none visible to any headless check we had:

1. **Quarto's OJS runtime refuses `file://` by design** — every cell renders an error card telling you to use a web server. **D1's file://-open premise is therefore unachievable with Quarto+OJS**, independent of the data embedding (which works). Deviation accepted and recorded: the page stays one self-contained HTML, but *viewing* it is served — `bun run dashboard:view` (throwaway static server on :4173, runs only while looking). The coverage-report pattern holds in spirit (generated, never-versioned, one command), bends on the letter (no raw file open).
2. **The four generated data cells had no DOM slots** (they sat outside any page's card layout), crashing Quarto's OJS connector (`cellDiv.classList` TypeError) and taking dependent cells' rendering down. Fixed twice over: `//| output: false` on the generated cells (prepare.sh) + the include wrapped in a `.hidden` div so the cells stop consuming the page's height budget — which had also been crushing the tables out of view.
3. **The `content: valuebox` OJS-object form doesn't render values** — rewritten to the documented div form with inline `{ojs}` expressions; explicit heights added to both Plot calls (negative-`<rect>` errors).

Diagnosed and verified with **Playwright headless Chromium** (console capture + per-page text + screenshots), now a standing check: `dashboards/smoke.mjs` (`bun run dashboard:smoke`) serves the built page, loads it in a real browser, and fails on any console/page error or unpopulated page — closing exactly the verification lane whose absence shipped these bugs. `playwright` added as a devDependency. Final state: **0 browser errors, all four pages populated with live data** (value boxes, epic table, coverage matrix, both charts). The operator's eyeball remains the gate.

## Operator review round → accepted (2026-07-23)

The operator's visual read came back: "it works" — with a defect/gap list, fixed same-session:

- **Blank cards on Since-last-visit and Coverage** — three definition-only OJS cells lacked `//| output: false`, so `format: dashboard` gave each an empty card that also stole the page's height budget. Same family as browser-truth defect 2, caught in the authored cells this time.
- **Bench squeezed** — the "Bench state" text cell sat outside any `## Row`, grabbing an implicit full row; the per-suite table compressed to a scroll strip. All three pages now carry explicit row heights.
- **Counts without drill-down** — `graph export` gained `freshness.entities_by_kind`, `freshness.edges_by_kind`, and `backlog.items` (open entries; TDD'd, additive); the State page renders by-kind bar charts and an open-backlog table so 219/234/7 resolve to something inspectable.
- **Since-last-visit unexplained** — the "What changed" card now opens with the anchor semantics (previous STATE.md heartbeat commit → HEAD).
- **A transient the smoke caught during the fix round:** switching tabs re-renders hidden charts at container width 0, driving horizontal-bar `<rect>` widths negative (0 − margins) — 75 console errors. Horizontal bars need explicit `width` + `max-width: 100%`; the width-0 re-render is Quarto's card-fill sizing, so any future `barX` here inherits the same guard.

Closed at 490/0 tests, smoke clean, all four tabs screenshot-reviewed. **Done granted** — the operator judges it beats reading EPIC-STATE, with two recorded reservations: the Quarto dependency and its render-time-only layout. Direction captured in [`backlog/own-dashboard-renderer.md`](../../backlog/own-dashboard-renderer.md) — an owned self-contained renderer over the same four JSON contracts, bundleable with sk-*; [`backlog/dashboard-verdict-rule-duplication.md`](../../backlog/dashboard-verdict-rule-duplication.md) stands from verification.
