---
name: orient
description: Use at the start of a session in this repo, or whenever returning after time away — rebuilds the knowledge graph, diffs since the last visit, and delivers a briefing of current state, what changed, and what needs attention.
---

# orient — re-ground a cold session

> **Work state moved (2026-09, R1).** Open work, releases, and the backlog are now authoritative on **GitHub** — issues + milestones on `Rikmorn/sidekick` and the "sidekick" project board (`gh issue list`, `gh issue list --milestone <m>`, board: github.com/users/Rikmorn/projects/2). EPIC.md / EPIC-STATE.md are archived records, and STATE.md's work sections describe the pre-R1 world. The graph and the surfaces below remain authoritative for the *knowledge* corpus (agents, evals, research, coverage). Conventions: `rules/sk-pm-conventions.md`. Full reconciliation of this skill is tracked in issue #52.

You are re-entering a repo built by two intermittent minds — an operator who returns after weeks away, and an agent that starts every session cold. Its knowledge layer (ADR-0007) exists so that re-entry costs one ritual instead of an afternoon of grep. Your goal: a briefing that hands whoever is reading the current state, what changed while they were away, and what deserves attention — grounded in the layer, written for someone who has paged everything out.

## Instruments

All `bun bin/cli.ts graph <cmd>`, all `--json`-capable:

- `build` — refresh `.kb/graph.db` from the tree. Run it before anything else reads the graph; it is fast and always safe.
- [`MAP.md`](../../../MAP.md) + [`docs/STATE.md`](../../../docs/STATE.md) — the generated surfaces: what exists, and where it stands. Short by design; read both whole. Note STATE reflects the last regeneration — the graph you just built reflects *now*; a difference between them is in-flight work.
- `diff <ref> [ref]` — what changed between commits. The natural "last visit" anchor is the most recent commit that touched `docs/STATE.md` (state regenerates when work concludes, so its git history is the session heartbeat): diff from *it* to HEAD shows what landed since. When that commit *is* HEAD, the last visit just ended — report that nothing new has landed and look at the working tree for in-flight work instead. If no such commit exists at all, there is no last visit — say so rather than inventing one.
- `gaps`, `lint` — open questions and corpus health. `lint` exits non-zero when errors exist; that is signal, not a broken command.
- `applies <topic|path>` — open backlog bearing on what this session is about to touch. Worth running whenever the session has a stated intent.

## The briefing

Written for a reader catching up, in complete sentences — lead with what happened, not with mechanics:

1. **What changed since last visit** — status moves, new or resolved entities, arrivals (from `diff`). "Nothing" is a fine answer when it is the true one; say it plainly.
2. **Where things stand** — open epics and items, backlog count, bench state, freshness flags, and anything awaiting sign-off (STATE surfaces these; repeat them — pending decisions are the easiest thing to lose across a gap). Bench state is per-metric: STATE's "Metric frame" line says how many subjects meet each metric and which metrics nothing feeds yet; `bun bin/cli.ts graph coverage` has the per-subject drill-down when a metric looks off.
3. **What needs attention** — lint *errors* always (a drift error usually means in-flight work whose surfaces need regenerating before commit); advisories and gaps only when they bear on this session's likely work. If `bun bin/cli.ts harvest list` shows unimported entries, say so — each is a real failure waiting to become an eval case, and they go stale quietly.
4. **If the session has a stated goal** — what `applies` to it, and the two or three entities worth reading before touching anything.

The human's visual surface is the dashboard: `bun run dashboard` regenerates it (prepare step + Quarto render), then `bun run dashboard:view` serves it at `http://localhost:4173` — served, not `file://`-opened, because Quarto's OJS runtime refuses `file://` by design (the page itself is still one self-contained HTML under `.kb/site/`; only the *viewing* needs the throwaway server, which runs only while looking). Four views: state, since-last-visit, coverage, bench — the same rollup this briefing draws on. Point the reader at it for the visual read; MAP and STATE stay the readable text views.

## Bounds

This is re-grounding, not an audit: prefer the generated surfaces and budgeted queries over raw dumps, and keep the briefing under a screen — a briefing that needs scrolling has failed its purpose. If a query misses something you can see in the tree, that is a layer bug worth one line in the briefing: note it, fall back to Read for that item, and continue.
