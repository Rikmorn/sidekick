---
applies-to: [dashboards/index.qmd, dashboards/_quarto.yml, dashboards/prepare.sh]
---

# Replace Quarto with an owned dashboard renderer, bundleable with sk-*

The ops-6 dashboards work, but the operator review (2026-07-23) flagged two structural dislikes: Quarto is an extra operator-machine dependency (`brew install quarto`, plus its OJS runtime refusing `file://` forces a throwaway server for viewing), and its layout is render-time only — rows/columns/tabsets fixed in the `.qmd`, no moving or resizing panels, interactivity capped at OJS cells.

**Resolution direction:** build an owned renderer — a self-contained generated HTML page (the coverage-report pattern) consuming the same four prepare-step JSON contracts (`state`, `coverage`, `diff`, `runs`). The data layer is renderer-agnostic by design (ADR-0007: generated views are the swappable part), so this swaps the view half only. Being plain HTML/JS it can also ship inside the sk-* install set, which Quarto never could. Decide shape at the next dashboards iteration; the Quarto views stay the surface until then.

Operator direction from the ops-6 review, 2026-07-23 ("fine for now, but not a fan of the extra dependencies and the inflexibility").
