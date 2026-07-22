# docs/ — taxonomy & lifecycles

**Status:** decided 2026-07-22 alongside [ADR-0007](./adr/0007-knowledge-layer.md) (Decision 6; ADR itself still Proposed). This file is the authored record of what each folder *means* and how files *live and die* here. The graph lint checks conformance; the generated `MAP.md` (ADR-0007 Decision 7) is the navigational complement — this file says what folders mean, the map says what's in them right now.

## Lifecycle classes

- **Living** — edited in place for the life of the project; status/tables become generated views, narrative stays human.
- **Record** — immutable once landed; *superseded via edges, never deleted or rewritten*, so the graph always knows what still binds. History is part of the value.
- **Ephemeral** — present only while open; removal on resolution is the mechanism, git history is the archive.

## Folders

| Folder | Meaning | Lifecycle |
|---|---|---|
| `docs/` root | Steering docs only: `NORTH-STAR.md` (objective tree — net-new with the knowledge layer), `EPIC.md`, `EPIC-STATE.md`, `LIMITS.md`, `DESIGN-PRINCIPLES.md` | Living |
| [`adr/`](./adr/) | Architecture decisions with the assumptions they rest on | Record — status transitions (Proposed → Accepted → Superseded-by-edge) only |
| [`research/`](./research/) | Grounding reports + the research program map | Record — kept as-authored; freshness/supersession expressed as edges; index table generated |
| [`backlog/`](./backlog/) | **Open** items only. Frontmatter carries `applies-to` edges (EPIC items, file globs, components) so applicability-to-current-work is a standing query, not a memory test | Ephemeral — on resolution: **promote** to `references/` when the shipped change needs provenance, else **delete**, recording a `resolves` edge on the resolver |
| [`references/`](./references/) | Provenance records of shipped changes — the "want to know more" home, so shipped artifacts (prompts, rules) stay lean and citation-free | Record — append-only via promotion from `backlog/` |
| [`reviews/`](./reviews/) | Point-in-time whole-system audits | Record — dated, immutable, superseded by later reviews |

**Declared foreign enclave:** `docs/superpowers/` (gitignored) is the superpowers plugin's hardcoded output path for its specs/plans — a third-party tool's working directory that happens to live inside docs/. It is outside this taxonomy and invisible to the graph; its lifecycle belongs to the plugin, and the model-split plan-doc handoff workflow continues to use it as-is.

## Machine artifacts live elsewhere

Prompts (`agents/`, `skills/`), eval cases/fixtures (`evals/`), run records (`evals/results/`), calibration certificates (`.sidekick/calibrations/`) — deterministic text consumed by the kernel, governed by ADR-0006/0007, not by this taxonomy.
