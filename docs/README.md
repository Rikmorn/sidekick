# docs/ — taxonomy & lifecycles

**Status:** decided 2026-07-22 alongside [ADR-0007](./adr/0007-knowledge-layer.md) (Decision 6; ADR itself still Proposed). This file is the authored record of what each folder *means* and how files *live and die* here. The graph lint checks conformance; the generated `MAP.md` (ADR-0007 Decision 7) is the navigational complement — this file says what folders mean, the map says what's in them right now.

## Lifecycle classes

- **Living** — edited in place for the life of the project; status/tables become generated views, narrative stays human.
- **Record** — immutable once landed; *superseded via edges, never deleted or rewritten*, so the graph always knows what still binds. History is part of the value.
- **Ephemeral** — present only while open; removal on resolution is the mechanism, git history is the archive.

## Folders (target structure — migration is incremental, see note below)

| Folder | Meaning | Lifecycle |
|---|---|---|
| `docs/` root | Steering docs: `NORTH-STAR.md` (objective tree), `LIMITS.md`, `DESIGN-PRINCIPLES.md` — plus generated `STATE.md` | Living (STATE.md: generated, committed, **size-capped** — current state only, pointers and counts, completed items drop out; the timeline lives in `git log -p STATE.md`) |
| `work/<epic>/` | **One folder per epic**: authored `epic.md` (narrative frame) + one file per item — frontmatter (id, status, deps, grounds, implements) + spec before execution + a *self-contained* completion synthesis after (may cite ephemeral plan files, never depend on them). **IDs are epic-scoped** (`ops-2`, `plat-3.4`) — the folder is the namespace | Items: living-while-open → record-on-completion. Completed epics freeze in place |
| `work/backlog/` | The **single unscheduled pool** (deliberately not per-epic — items predate knowing their owner). Frontmatter `applies-to` edges make applicability-to-current-work a standing pre-work query | Ephemeral — on scheduling: **promote** into the owning epic; on resolution without work: promote to `references/` for provenance or **delete**, with a `resolves` edge on the resolver |
| [`adr/`](./adr/) | Architecture decisions — **deliberately top-level, never nested in epics**: their scope is the system and they remain binding after the spawning epic freezes. Epics get their ADR listing via `spawned-by`/`implements` edges | Record — status transitions (Proposed → Accepted → Superseded-by-edge) only |
| [`research/`](./research/) | Grounding reports + the research program map | Record — kept as-authored; freshness/supersession expressed as edges; index table generated |
| [`references/`](./references/) | Provenance records of shipped changes — the "want to know more" home, so shipped artifacts (prompts, rules) stay lean and citation-free | Record — append-only via promotion |
| [`reviews/`](./reviews/) | Point-in-time whole-system audits | Record — dated, immutable, superseded by later reviews |

**Migration note:** [`EPIC.md`](./EPIC.md) and [`EPIC-STATE.md`](./EPIC-STATE.md) are interleaved entity soups dissolving into `work/platform/`: new work takes the new shape immediately; the monoliths remain compiler parse-sources until empty, then freeze as records. Until then they are still the authoritative roadmap/state pair.

**Declared foreign enclave:** `docs/superpowers/` (gitignored) is the superpowers plugin's hardcoded output path for its specs/plans — a third-party tool's working directory that happens to live inside docs/. It is outside this taxonomy and invisible to the graph; its lifecycle belongs to the plugin, and the model-split plan-doc handoff workflow continues to use it as-is.

## Machine artifacts live elsewhere

Prompts (`agents/`, `skills/`), eval cases/fixtures (`evals/`), run records (`evals/results/`), calibration certificates (`.sidekick/calibrations/`) — deterministic text consumed by the kernel, governed by ADR-0006/0007, not by this taxonomy.
