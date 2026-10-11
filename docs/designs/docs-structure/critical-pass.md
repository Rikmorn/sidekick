# Sub-problem: a critical pass over every folder

Part of `design.md`, gate 2. Status: decided 2026-10-11, P1–P7 as recommended · 2026-10-11

## Problem

The operator asked for each folder to be looked at critically, on 2026-10-10. `adr/`, `research/`, and `designs/` plainly earn their place; the rest get scrutiny. The question for each is whether it earns its place, whether its contents do, and what it costs to keep true.

The layout, `superpowers/`, compaction, and checks sub-problems have already settled `reviews/`, the frozen folders, the working folder, and the research root files. This pass covers what remains.

## Findings

- **F11: the loop's procedures are restated in two to five places.** Measured 2026-10-11 with `git grep -l` over `docs/USAGE.md`, `docs/LOOP.md`, `AGENTS.md`, `README.md`, `plugin/skills`, and `plugin/rules`:
  - the release command, `claude plugin tag`: `AGENTS.md`, `README.md`, `USAGE.md`, and `sk-milestone`;
  - the pick-up command, `gh project item-edit`: `LOOP.md`, `USAGE.md`, `sk-orient`, and `sk-track`;
  - the status update, `pickup --report`: `LOOP.md`, `USAGE.md`, `sk-milestone`, and `sk-orient`;
  - the close, `gh issue close`: `LOOP.md`, `USAGE.md`, and `sk-track`;
  - the rules install: `AGENTS.md`, `README.md`, `LOOP.md`, `USAGE.md`, and the `sidekick` skill.

  Each change to a skill's procedure has to reach up to four copies, against "No mirroring". R8 changed several such procedures.
- **F12: sidekick's `docs/learnings/README.md` states nothing of its own.** It says the layout's default applies and "This repo adds nothing to them". Nothing links it, checked with `git grep`.
- **F13: the 11 legacy research topics have no index.** Each centres on a `REPORT.md`, often with `FRAMING.md` and a sources file. `docs/README.md` §Folders records the legacy shape as an exception.
- **F14: the ADR index needs each ADR's standing.** ADR-0009's status line supersedes ADR-0001 and ADR-0002, and parks the eval, knowledge-layer, and measurement programmes, which are ADR-0006, ADR-0007, and ADR-0008. ADR-0010 and ADR-0011 amend in turn. A reader of the index should see which decisions still bind.

## Decisions

### P1. `learnings/`

Keep the folder. It is a distinct retrieval axis: lessons from the repo's own work, shared in the repo, where auto-memory is per user and per machine. Delete sidekick's `learnings/README.md` (F12), so the layout's default applies with no copy.

### P2. `tech-debt/`

Keep it, unchanged. It serves repos without the PM layer, and odin holds 30 entries. Its owner line says `sk-design` writes it, and whoever pays the debt deletes it.

### P3. `reference/`

`NORTH-STAR.md` and `LIMITS.md` keep their place and content. For `USAGE.md` and `LOOP.md` (F11), three options:

- **Cut to orientation (recommended).** Both keep the question each answers. `USAGE.md` covers how a day with the loop runs, and `LOOP.md` covers what each skill reads, produces, and where it stops. Each names the skill that does a step instead of restating its commands. Sidekick's release lives in `AGENTS.md` §Releasing alone, which is where #165 moves the skills' sidekick facts too.
- **Merge them into one doc.** This halves the surface, but it loses the split #122 asked for, between a session's steps and each skill's view.
- **Leave them.** The cost is accepting the drift: every procedure change must reach up to four copies.

### P4. `docs/README.md`

Rewrite it as a pointer to the layout, plus only what sidekick adds or overrides:

- the commit that keeps the deleted folders, and the `git show` way in (compaction D1);
- anything the legacy research topics still need, per P5.

The folder-earning test moves into the layout's opening. It reads: every top-level folder is a distinct retrieval axis, and anything retrievable on an existing axis gets no folder of its own. It guides a consumer repo that adds folders of its own. The alternative is dropping it, since the layout now defines the folders.

### P5. The legacy research topics

- **Give each an index (recommended).** Each topic gets a short `README.md` naming the question it answered and its files. It notes that it served the research programme ADR-0009 parked, plus any issue it served. Eleven small living files, and sidekick's docs check needs no exemption. The report bodies stay as written, since rewriting records waits for #128.
- **Exempt them by rule.** The layout states that a topic with no dated report is legacy and unindexed, and the check skips it. This writes no files, but it adds a permanent special case to the layout and the check.

### P6. `adr/`

Keep it. #137's index lists every ADR with its standing, taken from the status lines (F14): accepted, superseded by an ADR, parked, or amended. The bodies stay as written.

### P7. `designs/`

Keep it. This design's folder is deleted at R8's close, once its issues close.

## Noted outside `docs/`

Auto-memory holds facts about this repo that a teammate or a consumer repo cannot see. `sidekick-conventions` holds verified plugin mechanism facts, for example. The placement test sends true-now facts to a reference doc, and `sk-guidance-authoring.md` §Placement ranks memory as a home for process notes only. Whether a durable repo fact belongs in memory or a reference doc is unstated. This is outside this design's scope. The operator declined to file it on 2026-10-11: the project serves one person, and external repos need their own strategies.

## Stance

**Decided 2026-10-11: P1–P7 as recommended.**

The recommendation, as written before the decision: P1–P7 as written, with P3 cut to orientation and P5 giving each topic an index.

P3 rests on an assumption: the skills are the source of truth for their procedures, and a doc that orients is enough for a reader. If the operator reads `USAGE.md` as the runbook instead of invoking skills, cutting its commands costs them a lookup.
