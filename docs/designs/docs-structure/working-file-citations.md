# Sub-problem: durable things that depend on working files

Part of `design.md`, gate 2, raised by the operator after review round 2. Status: decided 2026-10-11, as recommended · 2026-10-11

## Problem

The sweep's hard cases were not about the sweep. A working file can only be lost if something durable depends on it. The operator's reframing on 2026-10-11 asks why such dependencies exist, and how to stop them.

Measured on 2026-10-11 by scanning every issue body, every issue comment, and every milestone description on `Rikmorn/sidekick` with `gh api`. The scan matched `docs/superpowers`, `run report`, `/plans/`, `/specs/`, and similar, then each match was read in context:

- **Dependencies**, where a durable thing points at a working file for content or evidence found nowhere else:
  - open issue bodies: #116, whose "Full record" is a table in a run report. Also #140, whose baseline is "the run reports and escalation counts #121 recorded";
  - closed issue bodies: #115, #104, #80, #76, #63, #62, and #61, mostly "Source: … run report (local)";
  - about nine comments, on #27, #28, #30, #31, #109, and #121, naming a plan, spec, or run report path as where something lives;
  - the R5 milestone description, which names its design spec beside ADR-0009.
- **Mentions that are not dependencies**: issues about the mechanism itself, such as #184, #146, #123, #152, and #90. Matches on the retired `.sidekick/plans/` layout were false positives.

Nearly all the dependencies date from 2026-09-13 to 2026-09-23.

## Why it happens

1. **The rule pulls toward pointing, and never says what may be pointed at.** `sk-pm-conventions.md` §No mirroring says "A fact lives in exactly one place; the other side points at it". Nothing requires that one place to outlive what points at it. "Join by issue number, never by file path" (§Files keep content) catches paths, not prose such as "the #109 run report". The layout's "No committed file cites one" covers committed files, not issues, comments, or milestones.
2. **Findings are born in working files, and filing is where the dependency forms.** Reviews, deviations, and measurements first land in run reports and specs. An issue filed from one points back at it, because pointing is cheaper than carrying. Most body dependencies predate `sk-track`'s "self-contained brief" (R6, 2026-09-21). Comments kept pointing at run reports until 2026-09-23 (#121).
3. **Nothing checks it.** `sidekick pm lint` already reads open issue bodies, for the `Revisit when:` line on `backlog` issues (`bin/helpers/pm-lint.ts:98`), but not for citations of working files.

## How to stop it

- **The rule states what may be pointed at.** `sk-pm-conventions.md` §No mirroring gains the missing half. The one place a fact lives outlives whatever points at it. A working file dies with its work, so no issue, comment, milestone, release note, or committed file cites one, by path or in prose. It carries what it needs, or points at a record. This is a demonstrated failure pattern, with about twenty data points, so it clears `sk-guidance-authoring.md`'s admission bar. The rule loads in every session.
- **A check catches the path form.** `sidekick pm lint` reports an open issue whose body names `docs/superpowers/`, in the same way it reports a `backlog` issue without its condition. Today it would report #116 alone. Sidekick's docs check already reports a tracked Markdown link into `docs/superpowers/`. Prose without a path is left to the rule, since a keyword match on "run report" would flag issues about run reports.
- **The open dependencies are repaired.** #116 carries its table. #140 is checked for anything it needs from the run reports behind #121, and carries it. Closed issues and the R5 milestone stay as written, since their work is done and their pointers are history.
- **Producers need no new step.** `sk-execute` §Route every finding already sends each finding to an issue before a workspace goes, and `sk-track` asks for a self-contained brief. The rule line and the lint make that hold.

## What this does to the cleanup question

With the dependency stopped and checked, deleting working files strands nothing durable. The only risk left is deleting work still in progress. The operator knows what is in progress, and a sweep cannot judge it well (`design.md` §Review, round 2, findings 1–3).

So the cleanup needs no trigger logic. Recommend: the rule and the layout say the folder is local scratch, cleared when the operator chooses, and that nothing durable cites it. No sweep command ships. The alternative is a simple command that clears working files older than the oldest open plan, but no evidence says that judgement is needed.
