# docs/ — taxonomy and lifecycles

What each folder means and how files live and die here. Decided 2026-07-22 with ADR-0007; reshaped 2026-09-18 with ADR-0009, which retired the knowledge graph and the generated views. Work state is not here: it is the issues, milestones, and board on `Rikmorn/sidekick`, per `plugin/rules/sk-pm-conventions.md`.

## Lifecycle classes

- **Living**: edited in place for the life of the project.
- **Record**: immutable once landed; superseded by a later record, never rewritten. A broken link is the only edit a record takes; if something inside one is still true now, promote it into a living doc.
- **Ephemeral**: present only while open; removal on resolution is the mechanism, git history is the archive.

## Folders

| Folder | Meaning | Lifecycle |
|---|---|---|
| `docs/` root | Steering docs: `NORTH-STAR.md`, `DESIGN-PRINCIPLES.md`, `LIMITS.md` | Living |
| `adr/` | Architecture decisions. Top-level on purpose: their scope is the system and they bind after the work that spawned them closes. A status line names what an ADR supersedes | Record |
| `research/` | Grounding reports, one topic per folder, plus the programme map. Proactive research lands here directly; research done inside a piece of work starts under `superpowers/` and is promoted here only when it outlives its issue, naming that issue | Record |
| `reviews/` | Assessments and audits, frozen at birth. A review that should change something files an issue | Record |
| `learnings/` | One record per closed item or milestone worth keeping, linked from the close comment. Opens with R6 | Record |
| `backlog/` | Notes from before work moved to GitHub; each live one names its issue | Record, frozen |
| `work/` | Per-item records from before the move to GitHub, and the `EPIC.md` and `EPIC-STATE.md` frame they hung from | Record, frozen |
| `references/` | Provenance notes for shipped changes from before the work records existed | Record, frozen |
| `superpowers/` | Superpowers' working directory for specs, plans, and scratch research; gitignored | Ephemeral |

**The folder-earning test:** every top-level folder is a distinct retrieval axis. `adr/` is binding, `research/` is topical, `reviews/` and `learnings/` are what was found, `work/` and `backlog/` are frozen history. Anything retrievable on an existing axis gets no folder of its own.
