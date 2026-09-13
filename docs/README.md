# docs/ — taxonomy & lifecycles

**Status:** decided 2026-07-22 alongside [ADR-0007](./adr/0007-knowledge-layer.md) (Decision 6; ADR itself still Proposed). This file is the authored record of what each folder *means* and how files *live and die* here. The graph lint checks conformance; the generated `MAP.md` (ADR-0007 Decision 7) is the navigational complement — this file says what folders mean, the map says what's in them right now.

## Lifecycle classes

- **Living** — edited in place for the life of the project; status/tables become generated views, narrative stays human.
- **Record** — immutable once landed; *superseded via edges, never deleted or rewritten*, so the graph always knows what still binds. History is part of the value.
- **Ephemeral** — present only while open; removal on resolution is the mechanism, git history is the archive.

## Folders

| Folder | Meaning | Lifecycle |
|---|---|---|
| `docs/` root | Steering docs: `NORTH-STAR.md`, `LIMITS.md`, `DESIGN-PRINCIPLES.md` — plus the archived `EPIC.md` / `EPIC-STATE.md` and the generated `STATE.md` | Living for the steering docs; record for the monoliths; `STATE.md` is generated, committed and **size-capped** (bench and freshness only — the timeline lives in `git log -p STATE.md`) |
| [`work/`](./work/) | Per-epic work records from before the move to GitHub: an `epic.md` frame plus one file per item, each a synthesis of what happened | Record — frozen 2026-09 (R1); open work is a GitHub issue |
| [`backlog/`](./backlog/) | Notes that predate or outlive an issue: the problem statement, the direction, and why something was parked or resolved. Each note that is still live names its issue | Record — the live question is the issue it points at |
| [`adr/`](./adr/) | Architecture decisions — **deliberately top-level, never nested in epics**: their scope is the system and they remain binding after the spawning epic freezes. Epics get their ADR listing via `spawned-by`/`implements` edges | Record — status transitions (Proposed → Accepted → Superseded-by-edge) only |
| [`research/`](./research/) | Grounding reports + the research program map | Record — kept as-authored; freshness/supersession expressed as edges; index table generated |
**The folder-earning test — every top-level folder is a distinct retrieval axis:** `work/` is temporal (what happened, as a frozen record — what is open is a GitHub issue), `adr/` is binding (what constrains now), `research/` is topical (what we know about X, consumed across epics). Anything retrievable on an existing axis gets no folder of its own — it gets a `kind` and edges, and derived views collect it.

**Also records:**
- [`references/`](./references/) — the pre-item-file workaround for shipped-change provenance; item completion syntheses subsume it (occupant → the E1 item record).
- [`reviews/`](./reviews/) — assessments are work products, conducted and frozen at birth: each is the record of a review, carried by the graph as a plain document. Unlike ADRs they carry no live binding force; a review that should change something files an issue.

**Archived (2026-09, #30):** [`EPIC.md`](./EPIC.md), [`EPIC-STATE.md`](./EPIC-STATE.md) and everything under [`work/`](./work/) are records of how the project was run before work moved to GitHub. No parser reads them; the graph carries them as plain documents. Open work, releases and priorities are issues, milestones and the project board on `Rikmorn/sidekick` — see `rules/sk-pm-conventions.md`.

**Declared foreign enclave:** `docs/superpowers/` (gitignored) is the superpowers plugin's hardcoded output path for its specs/plans — a third-party tool's working directory that happens to live inside docs/. It is outside this taxonomy and invisible to the graph; its lifecycle belongs to the plugin.

**Execution convention (superpowers as the execution engine):** work is executed through the superpowers workflow (brainstorm → plan → execute) until sk-* graduates its confidence gate. The layering: the GitHub issue is the work item and its status surface; the plan under `docs/superpowers/` is the ephemeral *how* and opens by naming its issue (`#NN`); on conflict the issue and the locked decisions it points at win. What happened is recorded on closure — a close comment, or a learning record in the repo linked from it (`rules/sk-pm-conventions.md`). The item files under `work/` are the pre-GitHub form of that record and are frozen.

## Machine artifacts live elsewhere

Prompts (`agents/`, `skills/`), eval cases/fixtures (`evals/`), run records (`evals/results/`), calibration certificates (`.sidekick/calibrations/`) — deterministic text consumed by the kernel, governed by ADR-0006/0007, not by this taxonomy.
