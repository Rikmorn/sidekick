# docs/ — what sidekick adds to the layout

Each folder here works as `plugin/skills/sidekick/references/docs-layout.md` says, and `plugin/rules/sk-pm-conventions.md` §Placement test (tense) sends content to its folder. This file lists only what sidekick adds or overrides. Work state is the issues, milestones, and board on `Rikmorn/sidekick`.

## The docs check

`bun run check:docs` checks the layout's ADR index, research topic indexes, and design status lines. It also checks relative links, permalinks, and links into `docs/superpowers/`. CI runs it on every push to `master` and to a `milestone/` branch.

## The watchlist

`WATCHLIST.md` names the sources to check for Claude Code skills, agents, hooks, plugins, and mods, and the leads not yet reviewed. It sits at the top of `docs/` because it describes nothing in sidekick, so no layout folder fits it.

## Legacy research topics

Topics from the research programme that ADR-0009 parked centre on a `REPORT.md`, often with a `FRAMING.md` and a sources file, rather than dated reports. Each topic's `README.md` indexes its files.

## Retired folders

Git keeps the retired material at `dce44d7`. Use `git show dce44d7:<path>` to read a file, or `git ls-tree -r dce44d7 docs/<folder>` to list one. Records link to those files by permalink at the same commit.

- `backlog/` held notes from before work moved to GitHub.
- `work/` held per-item records from the same period, and the `EPIC.md` and `EPIC-STATE.md` frame they hung from.
- `references/` held provenance notes for shipped changes from before the work records existed.
- `reviews/` held assessments and audits. A review that should change something now files an issue, and a surveyed body of prior art is a research report.
- `DESIGN-PRINCIPLES.md` and `learnings/README.md` also went; the layout states the learnings bar and shape.
- The root research files `SYNTHESIS.md`, `ACTION-PLAN.md`, `prior-art.md`, and `platform-landscape.md` went with them.
