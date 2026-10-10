# docs/ — taxonomy and lifecycles

What each folder means and how files live and die here. Decided 2026-07-22 with ADR-0007; reshaped 2026-09-18 with ADR-0009, which retired the knowledge graph and the generated views. Work state is not here: it is the issues, milestones, and board on `Rikmorn/sidekick`, per `plugin/rules/sk-pm-conventions.md`.

The plugin ships how the folders its skills write work, in `plugin/skills/sidekick/references/docs-layout.md`. The rows here for `designs/`, `research/`, `adr/`, `learnings/`, and `superpowers/` summarise it and add what is sidekick's own.

## Lifecycle classes

- **Living**: edited in place for the life of the project.
- **Record**: immutable once landed; superseded by a later record, never rewritten. It takes three edits only: a repaired link, a dated amendment line at the top, and a status line naming where its lesson was promoted. A record in a folder marked frozen takes the first alone, and a folder's `README.md` is living in every class. If something inside one is still true now, promote it into a living doc.
- **Ephemeral**: present only while open; removal on resolution is the mechanism, git history is the archive.

## Folders

| Folder | Meaning | Lifecycle |
|---|---|---|
| `docs/` root | Steering docs: `NORTH-STAR.md`, `DESIGN-PRINCIPLES.md`, `LIMITS.md`; `USAGE.md`, how the loop runs day to day; `LOOP.md`, what each skill in it does | Living |
| `adr/` | Architecture decisions. Top-level on purpose: their scope is the system and they bind after the work that spawned them closes. A status line names what an ADR supersedes | Record |
| `research/` | Grounding reports, one topic per folder, laid out as the docs layout says, plus the programme map. Topics written before 2026-10-10 centre on a `REPORT.md`, often with `FRAMING.md` and `sources.md`, rather than an index and dated reports | Record |
| `reviews/` | Assessments and audits, frozen at birth. A review that should change something files an issue | Record |
| `learnings/` | One record per closed item or milestone worth keeping, linked from the close comment; the docs layout states the bar and the shape | Record |
| `designs/` | Designs in progress, one folder per topic, written by `sk-design` and laid out as the docs layout says | Ephemeral: a topic folder is deleted when its issues close, or when the design is dropped |
| `backlog/` | Notes from before work moved to GitHub; each live one names its issue | Record, frozen |
| `work/` | Per-item records from before the move to GitHub, and the `EPIC.md` and `EPIC-STATE.md` frame they hung from | Record, frozen |
| `references/` | Provenance notes for shipped changes from before the work records existed | Record, frozen |
| `superpowers/` | Superpowers' working directory for specs, plans, scratch research, and `sk-design`'s shape-scale notes; gitignored | Ephemeral |

**The folder-earning test:** every top-level folder is a distinct retrieval axis. `adr/` is binding, `research/` is topical, `reviews/` and `learnings/` are what was found, `designs/` is what is being designed, and `work/` and `backlog/` are frozen history. Anything retrievable on an existing axis gets no folder of its own.
